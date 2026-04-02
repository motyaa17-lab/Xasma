export const translations = {
  en: {
    appTitle: "Xasma",
    realtimeOn: "Real-time: ON",
    realtimeReconnecting: "Real-time: reconnecting...",

    back: "Back",
    searchChatsPlaceholder: "Search chats…",
    searchUnifiedPlaceholder: "Search",
    searchUsersHeading: "People",
    searchNoResults: "No results",
    newActivity: "Last message from contact",
    unreadBadgeAria: "{count} unread messages",

    notifySettingsTitle: "Notifications",
    notifyEnableLabel: "New message alerts",
    notifyEnableHint: "Shows a browser notification when someone messages you and this tab is in the background or another chat is open.",
    notifyUnsupported: "Browser notifications are not available in this environment.",
    notifyDeniedInBrowser: "Notifications are blocked. Enable them in your browser site settings for this page.",
    notifyEnableButton: "Enable notifications",
    notifyDisableButton: "Disable notifications",
    notifyBlockedButton: "Blocked in browser",
    notifyPreviewPhoto: "[Photo]",
    notifyPreviewVoice: "[Voice message]",
    notifyPreviewVideo: "[Video message]",
    notifyBodyFallback: "New message",
    notifyUnknownSender: "Someone",
    navChats: "Chats",
    navCalls: "Calls",
    navSettings: "Settings",
    callsComingSoon: "Calls are not available yet. This space is reserved for a future update.",
    mobileNavLabel: "Main navigation",

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

    groupChangeAvatar: "Change group avatar",
    groupAvatarApply: "Save avatar",
    groupAvatarCancelPick: "Cancel",
    groupAvatarHint: "PNG/JPEG, max ~400KB as data URL.",

    participantCountOne: "1 participant",
    participantCountMany: "{count} participants",
    groupOnlineSep: " · ",
    groupOnlineCount: "{count} online",

    systemGroupCreated: "{actor} created the group",
    systemMemberAdded: "{actor} added {target} to the group",
    systemMemberRemoved: "{actor} removed {target} from the group",

    searchUsernamePlaceholder: "Search username...",
    searching: "Searching...",
    noChatsYet: "No chats yet.",
    noMessages: "No messages",
    chatEmptyPrompt: "Start the conversation 👋",

    selectChatTitle: "Select a chat",
    selectChatHint: "Pick a conversation from the sidebar, or start a new one.",

    typeMessagePlaceholder: "Type a message...",
    attachPhoto: "Attach photo",
    uploadImageProgress: "Uploading image…",
    uploadImageError: "Could not upload the image. Please try again.",
    uploadImageTypeError: "Please choose a JPEG, PNG, WebP, or GIF image.",
    removeAttachedPhoto: "Remove attached photo",

    voicePlay: "Play",
    voicePause: "Pause",
    voiceRecord: "Record voice message",
    voiceHoldRecord: "Hold to record, release to send",
    voiceTapStopSend: "Release to send, or tap again to stop",
    voiceRecordingControls: "Voice recording controls",
    recordingInline: "Recording",
    voiceRecording: "Recording…",
    voiceStopSend: "Stop & send",
    voiceCancel: "Cancel",
    voiceSending: "Sending voice…",
    voiceMicDenied:
      "Microphone access was denied or is unavailable. Check browser permissions and try again.",
    voiceNotSupported: "Voice recording is not supported in this browser. Try Chrome, Firefox, or Safari (HTTPS).",
    voiceTooShort: "Recording was too short.",
    uploadVoiceError: "Could not upload the voice message. Please try again.",

    videoNoteOpenCamera: "Video message",
    videoNoteHoldRecord: "Hold to record video, release to send",
    videoNoteTitle: "Video message",
    videoNoteStarting: "Starting camera…",
    videoNoteRecord: "Record",
    videoNoteStop: "Stop",
    videoNoteSend: "Send",
    videoNoteRetake: "Retake",
    videoNoteCancel: "Cancel",
    videoNoteRetry: "Try again",
    videoNoteCameraDenied:
      "Camera or microphone access was denied. Allow access in your browser settings.",
    videoNoteNotSupported: "Video recording is not supported in this browser.",
    videoNoteTooShort: "Clip was too short.",
    videoNoteUploading: "Sending video…",
    videoNoteUploadError: "Could not upload the video. Please try again.",
    videoTapSound: "Tap to turn sound on",
    videoSoundOn: "Sound on — tap to mute",

    send: "Send",
    save: "Save",
    edit: "Edit",
    edited: "(edited)",
    deleteMessage: "Delete",
    messageMenuReactions: "Reactions",

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

    back: "Назад",
    searchChatsPlaceholder: "Поиск чатов…",
    searchUnifiedPlaceholder: "Поиск",
    searchUsersHeading: "Пользователи",
    searchNoResults: "Ничего не найдено",
    newActivity: "Сообщение от собеседника",
    unreadBadgeAria: "Непрочитанных сообщений: {count}",

    notifySettingsTitle: "Уведомления",
    notifyEnableLabel: "О новых сообщениях",
    notifyEnableHint:
      "Показывать уведомление браузера, когда вам пишут и вкладка в фоне или открыт другой чат.",
    notifyUnsupported: "Уведомления браузера недоступны в этой среде.",
    notifyDeniedInBrowser: "Уведомления заблокированы. Разрешите их в настройках сайта для этой страницы.",
    notifyEnableButton: "Включить уведомления",
    notifyDisableButton: "Отключить уведомления",
    notifyBlockedButton: "Заблокировано в браузере",
    notifyPreviewPhoto: "[Фото]",
    notifyPreviewVoice: "[Голосовое сообщение]",
    notifyPreviewVideo: "[Видеосообщение]",
    notifyBodyFallback: "Новое сообщение",
    notifyUnknownSender: "Собеседник",
    navChats: "Чаты",
    navCalls: "Звонки",
    navSettings: "Настройки",
    callsComingSoon: "Звонки пока недоступны — раздел зарезервирован.",
    mobileNavLabel: "Основная навигация",

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

    groupChangeAvatar: "Сменить аватар группы",
    groupAvatarApply: "Сохранить аватар",
    groupAvatarCancelPick: "Отмена",
    groupAvatarHint: "PNG/JPEG, до ~400 КБ в виде data URL.",

    participantCountOne: "1 участник",
    participantCountMany: "Участников: {count}",
    groupOnlineSep: " · ",
    groupOnlineCount: "в сети: {count}",

    systemGroupCreated: "{actor} создал(а) группу",
    systemMemberAdded: "{actor} добавил(а) {target} в группу",
    systemMemberRemoved: "{actor} удалил(а) {target} из группы",

    searchUsernamePlaceholder: "Поиск по имени...",
    searching: "Поиск...",
    noChatsYet: "Пока нет чатов.",
    noMessages: "Нет сообщений",
    chatEmptyPrompt: "Начни диалог 👋",

    selectChatTitle: "Выберите чат",
    selectChatHint: "Выберите диалог слева или начните новый.",

    typeMessagePlaceholder: "Введите сообщение...",
    attachPhoto: "Прикрепить фото",
    uploadImageProgress: "Загрузка изображения…",
    uploadImageError: "Не удалось загрузить изображение. Попробуйте ещё раз.",
    uploadImageTypeError: "Выберите изображение JPEG, PNG, WebP или GIF.",
    removeAttachedPhoto: "Убрать фото",

    voicePlay: "Воспроизвести",
    voicePause: "Пауза",
    voiceRecord: "Голосовое сообщение",
    voiceHoldRecord: "Удерживайте для записи, отпустите для отправки",
    voiceTapStopSend: "Отпустите для отправки или нажмите ещё раз, чтобы остановить",
    voiceRecordingControls: "Управление записью голоса",
    recordingInline: "Запись",
    voiceRecording: "Идёт запись…",
    voiceStopSend: "Стоп и отправить",
    voiceCancel: "Отмена",
    voiceSending: "Отправка голоса…",
    voiceMicDenied:
      "Нет доступа к микрофону или он недоступен. Разрешите доступ в настройках браузера.",
    voiceNotSupported:
      "Запись голоса не поддерживается в этом браузере. Попробуйте Chrome, Firefox или Safari (HTTPS).",
    voiceTooShort: "Запись слишком короткая.",
    uploadVoiceError: "Не удалось загрузить голосовое сообщение. Попробуйте ещё раз.",

    videoNoteOpenCamera: "Видеосообщение",
    videoNoteHoldRecord: "Удерживайте для видео, отпустите для отправки",
    videoNoteTitle: "Видеосообщение",
    videoNoteStarting: "Запуск камеры…",
    videoNoteRecord: "Запись",
    videoNoteStop: "Стоп",
    videoNoteSend: "Отправить",
    videoNoteRetake: "Переснять",
    videoNoteCancel: "Отмена",
    videoNoteRetry: "Повторить",
    videoNoteCameraDenied:
      "Нет доступа к камере или микрофону. Разрешите доступ в настройках браузера.",
    videoNoteNotSupported: "Запись видео не поддерживается в этом браузере.",
    videoNoteTooShort: "Ролик слишком короткий.",
    videoNoteUploading: "Отправка видео…",
    videoNoteUploadError: "Не удалось загрузить видео. Попробуйте ещё раз.",
    videoTapSound: "Нажмите, чтобы включить звук",
    videoSoundOn: "Звук включён — нажмите, чтобы выключить",

    send: "Отправить",
    save: "Сохранить",
    edit: "Изменить",
    edited: "(изменено)",
    deleteMessage: "Удалить",
    messageMenuReactions: "Реакции",

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

