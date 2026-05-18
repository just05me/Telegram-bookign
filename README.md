# Telegram Booking Bot

Telegram-бот для организации записи клиентов на встречи. Позволяет организаторам создавать календари с настраиваемым расписанием, а клиентам — бронировать слоты через интерактивный inline-интерфейс прямо в Telegram.

## Возможности

### Для организатора
- **Календарь** — создание и настройка календаря (название, описание, длительность встречи)
- **Расписание** — гибкая настройка рабочих часов по дням недели, несколько слотов в день, добавление на все дни одной кнопкой
- **Исключения** — ручное добавление выходных или особых часов на конкретные даты
- **Управление встречами** — просмотр всех записей, отмена с подтверждением второй стороны, приватные заметки, указание адреса
- **Опции бронирования** — создание групп дополнительных услуг/вариантов, которые клиент выбирает при записи
- **Статистика** — общее количество встреч, запланированные/отменённые, загруженность по датам, среднее число участников
- **Google Calendar** — OAuth 2.0 подключение, автоматическое создание событий при бронировании и удаление при отмене
- **Ссылка для клиентов** — персональная ссылка вида `https://t.me/bot?start=slug` для быстрого бронирования

### Для клиента
- **Бронирование** — выбор даты через интерактивный календарь с навигацией по месяцам
- **Выбор времени** — сетка свободных слотов с учётом расписания, буферов и занятых часов
- **Форма записи** — имя, Telegram, Instagram, телефон (через кнопку «Поделиться номером» или вручную), количество участников, заметка
- **Опции** — выбор дополнительных услуг при бронировании (если настроены организатором)
- **Подтверждение** — сводка всех данных перед записью, защита от race condition (проверка конфликтов в момент подтверждения)
- **Управление** — просмотр своих встреч, запрос отмены с подтверждением организатора

### Общее
- **Напоминания** — автоматические уведомления за 1 день, 3 часа и 1 час до встречи (cron, каждые 5 минут)
- **Google Calendar** — двусторонняя синхронизация; проверка конфликтов через FreeBusy API
- **Генерация ICS** — библиотечная подготовка .ics-файлов

## Стек технологий

| Компонент | Технология |
|---|---|
| Bot framework | [grammY](https://grammy.dev/) (TypeScript) |
| ORM | Prisma 6 |
| База данных | SQLite |
| HTTP-сервер | Express |
| Календарь | Google Calendar API v3 |
| Напоминания | node-cron |

## Структура проекта

```
V2/
├── packages/server/
│   ├── prisma/
│   │   └── schema.prisma          # 11 моделей: User, Organizer, Appointment, AvailabilitySlot, ExceptionDate, BookingOptionGroup/Choice, Session, Reminder
│   └── src/
│       ├── index.ts               # Точка входа: Express + бот + напоминания
│       ├── config.ts              # Загрузка .env, конфигурация
│       ├── api/google.ts          # OAuth-эндпоинты для Google Calendar
│       ├── bot/
│       │   ├── index.ts           # Инициализация бота, middleware, error handling
│       │   ├── commands.ts        # /start, /menu, /book, /my_bookings + role selection
│       │   ├── callbacks.ts       # Все inline-кнопки: навигация, действия над встречами
│       │   ├── keyboards.ts       # Фабрики inline и reply клавиатур
│       │   ├── booking.ts         # Логика бронирования: календарь, слоты, форма, подтверждение
│       │   ├── settings.ts        # Настройки календаря организатора
│       │   ├── availability.ts    # Управление рабочим расписанием
│       │   ├── options.ts         # Управление опциями бронирования
│       │   └── address.ts         # Указание адреса встречи
│       └── lib/
│           ├── prisma.ts          # PrismaClient singleton
│           ├── session.ts         # Сессии: in-memory cache + SQLite persist (Proxy-автосохранение)
│           ├── slots.ts           # Генерация доступных временных слотов
│           ├── telegram.ts        # Отправка сообщений через Telegram API
│           ├── reminders.ts       # Cron-напоминания о встречах
│           ├── google.ts          # Google Calendar API (создание/удаление событий)
│           ├── ics.ts             # Генерация .ics файлов
│           ├── timezone.ts        # Утилиты для работы с часовыми поясами
│           └── escape.ts          # Экранирование Markdown для Telegram
├── docker-compose.yml             # PostgreSQL (не используется, БД = SQLite)
├── ruvector.db                    # Файл SQLite БД
└── .env.example                   # Шаблон конфигурации
```

## Модель данных

Основные сущности:

- **User** — пользователь бота (telegramId, роль ORGANIZER/CLIENT)
- **Organizer** — календарь организатора (slug, title, настройки времени, Google Calendar токены)
- **AvailabilitySlot** — рабочие слоты (день недели, startTime, endTime)
- **ExceptionDate** — исключения в расписании на конкретную дату
- **Appointment** — встреча (клиентские данные, время, статус, адрес, Google-событие)
- **BookingOptionGroup / BookingOptionChoice** — группы опций и их варианты
- **Session** — сессии пользователей (JSON, persist в SQLite)
- **Reminder** — напоминания (тип, статус отправки)

Статусы встречи: `CONFIRMED → CANCELLATION_REQUESTED → CANCELLED` / `RESCHEDULE_REQUESTED → RESCHEDULED`

## Быстрый старт

### Требования
- Node.js 20+
- npm
- Telegram Bot Token (через [@BotFather](https://t.me/BotFather))

### Установка

```bash
# Клонировать репозиторий
git clone <repo-url>
cd telegram-booking/V2

# Скопировать и заполнить .env
cp .env.example .env
```

### Настройка `.env`

```env
BOT_TOKEN=your_telegram_bot_token
DATABASE_URL="file:./dev.db"
PORT=3001

# Google Calendar OAuth (опционально, но рекомендуется)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/google/callback

# Ключ шифрования для Google refresh token
ENCRYPTION_KEY=your-32-char-encryption-key
```

### Запуск

```bash
npm install
npx prisma migrate dev
npm run dev -w packages/server
```

Бот запускается в polling-режиме (по умолчанию). Для webhook укажите `BOT_WEBHOOK_URL` в `.env`.

## API эндпоинты

Express-сервер (обязателен для Google OAuth):

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/google/auth` | Начало OAuth-флоу Google |
| GET | `/api/google/callback` | Callback OAuth Google |

## Команды бота

| Команда | Описание |
|---|---|
| `/start` | Регистрация / вход. С deep link (`/start slug`) — сразу бронирование |
| `/menu` | Главное меню |
| `/book <slug>` | Запустить бронь по slug организатора |
| `/my_bookings` | Список своих встреч |

## Флоу бронирования

```
1. Выбор даты (календарь с навигацией по месяцам)
       ↓
2. Выбор времени (сетка свободных слотов)
       ↓
3. Выбор опции (опционально)
       ↓
4. Форма: имя → Telegram → Instagram → телефон → участники → заметка
       ↓
5. Подтверждение (сводка всех данных)
       ↓
6. Проверка конфликтов → создание записи → уведомление организатора
```

## Версии

- `V1` — первая версия на Next.js с веб-приложением
- `V2` — актуальная версия: чистый Telegram-бот, общая кодовая база
