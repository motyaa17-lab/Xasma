export const translations = {
  en: {
    appTitle: "Xasma",
    realtimeOn: "Real-time: ON",
    realtimeReconnecting: "Real-time: reconnecting...",

    login: "Login",
    register: "Register",
    username: "Username",
    password: "Password",
    avatarUrlOptional: "Avatar URL (optional)",
    createAccount: "Create account",

    chats: "Chats",
    newChat: "New chat",
    searchUsernamePlaceholder: "Search username...",
    searching: "Searching...",
    noChatsYet: "No chats yet.",
    noMessages: "No messages",

    selectChatTitle: "Select a chat",
    selectChatHint: "Pick a conversation from the sidebar, or start a new one.",

    typeMessagePlaceholder: "Type a message...",
    send: "Send",
    save: "Save",
    edit: "Edit",
    edited: "(edited)",

    menu: "Menu",
    myProfile: "My Profile",
    settings: "Settings",
    logout: "Logout",
    close: "Close",

    changeAvatar: "Change Avatar",
    saving: "Saving...",
    remove: "Remove",

    language: "Language",
    chatBackground: "Chat background",

    online: "Online",
    lastSeen: "Last seen",
    lastSeenAt: "Last seen {time}",
    typing: "Typing...",

    ocean: "Ocean",
    midnight: "Midnight",
    slate: "Slate",

    maxAvatarHint: "Max 3MB. (Stored in SQLite as base64 for now.)",
  },
  ru: {
    appTitle: "Xasma",
    realtimeOn: "Реалтайм: ВКЛ",
    realtimeReconnecting: "Реалтайм: подключение...",

    login: "Войти",
    register: "Регистрация",
    username: "Имя пользователя",
    password: "Пароль",
    avatarUrlOptional: "URL аватара (необязательно)",
    createAccount: "Создать аккаунт",

    chats: "Чаты",
    newChat: "Новый чат",
    searchUsernamePlaceholder: "Поиск по имени...",
    searching: "Поиск...",
    noChatsYet: "Пока нет чатов.",
    noMessages: "Нет сообщений",

    selectChatTitle: "Выберите чат",
    selectChatHint: "Выберите диалог слева или начните новый.",

    typeMessagePlaceholder: "Введите сообщение...",
    send: "Отправить",
    save: "Сохранить",
    edit: "Изменить",
    edited: "(изменено)",

    menu: "Меню",
    myProfile: "Мой профиль",
    settings: "Настройки",
    logout: "Выйти",
    close: "Закрыть",

    changeAvatar: "Сменить аватар",
    saving: "Сохранение...",
    remove: "Удалить",

    language: "Язык",
    chatBackground: "Фон чата",

    online: "В сети",
    lastSeen: "Был(а)",
    lastSeenAt: "Был(а) {time}",
    typing: "Печатает...",

    ocean: "Океан",
    midnight: "Полночь",
    slate: "Сланец",

    maxAvatarHint: "До 3MB. (Сохраняется в SQLite в base64.)",
  },
};

export function t(lang, key) {
  const table = translations[lang] || translations.en;
  return table[key] || translations.en[key] || key;
}

export function tf(lang, key, vars) {
  let s = t(lang, key);
  const v = vars || {};
  Object.keys(v).forEach((k) => {
    s = s.replaceAll(`{${k}}`, String(v[k]));
  });
  return s;
}

