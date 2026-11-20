// =====================================================================
//  КАРТКИ ДЛЯ ПОВТОРЕННЯ (flashcards) з інтервальним повторенням
//  Система Лейтнера: чим краще знаєте картку, тим рідше вона з'являється.
//  Прогрес зберігається в браузері та синхронізується з БД (таблиця card_progress),
//  тому доступний з будь-якого пристрою після входу в акаунт.
// =====================================================================
(function () {
    'use strict';

    const DAY = 86400000, MIN = 60000;
    const INTERVALS = [0, 1, 2, 4, 8, 16, 32]; // днів до наступного повторення для кожної "коробки"
    const MASTERED_BOX = 5;                      // коробка 5+ (інтервал від 16 днів) вважається «вивченою»

    const TXT = {
        ua: {
            title: 'Картки для повторення',
            source: 'Що повторюємо', src_word: 'Слова', src_expr: 'Вирази', src_both: 'Слова + вирази',
            theme: 'Тема',
            dir: 'Напрямок', dir_cz: 'Чеська → переклад', dir_tr: 'Переклад → чеська', dir_mix: 'Вперемішку',
            mode: 'Режим', mode_smart: 'За розкладом (повторення + нові)', mode_all: 'Усі підряд (тренування)',
            limit: 'Карток за раз', limit_all: 'Усі',
            start: 'Почати 🚀', reset: 'Скинути прогрес',
            s_new: 'Нових', s_again: 'Не знаю', s_learn: 'Вчу', s_done: 'Вивчено', s_due: 'До повторення',
            flip_hint: 'Натисніть, щоб перевернути', keys: 'Пробіл — перевернути · 1 / 2 / 3 — оцінка',
            g_again: 'Не знаю', g_hard: 'Важко', g_good: 'Знаю',
            min: 'хв', d: 'д', level: 'Рівень',
            exit: 'Завершити',
            fin_title: 'Сесію завершено! 🎉', fin_total: 'Карток пройдено', fin_first: 'Знали з першого разу', fin_again: 'Довелось повторити',
            fin_more: 'Ще сесію', fin_back: 'До налаштувань',
            empty: 'Немає карток. Додайте слова у «Словнику» або оберіть іншу тему.',
            nothing_due: 'На сьогодні все повторено! 🎉 Оберіть режим «Усі підряд», щоб потренуватись ще.',
            confirm_reset: 'Скинути весь прогрес карток (також на інших пристроях)? Це не можна скасувати.',
            note_guest: 'Увійдіть в акаунт, щоб прогрес зберігався на всіх ваших пристроях. Зараз він лише в цьому браузері.',
            note_ok: '☁️ Прогрес синхронізується з акаунтом: ',
            note_sync: '☁️ Синхронізація…',
            note_err: '⚠️ Не вдалося синхронізувати. Прогрес збережено в браузері, спробуємо ще раз.'
        },
        ru: {
            title: 'Карточки для повторения',
            source: 'Что повторяем', src_word: 'Слова', src_expr: 'Фразы', src_both: 'Слова + фразы',
            theme: 'Тема',
            dir: 'Направление', dir_cz: 'Чешский → перевод', dir_tr: 'Перевод → чешский', dir_mix: 'Вперемешку',
            mode: 'Режим', mode_smart: 'По расписанию (повторение + новые)', mode_all: 'Все подряд (тренировка)',
            limit: 'Карточек за раз', limit_all: 'Все',
            start: 'Начать 🚀', reset: 'Сбросить прогресс',
            s_new: 'Новых', s_again: 'Не знаю', s_learn: 'Учу', s_done: 'Выучено', s_due: 'К повторению',
            flip_hint: 'Нажмите, чтобы перевернуть', keys: 'Пробел — перевернуть · 1 / 2 / 3 — оценка',
            g_again: 'Не знаю', g_hard: 'Трудно', g_good: 'Знаю',
            min: 'мин', d: 'дн', level: 'Уровень',
            exit: 'Завершить',
            fin_title: 'Сессия завершена! 🎉', fin_total: 'Карточек пройдено', fin_first: 'Знали с первого раза', fin_again: 'Пришлось повторить',
            fin_more: 'Ещё сессию', fin_back: 'К настройкам',
            empty: 'Нет карточек. Добавьте слова в «Словарь» или выберите другую тему.',
            nothing_due: 'На сегодня всё повторено! 🎉 Выберите режим «Все подряд», чтобы потренироваться ещё.',
            confirm_reset: 'Сбросить весь прогресс карточек (и на других устройствах)? Это нельзя отменить.',
            note_guest: 'Войдите в аккаунт, чтобы прогресс сохранялся на всех ваших устройствах. Сейчас он только в этом браузере.',
            note_ok: '☁️ Прогресс синхронизируется с аккаунтом: ',
            note_sync: '☁️ Синхронизация…',
            note_err: '⚠️ Не удалось синхронизировать. Прогресс сохранён в браузере, попробуем ещё раз.'
        }
    };
    const tx = k => ((TXT[currentLang] || TXT.ua)[k]) || k;
    const $ = id => document.getElementById(id);

    let S = { active: false };
    let syncState = 'idle';       // idle | sync | ok | err
    let syncedUserId = null;      // для якого користувача вже виконано початкову синхронізацію
    let syncing = false;

    // ---------- Локальне сховище ----------
    function storageKey() { return 'czCards:' + (currentUser ? 'u' + currentUser.id : 'guest'); }
    function loadProgress() { try { return JSON.parse(localStorage.getItem(storageKey())) || {}; } catch (e) { return {}; } }
    function saveProgress(p) { try { localStorage.setItem(storageKey(), JSON.stringify(p)); } catch (e) { /* сховище недоступне */ } }

    // ---------- Синхронізація з БД (таблиця card_progress) ----------
    async function getUid() {
        try { const { data } = await db.auth.getSession(); return data && data.session ? data.session.user.id : null; }
        catch (e) { return null; }
    }
    function toRow(uid, key, e) {
        return { user_id: uid, card_key: key, box: e.box, due: new Date(e.due).toISOString(), seen: e.seen || 0, last_seen: new Date(e.last || Date.now()).toISOString() };
    }
    function setSync(state) { syncState = state; updateNote(); }

    async function syncAll() {
        if (!currentUser || syncing) return;
        const uid = await getUid(); if (!uid) return;
        const forUser = currentUser.id;
        syncing = true; setSync('sync');
        try {
            const { data, error } = await db.from('card_progress').select('card_key, box, due, seen, last_seen');
            if (error) throw error;
            const server = {};
            (data || []).forEach(r => { server[r.card_key] = { box: r.box, due: Date.parse(r.due), seen: r.seen, last: Date.parse(r.last_seen) }; });

            // Локальні дані читаємо ПІСЛЯ запиту, щоб не втратити відповіді, дані під час очікування
            const local = loadProgress();
            const merged = Object.assign({}, server);
            const toPush = [];
            Object.keys(local).forEach(k => {
                const l = local[k], s = server[k];
                if (!s || (l.last || 0) > (s.last || 0)) { merged[k] = l; toPush.push(toRow(uid, k, l)); }
            });
            saveProgress(merged);

            for (let i = 0; i < toPush.length; i += 500) {
                const { error: e2 } = await db.from('card_progress').upsert(toPush.slice(i, i + 500), { onConflict: 'user_id,card_key' });
                if (e2) throw e2;
            }
            syncedUserId = forUser; setSync('ok');
        } catch (e) {
            console.error('Помилка синхронізації карток:', e);
            syncedUserId = null; setSync('err');
        } finally {
            syncing = false;
            if (!S.active) renderStats();
        }
    }

    async function pushOne(key, entry) {
        if (!currentUser) return;
        const uid = await getUid(); if (!uid) return;
        try {
            const { error } = await db.from('card_progress').upsert([toRow(uid, key, entry)], { onConflict: 'user_id,card_key' });
            if (error) throw error;
            if (syncState === 'err') setSync('ok');
        } catch (e) {
            console.error('Не вдалося зберегти картку в БД:', e);
            syncedUserId = null; setSync('err'); // при наступному відкритті вкладки відбудеться повторна синхронізація
        }
    }

    // ---------- Колода ----------
    function translationOf(c) { return c[currentLang] || c.ua || ''; }

    function poolFor(source, theme) {
        const out = [];
        if (source !== 'expr') dictionary.forEach(w => out.push({ key: 'w' + w.id, cz: w.cz, ua: w.ua, ru: w.ru, theme: w.theme }));
        if (source !== 'word') expressions.forEach(e => out.push({ key: 'e' + e.id, cz: e.cz, ua: e.ua, ru: e.ru, theme: e.theme }));
        return theme === 'all' ? out : out.filter(c => c.theme === theme);
    }

    function shuffle(a) {
        a = a.slice();
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
    }

    function settings() {
        return {
            source: $('cardsSource').value, theme: $('cardsTheme').value, dir: $('cardsDir').value,
            mode: $('cardsMode').value, limit: $('cardsLimit').value
        };
    }

    function buildQueue() {
        const s = settings(); const pool = poolFor(s.source, s.theme); const p = loadProgress(); const now = Date.now();
        let list;
        if (s.mode === 'all') {
            list = shuffle(pool);
        } else {
            const due = pool.filter(c => p[c.key] && p[c.key].due <= now).sort((a, b) => p[a.key].due - p[b.key].due);
            const fresh = shuffle(pool.filter(c => !p[c.key]));
            list = due.concat(fresh);
        }
        const lim = s.limit === 'all' ? Infinity : parseInt(s.limit, 10) || 20;
        return list.slice(0, lim);
    }

    // ---------- Розклад повторень ----------
    function nextState(e, grade) { // grade: 0 = не знаю, 1 = важко, 2 = знаю
        const now = Date.now(); let box = e ? e.box : 0;
        if (grade === 0) return { box: 0, due: now + 10 * MIN };
        if (grade === 1) { box = Math.max(1, box); return { box, due: now + Math.max(1, Math.floor(INTERVALS[box] / 2)) * DAY }; }
        box = Math.min(box + 1, INTERVALS.length - 1);
        return { box, due: now + INTERVALS[box] * DAY };
    }
    function fmtInterval(due) {
        const diff = due - Date.now();
        return diff < DAY ? '~' + Math.max(1, Math.round(diff / MIN)) + ' ' + tx('min') : Math.round(diff / DAY) + ' ' + tx('d');
    }
    function levelDots(e) {
        const n = e ? Math.min(e.box, MASTERED_BOX) : 0;
        return '●'.repeat(n) + '○'.repeat(MASTERED_BOX - n) + (n >= MASTERED_BOX ? ' ✅' : '');
    }

    // ---------- Налаштування / статистика ----------
    function setOptions(id, pairs) {
        const sel = $(id); if (!sel) return; const cur = sel.value;
        sel.innerHTML = pairs.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
        if (pairs.some(p => p[0] === cur)) sel.value = cur;
    }

    function updateNote() {
        const note = $('cardsNote'); if (!note) return;
        if (!currentUser) { note.textContent = tx('note_guest'); return; }
        note.textContent = syncState === 'sync' ? tx('note_sync')
            : syncState === 'err' ? tx('note_err')
            : tx('note_ok') + currentUser.username;
    }

    function applyLang() {
        const set = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
        set('cardsTitle', tx('title')); set('lblCardsSource', tx('source')); set('lblCardsTheme', tx('theme'));
        set('lblCardsDir', tx('dir')); set('lblCardsMode', tx('mode')); set('lblCardsLimit', tx('limit'));
        set('cardsStartBtn', tx('start')); set('cardsResetBtn', tx('reset')); set('cardsExitBtn', tx('exit'));
        setOptions('cardsSource', [['both', tx('src_both')], ['word', tx('src_word')], ['expr', tx('src_expr')]]);
        setOptions('cardsDir', [['cz', tx('dir_cz')], ['tr', tx('dir_tr')], ['mix', tx('dir_mix')]]);
        setOptions('cardsMode', [['smart', tx('mode_smart')], ['all', tx('mode_all')]]);
        setOptions('cardsLimit', [['10', '10'], ['20', '20'], ['50', '50'], ['all', tx('limit_all')]]);
        if (!$('cardsLimit').dataset.init) { $('cardsLimit').value = '20'; $('cardsLimit').dataset.init = '1'; }
        updateNote();
    }

    function rebuildThemes() {
        const sel = $('cardsTheme'); if (!sel) return; const cur = sel.value;
        const themes = Array.from(new Set(poolFor($('cardsSource').value, 'all').map(c => c.theme))).sort();
        sel.innerHTML = `<option value="all">${esc(t('all_themes'))}</option>` + themes.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
        sel.value = themes.includes(cur) ? cur : 'all';
    }

    function renderStats() {
        const box = $('cardsStats'); if (!box) return;
        const s = settings(); const pool = poolFor(s.source, s.theme); const p = loadProgress(); const now = Date.now();
        let nw = 0, again = 0, learn = 0, done = 0, due = 0;
        pool.forEach(c => {
            const e = p[c.key];
            if (!e) { nw++; return; }
            if (e.box >= MASTERED_BOX) done++; else if (e.box === 0) again++; else learn++;
            if (e.due <= now) due++;
        });
        box.innerHTML =
            `<span class="cards-chip due">${tx('s_due')}: <b>${due}</b></span>` +
            `<span class="cards-chip new">${tx('s_new')}: <b>${nw}</b></span>` +
            `<span class="cards-chip again">${tx('s_again')}: <b>${again}</b></span>` +
            `<span class="cards-chip">${tx('s_learn')}: <b>${learn}</b></span>` +
            `<span class="cards-chip done">${tx('s_done')}: <b>${done}</b></span>`;
        const msg = $('cardsMsg'); if (msg) msg.textContent = '';
    }

    // ---------- Сесія ----------
    function show(view) {
        $('cardsSetup').style.display = view === 'setup' ? 'block' : 'none';
        $('cardsSession').style.display = view === 'session' ? 'block' : 'none';
        $('cardsFinish').style.display = view === 'finish' ? 'block' : 'none';
    }

    function start() {
        const s = settings();
        if (poolFor(s.source, s.theme).length === 0) { $('cardsMsg').textContent = tx('empty'); return; }
        const queue = buildQueue();
        if (queue.length === 0) { $('cardsMsg').textContent = tx('nothing_due'); return; }
        S = { active: true, queue, total: queue.length, done: 0, failed: new Set(), current: null, flipped: false, front: 'cz', dir: s.dir };
        show('session'); renderCard(false);
    }

    function renderCard(keep) {
        const c = S.queue[0];
        if (!c) { finish(); return; }
        if (!keep || S.current !== c) {
            S.current = c; S.flipped = false;
            S.front = S.dir === 'mix' ? (Math.random() < 0.5 ? 'cz' : 'tr') : (S.dir === 'tr' ? 'tr' : 'cz');
        }
        const frontTxt = S.front === 'cz' ? c.cz : translationOf(c);
        const backTxt = S.front === 'cz' ? translationOf(c) : c.cz;
        const speak = () => `<button class="fc-speak" onclick="event.stopPropagation(); cardsSpeak()" title="🔊">🔊</button>`;
        const p = loadProgress(); const e = p[c.key] || null;
        const pct = Math.round((S.done / S.total) * 100);
        const level = `<span class="fc-level" title="${tx('level')}">${tx('level')}: ${levelDots(e)}</span>`;

        $('cardsSessionBody').innerHTML = `
            <div class="fc-progress"><div class="fc-progress-bar" style="width:${pct}%"></div></div>
            <div class="fc-counter">${S.done} / ${S.total}</div>
            <div class="fc-scene">
                <div class="fc-card ${S.flipped ? 'flipped' : ''}" id="fcCard" onclick="cardsFlip()">
                    <div class="fc-face fc-front">
                        <span class="fc-badge">${esc(c.theme)}</span>
                        <div class="fc-text">${esc(frontTxt)}</div>
                        ${S.front === 'cz' ? speak() : ''}
                        <div class="fc-hint">${tx('flip_hint')}</div>
                        ${level}
                    </div>
                    <div class="fc-face fc-back">
                        <span class="fc-badge">${esc(c.theme)}</span>
                        <div class="fc-text">${esc(backTxt)}</div>
                        ${S.front === 'tr' ? speak() : ''}
                        ${level}
                    </div>
                </div>
            </div>
            <div class="fc-grades ${S.flipped ? '' : 'hidden'}" id="fcGrades">
                <button class="fc-grade again" onclick="cardsGrade(0)">${tx('g_again')}<small>${fmtInterval(nextState(e, 0).due)} · 1</small></button>
                <button class="fc-grade hard" onclick="cardsGrade(1)">${tx('g_hard')}<small>${fmtInterval(nextState(e, 1).due)} · 2</small></button>
                <button class="fc-grade good" onclick="cardsGrade(2)">${tx('g_good')}<small>${fmtInterval(nextState(e, 2).due)} · 3</small></button>
            </div>
            <div class="fc-keys">${tx('keys')}</div>`;
    }

    function flip() {
        if (!S.active) return;
        S.flipped = !S.flipped;
        const card = $('fcCard'), grades = $('fcGrades');
        if (card) card.classList.toggle('flipped', S.flipped);
        if (grades) grades.classList.toggle('hidden', !S.flipped);
    }

    function grade(g) {
        if (!S.active || !S.flipped) return;
        const c = S.current; const p = loadProgress(); const old = p[c.key] || null;
        const st = nextState(old, g);
        const entry = { box: st.box, due: st.due, seen: (old ? old.seen : 0) + 1, last: Date.now() };
        p[c.key] = entry;
        saveProgress(p);
        pushOne(c.key, entry); // у фоні зберігаємо в БД

        S.queue.shift();
        if (g === 0) {
            S.failed.add(c.key);
            S.queue.splice(Math.min(3, S.queue.length), 0, c); // повернеться через кілька карток
        } else {
            S.done++;
        }
        renderCard(false);
    }

    function finish() {
        S.active = false;
        const first = S.total - S.failed.size;
        $('cardsFinish').innerHTML = `
            <div class="fc-finish">
                <h3>${tx('fin_title')}</h3>
                <div class="cards-stats">
                    <span class="cards-chip">${tx('fin_total')}: <b>${S.total}</b></span>
                    <span class="cards-chip done">${tx('fin_first')}: <b>${first}</b></span>
                    <span class="cards-chip due">${tx('fin_again')}: <b>${S.failed.size}</b></span>
                </div>
                <button class="btn-primary" onclick="cardsStart()">${tx('fin_more')}</button>
                <button class="btn-secondary" onclick="cardsBack()" style="margin-top:8px;width:100%">${tx('fin_back')}</button>
            </div>`;
        show('finish');
    }

    function back() { S.active = false; show('setup'); renderStats(); }

    function speakCurrent() {
        if (!S.current || !('speechSynthesis' in window)) return;
        const u = new SpeechSynthesisUtterance(S.current.cz); u.lang = 'cs-CZ';
        window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
    }

    async function resetProgress() {
        if (!confirm(tx('confirm_reset'))) return;
        try { localStorage.removeItem(storageKey()); } catch (e) { /* ignore */ }
        if (currentUser) {
            const uid = await getUid();
            if (uid) {
                const { error } = await db.from('card_progress').delete().eq('user_id', uid);
                if (error) { console.error(error); setSync('err'); }
            }
        }
        renderStats();
    }

    // ---------- Публічні функції ----------
    window.cardsStart = start;
    window.cardsFlip = flip;
    window.cardsGrade = grade;
    window.cardsBack = back;
    window.cardsSpeak = speakCurrent;
    window.cardsResetProgress = resetProgress;
    window.cardsOnSourceChange = function () { rebuildThemes(); renderStats(); };
    window.cardsRenderStats = renderStats;

    // Викликається після завантаження даних, зміни мови, входу/виходу, відкриття вкладки
    window.cardsRefresh = function () {
        if (!$('cardsSetup')) return;
        if (!currentUser) { syncedUserId = null; syncState = 'idle'; }
        applyLang();
        if (currentUser && syncedUserId !== currentUser.id) syncAll(); // початкова синхронізація (з БД на цей пристрій і навпаки)
        if (S.active) { renderCard(true); return; } // не збиваємо поточну сесію
        rebuildThemes(); renderStats();
    };

    // Клавіатура: пробіл/Enter — перевернути, 1/2/3 — оцінка
    document.addEventListener('keydown', function (ev) {
        if (!S.active) return;
        const tab = $('tab-cards'); if (!tab || !tab.classList.contains('active')) return;
        const tag = (ev.target && ev.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (ev.code === 'Space' || ev.key === 'Enter') { ev.preventDefault(); flip(); }
        else if (S.flipped && ['1', '2', '3'].includes(ev.key)) grade(parseInt(ev.key, 10) - 1);
    });
})();
