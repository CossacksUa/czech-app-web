window.trainingData = window.trainingData || [];

let gameMode = 'word'; 
let spaceMode = true; 
let itemLimit = 5; 

let currentWordIndex = 0;
let currentSentenceIndex = -1; 
let currentAudio = null;

let totalSteps = 0;
let currentStep = 0;

const startScreen = document.getElementById("startScreen");
const gameScreen = document.getElementById("gameScreen");
const targetWordTitle = document.getElementById("targetWordTitle");
const wordDisplay = document.getElementById("wordDisplay");
const emojiContainer = document.getElementById("imageContainer");
const progressBar = document.getElementById("progressBar");
const roundIndicator = document.getElementById("roundIndicator");
const gameCard = document.getElementById("gameCard");
const finishModal = document.getElementById("finishModal");
const wordsGrid = document.getElementById("wordsGrid");
const categorySelect = document.getElementById("categorySelect");

// Словник для гарного відображення категорій
const CATEGORY_MAP = {
    'news': '📰 Новини',
    'tongue_twister': '👅 Скоромовки',
    'story': '📖 Історії',
    'article': '📑 Статті'
};

// --- ДИНАМІЧНЕ ЗАВАНТАЖЕННЯ КАТЕГОРІЙ ЗАЛЕЖНО ВІД ОБРАНИХ ДЖЕРЕЛ ---
async function initCategories() {
    let attempts = 0;
    while ((typeof db === 'undefined' || !db) && attempts < 10) {
        await new Promise(r => setTimeout(r, 200));
        attempts++;
    }

    if (typeof db === 'undefined' || !db) return;

    const selectEl = document.getElementById('categorySelect');
    if (!selectEl) return;

    const useDict = document.getElementById('sourceDict')?.checked ?? true;
    const useExpr = document.getElementById('sourceExpr')?.checked ?? true;
    const useTraining = document.getElementById('sourceTraining')?.checked ?? true;
    const useTexts = document.getElementById('sourceTexts')?.checked ?? true;

    try {
        const categoriesSet = new Set();

        if (useDict) {
            try {
                const { data } = await db.from('dictionary').select('theme');
                if (data) data.forEach(i => i.theme && categoriesSet.add(i.theme));
            } catch (e) {}
        }

        if (useExpr) {
            try {
                const { data } = await db.from('expressions').select('theme');
                if (data) data.forEach(i => i.theme && categoriesSet.add(i.theme));
            } catch (e) {}
        }

        if (useTraining) {
            try {
                const { data } = await db.from('training_words').select('category');
                if (data) data.forEach(i => i.category && categoriesSet.add(i.category));
            } catch (e) {}
        }

        if (useTexts) {
            try {
                const { data } = await db.from('texts').select('category');
                if (data) data.forEach(i => i.category && categoriesSet.add(i.category));
            } catch (e) {}
        }

        const currentValue = selectEl.value;

        selectEl.innerHTML = `<option value="all">🌐 Усі категорії та теми</option>`;
        
        categoriesSet.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = CATEGORY_MAP[cat] || cat;
            selectEl.appendChild(option);
        });

        if (Array.from(selectEl.options).some(opt => opt.value === currentValue)) {
            selectEl.value = currentValue;
        } else {
            selectEl.value = 'all';
        }

    } catch (err) {
        console.error("Помилка завантаження категорій:", err);
    }
}

