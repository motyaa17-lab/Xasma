## Telegram-like 1:1 Web Chat (React + Express + SQLite + Socket.io)

This is a simple, working demo of a Telegram-like chat:
- Register / Login
- Profile (username, avatar)
- One-to-one chats
- Real-time messages with Socket.io
- Chat list sidebar + message bubbles

### Project layout
- `backend/` Node.js + Express + SQLite + Socket.io
- `frontend/` React (Vite) UI

## How to run (development)

### 1) Backend
Open `backend/` in a terminal and run:

```bash
npm install

# Create env file (copy example)
# (see backend/.env.example)

npm run dev
```

The backend runs on `http://localhost:4000`.

### 2) Frontend
Open `frontend/` in another terminal and run:

```bash
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

### 3) Test
1. Register 2 users in the UI.
2. Start a one-to-one chat between them.
3. Send messages; they should appear in real-time on both browsers.

## Environment variables (backend)
Copy `backend/.env.example` to `backend/.env`.

```bash
JWT_SECRET=change_me
PORT=4000
DATABASE_PATH=./db.sqlite
```

