# Xasma — Project Context

> Telegram-like 1:1 & group web-chat (React + Express + PostgreSQL + Socket.io).
> Includes Capacitor Android wrapper and PWA support.

---

## 1. Общая архитектура

```
┌──────────────────────────────────────────────────────────────────────┐
│                            Client (Browser / Android WebView)        │
│  React 18 (Vite)  ←→  Socket.io-client  ←→  REST API (fetch)       │
│  Capacitor (Android)   PWA (Service Worker)                          │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTPS / WSS
┌──────────────────────────────▼───────────────────────────────────────┐
│                            Backend (Node.js)                         │
│  Express 4  +  Socket.io 4  +  Multer (uploads)                     │
│  JWT auth   +  bcrypt        +  pg (PostgreSQL)                      │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                     ┌─────────▼─────────┐
                     │  PostgreSQL (Railway)  │
                     └───────────────────────┘
```

**Монолит-сервер** (`backend/src/index.js` — ~3 850 строк) совмещает REST API, Socket.io и статическую раздачу загрузок.

---

## 2. Структура файлов

```
Xasma/
├── backend/
│   ├── src/
│   │   ├── index.js            # Единственный серверный файл (Express + Socket.io)
│   │   ├── db.js               # PostgreSQL pool, initDb() — миграции / таблицы
│   │   ├── messageSafety.js    # Keyword-based scan «рисковых» слов в сообщениях
│   │   ├── sendRateLimit.js    # In-memory rate limiter (5 msg / 5s → 10s block)
│   │   └── stickersAllowed.js  # Whitelist стикеров (tg_wave_anim, …)
│   ├── uploads/                # Файлы пользователей (изображения, аудио, видео)
│   ├── .env.example
│   ├── .env.txt                # Реальные Railway credentials (закоммичены!)
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx            # Entry: ReactDOM.createRoot, SW регистрация
│   │   ├── App.jsx             # Единый корневой компонент (~3 140 строк)
│   │   ├── api.js              # REST-обёртки: register, login, CRUD chats/messages, uploads
│   │   ├── i18n.js             # Мультиязычность (en, ru) — ~2 000 строк
│   │   ├── premium.js          # isPremiumActive() — проверка подписки по дате
│   │   ├── userPersonalization.js  # Presets: tag color, username style, avatar ring
│   │   ├── webrtcIceServers.js     # ICE (STUN/TURN) конфигурация для звонков
│   │   ├── messageNotifications.js # Browser Notification API
│   │   ├── messageDrafts.js        # localStorage черновики
│   │   ├── chatMute.js             # localStorage мьюты
│   │   ├── activityBadge.js        # Activity level по количеству сообщений
│   │   ├── syncViewport.js         # Mobile viewport hacks (100dvh, keyboard)
│   │   ├── components/
│   │   │   ├── Auth.jsx            # Login / Register форма
│   │   │   ├── AuthBootSplash.jsx  # Splash при автозагрузке сессии
│   │   │   ├── Sidebar.jsx         # Список чатов + поиск
│   │   │   ├── Chat.jsx            # Окно чата (сообщения, ввод, медиа)
│   │   │   ├── CallOverlay.jsx     # UI звонка (полный экран)
│   │   │   ├── CallsScreen.jsx     # История звонков
│   │   │   ├── ContactsScreen.jsx  # Контакты (Contact API)
│   │   │   ├── UserMenu.jsx        # Настройки профиля, тема, язык
│   │   │   ├── UserProfileModal.jsx    # Модалка профиля другого юзера
│   │   │   ├── UserProfileScreen.jsx   # Полноэкранный профиль
│   │   │   ├── AdminPage.jsx           # Админ-панель
│   │   │   ├── GroupInfoModal.jsx       # Инфо группы/канала
│   │   │   ├── CircleVideoMessage.jsx   # Кружок-видеосообщение
│   │   │   ├── VoiceMessagePlayer.jsx   # Плеер голосовых
│   │   │   ├── MobileChatRowSwipe.jsx   # Свайп-действия на мобильных
│   │   │   ├── InstallDownloadPanel.jsx # Панель установки PWA/APK
│   │   │   ├── LegalPage.jsx           # Юридическая информация
│   │   │   ├── Icons.jsx               # SVG-иконки
│   │   │   ├── AvatarAura.jsx          # Свечение аватара (aura)
│   │   │   ├── ActivityBadge.jsx       # Бейдж активности
│   │   │   └── UserTagBadge.jsx        # Пользовательские теги
│   │   ├── stickers/
│   │   │   ├── stickerPack.js      # Список стикеров (8 шт, id + animated flag)
│   │   │   ├── StickerPicker.jsx   # Picker-панель (портал)
│   │   │   ├── StickerView.jsx     # Рендер стикера (SVG)
│   │   │   └── stickerArt.jsx      # SVG-арт животных (Cat, Corgi, Bunny, Panda, …)
│   │   ├── hooks/
│   │   │   └── useIsMobile.js      # Media-query хук (breakpoint 900px)
│   │   ├── config/
│   │   │   └── donation.js         # Конфиг доната
│   │   └── styles.css              # Все стили (единый CSS)
│   │
│   ├── public/
│   │   ├── manifest.webmanifest    # PWA manifest
│   │   ├── sw.js                   # Service Worker (кеширование)
│   │   └── xasma-logo-*.png        # Иконки PWA
│   ├── android/                    # Capacitor Android проект
│   ├── capacitor.config.json       # appId: com.xasma.app
│   ├── vercel.json                 # SPA fallback routing
│   ├── vite.config.js              # Vite: base './', port 5173
│   ├── .env.example                # Dev env
│   ├── .env.production             # Prod env → Railway backend URL
│   └── package.json
│
├── package.json                    # Root: @capacitor/cli + @capacitor/core
└── README.md
```