// Слухаємо зміну чекбоксів джерел
document.addEventListener('change', (e) => {
    if (e.target && ['sourceDict', 'sourceExpr', 'sourceTraining', 'sourceTexts'].includes(e.target.id)) {
        initCategories();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    initCategories();
});

// --- ВИБІР КІЛЬКОСТІ ---
function selectLimit(limit) {
    itemLimit = limit;
    document.getElementById("limit5Btn")?.classList.toggle("active", limit === 5);
    document.getElementById("limit10Btn")?.classList.toggle("active", limit === 10);
    document.getElementById("limitAllBtn")?.classList.toggle("active", limit === 'all');
    
    const inputField = document.getElementById("itemLimitInput");
    if (inputField && limit !== 'all') inputField.value = limit;
    else if (inputField && limit === 'all') inputField.value = '';
}

function customLimitInputChanged() {
    const inputField = document.getElementById("itemLimitInput");
    if (!inputField) return;
    const val = parseInt(inputField.value);
    if (!isNaN(val) && val > 0) {
        itemLimit = val;
        document.getElementById("limit5Btn")?.classList.remove("active");
        document.getElementById("limit10Btn")?.classList.remove("active");
        document.getElementById("limitAllBtn")?.classList.remove("active");
    }
}

// --- ЗАВАНТАЖЕННЯ ДАНИХ З БД ---
async function loadTrainingDataFromDB() {
    try {
        if (typeof db === 'undefined' || !db) {
            alert('Помилка: відсутнє підключення до Supabase (db).');
            return false;
        }

        const useDict = document.getElementById('sourceDict')?.checked ?? true;
        const useExpr = document.getElementById('sourceExpr')?.checked ?? true;
        const useTraining = document.getElementById('sourceTraining')?.checked ?? true;
        const useTexts = document.getElementById('sourceTexts')?.checked ?? true; // Обов'язково додано!
        const selectedCategory = document.getElementById('categorySelect')?.value ?? 'all';
        
        const inputField = document.getElementById('itemLimitInput');
        if (inputField && inputField.value) {
            const parsed = parseInt(inputField.value);
            if (!isNaN(parsed) && parsed > 0) itemLimit = parsed;
        }

        let combinedData = [];

        // 1. Словник
        if (useDict) {
            const { data, error } = await db.from('dictionary').select('*');
            if (!error && data) {
                data.forEach(item => {
                    const theme = item.theme || 'Різне';
                    if (selectedCategory !== 'all' && theme !== selectedCategory) return;

                    const wordText = item.cz || item.word || '';
                    const transText = item.ua || item.ru || item.translation || '';
                    if (!wordText) return;

                    combinedData.push({
                        word: wordText,
                        translation: transText,
                        emoji: item.emoji || '📚',
                        sentences: Array.isArray(item.sentences) ? item.sentences : []
                    });
                });
            }
        }

        // 2. Вирази
        if (useExpr) {
            const { data, error } = await db.from('expressions').select('*');
            if (!error && data) {
                data.forEach(item => {
                    const theme = item.theme || 'Різне';
                    if (selectedCategory !== 'all' && theme !== selectedCategory) return;

                    const phraseText = item.cz || item.phrase || item.word || '';
                    const transText = item.ua || item.ru || item.translation || '';
                    if (!phraseText) return;

                    combinedData.push({
                        word: phraseText,
                        translation: transText,
                        emoji: item.emoji || '💬',
                        sentences: Array.isArray(item.sentences) ? item.sentences : []
                    });
                });
            }
        }

        // 3. Речення
        if (useTraining) {
            const { data, error } = await db.from('training_words').select('*');
            if (!error && data) {
                data.forEach(item => {
                    const cat = item.category || 'Різне';
                    if (selectedCategory !== 'all' && cat !== selectedCategory) return;

                    const wordVal = item.word || '';
                    const transVal = item.translation || '';
                    const emojiVal = item.emoji || '💬';
                    const sents = Array.isArray(item.sentences) ? item.sentences : [];

                    if (wordVal || sents.length > 0) {
                        combinedData.push({
                            word: wordVal,
                            translation: transVal,
                            emoji: emojiVal,
                            sentences: sents
                        });
                    }
                });
            }
        }

     // 4. Тексти (texts) - розбиваємо на окремі речення
        if (useTexts) {
            const { data, error } = await db.from('texts').select('*');
            if (!error && data) {
                data.forEach(item => {
                    const cat = item.category || 'other';
                    if (selectedCategory !== 'all' && cat !== selectedCategory) return;

                    const textCs = item.text_cs || '';
                    const textUa = item.text_ua || '';

                    if (textCs) {
                        // Розбиваємо чеський текст на окремі речення за крапкою, знаком оклику чи питання
                        // (ураховуємо пробіл після розділового знака)
                        const rawSentences = textCs.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
                        
                        // Формуємо масив об'єктів речень для тренажера
                        const sentencesArray = rawSentences.map(sent => ({
                            text: sent.trim(),
                            translation: textUa // або можна залишити загальний переклад
                        }));

                        if (sentencesArray.length > 0) {
                            combinedData.push({
                                word: item.title || 'Текст',
                                translation: textUa,
                                emoji: '📄',
                                sentences: sentencesArray // Тепер тут окремі речення!
                            });
                        }
                    }
                });
            }
        }

        if (combinedData.length > 0) {
            shuffleArray(combinedData);
            if (itemLimit !== 'all') {
                window.trainingData = combinedData.slice(0, itemLimit);
            } else {
                window.trainingData = combinedData;
            }
            return true;
        } else {
            alert('У базі даних не знайдено записів за обраними джерелами та категорією!');
            return false;
        }
    } catch (err) {
        console.error('Помилка завантаження з БД:', err);
        alert('Помилка зв’язку з базою даних: ' + err.message);
        return false;
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function calculateTotalSteps() {
    totalSteps = 0;
    window.trainingData.forEach(item => {
        if (gameMode === 'word' && item.word) {
            totalSteps += 1; 
        }
        if (item.sentences && Array.isArray(item.sentences)) {
            totalSteps += item.sentences.length;
        }
    });
    currentStep = 0;
}

function selectGameMode(mode) {
    gameMode = mode;
    document.getElementById("modeWordBtn")?.classList.toggle("active", mode === 'word');
    document.getElementById("modeSentencesBtn")?.classList.toggle("active", mode === 'sentences_only');
}

function selectSpaceMode(val) {
    spaceMode = val;
    document.getElementById("spaceOnBtn")?.classList.toggle("active", val === true);
    document.getElementById("spaceOffBtn")?.classList.toggle("active", val === false);
}

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playErrorSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
}

function playSuccessSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.08);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + idx * 0.08 + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + idx * 0.08);
        osc.stop(audioCtx.currentTime + idx * 0.08 + 0.3);
    });
}

