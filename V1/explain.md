# Telegram Booking — Полная документация проекта

## Что это за проект?

**Telegram Booking** — система онлайн-записи на встречи, полностью интегрированная с Telegram. Организатор (мастер, врач, тренер и т.д.) регистрируется через Telegram-бота, получает персональную ссылку, которую отправляет клиентам. Клиент открывает WebApp прямо внутри Telegram, выбирает дату/время и бронирует встречу. Организатор получает уведомление в Telegram.

---

## Архитектура — общая схема

```
┌──────────────────────────────────────────────────────────┐
│                     КЛИЕНТ (Telegram)                    │
│  Открывает WebApp → выбирает дату → бронирует встречу   │
└───────────────────────────┬──────────────────────────────┘
                            │ HTTPS
                            ▼
┌──────────────────────────────────────────────────────────┐
│              WEBAPP  (packages/webapp)                   │
│  Next.js 14 + React + Tailwind CSS                       │
│  Страницы:                                               │
│    /book/[slug]       — форма бронирования               │
│    /book/[slug]/success — страница успеха                │
│    /dashboard         — кабинет организатора             │
│    /dashboard/settings    — настройки                    │
│    /dashboard/availability — расписание                  │
│    /dashboard/options     — опции бронирования           │
└───────────────────────────┬──────────────────────────────┘
                            │ REST API
                            ▼
┌──────────────────────────────────────────────────────────┐
│              SERVER  (packages/server)                   │
│  Express.js + TypeScript                                 │
│  Модули:                                                 │
│    /api/*        — REST endpoints                        │
│    /bot/*        — Telegram Bot (grammy)                 │
│    /lib/*        — утилиты (слоты, напоминания, Google)  │
│    Prisma ORM    — база данных                           │
└───────────────────────────┬──────────────────────────────┘
                            │
               ┌────────────┼────────────┐
               ▼            ▼            ▼
          SQLite/PG    Telegram API   Google Calendar
          (данные)     (уведомления)  (опционально)
```

---

## Структура файлов

```
telegram-booking/
├── package.json                   # npm workspaces (monorepo)
├── .env                           # переменные окружения
├── .env.example                   # пример переменных
├── scripts/
│   └── start-tunnel.sh            # ngrok-туннель для локальной разработки
│
├── packages/server/               # BACKEND
│   ├── src/
│   │   ├── index.ts               # точка входа: Express + Bot + Cron
│   │   ├── config.ts              # конфиг из .env
│   │   ├── types/
│   │   │   └── index.ts           # TypeScript-типы (SlotResult и др.)
│   │   ├── api/
│   │   │   ├── router.ts          # главный роутер /api/*
│   │   │   ├── organizers.ts      # CRUD организаторов
│   │   │   ├── appointments.ts    # CRUD встреч, отмена, перенос
│   │   │   ├── slots.ts           # GET свободных слотов
│   │   │   ├── options.ts         # CRUD опций бронирования
│   │   │   ├── google.ts          # OAuth Google Calendar
│   │   │   └── webapp.ts          # валидация Telegram initData
│   │   ├── bot/
│   │   │   ├── index.ts           # создание и запуск бота
│   │   │   ├── commands.ts        # /start, /menu, кнопки клавиатуры
│   │   │   ├── callbacks.ts       # inline-кнопки (встречи, опции и т.д.)
│   │   │   └── keyboards.ts       # фабрики клавиатур
│   │   └── lib/
│   │       ├── prisma.ts          # Prisma клиент (singleton)
│   │       ├── slots.ts           # алгоритм генерации слотов
│   │       ├── reminders.ts       # cron напоминаний
│   │       ├── telegram.ts        # отправка сообщений через бота
│   │       ├── google.ts          # Google Calendar API
│   │       ├── timezone.ts        # утилиты таймзон
│   │       ├── rate-limit.ts      # in-memory rate limiter
│   │       └── ics.ts             # генерация .ics файлов
│   └── prisma/
│       └── schema.prisma          # схема БД
│
└── packages/webapp/               # FRONTEND
    └── src/
        ├── app/
        │   ├── layout.tsx                     # root layout
        │   ├── page.tsx                       # главная страница
        │   ├── book/[slug]/
        │   │   ├── page.tsx                   # форма бронирования
        │   │   └── success/page.tsx           # страница успеха
        │   └── dashboard/
        │       ├── layout.tsx                 # layout дашборда
        │       ├── page.tsx                   # список встреч
        │       ├── settings/page.tsx          # настройки организатора
        │       ├── availability/page.tsx      # расписание
        │       └── options/page.tsx           # опции бронирования
        ├── components/
        │   ├── telegram-provider.tsx          # инициализация Telegram WebApp SDK
        │   └── booking/
        │       ├── calendar-view.tsx          # выбор даты
        │       ├── time-slots.tsx             # выбор времени
        │       ├── booking-form.tsx           # форма данных клиента
        │       └── options-select.tsx         # выбор опций
        └── lib/
            ├── api.ts                         # клиент REST API
            └── utils.ts                       # форматирование дат
```