---

## 3. Backend

### 3.1 Стек
- **Runtime:** Node.js
- **Framework:** Express 4
- **Database:** PostgreSQL (через `pg` Pool; Railway Postgres в продакшене)
- **Real-time:** Socket.io 4
- **Auth:** JWT (jsonwebtoken) + bcrypt
- **File uploads:** Multer (images до 8 MB, audio до 16 MB, video до 32 MB)
- **Dev:** Nodemon

### 3.2 Точка входа
`backend/src/index.js` — **монолитный файл ~3 850 строк**, содержит:
- REST API endpoints (50+ routes)
- Socket.io event handlers
- Вспомогательные функции (нормализация, валидация, premium-логика)
- WebRTC call signaling
- Утилиты: rate limiting, message safety scanning

### 3.3 База данных (`db.js`)
**PostgreSQL** с идемпотентными миграциями при старте (`initDb()`).

**Таблицы:**
| Таблица | Назначение |
|---------|-----------|
| `users` | Пользователи: username, email, password_hash, avatar, role, status, aura, tags, premium, referrals, user_handle |
| `chats` | Чаты: type (direct / group / channel / official), title, members (user1_id/user2_id для direct) |
| `chat_members` | Связь M:N чат–пользователь (актуально для групп) |
| `messages` | Сообщения: text, media URLs (image/audio/video/sticker), reply, forward, edit, delete, safety flags |
| `message_hidden` | Скрытые сообщения (delete for self) |
| `message_reactions` | Реакции: emoji на сообщение |
| `message_reports` | Жалобы: spam / scam / abuse |

**Ключевые поля users:**
- `role` (user / admin), `banned`, `is_online`, `last_seen_at`
- `user_handle` — уникальный @handle (lowercase)
- `referral_code`, `invited_by`, `referrals_count`
- `has_custom_bg`, `has_badge`, `has_reactions`, `has_premium_lite` — referral rewards
- `premium_type` (invite / paid / admin), `premium_expires_at` — timed premium
- `user_tag`, `tag_color`, `tag_style`, `username_style`, `avatar_ring` — personalization
- `aura_color`, `messages_sent_count`

### 3.4 Типы чатов
| Тип | Описание |
|-----|----------|
| `direct` | 1:1 чат, user1_id < user2_id (canonical order) |
| `group` | Групповой чат с title, created_by |
| `channel` | Канал: постить может только creator / admin |
| `official` | Системный чат «Xasma» (один на пользователя, broadcast-only) |

