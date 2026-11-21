import os
import telebot
import random
import time
import threading
import re
from datetime import datetime
from zoneinfo import ZoneInfo
from telebot import types
from supabase import create_client, Client

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def _require_env(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Змінна середовища {name} не задана! Додайте її у Render (Environment) або у файл .env")
    return value


# Налаштування Telegram Бота (токен береться зі змінних середовища, не зберігайте його в коді)
TOKEN = _require_env('CZECH_BOT_TOKEN')
bot = telebot.TeleBot(TOKEN)

# Налаштування Supabase. Бот використовує СЕКРЕТНИЙ service_role-ключ (він обходить RLS).
# Цей ключ НІКОЛИ не повинен потрапляти на сайт або у GitHub.
SUPABASE_URL = os.environ.get('SUPABASE_URL', "https://yvigquzsntvdkdusunxt.supabase.co")
SUPABASE_KEY = _require_env('SUPABASE_SERVICE_KEY')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- ЧАСОВІ ПОЯСИ ---
# Сервер Render працює за UTC, тому час нагадування порівнюється з місцевим часом користувача.
DEFAULT_TZ = 'Europe/Kyiv'
TZ_BUTTONS = {
    '🇺🇦 Київ': 'Europe/Kyiv',
    '🇨🇿 Прага': 'Europe/Prague',
    '🇵🇱 Варшава': 'Europe/Warsaw',
    '🇩🇪 Берлін': 'Europe/Berlin',
    '🇬🇧 Лондон': 'Europe/London',
}

def get_zone(name):
    """Повертає ZoneInfo або значення за замовчуванням, якщо назва некоректна"""
    try:
        return ZoneInfo(name or DEFAULT_TZ)
    except Exception:
        return ZoneInfo(DEFAULT_TZ)

# --- РОБОТА З БАЗОЮ ДАНИХ ---
def load_data_from_cloud(table_name):
    try:
        response = supabase.table(table_name).select('*').execute()
        return response.data
    except Exception as e:
        print(f"Помилка підключення до таблиці {table_name}: {e}")
        return []

# --- ДОПОМІЖНІ ФУНКЦІЇ ---
def clean_text(text):
    """Видаляє всі знаки пунктуації та зайві пробіли, переводить у нижній регістр"""
    if not text:
        return ""
    return re.sub(r'[^\w\s]', '', str(text)).strip().lower()

# --- КЛАВІАТУРИ ---
def get_main_menu():
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
    btn_train_w = types.KeyboardButton('🎯 Тренувати слова')
    btn_train_e = types.KeyboardButton('💬 Тренувати вирази')
    btn_reminder = types.KeyboardButton('⏰ Нагадування')
    btn_id = types.KeyboardButton('🆔 Мій ID')
    btn_restart = types.KeyboardButton('🔄 Перезапустити')
    btn_tz = types.KeyboardButton('🌍 Часовий пояс')
    markup.add(btn_train_w, btn_train_e, btn_reminder, btn_tz, btn_id, btn_restart)
    return markup

def get_stop_menu():
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add(types.KeyboardButton('❌ Зупинити'))
    return markup

# --- АВТОМАТИЧНІ НАГАДУВАННЯ (Індивідуальні) ---
def scheduler_thread():
    """Фоновий потік, який щохвилини перевіряє, кому треба надіслати повідомлення"""
    while True:
        try:
            # Беремо всіх, хто має час, і порівнюємо з МІСЦЕВИМ часом кожного користувача
            response = supabase.table('users').select('tg_id,reminder_time,timezone').not_.is_('reminder_time', 'null').execute()
            for user in response.data or []:
                rt = str(user.get('reminder_time') or '')[:5]
                tg_id = str(user.get('tg_id') or '').strip()
                now_local = datetime.now(get_zone(user.get('timezone'))).strftime("%H:%M")
                if rt != now_local or not tg_id.lstrip('-').isdigit():
                    continue
                try:
                    text = "⏰ Привіт! Час вивчити кілька нових слів або виразів. Поїхали? 😉"
                    bot.send_message(int(tg_id), text, reply_markup=get_main_menu())
                    print(f"Нагадування надіслано користувачу {tg_id}")
                except Exception as e:
                    print(f"Не вдалося надіслати {tg_id}: {e}")
        except Exception as e:
            print(f"Помилка в планувальнику: {e}")
            
        time.sleep(60 - datetime.now().second)

# --- ОБРОБНИКИ КОМАНД ---
@bot.message_handler(commands=['start', 'restart'])
@bot.message_handler(func=lambda message: message.text == '🔄 Перезапустити')
def send_welcome(message):
    bot.clear_step_handler_by_chat_id(message.chat.id)
    text = (
        f"👋 <b>Привіт! Вітаю у боті для вивчення чеської мови!</b>\n\n"
        f"Використовуй кнопки меню внизу екрана для керування."
    )
    bot.send_message(message.chat.id, text, parse_mode='HTML', reply_markup=get_main_menu())

@bot.message_handler(func=lambda message: message.text == '🆔 Мій ID')
def show_id(message):
    bot.clear_step_handler_by_chat_id(message.chat.id)
    bot.send_message(message.chat.id, f"Твій Telegram ID:\n👉 <code>{message.chat.id}</code> 👈", parse_mode='HTML')

# Глобальний обробник кнопки "Зупинити", щоб вона працювала в будь-який момент
@bot.message_handler(func=lambda message: message.text == '❌ Зупинити')
def global_stop(message):
    bot.clear_step_handler_by_chat_id(message.chat.id)
    bot.send_message(message.chat.id, "Тренування завершено! 🏁", reply_markup=get_main_menu())

def route_menu(message):
    """Якщо користувач натиснув кнопку меню під час кроку введення, переходимо до потрібної дії. Повертає True, якщо повідомлення оброблено."""
    txt = message.text or ''
    if not (txt in MENU_BUTTONS or txt.startswith('/')):
        return False
    bot.clear_step_handler_by_chat_id(message.chat.id)
    if txt == '❌ Зупинити':
        global_stop(message)
    elif txt in ['🔄 Перезапустити', '/start', '/restart']:
        send_welcome(message)
    elif txt == '🆔 Мій ID':
        show_id(message)
    elif txt == '⏰ Нагадування':
        setup_reminder(message)
    elif txt == '🌍 Часовий пояс':
        setup_timezone(message)
    elif txt in ['🎯 Тренувати слова', '💬 Тренувати вирази']:
        start_training(message)
    return True

MENU_BUTTONS = ['❌ Зупинити', '🔄 Перезапустити', '🆔 Мій ID', '⏰ Нагадування', '🌍 Часовий пояс', '🎯 Тренувати слова', '💬 Тренувати вирази']

# --- НАЛАШТУВАННЯ НАГАДУВАННЯ ---
@bot.message_handler(func=lambda message: message.text == '⏰ Нагадування')
def setup_reminder(message):
    bot.clear_step_handler_by_chat_id(message.chat.id)
    tz_name = DEFAULT_TZ
    try:
        r = supabase.table('users').select('timezone').eq('tg_id', str(message.chat.id)).execute()
        if r.data:
            tz_name = r.data[0].get('timezone') or DEFAULT_TZ
    except Exception as e:
        print(f"Помилка читання поясу: {e}")
    local = datetime.now(get_zone(tz_name)).strftime('%H:%M')
    text = (
        "Введіть бажаний час для щоденного нагадування у форматі <b>ГГ:ХХ</b> (наприклад, 18:30 або 09:00).\n\n"
        f"🌍 Ваш часовий пояс: <b>{tz_name}</b> (зараз там {local}). Якщо час невірний, натисніть «🌍 Часовий пояс».\n\n"
        "Щоб вимкнути нагадування, напишіть слово <b>Вимкнути</b>."
    )
    msg = bot.send_message(message.chat.id, text, parse_mode='HTML')
    bot.register_next_step_handler(msg, save_reminder)

def save_reminder(message):
    if not message.text:
        msg = bot.send_message(message.chat.id, "Введіть час текстом, наприклад <b>18:30</b>.", parse_mode='HTML')
        bot.register_next_step_handler(msg, save_reminder)
        return
    if route_menu(message):
        return

    text = message.text.strip().lower()

    try:
        user_check = supabase.table('users').select('id,timezone').eq('tg_id', str(message.chat.id)).execute()
        if not user_check.data:
            bot.send_message(message.chat.id, "❌ Спочатку прив'яжіть свій Telegram ID на сайті у Профілі!", reply_markup=get_main_menu())
            return
        tz_name = user_check.data[0].get('timezone') or DEFAULT_TZ

        if text == 'вимкнути':
            supabase.table('users').update({'reminder_time': None}).eq('tg_id', str(message.chat.id)).execute()
            bot.send_message(message.chat.id, "Нагадування вимкнено 🔕", reply_markup=get_main_menu())
            return

        if re.match(r'^([01]?\d|2[0-3]):([0-5]\d)$', text):
            hh, mm = text.split(':')
            text = f"{int(hh):02d}:{mm}"
            supabase.table('users').update({'reminder_time': text}).eq('tg_id', str(message.chat.id)).execute()
            bot.send_message(
                message.chat.id,
                f"✅ Нагадування встановлено на <b>{text}</b> ⏰\n🌍 Часовий пояс: {tz_name}",
                parse_mode='HTML', reply_markup=get_main_menu()
            )
        else:
            msg = bot.send_message(message.chat.id, "❌ Неправильний формат. Введіть час як <b>18:30</b> (або напишіть 'Вимкнути').", parse_mode='HTML')
            bot.register_next_step_handler(msg, save_reminder)
    except Exception as e:
        print(f"Помилка збереження нагадування: {e}")
        bot.send_message(message.chat.id, "⚠️ Щось пішло не так. Спробуйте ще раз пізніше.", reply_markup=get_main_menu())

# --- ЧАСОВИЙ ПОЯС ---
@bot.message_handler(func=lambda message: message.text == '🌍 Часовий пояс')
def setup_timezone(message):
    bot.clear_step_handler_by_chat_id(message.chat.id)
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
    markup.add(*[types.KeyboardButton(label) for label in TZ_BUTTONS])
    markup.add(types.KeyboardButton('❌ Зупинити'))
    text = (
        "🌍 Оберіть свій часовий пояс кнопкою, або напишіть назву у форматі <code>Країна/Місто</code> латиницею, "
        "наприклад <code>Europe/Vienna</code>.\n\nСаме за цим часом будуть приходити нагадування."
    )
    msg = bot.send_message(message.chat.id, text, parse_mode='HTML', reply_markup=markup)
    bot.register_next_step_handler(msg, save_timezone)

def save_timezone(message):
    if not message.text:
        msg = bot.send_message(message.chat.id, "Надішліть назву поясу текстом.")
        bot.register_next_step_handler(msg, save_timezone)
        return
    if route_menu(message):
        return

    tz_name = TZ_BUTTONS.get(message.text.strip(), message.text.strip())
    try:
        zone = ZoneInfo(tz_name)
    except Exception:
        msg = bot.send_message(message.chat.id, "❌ Не знаю такого поясу. Оберіть кнопкою або напишіть, наприклад, <code>Europe/Vienna</code>.", parse_mode='HTML')
        bot.register_next_step_handler(msg, save_timezone)
        return

    try:
        user_check = supabase.table('users').select('id').eq('tg_id', str(message.chat.id)).execute()
        if not user_check.data:
            bot.send_message(message.chat.id, "❌ Спочатку прив'яжіть свій Telegram ID на сайті у Профілі!", reply_markup=get_main_menu())
            return
        supabase.table('users').update({'timezone': tz_name}).eq('tg_id', str(message.chat.id)).execute()
        local = datetime.now(zone).strftime('%H:%M')
        bot.send_message(message.chat.id, f"✅ Часовий пояс: <b>{tz_name}</b>\nЗараз там {local}. Тепер встановіть час нагадування кнопкою «⏰ Нагадування».", parse_mode='HTML', reply_markup=get_main_menu())
    except Exception as e:
        print(f"Помилка збереження поясу: {e}")
        bot.send_message(message.chat.id, "⚠️ Не вдалося зберегти. Спробуйте пізніше.", reply_markup=get_main_menu())

# --- ТРЕНУВАННЯ ---
@bot.message_handler(func=lambda message: message.text in ['🎯 Тренувати слова', '💬 Тренувати вирази'])
def start_training(message):
    is_word = (message.text == '🎯 Тренувати слова')
    table = 'dictionary' if is_word else 'expressions'
    
    items = load_data_from_cloud(table)
    if not items:
        bot.send_message(message.chat.id, "Цей список порожній! Додайте дані на сайті.", reply_markup=get_main_menu())
        return

    item = random.choice(items)
    # Беремо відразу і укр, і рус переклад з бази
    correct_ua = item.get('ua') or ''
    correct_ru = item.get('ru') or ''
    
    prefix = "слово" if is_word else "вираз"
    text = f"❓ Як перекладається {prefix}:\n<b>{item.get('cz')}</b> ?"
    
    msg = bot.send_message(message.chat.id, text, parse_mode='HTML', reply_markup=get_stop_menu())
    bot.register_next_step_handler(msg, check_answer, correct_ua, correct_ru, table)

def check_answer(message, correct_ua, correct_ru, training_type):
    if not message.text:
        msg = bot.send_message(message.chat.id, "Будь ласка, введіть текст.", reply_markup=get_stop_menu())
        bot.register_next_step_handler(msg, check_answer, correct_ua, correct_ru, training_type)
        return

    if route_menu(message):
        return

    # Очищуємо текст користувача та обидва варіанти правильної відповіді
    user_ans = clean_text(message.text)
    ans_ua = clean_text(correct_ua)
    ans_ru = clean_text(correct_ru)
    
    inline_markup = types.InlineKeyboardMarkup()
    callback_data = "next_word" if training_type == 'dictionary' else "next_expr"
    inline_markup.add(types.InlineKeyboardButton(text="➡️ Далі", callback_data=callback_data))
    
    # Перевіряємо збіг хоча б з одним з варіантів
    if user_ans == ans_ua or (ans_ru and user_ans == ans_ru):
        bot.send_message(message.chat.id, "✅ Правильно! 🎉", reply_markup=inline_markup)
    else:
        # У разі помилки показуємо український переклад, якщо він є (або російський, якщо укр порожній)
        display_correct = correct_ua if correct_ua else correct_ru
        bot.send_message(message.chat.id, f"❌ Помилка.\nПравильна відповідь: <b>{display_correct}</b>", parse_mode='HTML', reply_markup=inline_markup)

@bot.callback_query_handler(func=lambda call: call.data in ["next_word", "next_expr"])
def callback_next(call):
    bot.answer_callback_query(call.id)
    call.message.text = '🎯 Тренувати слова' if call.data == "next_word" else '💬 Тренувати вирази'
    start_training(call.message)

def run_czech_bot():
    t = threading.Thread(target=scheduler_thread, daemon=True)
    t.start()
    # Безкінечний цикл: якщо polling впав (наприклад, 409 Conflict під час деплою, коли на хвилину
    # працюють дві копії бота), потік не помирає, а через кілька секунд пробує знову.
    while True:
        try:
            bot.remove_webhook()   # без цього polling не працює, якщо на токені є webhook
            print("Чеський бот запускається...")
            bot.infinity_polling(timeout=30, long_polling_timeout=30, skip_pending=True)
        except Exception as e:
            print(f"⚠️ Чеський бот впав: {e}. Перезапуск через 5 секунд...")
            time.sleep(5)

if __name__ == '__main__':
    run_czech_bot()