async function startGame() {
    const success = await loadTrainingDataFromDB();
    if (!success) return;

    calculateTotalSteps();
    if (startScreen) startScreen.classList.add("hidden");
    if (gameScreen) gameScreen.classList.remove("hidden");
    restartGame();
}

function returnToStart() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    if (finishModal) finishModal.classList.add("hidden");
    if (gameScreen) gameScreen.classList.add("hidden");
    if (startScreen) startScreen.classList.remove("hidden");
}

function speakCurrentWord() {
    const target = getCurrentTarget();
    if (!target || !target.text) return;

    if (window.currentAudio) {
        window.currentAudio.pause();
        window.currentAudio.currentTime = 0;
    }

    const ttsUrl = `/api/tts?text=${encodeURIComponent(target.text)}`;
    window.currentAudio = new Audio(ttsUrl);
    window.currentAudio.play().catch(error => {
        console.error("Помилка відтворення аудіо:", error);
    });
}

function getCurrentTarget() {
    const item = window.trainingData[currentWordIndex];
    if (!item) return null;

    const sentences = item.sentences || [];

    // Якщо це текст із таблиці texts, у нього завжди є sentences із чеським текстом
    if (item.emoji === '📄' && sentences.length > 0) {
        return { text: sentences[0].text, translation: sentences[0].translation, isSentence: true };
    }

    if (gameMode === 'sentences_only') {
        if (sentences.length > 0) {
            const idx = Math.min(Math.max(0, currentSentenceIndex), sentences.length - 1);
            return { text: sentences[idx].text, translation: sentences[idx].translation, isSentence: true };
        } else {
            return { text: item.word, translation: item.translation, isSentence: false };
        }
    } else {
        if (currentSentenceIndex === -1) {
            if (!item.word && sentences.length > 0) {
                return { text: sentences[0].text, translation: sentences[0].translation, isSentence: true };
            }
            return { text: item.word, translation: item.translation, isSentence: false };
        } else {
            const idx = Math.min(Math.max(0, currentSentenceIndex), sentences.length - 1);
            const sentenceObj = sentences[idx];
            return { text: sentenceObj.text, translation: sentenceObj.translation, isSentence: true };
        }
    }
}

let currentCharIndex = 0;

function loadRound() {
    if (currentWordIndex >= window.trainingData.length) {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }
        showFinishModal();
        return;
    }

    const target = getCurrentTarget();
    if (!target || !target.text) {
        currentWordIndex++;
        loadRound();
        return;
    }

    targetWordTitle.textContent = target.text;
    const item = window.trainingData[currentWordIndex];
    emojiContainer.textContent = target.isSentence ? "💬" : (item.emoji || "📚");
    
    currentCharIndex = 0;
    renderSlots(target.text);
    
    if (roundIndicator) {
        roundIndicator.textContent = target.isSentence 
            ? `Речення (${item.word || 'фраза'})` 
            : `Слово ${currentWordIndex + 1} із ${window.trainingData.length}`;
    }

    const progressPercent = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
    if (progressBar) progressBar.style.width = `${progressPercent}%`;

    setTimeout(() => {
        speakCurrentWord();
    }, 300);
}