---

## 4. Authentication

### 4.1 Регистрация (`POST /api/register`)
1. Принимает `username`, `email`, `password`, опционально `avatar`, `inviteCode`
2. Валидация: username уникален, email уникален (case-insensitive), пароль bcrypt-хеширован
3. Генерирует уникальный `referral_code` и `user_handle`
4. Если `inviteCode` валиден → привязывает `invited_by`, инкрементирует `referrals_count` у пригласившего
5. Referral rewards: 1 → custom bg, 3 → badge, 5 → reactions, 10 → premium lite (14 дней invite-premium)
6. Создаёт official-чат «Xasma» для нового пользователя
7. Возвращает JWT token + user object

### 4.2 Логин (`POST /api/login`)
1. Принимает `email` (или `username`) + `password`
2. Поиск по email (if contains @) или по username/user_handle
3. bcrypt.compare → JWT token (7 дней expiry)
4. Payload: `{ sub: user.id, username, role }`

### 4.3 Авторизация
- **REST:** Middleware `authRequired` — извлекает Bearer token из `Authorization` header, проверяет JWT, загружает user из БД, проверяет `banned`
- **Socket.io:** При подключении — `socket.handshake.auth.token` → jwt.verify
- **Admin:** Middleware `requireAdmin` — `req.user.role === 'admin'`

### 4.4 Хранение на клиенте
- Token хранится в `localStorage.token`
- При старте App.jsx пытается `getMe()` → если ок, восстанавливает сессию

---

## 5. WebSocket / Messages

### 5.1 Подключение
- Клиент: `io(socketEndpoint, { auth: { token } })` (socket.io-client)
- Сервер: при connection — проверка JWT, регистрация в `userSockets` Map, отметка `is_online = TRUE`, broadcast `user:presence`

### 5.2 Socket-события (клиент → сервер)
| Событие | Описание |
|---------|----------|
| `chat:send` | Отправка сообщения (text, imageUrl, audioUrl, videoUrl, stickerId, replyToMessageId, clientTempId) |
| `chat:read` | Пометка прочитанных (chatId, upToMessageId) |
| `chat:typing` | Индикатор набора (chatId, isTyping) |
| `call:invite` | Инициация звонка (chatId) |
| `call:accept` | Принять звонок (callId) |
| `call:reject` | Отклонить звонок (callId, reason) |
| `call:end` | Завершить звонок (callId, reason) |
| `webrtc:offer` | SDP offer (callId, sdp) |
| `webrtc:answer` | SDP answer (callId, sdp) |
| `webrtc:ice-candidate` | ICE candidate (callId, candidate) |

### 5.3 Socket-события (сервер → клиент)
| Событие | Описание |
|---------|----------|
| `chat:message` | Новое сообщение (полный объект messageRowToApi) |
| `chat:message:status` | Обновление delivered_at / read_at |
| `chat:message:updated` | Редактирование сообщения |
| `chat:message:deleted` | Удаление сообщения |
| `chat:typing` | Индикатор набора от другого пользователя |
| `chat:pinnedUpdated` | Обновление закреплённого сообщения |
| `chat:sendRateLimited` | Rate limit ответ |
| `user:presence` | Онлайн/оффлайн статус |
| `user:messageCount` | Обновление счётчика сообщений |
| `call:ringing` | Звонок в процессе вызова |
| `call:incoming` | Входящий звонок |
| `call:accept` | Звонок принят |
| `call:connecting` | Соединение устанавливается |
| `call:ended` | Звонок завершён |
| `webrtc:offer/answer/ice-candidate` | WebRTC relay |

### 5.4 Сообщения — типы
| message_type | Описание |
|-------------|----------|
| `text` | Текстовое (может включать image/audio/video URL) |
| `sticker` | Стикер (sticker_id) |
| `system` | Системное (system_kind: member_added, member_removed, call_log, …) |