---

## База данных (Prisma Schema)

### Модели

#### `User` — пользователь Telegram
```prisma
model User {
  id               String    // UUID
  telegramId       BigInt    // уникальный Telegram ID
  telegramUsername String?
  firstName        String
  lastName         String?
  languageCode     String?
  role             String    // "ORGANIZER" | "CLIENT"
  createdAt        DateTime

  organizer    Organizer?     // если пользователь — организатор
  appointments Appointment[]  // встречи, где он клиент
}
```

#### `Organizer` — профиль организатора
```prisma
model Organizer {
  id                  String   // UUID
  userId              String   // FK → User
  slug                String   // уникальный URL-идентификатор (напр. "ivan-a1b2")
  title               String   // название календаря
  description         String?
  defaultDuration     Int      // длительность встречи в минутах (по умолчанию 30)
  bufferBefore        Int      // буфер до встречи в минутах (по умолчанию 0)
  bufferAfter         Int      // буфер после встречи в минутах (по умолчанию 5)
  maxMeetingsPerDay   Int      // макс. встреч в день (по умолчанию 10)
  bookingDeadlineDays Int      // на сколько дней вперёд можно бронировать (60)
  timezone            String   // часовой пояс (по умолчанию "UTC")
  isActive            Boolean
  googleRefreshToken  String?  // токен Google Calendar (зашифрован)
  googleCalendarId    String?
  createdAt           DateTime
}
```

#### `AvailabilitySlot` — рабочие часы по дням недели
```prisma
model AvailabilitySlot {
  id          String
  organizerId String
  dayOfWeek   Int    // 0=Вс, 1=Пн, ..., 6=Сб
  startTime   String // "09:00" — в таймзоне организатора
  endTime     String // "18:00"
}
```

#### `ExceptionDate` — исключения из расписания
```prisma
model ExceptionDate {
  id          String
  organizerId String
  date        DateTime
  isAvailable Boolean  // false = выходной, true = особый график
  startTime   String?  // если особый — время начала
  endTime     String?  // если особый — время конца
  reason      String?
}
```

#### `Appointment` — встреча/запись
```prisma
model Appointment {
  id                     String
  organizerId            String
  clientId               String?   // FK → User (если клиент зарегистрирован)
  clientName             String    // имя клиента
  clientContact          String    // контакт (email / телефон)
  clientNote             String?   // заметка от клиента
  instagram              String?
  clientTelegram         String?
  phoneNumber            String?
  participantsCount      Int       // количество участников
  selectedChoiceId       String?   // FK → BookingOptionChoice
  startTime              DateTime
  endTime                DateTime
  duration               Int       // минуты
  status                 String    // CONFIRMED | CANCELLATION_REQUESTED | CANCELLED |
                                   // RESCHEDULE_REQUESTED | RESCHEDULED
  cancellationRequestedBy String?  // "ORGANIZER" | "CLIENT"
  cancellationReason     String?
  rescheduleTargetTime   DateTime? // новое время при запросе переноса
  googleEventId          String?
  createdAt              DateTime
}
```