function renderSlots(text) {
    if (!wordDisplay) return;
    wordDisplay.innerHTML = "";
    wordDisplay.className = text.length > 15 ? "letter-slots sentence-mode" : "letter-slots";

    for (let i = 0; i < text.length; i++) {
        const span = document.createElement("span");
        span.classList.add("letter-slot");
        if (i === 0) span.classList.add("active");
        
        if (text[i] === ' ') {
            span.innerHTML = "&nbsp;";
            span.style.borderBottom = spaceMode ? "2px dashed #94a3b8" : "none";
            span.style.minWidth = "15px";
            if (!spaceMode) span.classList.add("auto-space");
        } else {
            span.textContent = "_";
        }
        wordDisplay.appendChild(span);
    }

    if (!spaceMode) {
        skipSpacesAutomatically();
    }
}

function skipSpacesAutomatically() {
    const target = getCurrentTarget();
    if (!target) return;
    const targetText = target.text;
    const slots = wordDisplay.children;

    while (currentCharIndex < targetText.length && targetText[currentCharIndex] === ' ') {
        if (slots[currentCharIndex]) {
            slots[currentCharIndex].textContent = ' ';
            slots[currentCharIndex].classList.add("correct");
        }
        currentCharIndex++;
    }
    if (currentCharIndex < targetText.length && slots[currentCharIndex]) {
        slots[currentCharIndex].classList.add("active");
    }
}

window.addEventListener("keydown", (e) => {
    if (startScreen && startScreen.classList.contains("hidden") === false) return;
    if (finishModal && !finishModal.classList.contains("hidden")) return;
    if (e.key.length > 1 && e.key !== " ") return;

    const target = getCurrentTarget();
    if (!target) return;
    const targetText = target.text;
    const expectedChar = targetText[currentCharIndex];

    if (e.key.toLowerCase() === expectedChar.toLowerCase()) {
        const slots = wordDisplay.children;
        if (slots[currentCharIndex]) {
            slots[currentCharIndex].textContent = expectedChar;
            slots[currentCharIndex].classList.add("correct");
            slots[currentCharIndex].classList.remove("active");
        }

        currentCharIndex++;

        if (!spaceMode) {
            skipSpacesAutomatically();
        } else {
            if (currentCharIndex < targetText.length && slots[currentCharIndex]) {
                slots[currentCharIndex].classList.add("active");
            }
        }

        if (currentCharIndex >= targetText.length) {
            playSuccessSound();
            currentStep++;

            setTimeout(() => {
                const item = window.trainingData[currentWordIndex];
                const sentences = item.sentences || [];

                if (gameMode === 'sentences_only') {
                    currentSentenceIndex++;
                    if (currentSentenceIndex >= sentences.length) {
                        currentSentenceIndex = 0;
                        currentWordIndex++;
                    }
                } else {
                    if (currentSentenceIndex === -1) {
                        if (item.word && sentences.length > 0) {
                            currentSentenceIndex = 0;
                        } else {
                            currentWordIndex++;
                        }
                    } else {
                        currentSentenceIndex++;
                        if (currentSentenceIndex >= sentences.length) {
                            currentSentenceIndex = -1;
                            currentWordIndex++;
                        }
                    }
                }
                loadRound();
            }, 800);
        }
    } else {
        playErrorSound();
        if (gameCard) {
            gameCard.classList.remove("shake");
            void gameCard.offsetWidth;
            gameCard.classList.add("shake");
        }
    }
});

function showFinishModal() {
    if (progressBar) progressBar.style.width = `100%`;
    if (wordsGrid) {
        wordsGrid.innerHTML = "";
        window.trainingData.forEach(item => {
            const div = document.createElement("div");
            div.classList.add("word-summary-item");
            div.innerHTML = `
                <div style="font-size: 24px;">${item.emoji || '💬'}</div>
                <div style="color: #0284c7; font-weight: bold; font-size: 15px;">${item.word || 'Фраза'}</div>
                <div style="color: #64748b; font-size: 11px;">${item.translation}</div>
            `;
            wordsGrid.appendChild(div);
        });
    }
    if (finishModal) finishModal.classList.remove("hidden");
}

function showHint() {
    const target = getCurrentTarget();
    if (target) alert(`Переклад: ${target.translation}`);
}

function restartGame() {
    if (finishModal) finishModal.classList.add("hidden");
    currentWordIndex = 0;
    currentSentenceIndex = (gameMode === 'sentences_only') ? 0 : -1;
    calculateTotalSteps();
    loadRound();
}