### 5.5 Функции сообщений
- **Reply:** `reply_to_message_id` → предпросмотр в replyTo
- **Forward:** `forward_from_message_id` → копия с атрибуцией
- **Edit:** `PUT /api/messages/:id` → помечает `edited_at`
- **Delete:** `DELETE /api/messages/:id?scope=self|both` → hide/delete_for_all
- **Reactions:** emoji-реакции (toggle), unique per user+message+emoji
- **Pinning:** `PATCH /api/chats/:chatId/pin` → `pinned_message_id`
- **Search:** `GET /api/chats/:chatId/messages/search?q=...` (ILIKE)
- **Report:** `POST /api/messages/:id/report` (spam/scam/abuse)
- **Safety:** auto-scan keywords (messageSafety.js) → flagged, risk_level
- **Rate limit:** 5 messages per 5s window → 10s block (sendRateLimit.js)
- **Media:** image upload (8 MB), audio upload (16 MB), video upload (32 MB)

### 5.6 Presence
- `is_online` + `last_seen_at` в БД
- При connect → online, при disconnect (все сокеты закрыты) → offline + timestamp
- Broadcast `user:presence` всем

---

## 6. Stickers

### 6.1 Архитектура
- **Backend** (`stickersAllowed.js`): whitelist из 8 ID (`tg_wave_anim`, `tg_wave_static`, …), нормализация/валидация
- **Frontend** (`stickers/stickerPack.js`): зеркало backend-списка с метой (animated flag, labelKey для i18n)
- **Рендер** (`StickerView.jsx` → `stickerArt.jsx`): **SVG-арт** животных (Cat, Corgi, Bunny, Panda, Penguin, Frog, Bear, Seal) с CSS-анимациями

### 6.2 Набор стикеров (8 штук)
| ID | Тип | Персонаж |
|----|-----|----------|
| `tg_wave_anim` | animated | Cat |
| `tg_wave_static` | static | Corgi |
| `tg_nod_anim` | animated | Bunny |
| `tg_heart_static` | static | Panda |
| `tg_party_anim` | animated | Penguin |
| `tg_ok_static` | static | Frog |
| `tg_hi_static` | static | Bear |
| `tg_lol_anim` | animated | Seal |

### 6.3 Picker
- `StickerPicker.jsx` — портал (`createPortal`), сетка стикеров, выбор → `onPick(stickerId)` → отправка через `chat:send`

---

## 7. Calls (Звонки)

### 7.1 Архитектура
- **Signaling:** Socket.io (in-memory state на сервере)
- **Media:** WebRTC (audio-only) peer-to-peer
- **ICE:** STUN (Google) по умолчанию + опциональный TURN (Metered или custom)
- **Scope:** только 1:1 direct-чаты

### 7.2 Серверный flow
1. `call:invite` → создание callId, регистрация в `activeCalls` Map
2. Busy guard: проверка что оба участника не в звонке
3. `call:ringing` → caller; `call:incoming` → callee (если онлайн)
4. Timeout 28s → missed/offline
5. `call:accept` → state = connecting, clear timeout
6. WebRTC relay: `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate` → пересылка другому участнику
7. `call:end` / `call:reject` → `endCallInternal()` → system message `call_log`
8. При disconnect → автозавершение активного звонка

### 7.3 Клиентский flow (App.jsx)
- State: `call` object с phase: `idle → calling → ringing → connecting → connected → ended`
- `pcRef` (RTCPeerConnection), `localStreamRef`, `remoteStreamRef` — refs
- `CallOverlay.jsx` — full-screen UI с таймером, mute, speakerphone
- `CallsScreen.jsx` — история звонков (localStorage `callLogs`)
- `useCallVoiceLevels.js` — анализ громкости (AudioContext AnalyserNode)

### 7.4 ICE Servers (`webrtcIceServers.js`)
- Default: Google STUN (`stun:stun.l.google.com:19302`)
- Env: `VITE_WEBRTC_ICE_SERVERS` (JSON array) или `VITE_TURN_URLS` + credentials
- Backend endpoint: `GET /api/webrtc/ice-servers` — Metered TURN (опционально, env `METERED_TURN_DOMAIN` + `METERED_TURN_SECRET`)

---

## 8. State Management (Frontend)

