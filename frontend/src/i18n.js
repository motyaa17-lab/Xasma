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

    authInvalidCredentials: "Invalid credentials",
    authServerUnavailable:
      "Server is starting or temporarily unavailable. Please try again in a few seconds.",
    authGenericError: "Something went wrong. Please try again.",
    authBanned: "Your account has been banned by an administrator.",

    chats: "Chats",
    newChat: "New chat",
    createGroup: "Create group",
    groupTitleLabel: "Group name",
    groupPickMembers: "Pick members from search",
    groupCreateSubmit: "Create",
    groupChat: "Group",
    groupErrorTitle: "Enter a group name.",
    groupErrorMembers: "Select at least one other member.",
    cancel: "Cancel",

    groupInfo: "Group info",
    groupInfoTitle: "Group",
    groupMembers: "Members",
    groupParticipantCount: "{count} participants",
    groupCreator: "Creator",
    groupAddMember: "Add member",
    groupRemoveMember: "Remove",
    groupSearchToAdd: "Search users to add…",
    groupLoadError: "Could not load group.",
    groupNoMembers: "No members.",
    groupLoading: "Loading…",

    participantCountOne: "1 participant",
    participantCountMany: "{count} participants",

    systemGroupCreated: "{actor} created the group",
    systemMemberAdded: "{actor} added {target} to the group",
    systemMemberRemoved: "{actor} removed {target} from the group",

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

    authInvalidCredentials: "Неверный логин или пароль",
    authServerUnavailable:
      "Сервер запускается или временно недоступен. Попробуйте снова через несколько секунд.",
    authGenericError: "Что-то пошло не так. Попробуйте ещё раз.",
    authBanned: "Ваш аккаунт заблокирован администратором.",

    chats: "Чаты",
    newChat: "Новый чат",
    createGroup: "Создать группу",
    groupTitleLabel: "Название группы",
    groupPickMembers: "Выберите участников в поиске",
    groupCreateSubmit: "Создать",
    groupChat: "Группа",
    groupErrorTitle: "Введите название группы.",
    groupErrorMembers: "Выберите хотя бы одного участника.",
    cancel: "Отмена",

    groupInfo: "О группе",
    groupInfoTitle: "Группа",
    groupMembers: "Участники",
    groupParticipantCount: "Участников: {count}",
    groupCreator: "Создатель",
    groupAddMember: "Добавить",
    groupRemoveMember: "Удалить",
    groupSearchToAdd: "Поиск для добавления…",
    groupLoadError: "Не удалось загрузить группу.",
    groupNoMembers: "Нет участников.",
    groupLoading: "Загрузка…",

    participantCountOne: "1 участник",
    participantCountMany: "Участников: {count}",

    systemGroupCreated: "{actor} создал(а) группу",
    systemMemberAdded: "{actor} добавил(а) {target} в группу",
    systemMemberRemoved: "{actor} удалил(а) {target} из группы",

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

/** Maps login/register failures to a clear UX message (uses `t` from current language). */
export function formatAuthError(err, t) {
  const status = err?.status;
  if (err?.name === "ApiError" && typeof status === "number") {
    if (status === 0 || status >= 500) {
      return t("authServerUnavailable");
    }
    if (status === 403 && String(err.message || "").toLowerCase().includes("banned")) {
      return t("authBanned");
    }
    if (status === 401) {
      return t("authInvalidCredentials");
    }
    return err.message || t("authGenericError");
  }
  return err?.message || t("authGenericError");
}