#### `BookingOptionGroup` / `BookingOptionChoice` — опции бронирования
```
BookingOptionGroup — группа опций (например: "Тип услуги")
  ├── BookingOptionChoice — "Стрижка"
  ├── BookingOptionChoice — "Окрашивание"
  └── BookingOptionChoice — "Укладка"
```

#### `Reminder` — отправленные напоминания
```prisma
model Reminder {
  id            String
  appointmentId String
  type          String    // "BEFORE_1H" | "BEFORE_3H" | "BEFORE_1D"
  scheduledFor  DateTime
  sentAt        DateTime?
  status        String    // "PENDING" | "SENT" | "FAILED"
}
```

---

## Конфигурация (.env)

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | URL базы данных. SQLite: `file:./dev.db`, PostgreSQL: `postgresql://...` |
| `BOT_TOKEN` | Токен Telegram-бота от @BotFather |
| `BOT_WEBHOOK_URL` | URL вебхука (пусто = polling режим) |
| `PORT` | Порт сервера (по умолчанию 3001) |
| `FRONTEND_URL` | URL фронтенда (http://localhost:3000) |
| `SESSION_SECRET` | Секрет сессии |
| `GOOGLE_CLIENT_ID` | OAuth Client ID Google |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret Google |
| `GOOGLE_REDIRECT_URI` | Callback URL для Google OAuth |
| `ENCRYPTION_KEY` | 32-символьный ключ шифрования токенов Google |
| `NGROK_AUTHTOKEN` | Токен ngrok для локального HTTPS |

---

## Точка входа сервера (`packages/server/src/index.ts`)

```typescript
const app = express();
app.use(cors({ origin: config.frontendUrl }));  // разрешаем CORS только для фронтенда
app.use(express.json());
app.use('/api', apiRouter);
app.get('/health', (_req, res) => res.json({ ok: true }));

async function main() {
  await startBot();        // запускаем Telegram-бота
  startReminderCron();     // запускаем cron напоминаний (каждые 5 минут)
  app.listen(config.port); // слушаем порт
}
```

---

## REST API

### Роутер (`/api/*`)

| Маршрут | Файл |
|---|---|
| `/api/organizers/*` | `organizers.ts` |
| `/api/appointments/*` | `appointments.ts` |
| `/api/organizers/:slug/slots` | `slots.ts` |
| `/api/organizers/:id/options` | `options.ts` |
| `/api/google/*` | `google.ts` |
| `/api/webapp/*` | `webapp.ts` |

---

### Организаторы (`organizers.ts`)

**`GET /api/organizers/by-telegram/:telegramId`**
- Ищет организатора по Telegram ID
- Возвращает `{ id, slug, title }`

**`GET /api/organizers/:slug`**
- Публичный профиль организатора для страницы бронирования
- Возвращает настройки + активные группы опций

**`POST /api/organizers`**
- Создаёт нового организатора
- Body: `{ telegramId, title, timezone }`
- Автоматически генерирует уникальный `slug`

**`POST /api/organizers/:id/settings`**
- Обновляет настройки: `title`, `description`, `defaultDuration`, `bufferBefore`, `bufferAfter`, `maxMeetingsPerDay`, `bookingDeadlineDays`, `timezone`

**`POST /api/organizers/:id/availability`**
- Перезаписывает рабочие часы организатора
- Body: `{ slots: [{ dayOfWeek, startTime, endTime }] }`

**`GET /api/organizers/:id/appointments`**
- Список всех встреч организатора (по убыванию времени)

---

### Встречи (`appointments.ts`)

**`POST /api/appointments`** — создать запись
- Rate limit: 10 запросов в минуту с одного IP
- Body: `{ organizerId, clientName, clientContact, startTime, duration, clientNote?, instagram?, clientTelegram?, phoneNumber?, participantsCount?, selectedChoiceId? }`
- Логика:
  1. Проверяет rate limit
  2. Находит организатора, проверяет `isActive`
  3. Вычисляет `endTime = startTime + duration * 60000`
  4. **Race condition check**: ищет пересекающиеся записи (`status IN ['CONFIRMED', 'RESCHEDULE_REQUESTED']`)
  5. Проверяет дневной лимит (`maxMeetingsPerDay`)
  6. Создаёт запись в БД
  7. Отправляет уведомление организатору в Telegram

**`GET /api/appointments/:id`** — получить встречу по ID

**`POST /api/appointments/:id/cancel`** — запрос на отмену
- Меняет статус на `CANCELLATION_REQUESTED`
- Уведомляет вторую сторону в Telegram

**`POST /api/appointments/:id/confirm-cancel`** — подтвердить отмену
- Меняет статус на `CANCELLED`
- Уведомляет обе стороны

**`POST /api/appointments/:id/reschedule`** — запрос на перенос
- Проверяет отсутствие конфликта в новом времени
- Меняет статус на `RESCHEDULE_REQUESTED`, сохраняет `rescheduleTargetTime`
- Уведомляет организатора

**`POST /api/appointments/:id/confirm-reschedule`** — подтвердить перенос
- Меняет статус на `RESCHEDULED`
- Обновляет `startTime` / `endTime` из `rescheduleTargetTime`

---

### Слоты (`slots.ts`)

**`GET /api/organizers/:slug/slots?date=YYYY-MM-DD&timezone=...`**

Вызывает функцию `generateAvailableSlots()` из `lib/slots.ts`.

**Алгоритм генерации слотов:**
1. Определяет `dayOfWeek` для запрошенной даты
2. Проверяет `ExceptionDate` — если день отмечен как нерабочий (`isAvailable=false`) — возвращает `[]`
3. Берёт `AvailabilitySlot` для этого дня недели (или исключение с особым временем)
4. Загружает существующие встречи на этот день (`status IN ['CONFIRMED', 'RESCHEDULE_REQUESTED', 'CANCELLATION_REQUESTED']`)
5. Вычисляет "занятые диапазоны" с учётом буферов: `[start - bufferBefore, end + bufferAfter]`
6. Разбивает рабочий день на слоты длиной `defaultDuration` минут
7. Убирает слоты, пересекающиеся с занятыми диапазонами
8. Обрезает список до `maxMeetingsPerDay - уже_забронировано`
9. Возвращает массив `[{ start: "HH:mm", end: "HH:mm" }]`

---

### Опции (`options.ts`)

**`GET /api/organizers/:id/options`** — все группы опций с вариантами

**`POST /api/organizers/:id/options`** — создать/обновить группу
- Body: `{ groupId?, title, choices: [{ label, sortOrder? }] }`
- Если `groupId` передан — обновляет существующую группу (удаляет старые варианты и создаёт новые)
- Если `groupId` не передан — создаёт новую

**`DELETE /api/organizers/:id/options/:groupId`** — удалить группу
- Сначала очищает `selectedChoiceId` у связанных встреч (чтобы не было битых ссылок)
- Затем удаляет группу (каскадно удаляет варианты)

---

### Webapp (`webapp.ts`)

**`POST /api/webapp/init`** — валидация Telegram WebApp initData

Telegram WebApp передаёт `initData` при открытии. Сервер проверяет подпись:
1. Удаляет `hash` из параметров
2. Сортирует оставшиеся ключи в алфавитном порядке
3. Создаёт `dataCheckString = "key=value\n..."` 
4. Вычисляет `secretKey = HMAC-SHA256("WebAppData", botToken)`
5. Вычисляет `hash = HMAC-SHA256(secretKey, dataCheckString)`
6. Сравнивает с присланным hash
7. Возвращает `{ ok: true, user }` при успехе

---

## Telegram Bot

### Архитектура бота

Бот создаётся с помощью библиотеки **grammy** (`packages/server/src/bot/index.ts`).

**Режимы запуска:**
- **Polling** (по умолчанию): `BOT_WEBHOOK_URL` пуст → `bot.start()` — бот сам опрашивает Telegram API
- **Webhook**: `BOT_WEBHOOK_URL` задан → `bot.init()` — Express получает обновления через POST

---

### Команды (`bot/commands.ts`)

#### `/start`
1. Ищет пользователя в БД по `telegramId`
2. Если пользователь с организатором — приветствует, показывает кнопку WebApp и главное меню
3. Если пользователь без организатора — предлагает создать календарь
4. Если новый пользователь — создаёт запись в `User` с `role="ORGANIZER"`, показывает приветствие

#### `/menu`
- Показывает главное меню (inline-клавиатуру) если есть организатор

#### Кнопка `📅 Создать календарь`
1. Если организатор уже есть — показывает ссылку
2. Если нет — автоматически создаёт `Organizer` с названием `"Имя's Calendar"` и уникальным slug
3. Показывает кнопку WebApp для клиентов + главное меню

#### Кнопка `🔍 Забронировать встречу`
- Инструкция по использованию системы

---

### Inline callbacks (`bot/callbacks.ts`)

| Callback | Действие |
|---|---|
| `my_appointments` | Список ближайших встреч (до 10 шт.) |
| `settings` | Текущие настройки + ссылка на WebApp |
| `availability` | Расписание + ссылка на WebApp |
| `my_link` | Кнопка WebApp для клиентов |
| `stats` | Статистика: всего / подтверждено / отменено |
| `cancel_appointment:{id}` | Инициировать отмену встречи организатором |
| `confirm_cancel:{id}` | Подтвердить отмену (клиентом) |
| `reject_cancel:{id}` | Отклонить отмену |
| `confirm_reschedule:{id}` | Подтвердить перенос |
| `reject_reschedule:{id}` | Отклонить перенос |
| `reschedule_appointment:{id}` | Перенести (редирект в WebApp) |
| `options_list` | Список групп опций |
| `options_new` | Создать опцию (редирект в WebApp) |
| `options_edit:{id}` | Просмотр группы с кнопками управления |
| `options_rename:{id}` | Переименовать (редирект в WebApp) |
| `options_add_choice:{id}` | Добавить вариант (редирект в WebApp) |
| `options_delete:{id}` | Удалить группу опций |

---

### Клавиатуры (`bot/keyboards.ts`)

```
mainMenuKeyboard()       — InlineKeyboard: [Мои встречи, Настройки], [Расписание, Моя ссылка], [Опции, Статистика]
startKeyboard()          — ReplyKeyboard: [📅 Создать календарь, 🔍 Забронировать встречу]
bookingWebAppKeyboard()  — InlineKeyboard: [📅 Открыть календарь (WebApp)]
optionsListKeyboard()    — InlineKeyboard: список групп + [➕ Новая опция]
optionsManageKeyboard()  — InlineKeyboard: [Название, Вариант], [Удалить, ← Назад]
confirmCancelKeyboard()  — InlineKeyboard: [✅ Подтвердить, ❌ Отклонить]
confirmRescheduleKeyboard() — InlineKeyboard: [✅ Подтвердить, ❌ Отклонить]
appointmentActionsKeyboard() — InlineKeyboard: [❌ Отменить, 🔄 Перенести]
```

---

## Cron-напоминания (`lib/reminders.ts`)

Запускается каждые **5 минут**. Проверяет встречи со статусом `CONFIRMED`, которые начинаются через:
- **1 день** (`BEFORE_1D`)
- **3 часа** (`BEFORE_3H`)
- **1 час** (`BEFORE_1H`)

Для каждой встречи:
1. Проверяет, что напоминание данного типа ещё не отправлялось (таблица `Reminder`)
2. Отправляет уведомление организатору
3. Если у клиента есть `telegramId` — отправляет и ему
4. Сохраняет запись в `Reminder` со статусом `SENT`

**Окно поиска**: ±5 минут от целевого времени → компенсирует погрешность cron.

---

## Frontend — страница бронирования (`/book/[slug]`)

### Поток (steps)

```
date → time → [options] → form → /book/[slug]/success
```

Шаг `options` показывается **только** если у организатора настроены группы опций.

### Шаг 1: Выбор даты (`CalendarView`)
- Компонент `CalendarView` — сетка-календарь
- `minDate = сегодня`, `maxDate = сегодня + bookingDeadlineDays`
- При выборе: `handleDateSelect(date)` → `setStep('time')` + загружает слоты через API

### Шаг 2: Выбор времени (`TimeSlots`)
- Загружает `GET /api/organizers/:slug/slots?date=YYYY-MM-DD&timezone=...`
- Показывает сетку доступных слотов
- `timezone` определяется браузером: `Intl.DateTimeFormat().resolvedOptions().timeZone`

### Шаг 3: Выбор опции (`OptionsSelect`) — если есть
- Показывает группы опций с вариантами
- Сохраняет `selectedChoiceId`

### Шаг 4: Форма данных (`BookingForm`)
- Поля: Имя, Контакт, Telegram, Телефон, Instagram, Заметка, Кол-во участников
- При отправке: `POST /api/appointments` → редирект на `/book/[slug]/success?id=...`

---

## Frontend — дашборд организатора (`/dashboard`)

Доступен через Telegram WebApp (inline button в боте). При открытии:
1. Telegram WebApp SDK (`telegram-provider.tsx`) инициализирует `window.Telegram.WebApp`
2. `initData` передаётся на `/api/webapp/init` для верификации
3. Организатор определяется по Telegram ID → `sessionStorage.setItem('organizer_id', ...)`

### Страницы дашборда

**`/dashboard`** — список встреч организатора с цветными статусами

**`/dashboard/settings`** — форма настроек:
- Название, описание
- Длительность встречи (15–120 мин)
- Буферы до/после
- Макс. встреч в день
- Дней для бронирования
- Сохраняет через `POST /api/organizers/:id/settings`

**`/dashboard/availability`** — расписание по дням недели:
- Для каждого дня (Вс–Сб): можно добавить/удалить временные слоты
- Сохраняет через `POST /api/organizers/:id/availability`

**`/dashboard/options`** — управление опциями бронирования:
- CRUD групп и вариантов
- Сохраняет через `POST/DELETE /api/organizers/:id/options`

---

## Google Calendar интеграция (`api/google.ts`, `lib/google.ts`)

**OAuth Flow:**
1. `GET /api/google/auth?organizerId=...` — редирект на Google OAuth
2. После авторизации Google → `GET /api/google/callback?code=...`
3. Сервер получает `refresh_token`, **шифрует** его AES (`ENCRYPTION_KEY`) и сохраняет в `organizer.googleRefreshToken`
4. При создании встречи — создаёт событие в Google Calendar организатора
5. При отмене — удаляет событие

---

## Rate Limiting (`lib/rate-limit.ts`)

In-memory карта `Map<string, { count, resetAt }>`:
- Ключ: `"booking:IP_ADDRESS"`
- Лимит: 10 запросов за 60 секунд
- Защищает эндпоинт `POST /api/appointments` от спама

---

## Генерация slug (`lib/slots.ts::generateSlug`)

```typescript
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // только латиница и цифры
    .replace(/^-|-$/g, '')         // убираем ведущие/trailing дефисы
    .slice(0, 30)                  // макс. 30 символов
    + '-' + Math.random().toString(36).slice(2, 6);  // + 4 случайных символа
}
// Пример: "Ivan's Calendar" → "ivan-s-calendar-a1b2"
```

---

## Полный жизненный цикл: от регистрации до встречи

```
1. ОРГАНИЗАТОР открывает @YourBot в Telegram
   → /start
   → Бот создаёт User в БД (role=ORGANIZER)
   → Показывает ReplyKeyboard

2. ОРГАНИЗАТОР нажимает "📅 Создать календарь"
   → Бот создаёт Organizer (slug, title)
   → Показывает кнопку WebApp [📅 Открыть календарь] + главное меню

3. ОРГАНИЗАТОР открывает Dashboard через бота
   → WebApp загружается, verifyInitData, получает organizer_id
   → Настраивает расписание (Mon-Fri 09:00-18:00)
   → Настраивает длительность: 30 мин, буфер после: 5 мин

4. ОРГАНИЗАТОР делится кнопкой WebApp с клиентами
   (или ссылкой https://webapp.example.com/book/ivan-s-calendar-a1b2)

5. КЛИЕНТ нажимает кнопку WebApp
   → Открывается /book/ivan-s-calendar-a1b2
   → GET /api/organizers/ivan-s-calendar-a1b2 → профиль
   → Клиент выбирает дату (например, 20 мая)
   → GET /api/organizers/ivan-s-calendar-a1b2/slots?date=2026-05-20
     └── Алгоритм: Mon 09:00–18:00, слоты по 30 мин, с учётом буферов
     └── Свободно: [09:00, 09:30, 10:00, ..., 17:30]
   → Клиент выбирает 14:00
   → (Если есть опции) Выбирает "Стрижка"
   → Заполняет форму: Иван, @ivan_tg, +7...
   → POST /api/appointments
     └── Race condition check: 14:00–14:30 свободно ✓
     └── Daily limit: 3 из 10 ✓
     └── Создаёт Appointment (status=CONFIRMED)
     └── Отправляет уведомление организатору в Telegram
   → Редирект на /book/.../success

6. ОРГАНИЗАТОР получает уведомление:
   "📅 Новая встреча
   Иван
   Telegram: @ivan_tg
   Тел: +7...
   20.05.2026 в 14:00
   Длительность: 30 мин
   Тип услуги: Стрижка"

7. За 1 день до встречи (cron каждые 5 мин):
   → "⏰ Напоминание за 1 день. Встреча: 20.05.2026 в 14:00"
   → Отправляется организатору (+ клиенту если есть telegramId)

8. За 1 час до встречи:
   → Второе напоминание

9. Если встреча отменяется:
   → Клиент: POST /api/appointments/:id/cancel (requestedBy=CLIENT)
   → Сервер: status → CANCELLATION_REQUESTED, уведомляет организатора
   → Организатор в боте: нажимает "✅ Подтвердить" → confirm_cancel:id
   → Бот: status → CANCELLED, уведомляет обе стороны
```

---

## Запуск проекта

### Установка

```bash
npm install
```

### Настройка окружения

```bash
cp .env.example .env
# Заполнить BOT_TOKEN, DATABASE_URL и т.д.
```

### Миграция БД

```bash
npm run db:migrate   # создаёт/обновляет таблицы
npm run db:generate  # генерирует Prisma Client
```

### Локальный запуск

```bash
# В отдельных терминалах:
npm run dev:server   # сервер на :3001
npm run dev:webapp   # webapp на :3000
```

### Локальный HTTPS (для Telegram WebApp)

Telegram требует HTTPS для WebApp. Используем ngrok:

```bash
NGROK_AUTHTOKEN=your_token npm run tunnel
```

Скрипт `scripts/start-tunnel.sh` создаёт публичный HTTPS-туннель.

### Production сборка

```bash
npm run build:server
npm run build:webapp
```

---

## Статусы встречи (state machine)

```
CONFIRMED
  │
  ├─── (клиент/орг инициирует отмену) ──→ CANCELLATION_REQUESTED
  │         │
  │         ├── (подтверждено)  ──→ CANCELLED
  │         └── (отклонено)    ──→ CONFIRMED
  │
  └─── (клиент инициирует перенос) ──→ RESCHEDULE_REQUESTED
            │
            ├── (подтверждено) ──→ RESCHEDULED (+ обновляет startTime/endTime)
            └── (отклонено)   ──→ CONFIRMED
```

---

## Ключевые технологии

| Слой | Технология |
|---|---|
| Язык | TypeScript |
| Backend framework | Express.js |
| ORM | Prisma |
| База данных | SQLite (dev) / PostgreSQL (prod) |
| Telegram Bot | grammy |
| Frontend | Next.js 14 (App Router) |
| Стили | Tailwind CSS |
| Monorepo | npm workspaces |
| Cron | node-cron |
| Google Calendar | googleapis |
| HTTPS в dev | ngrok |