### 8.1 Подход
**Нет Redux/Zustand/MobX.** Всё state management — в **одном компоненте `App.jsx`** (~3 140 строк) через `useState` + `useRef`.

### 8.2 Ключевые состояния
| State | Тип | Описание |
|-------|-----|----------|
| `token` | string | JWT token (sync с localStorage) |
| `me` | object | Текущий пользователь |
| `chats` | array | Список чатов (sidebar) |
| `messages` | array | Сообщения текущего чата |
| `selectedChatId` | number | ID открытого чата |
| `settings` | object | Тема, язык, уведомления (localStorage) |
| `call` | object | Состояние звонка (phase, peer, mute, …) |
| `callLogs` | array | История звонков (localStorage) |
| `socketReady` | bool | Подключение Socket.io |
| `typingUntil` | object | Индикаторы набора (chatId → timestamp) |
| `mobileTab` | string | Активная вкладка (chats/contacts/calls/settings) |

### 8.3 Кеширование
- `messagesCacheRef` — in-memory cache сообщений по chatId (быстрое переоткрытие чата)
- `messageDrafts.js` — localStorage черновики (`xasma.draft.v1.<chatId>`)
- `chatMute.js` — localStorage мьюты (`xasma.chatMute.v1.<chatId>`)
- `callLogs` — localStorage (до 250 записей)
- `settings` — localStorage (тема, язык, notification prefs)

### 8.4 Оптимистичные обновления
- `clientTempId` при отправке сообщений — показывает «призрак» до подтверждения сервером
- `mergeFetchedMessages()` — сливает fetch с realtime-обновлениями без дублей

---

## 9. Deployment

### 9.1 Текущая конфигурация
| Компонент | Платформа | URL |
|-----------|----------|-----|
| Backend | **Railway** | `https://xasma-production.up.railway.app` |
| Frontend | **Vercel** | (через `vercel.json` SPA fallback) |
| Database | **Railway PostgreSQL** | `postgresql://...@postgres.railway.internal:5432/railway` |
| Android | **Capacitor** APK | `com.xasma.app` |
| PWA | Service Worker + manifest | `manifest.webmanifest` |

### 9.2 Environment Variables

**Backend (`.env`):**
| Переменная | Описание |
|-----------|----------|
| `DATABASE_URL` | PostgreSQL connection string (Railway) |
| `PORT` | HTTP порт (4000) |
| `JWT_SECRET` | Секрет для JWT |
| `FRONTEND_ORIGIN` | Разрешённый CORS origin |
| `METERED_TURN_DOMAIN` | (опц.) Metered TURN домен |
| `METERED_TURN_SECRET` | (опц.) Metered TURN секрет |
| `PUBLIC_BASE_URL` | (опц.) Публичный base URL для uploads |
| `NODE_ENV` | production / development |

**Frontend (`.env.production`):**
| Переменная | Описание |
|-----------|----------|
| `VITE_API_URL` | Backend API origin |
| `VITE_API_BASE` | Legacy fallback |
| `VITE_WEBRTC_ICE_SERVERS` | (опц.) JSON ICE servers |
| `VITE_TURN_URLS` | (опц.) TURN URLs |
| `VITE_TURN_USERNAME` | (опц.) TURN username |
| `VITE_TURN_CREDENTIAL` | (опц.) TURN credential |

### 9.3 CORS
- Production: только `FRONTEND_ORIGIN`
- Dev: localhost, LAN (192.168.x.x, 10.x.x.x), Capacitor origins
- Capacitor/Ionic: `capacitor://localhost`, `ionic://localhost`, `https://localhost`

### 9.4 Android (Capacitor)
- `capacitor.config.json`: appId `com.xasma.app`, webDir `dist`
- `npm run android:sync` = build + cap sync
- Network security: `allowMixedContent: true`, cleartext для dev
- Custom plugin: `AndroidNotifyPermsPlugin` — проверка/запрос уведомлений

---

## 10. Premium система

### 10.1 Типы
| premium_type | Источник |
|-------------|---------|
| `invite` | Referral (10 приглашений → 14 дней) |
| `paid` | Оплата (через админку) |
| `admin` | Выдача администратором |

### 10.2 Premium-перки (UI)
- Стиль имени (`usernameStyle`): silver, neonBlue, violetGlow, platinum, softGlow
- Ободок аватара (`avatarRing`): gradient, neon, diamond, soft
- Цвет тега (`tagColor`): preset-палитра (Sky, Violet, Pink, Emerald, Amber, Rose)
- Стиль тега (`tagStyle`): solid / gradient
- Фон профиля (`profileBackground`)

### 10.3 Referral система
- Каждый пользователь получает `referral_code` при регистрации
- Приглашённые передают код → `invited_by`
- Rewards по порогам: 1→bg, 3→badge, 5→reactions, 10→premium_lite (14 дней)

---

## 11. Admin API

| Endpoint | Описание |
|----------|----------|
| `GET /api/admin/users` | Список пользователей |
| `PATCH /api/admin/users/:id/role` | Изменить роль |
| `PATCH /api/admin/users/:id/ban` | Бан/разбан |
| `PATCH /api/admin/users/:id/tag` | Установить тег |
| `POST /api/admin/users/:id/premium` | Выдать premium (type + days) |
| `DELETE /api/admin/users/:id/premium` | Отозвать premium |
| `DELETE /api/admin/messages/:id` | Удалить сообщение |
| `GET /api/admin/flagged-messages` | Автофлаг-сообщения |
| `GET /api/admin/message-reports` | Жалобы |
| `POST /api/admin/broadcast-official` | Broadcast через official-чат |

---

## 12. i18n

- Два языка: **English** (`en`) и **Русский** (`ru`)
- Файл: `frontend/src/i18n.js` (~2 000 строк)
- Функция: `t(lang, key)` → строка
- Хранение: `localStorage.settings.lang`
- Скрипт проверки: `frontend/scripts/i18n-check.mjs` — проверяет полноту ключей

---

## 13. Прочие фичи

| Фича | Детали |
|------|--------|
| **Голосовые сообщения** | MediaRecorder → upload audio → audioUrl в сообщении |
| **Видеосообщения (кружки)** | CircleVideoMessage.jsx, upload video (32 MB max) |
| **Изображения в чате** | Upload → imageUrl, предпросмотр в чате |
| **Поиск** | В sidebar (по username/handle), в чате (ILIKE по тексту) |
| **Закрепление** | Сообщений в чатах, чатов в списке (list_pinned_at) |
| **Message drafts** | localStorage, показ "Draft:" в sidebar |
| **Chat folders** | Client-side (localStorage), All / Archive / custom |
| **Stories** | Stub: localStorage-based, 24h TTL, UI присутствует но без backend |
| **Activity badge** | Уровни: Lv.1 (10), Lv.2 (100), Lv.3 (500), Legendary (2000) |
| **Avatar aura** | Свечение вокруг аватара (hex цвет) |
| **Donation config** | `config/donation.js` |
| **Legal page** | Data safety, privacy, about |

---

## 14. Известные особенности / Потенциальные проблемы

1. **Монолитный backend** — весь код в одном файле (~3 850 строк). Нет разделения на роутеры/контроллеры/сервисы.
2. **Монолитный App.jsx** — ~3 140 строк. Всё state management в одном компоненте, нет state library.
3. **Credentials в репозитории** — `backend/.env.txt` содержит реальный DATABASE_URL и JWT_SECRET в открытом виде.
4. **In-memory state** — rate limiter и call state хранятся в памяти; при restart теряются. Не масштабируется горизонтально.
5. **No TypeScript** — весь проект на JavaScript (JSX), нет статической типизации.
6. **No tests** — нет юнит/интеграционных тестов.
7. **No linter config** — нет ESLint/Prettier конфигурации в репо (есть eslint-disable комментарии).
8. **SQLite упоминается** в README, но фактически используется **PostgreSQL** (Railway). README устарел.
9. **dist-lan / dist-local** — закоммичены build-артефакты (вероятно, для LAN-тестирования).
10. **Stories** — UI готов, но backend-хранилища нет (только localStorage).
