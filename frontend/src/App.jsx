import React, { Component, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

import Auth from "./components/Auth.jsx";
import AuthBootSplash from "./components/AuthBootSplash.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Chat from "./components/Chat.jsx";
import UserMenu from "./components/UserMenu.jsx";
import InstallDownloadPanel from "./components/InstallDownloadPanel.jsx";
import { IconChats, IconPhone, IconSettings, IconDownload } from "./components/Icons.jsx";
import CallOverlay from "./components/CallOverlay.jsx";
import CallsScreen from "./components/CallsScreen.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { t as tr, normalizeLang } from "./i18n.js";
import {
  createChat,
  createGroup,
  createChannel,
  getChats,
  getMe,
  getMessages,
  patchChatPin,
  patchChatListPin,
  deleteChatMembership,
  login,
  register,
  adminDeleteMessage,
  toggleReaction,
  updateMessage,
  updateMyAvatar,
  updateMyProfile,
} from "./api.js";
import { getSocketEndpoint } from "./api.js";
import {
  MOBILE_CHAT_OPEN_BODY_CLASS,
  syncAppRootHeight,
  syncMobileChatVisualViewport,
} from "./syncViewport.js";
import { tryShowIncomingMessageNotification } from "./messageNotifications.js";
import { shouldClearNotificationPreferenceDueToOs } from "./notifyPermissions.js";
import { XASMA_LOGO_SRC } from "./branding.js";

/** Set `true` temporarily to verify stacking: fixed red "TEST SETTINGS" (then set back to `false`). */
const DEBUG_DESKTOP_SETTINGS_FIXED_TEST = false;

/** After successful session restore, hold splash at least this long to avoid a jarring sub-frame flash (400–700ms). */
const AUTH_BOOT_MIN_MS = 520;

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [me, setMe] = useState(null);
  const [authError, setAuthError] = useState("");

  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem("settings");
      const parsed = raw ? JSON.parse(raw) : {};
      const allowed = new Set(["darkGradient", "softBlur", "night"]);
      const legacy = {
        ocean: "darkGradient",
        midnight: "night",
        slate: "darkGradient",
        dark: "darkGradient",
        glass: "softBlur",
        noise: "darkGradient",
        night: "night",
      };
      const rawTheme = typeof parsed.chatTheme === "string" ? parsed.chatTheme : "darkGradient";
      const chatTheme = allowed.has(rawTheme) ? rawTheme : legacy[rawTheme] || "darkGradient";
      const rawBg = typeof parsed.chatBackgroundImageUrl === "string" ? parsed.chatBackgroundImageUrl : "";
      const chatBackgroundImageUrl =
        rawBg.startsWith("data:image/") && rawBg.length <= 2_200_000 ? rawBg : null;
      return {
        lang: normalizeLang(parsed.lang),
        chatTheme,
        chatBackgroundImageUrl,
        messageNotificationsEnabled: Boolean(parsed.messageNotificationsEnabled),
      };
    } catch {
      return {
        lang: "en",
        chatTheme: "darkGradient",
        chatBackgroundImageUrl: null,
        messageNotificationsEnabled: false,
      };
    }
  });

  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [socketReady, setSocketReady] = useState(false);
  const [typingUntil, setTypingUntil] = useState({}); // chatId -> ms timestamp
  const [presenceTick, setPresenceTick] = useState(0);

  const socketRef = useRef(null);
  const selectedChatIdRef = useRef(null);
  const lastReadSentRef = useRef({}); // chatId -> messageId
  const readEmitTimerRef = useRef(null);
  const socketResyncTimerRef = useRef(null);
  const lastSocketResyncAtRef = useRef(0);
  const optimisticSendTimersRef = useRef(new Map()); // clientTempId -> timeoutId
  const messagesLoadSeqRef = useRef(0);
  const mobileInboxSidebarRef = useRef(null);
  const settingsRef = useRef(settings);
  const openChatFromNotificationRef = useRef(() => {});

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const syncOs = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void (async () => {
        if (!(await shouldClearNotificationPreferenceDueToOs(settingsRef.current))) return;
        setSettings((s) => ({ ...s, messageNotificationsEnabled: false }));
      })();
    };
    document.addEventListener("visibilitychange", syncOs);
    window.addEventListener("focus", syncOs);
    return () => {
      document.removeEventListener("visibilitychange", syncOs);
      window.removeEventListener("focus", syncOs);
    };
  }, []);

  const socketEndpoint = useMemo(() => getSocketEndpoint(), []);
  const isMobile = useIsMobile(900);
  const [mobileTab, setMobileTab] = useState("chats");
  const [installDownloadOpen, setInstallDownloadOpen] = useState(false);
  const [desktopCallsOpen, setDesktopCallsOpen] = useState(false);
  const desktopUserMenuRef = useRef(null);
  const desktopMenuClusterRef = useRef(null);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const [sendRateLimitNotice, setSendRateLimitNotice] = useState("");
  const [realtimeSendNotice, setRealtimeSendNotice] = useState("");
  const [call, setCall] = useState(() => ({
    phase: "idle", // idle | calling | ringing | connecting | connected | ended
    direction: null, // outgoing | incoming
    callId: null,
    chatId: null,
    peerUserId: null,
    peerUsername: "",
    peerAvatar: "",
    muted: false,
    connectedAtMs: 0,
    endedReason: "",
  }));
  const [callLogs, setCallLogs] = useState(() => {
    try {
      const raw = localStorage.getItem("callLogs");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const mobileConversationOpen = Boolean(isMobile && mobileTab === "chats" && selectedChatId);

  // /invite/:code (simple route capture, no router).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = String(window.location?.pathname || "");
    const m = p.match(/^\/invite\/([a-zA-Z0-9_-]{3,64})\/?$/);
    if (!m) return;
    const code = String(m[1] || "").trim();
    if (!code) return;
    try {
      localStorage.setItem("inviteCode", code);
    } catch {
      // ignore
    }
    try {
      window.history.replaceState({}, "", "/");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!mobileConversationOpen) {
      document.body.classList.remove(MOBILE_CHAT_OPEN_BODY_CLASS);
      syncAppRootHeight();
      return undefined;
    }
    document.body.classList.add(MOBILE_CHAT_OPEN_BODY_CLASS);
    syncAppRootHeight();
    syncMobileChatVisualViewport();
    const onVv = () => {
      syncMobileChatVisualViewport();
      syncAppRootHeight();
    };
    window.visualViewport?.addEventListener?.("resize", onVv);
    window.visualViewport?.addEventListener?.("scroll", onVv);
    window.addEventListener("resize", onVv);
    return () => {
      document.body.classList.remove(MOBILE_CHAT_OPEN_BODY_CLASS);
      window.visualViewport?.removeEventListener?.("resize", onVv);
      window.visualViewport?.removeEventListener?.("scroll", onVv);
      window.removeEventListener("resize", onVv);
      syncAppRootHeight();
    };
  }, [mobileConversationOpen]);

  const t = useMemo(() => (key) => tr(settings.lang, key), [settings.lang]);

  const callRef = useRef(call);
  useEffect(() => {
    callRef.current = call;
  }, [call]);

  useEffect(() => {
    try {
      localStorage.setItem("callLogs", JSON.stringify(callLogs.slice(0, 250)));
    } catch {
      // ignore
    }
  }, [callLogs]);

  const chatsRef = useRef(chats);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  function mergeFetchedMessages(chatId, fetchedList, prevList) {
    const cid = Number(chatId);
    const fetched = Array.isArray(fetchedList) ? fetchedList : [];
    const prev = Array.isArray(prevList) ? prevList : [];
    const prevById = new Map();
    for (const m of prev) {
      if (!m || typeof m !== "object") continue;
      if (Number(m.chatId) !== cid) continue;
      const mid = Number(m.id);
      if (!Number.isFinite(mid) || mid <= 0) continue;
      prevById.set(mid, m);
    }

    // Start from fetched (authoritative shape), but never allow it to "downgrade" fields
    // that were already updated via realtime while the fetch was in-flight.
    const out = fetched.map((m) => {
      const mid = Number(m?.id);
      if (!Number.isFinite(mid) || mid <= 0) return m;
      const existing = prevById.get(mid);
      return existing ? { ...m, ...existing } : m;
    });

    const ids = new Set(out.map((m) => Number(m?.id)).filter((x) => Number.isFinite(x) && x > 0));

    // Keep any messages that arrived via realtime/optimistic while fetch was in-flight.
    for (const m of prev) {
      if (!m || typeof m !== "object") continue;
      if (Number(m.chatId) !== cid) continue;
      const mid = Number(m.id);
      if (Number.isFinite(mid) && mid > 0 && ids.has(mid)) continue;
      out.push(m);
    }

    // Ensure chronological order, even when we appended optimistic/realtime items.
    out.sort((a, b) => {
      const at = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (at !== bt) return at - bt;
      const aid = Number(a?.id) || 0;
      const bid = Number(b?.id) || 0;
      return aid - bid;
    });
    return out;
  }

  const activeCallLogIdRef = useRef(null); // string | null

  function newId() {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    } catch {
      // ignore
    }
    return `log_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function upsertActiveCallLog(patch) {
    const id = activeCallLogIdRef.current;
    if (!id) return;
    setCallLogs((prev) =>
      prev.map((x) => (String(x.id) === String(id) ? { ...x, ...patch } : x))
    );
  }

  function debugLog(...args) {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.log("[Xasma]", ...args);
  }

  const callConnectedTimerRef = useRef(null);
  const outgoingCancelBeforeCallIdRef = useRef(false);

  function clearCallTimers() {
    if (callConnectedTimerRef.current) {
      window.clearTimeout(callConnectedTimerRef.current);
      callConnectedTimerRef.current = null;
    }
  }

  function resetCallState() {
    clearCallTimers();
    outgoingCancelBeforeCallIdRef.current = false;
    setCall({
      phase: "idle",
      direction: null,
      callId: null,
      chatId: null,
      peerUserId: null,
      peerUsername: "",
      peerAvatar: "",
      muted: false,
      connectedAtMs: 0,
      endedReason: "",
    });
  }

  function endCallUi(reason = "") {
    clearCallTimers();
    setCall((prev) => {
      if (prev.phase === "idle") return prev;
      return { ...prev, phase: "ended", endedReason: String(reason || prev.endedReason || "") };
    });
    window.setTimeout(() => {
      const c = callRef.current;
      if (c.phase === "ended") resetCallState();
    }, 900);
  }

  function beginOutgoingCall({ chatId, other }) {
    const cid = Number(chatId);
    if (!cid) return;
    const c = callRef.current;
    if (c.phase !== "idle") return;
    if (!socketRef.current || !socketReady) {
      setRealtimeSendNotice(t("realtimeReconnecting"));
      return;
    }

    outgoingCancelBeforeCallIdRef.current = false;
    // Create call log immediately.
    const logId = newId();
    activeCallLogIdRef.current = logId;
    const now = new Date().toISOString();
    setCallLogs((prev) => [
      {
        id: logId,
        callerId: Number(me?.id || 0),
        receiverId: other?.id != null ? Number(other.id) : null,
        chatId: Number(cid),
        direction: "outgoing",
        status: "missed", // will be corrected on accept/decline/answer
        startedAt: now,
        endedAt: null,
        peerUserId: other?.id != null ? Number(other.id) : null,
        peerUsername: String(other?.username || ""),
        peerAvatar: String(other?.avatar || ""),
      },
      ...prev,
    ]);

    setCall({
      phase: "calling",
      direction: "outgoing",
      callId: null,
      chatId: cid,
      peerUserId: other?.id != null ? Number(other.id) : null,
      peerUsername: String(other?.username || ""),
      peerAvatar: String(other?.avatar || ""),
      muted: false,
      connectedAtMs: 0,
      endedReason: "",
    });
    socketRef.current.emit("call:invite", { chatId: cid });
  }

  function acceptIncomingCall() {
    const c = callRef.current;
    if (!socketRef.current || !socketReady) return;
    if (c.phase !== "ringing" || !c.callId) return;
    socketRef.current.emit("call:accept", { callId: c.callId });
    setCall((prev) => ({ ...prev, phase: "connecting", connectedAtMs: 0 }));
    upsertActiveCallLog({ status: "answered" });
    clearCallTimers();
  }

  function rejectIncomingCall() {
    const c = callRef.current;
    if (!socketRef.current || !socketReady) {
      endCallUi("rejected");
      return;
    }
    if (c.phase !== "ringing" || !c.callId) {
      endCallUi("rejected");
      return;
    }
    socketRef.current.emit("call:reject", { callId: c.callId, reason: "rejected" });
    upsertActiveCallLog({ status: "declined", endedAt: new Date().toISOString() });
    endCallUi("rejected");
  }

  function endOrCancelCall() {
    const c = callRef.current;
    if (c.phase === "idle") return;
    if (!socketRef.current || !socketReady) {
      endCallUi("ended");
      return;
    }

    if (!c.callId) {
      outgoingCancelBeforeCallIdRef.current = true;
      upsertActiveCallLog({ status: "declined", endedAt: new Date().toISOString() });
      endCallUi("cancelled");
      return;
    }

    if (c.phase === "calling") {
      socketRef.current.emit("call:reject", { callId: c.callId, reason: "cancelled" });
      upsertActiveCallLog({ status: "declined", endedAt: new Date().toISOString() });
      endCallUi("cancelled");
      return;
    }

    socketRef.current.emit("call:end", { callId: c.callId, reason: "ended" });
    upsertActiveCallLog({ status: "answered", endedAt: new Date().toISOString() });
    endCallUi("ended");
  }

  function toggleMuteUi() {
    setCall((prev) => ({ ...prev, muted: !prev.muted }));
  }

  // ========================
  // WebRTC (audio only)
  // ========================

  const pcRef = useRef(null); // RTCPeerConnection | null
  const localStreamRef = useRef(null); // MediaStream | null
  const remoteStreamRef = useRef(null); // MediaStream | null
  const remoteAudioRef = useRef(null); // HTMLAudioElement | null
  const pendingIceRef = useRef([]); // RTCIceCandidateInit[]
  const remoteTrackSeenRef = useRef(false);
  const audioResumeArmedRef = useRef(false);
  const audioResumeCleanupRef = useRef(null);

  function cleanupWebrtc() {
    try {
      if (pcRef.current) {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        try {
          pcRef.current.close();
        } catch {
          // ignore
        }
      }
    } finally {
      pcRef.current = null;
    }

    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    } finally {
      localStreamRef.current = null;
    }

    remoteStreamRef.current = null;
    remoteTrackSeenRef.current = false;
    pendingIceRef.current = [];

    const el = remoteAudioRef.current;
    if (el) {
      try {
        el.srcObject = null;
      } catch {
        // ignore
      }
    }

    audioResumeArmedRef.current = false;
    if (audioResumeCleanupRef.current) {
      try {
        audioResumeCleanupRef.current();
      } catch {
        // ignore
      }
    }
    audioResumeCleanupRef.current = null;
  }

  async function ensureLocalAudioOrFail() {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      return stream;
    } catch (e) {
      debugLog("getUserMedia failed", e?.message || e);
      // End call on mic denial/failure.
      endOrCancelCall();
      return null;
    }
  }

  function tryPlayRemoteAudio() {
    const el = remoteAudioRef.current;
    if (!el) return;
    try {
      el.muted = false;
      el.volume = 1;
      const p = el.play?.();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      // ignore
    }
  }

  function markConnectedIfReady(pc) {
    if (!pc) return;
    const connected =
      pc.connectionState === "connected" ||
      pc.iceConnectionState === "connected" ||
      pc.iceConnectionState === "completed";
    if (!connected) return;
    if (!remoteTrackSeenRef.current) return;
    setCall((prev) =>
      prev.phase === "connecting"
        ? { ...prev, phase: "connected", connectedAtMs: prev.connectedAtMs || Date.now() }
        : prev
    );
  }

  function ensurePeerConnection(callId) {
    if (pcRef.current) return pcRef.current;
    const id = String(callId || "");
    const socket = socketRef.current;
    if (!socket || !id) return null;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // Helps some browsers/WebViews reliably negotiate audio receive.
    try {
      pc.addTransceiver?.("audio", { direction: "sendrecv" });
    } catch {
      // ignore
    }

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      socket.emit("webrtc:ice-candidate", { callId: id, candidate: ev.candidate.toJSON() });
    };

    pc.ontrack = (ev) => {
      const existing = remoteStreamRef.current;
      const stream =
        (ev.streams && ev.streams[0]) ||
        existing ||
        (typeof MediaStream !== "undefined" ? new MediaStream() : null);
      if (!stream) return;
      if (!existing && ev.track) {
        try {
          stream.addTrack(ev.track);
        } catch {
          // ignore
        }
      }
      remoteStreamRef.current = stream;
      remoteTrackSeenRef.current = true;
      const el = remoteAudioRef.current;
      if (el) {
        try {
          el.srcObject = stream;
          el.muted = false;
          el.volume = 1;
          // Some WebViews/Safari won't start playback if the element is `display:none`.
          // Also, calling play in the same tick can fail; defer slightly.
          requestAnimationFrame(tryPlayRemoteAudio);
          window.setTimeout(tryPlayRemoteAudio, 60);
        } catch {
          // ignore
        }
      }

      markConnectedIfReady(pc);
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") markConnectedIfReady(pc);
      // "disconnected" is often transient (ICE restart / network blip); only "failed" is a hard stop.
      if (st === "failed") {
        debugLog("webrtc connectionState", st);
        endOrCancelCall();
      }
    };

    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === "connected" || st === "completed") markConnectedIfReady(pc);
      if (st === "failed") {
        debugLog("webrtc iceConnectionState", st);
        endOrCancelCall();
      }
    };

    pcRef.current = pc;
    return pc;
  }

  async function flushPendingIce(pc) {
    const list = pendingIceRef.current;
    if (!list.length) return;
    pendingIceRef.current = [];
    for (const c of list) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        // ignore
      }
    }
  }

  useEffect(() => {
    // Cleanup when call leaves active phases.
    if (call.phase === "idle" || call.phase === "ended") {
      cleanupWebrtc();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.phase]);

  useEffect(() => {
    // Apply mute to the actual microphone track (UI + media stay consistent).
    const stream = localStreamRef.current;
    if (!stream) return;
    try {
      stream.getAudioTracks().forEach((tr) => {
        tr.enabled = !call.muted;
      });
    } catch {
      // ignore
    }
  }, [call.muted]);

  useEffect(() => {
    // Start WebRTC setup when entering "connecting".
    if (call.phase !== "connecting") return;
    if (!call.callId) return;

    let cancelled = false;
    (async () => {
      const stream = await ensureLocalAudioOrFail();
      if (!stream || cancelled) return;

      const pc = ensurePeerConnection(call.callId);
      if (!pc || cancelled) return;

      // Attach local tracks once.
      const already = new Set(pc.getSenders().map((s) => s.track).filter(Boolean));
      stream.getTracks().forEach((tr) => {
        if (already.has(tr)) return;
        try {
          pc.addTrack(tr, stream);
        } catch {
          // ignore
        }
      });

      // Caller creates and sends offer.
      if (call.direction === "outgoing") {
        try {
          const offer = await pc.createOffer();
          if (cancelled) return;
          await pc.setLocalDescription(offer);
          socketRef.current?.emit("webrtc:offer", { callId: String(call.callId), sdp: pc.localDescription });
        } catch (e) {
          debugLog("createOffer/setLocalDescription failed", e?.message || e);
          endOrCancelCall();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.phase, call.callId, call.direction]);

  useEffect(() => {
    // WebViews may block autoplay even for off-screen audio; retry playback on the next user gesture.
    if (call.phase !== "connecting" && call.phase !== "connected") return;
    if (!remoteStreamRef.current) return;
    if (audioResumeArmedRef.current) return;
    audioResumeArmedRef.current = true;

    const onGesture = () => tryPlayRemoteAudio();
    document.addEventListener("pointerdown", onGesture, { passive: true });
    document.addEventListener("touchstart", onGesture, { passive: true });
    audioResumeCleanupRef.current = () => {
      document.removeEventListener("pointerdown", onGesture);
      document.removeEventListener("touchstart", onGesture);
    };
    return () => {
      if (audioResumeCleanupRef.current) audioResumeCleanupRef.current();
      audioResumeCleanupRef.current = null;
      audioResumeArmedRef.current = false;
    };
  }, [call.phase]);

  function makeClientTempId() {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    } catch {
      // ignore
    }
    return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function previewTextForMessage(msg) {
    const text = String(msg?.text ?? "").replace(/\s+/g, " ").trim();
    if (text) return text;
    if (msg?.videoUrl) return t("notifyPreviewVideo");
    if (msg?.audioUrl) return t("notifyPreviewVoice");
    if (msg?.imageUrl) return t("notifyPreviewPhoto");
    if (msg?.type === "system") {
      const sk = String(msg?.systemKind || "");
      const p = msg?.systemPayload && typeof msg.systemPayload === "object" ? msg.systemPayload : {};
      if (sk === "call_log") {
        const result = String(p.result || "");
        const dur = typeof p.durationSeconds === "number" ? Math.max(0, Math.floor(p.durationSeconds)) : 0;
        const mm = String(Math.floor(dur / 60)).padStart(2, "0");
        const ss = String(dur % 60).padStart(2, "0");
        if (result === "missed") return t("callEventMissed");
        if (result === "declined") return t("callEventDeclined");
        if (result === "cancelled") return t("callEventCancelled");
        if (result === "answered" && dur > 0) return t("callEventAudioWithDuration").replace("{dur}", `${mm}:${ss}`);
        return t("callEventAudio");
      }
      return "[Event]";
    }
    return "…";
  }

  function reorderChatsByActivity(nextChats, chatIdToBump) {
    const cid = Number(chatIdToBump);
    if (!cid) return nextChats;
    const idx = nextChats.findIndex((c) => Number(c.id) === cid);
    if (idx < 0) return nextChats;
    const chat = nextChats[idx];
    const rest = nextChats.slice(0, idx).concat(nextChats.slice(idx + 1));
    const pinned = [];
    const unpinned = [];
    for (const c of rest) (c.listPinned ? pinned : unpinned).push(c);
    if (chat.listPinned) pinned.unshift(chat);
    else unpinned.unshift(chat);
    return pinned.concat(unpinned);
  }

  function markBanned() {
    setMe((prev) => (prev ? { ...prev, banned: true } : prev));
  }

  useEffect(() => {
    localStorage.setItem("settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!token) {
      setMe(null);
      setChats([]);
      setSelectedChatId(null);
      setMessages([]);
      return;
    }

    let cancelled = false;
    let minSplashTimerId = null;
    const bootStartedAt = Date.now();

    (async () => {
      setAuthError("");
      try {
        const meUser = await getMe();
        if (cancelled) return;
        const elapsed = Date.now() - bootStartedAt;
        const remaining = Math.max(0, AUTH_BOOT_MIN_MS - elapsed);
        const applyMe = () => {
          if (cancelled) return;
          setMe(meUser);
        };
        if (remaining > 0) {
          minSplashTimerId = window.setTimeout(applyMe, remaining);
        } else {
          applyMe();
        }
      } catch (e) {
        if (cancelled) return;
        setAuthError(e.message || tr(normalizeLang(settingsRef.current?.lang), "authSessionFailed"));
        localStorage.removeItem("token");
        setToken("");
      }
    })();

    return () => {
      cancelled = true;
      if (minSplashTimerId != null) window.clearTimeout(minSplashTimerId);
    };
  }, [token]);

  // Fetch chat list when authenticated.
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getChats();
        if (cancelled) return;
        setChats(list);
      } catch (e) {
        // Ignore at first; user can reload or interact.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  // Socket.io: connect once authenticated.
  useEffect(() => {
    if (!token) return;

    const socket = io(socketEndpoint, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4_000,
    });
    socketRef.current = socket;

    function scheduleSocketResync(reason) {
      const now = Date.now();
      // Avoid thundering herds on flaky networks.
      if (now - lastSocketResyncAtRef.current < 900) return;
      if (socketResyncTimerRef.current) window.clearTimeout(socketResyncTimerRef.current);
      socketResyncTimerRef.current = window.setTimeout(async () => {
        socketResyncTimerRef.current = null;
        lastSocketResyncAtRef.current = Date.now();

        debugLog("socket resync", { reason });
        try {
          const list = await getChats();
          setChats(list);
        } catch (e) {
          debugLog("socket resync: getChats failed", e?.message || e);
        }

        const openChatId = Number(selectedChatIdRef.current || 0);
        if (!openChatId) return;
        try {
          const loadSeq = ++messagesLoadSeqRef.current;
          const list = await getMessages(openChatId, 50);
          setMessages((prev) => {
            if (Number(selectedChatIdRef.current || 0) !== Number(openChatId)) return prev;
            if (messagesLoadSeqRef.current !== loadSeq) return prev;
            return mergeFetchedMessages(openChatId, list, prev);
          });
          const lastId = list.length ? Number(list[list.length - 1].id) : 0;
          if (lastId && socket.connected) {
            socket.emit("chat:read", { chatId: openChatId, upToMessageId: lastId });
          }
        } catch (e) {
          debugLog("socket resync: getMessages failed", e?.message || e);
        }
      }, 220);
    }

    socket.on("connect", () => {
      setSocketReady(true);
      setRealtimeSendNotice("");
      scheduleSocketResync("connect");
    });
    socket.on("disconnect", (reason) => {
      setSocketReady(false);
      debugLog("socket disconnect", reason);
    });
    socket.on("connect_error", (err) => {
      debugLog("socket connect_error", err?.message || err);
    });
    socket.io.on("reconnect", (attempt) => {
      debugLog("socket reconnect", attempt);
      scheduleSocketResync("reconnect");
    });
    socket.io.on("reconnect_error", (err) => {
      debugLog("socket reconnect_error", err?.message || err);
    });

    socket.on("chat:message", (msg) => {
      const msgId = msg?.id != null ? Number(msg.id) : 0;
      const temp = typeof msg?.clientTempId === "string" ? msg.clientTempId : "";
      const msgChatId = msg?.chatId != null ? Number(msg.chatId) : 0;

      // Update open chat immediately; otherwise refresh chat list.
      const openChatId = selectedChatIdRef.current;
      if (openChatId && msgChatId && Number(openChatId) === msgChatId) {
        setMessages((prev) => {
          // If this is the server-confirmation of an optimistic message, replace it in-place.
          if (temp && me?.id && Number(msg?.senderId) === Number(me.id)) {
            const idx = prev.findIndex((m) => m && typeof m.clientTempId === "string" && m.clientTempId === temp);
            if (idx >= 0) {
              const tid = optimisticSendTimersRef.current.get(temp);
              if (tid) {
                window.clearTimeout(tid);
                optimisticSendTimersRef.current.delete(temp);
              }
              const next = prev.slice();
              next[idx] = msg;
              return next;
            }
          }

          // Avoid duplicates (e.g. reconnect/resync races).
          if (msgId && prev.some((m) => Number(m?.id) === msgId)) return prev;
          return prev.concat(msg);
        });

        // If I'm currently viewing this chat and the tab is active,
        // immediately mark the incoming message as read.
        const isIncoming =
          me?.id &&
          msg.senderId &&
          Number(msg.senderId) !== me.id &&
          msg.type !== "system";
        if (isIncoming && socketReady && isWindowActive()) {
          const cid = Number(openChatId);
          const mid = Number(msg.id);
          const lastSent = Number(lastReadSentRef.current[cid] || 0);
          if (mid > lastSent) {
            lastReadSentRef.current[cid] = mid;
            if (readEmitTimerRef.current) clearTimeout(readEmitTimerRef.current);
            readEmitTimerRef.current = setTimeout(() => {
              socket.emit("chat:read", { chatId: cid, upToMessageId: mid });
            }, 120);
          }
        }
      }

      // Keep chat list fresh without full refresh:
      // update the affected chat row (last preview, time, unread count) and bump it to top of its section.
      setChats((prev) => {
        const cid = msgChatId;
        if (!cid) return prev;
        const now = Date.now();
        const open = Number(openChatId || 0);
        const isIncoming =
          me?.id &&
          msg?.senderId &&
          Number(msg.senderId) !== Number(me.id) &&
          msg?.type !== "system";
        const treatAsUnread = Boolean(isIncoming && (open !== cid || !isWindowActive()));

        const next = prev.map((c) => {
          if (Number(c.id) !== cid) return c;
          const last = {
            id: msg.id != null ? Number(msg.id) : null,
            text: previewTextForMessage(msg),
            createdAt: msg.createdAt || new Date(now).toISOString(),
            senderId: msg.senderId != null ? Number(msg.senderId) : null,
          };
          const unreadCount = treatAsUnread ? Math.max(0, Number(c.unreadCount) || 0) + 1 : c.unreadCount;
          return { ...c, last, unreadCount };
        });
        return reorderChatsByActivity(next, cid);
      });

      const lang = normalizeLang(settingsRef.current?.lang);
      void tryShowIncomingMessageNotification(msg, {
        meId: me?.id,
        openChatId: selectedChatIdRef.current,
        settings: settingsRef.current,
        t: (key) => tr(lang, key),
        onOpenChat: (cid) => openChatFromNotificationRef.current(cid),
      });
    });

    // ========================
    // Call signaling (UI only)
    // ========================

    socket.on("call:incoming", ({ callId, chatId, fromUserId } = {}) => {
      const c = callRef.current;
      const id = callId ? String(callId) : "";
      if (c.phase !== "idle") {
        // Reject as busy to avoid stuck states.
        if (id) socket.emit("call:reject", { callId: id, reason: "busy" });
        return;
      }
      const cid = Number(chatId);
      const row = chatsRef.current.find((x) => Number(x.id) === cid);
      const other = row?.other || null;
      const logId = newId();
      activeCallLogIdRef.current = logId;
      const now = new Date().toISOString();
      setCallLogs((prev) => [
        {
          id: logId,
          callerId: fromUserId != null ? Number(fromUserId) : null,
          receiverId: Number(me?.id || 0),
          chatId: cid || null,
          direction: "incoming",
          status: "missed", // becomes answered/declined if user acts
          startedAt: now,
          endedAt: null,
          peerUserId: other?.id != null ? Number(other.id) : fromUserId != null ? Number(fromUserId) : null,
          peerUsername: String(other?.username || ""),
          peerAvatar: String(other?.avatar || ""),
        },
        ...prev,
      ]);
      setCall({
        phase: "ringing",
        direction: "incoming",
        callId: id || null,
        chatId: cid || null,
        peerUserId:
          fromUserId != null
            ? Number(fromUserId)
            : other?.id != null
              ? Number(other.id)
              : null,
        peerUsername: String(other?.username || ""),
        peerAvatar: String(other?.avatar || ""),
        muted: false,
        connectedAtMs: 0,
        endedReason: "",
      });
    });

    socket.on("call:ringing", ({ callId, chatId } = {}) => {
      const c = callRef.current;
      if (c.phase !== "calling") return;
      const id = callId ? String(callId) : null;
      if (!id) return;
      if (outgoingCancelBeforeCallIdRef.current) {
        outgoingCancelBeforeCallIdRef.current = false;
        socket.emit("call:reject", { callId: id, reason: "cancelled" });
        endCallUi("cancelled");
        return;
      }
      setCall((prev) => ({ ...prev, callId: id, chatId: Number(chatId) || prev.chatId }));
    });

    socket.on("call:accept", ({ callId } = {}) => {
      const c = callRef.current;
      if (!c.callId || String(callId || "") !== String(c.callId)) return;
      setCall((prev) => ({ ...prev, phase: "connecting" }));
      upsertActiveCallLog({ status: "answered" });
      clearCallTimers();
    });

    socket.on("call:connecting", ({ callId } = {}) => {
      const c = callRef.current;
      if (!c.callId || String(callId || "") !== String(c.callId)) return;
      setCall((prev) => ({ ...prev, phase: "connecting" }));
      clearCallTimers();
    });

    socket.on("call:reject", ({ callId, reason } = {}) => {
      const c = callRef.current;
      if (c.callId && String(callId || "") !== String(c.callId)) return;
      const r = String(reason || "rejected");
      const status = r === "busy" || r === "rejected" || r === "cancelled" ? "declined" : "missed";
      upsertActiveCallLog({ status, endedAt: new Date().toISOString() });
      endCallUi(r);
    });

    socket.on("call:ended", ({ callId, reason } = {}) => {
      const c = callRef.current;
      if (c.callId && String(callId || "") !== String(c.callId)) return;
      const r = String(reason || "ended");
      const status = r === "missed" || r === "offline" ? "missed" : "answered";
      upsertActiveCallLog({ status, endedAt: new Date().toISOString() });
      endCallUi(r);
    });

    // Defensive: if server ever emits call:end.
    socket.on("call:end", ({ callId, reason } = {}) => {
      const c = callRef.current;
      if (c.callId && String(callId || "") !== String(c.callId)) return;
      const r = String(reason || "ended");
      upsertActiveCallLog({ status: "answered", endedAt: new Date().toISOString() });
      endCallUi(r);
    });

    // ========================
    // WebRTC signaling relay
    // ========================

    socket.on("webrtc:offer", async ({ callId, sdp } = {}) => {
      const c = callRef.current;
      if (!c.callId || String(callId || "") !== String(c.callId)) return;
      if (c.phase !== "connecting" && c.phase !== "connected") return;

      const stream = await ensureLocalAudioOrFail();
      if (!stream) return;
      const pc = ensurePeerConnection(String(callId));
      if (!pc) return;

      // Attach local tracks once.
      const already = new Set(pc.getSenders().map((s) => s.track).filter(Boolean));
      stream.getTracks().forEach((tr) => {
        if (already.has(tr)) return;
        try {
          pc.addTrack(tr, stream);
        } catch {
          // ignore
        }
      });

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await flushPendingIce(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc:answer", { callId: String(callId), sdp: pc.localDescription });
      } catch (e) {
        debugLog("handle offer failed", e?.message || e);
        endOrCancelCall();
      }
    });

    socket.on("webrtc:answer", async ({ callId, sdp } = {}) => {
      const c = callRef.current;
      if (!c.callId || String(callId || "") !== String(c.callId)) return;
      if (c.phase !== "connecting" && c.phase !== "connected") return;
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await flushPendingIce(pc);
      } catch (e) {
        debugLog("handle answer failed", e?.message || e);
        endOrCancelCall();
      }
    });

    socket.on("webrtc:ice-candidate", async ({ callId, candidate } = {}) => {
      const c = callRef.current;
      if (!c.callId || String(callId || "") !== String(c.callId)) return;
      if (c.phase !== "connecting" && c.phase !== "connected") return;
      const pc = pcRef.current;
      if (!pc || !candidate) return;
      try {
        if (!pc.remoteDescription) {
          pendingIceRef.current.push(candidate);
          return;
        }
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore
      }
    });

    socket.on("user:avatar", ({ userId, avatar }) => {
      const uid = Number(userId);
      const av = String(avatar || "");

      setMe((prev) => (prev && prev.id === uid ? { ...prev, avatar: av } : prev));
      setChats((prev) =>
        prev.map((c) => (c.other?.id === uid ? { ...c, other: { ...c.other, avatar: av } } : c))
      );
      setMessages((prev) =>
        prev.map((m) => (m.senderId === uid ? { ...m, sender: { ...(m.sender || {}), avatar: av } } : m))
      );
    });

    socket.on("user:presence", ({ userId, isOnline, lastSeenAt }) => {
      const uid = Number(userId);
      const online = Boolean(isOnline);
      const seen = lastSeenAt || null;

      setPresenceTick((n) => n + 1);

      setMe((prev) =>
        prev && prev.id === uid ? { ...prev, isOnline: online, lastSeenAt: seen } : prev
      );
      setChats((prev) =>
        prev.map((c) =>
          c.other?.id === uid
            ? { ...c, other: { ...c.other, isOnline: online, lastSeenAt: seen } }
            : c
        )
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === uid
            ? { ...m, sender: { ...(m.sender || {}), isOnline: online, lastSeenAt: seen } }
            : m
        )
      );
    });

    socket.on("chat:typing", ({ chatId, userId, isTyping }) => {
      const cid = Number(chatId);
      if (!cid) return;

      // Only show typing for the other user.
      if (me?.id && Number(userId) === me.id) return;

      if (isTyping) {
        const until = Date.now() + 2500;
        setTypingUntil((prev) => ({ ...prev, [cid]: until }));
      } else {
        setTypingUntil((prev) => ({ ...prev, [cid]: 0 }));
      }
    });

    socket.on("chat:message:status", ({ chatId, updates }) => {
      const cid = Number(chatId);
      if (!cid || !Array.isArray(updates)) return;
      setMessages((prev) =>
        prev.map((m) => {
          const u = updates.find((x) => Number(x.id) === m.id);
          if (!u) return m;
          return {
            ...m,
            deliveredAt: u.deliveredAt ?? m.deliveredAt ?? null,
            readAt: u.readAt ?? m.readAt ?? null,
          };
        })
      );
    });

    socket.on("message:edited", ({ chatId, message }) => {
      if (!message?.id) return;
      const openChatId = selectedChatIdRef.current;
      if (!openChatId || Number(chatId) !== openChatId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, ...message } : m))
      );

      // If the edited message is the chat list "last", update its preview text in-place.
      setChats((prev) =>
        prev.map((c) => {
          if (Number(c.id) !== Number(chatId)) return c;
          if (!c.last || Number(c.last.id) !== Number(message.id)) return c;
          return { ...c, last: { ...c.last, text: previewTextForMessage(message) } };
        })
      );
    });

    socket.on("message:reactionsUpdated", ({ chatId, messageId, reactions }) => {
      const openChatId = selectedChatIdRef.current;
      if (!openChatId || Number(chatId) !== openChatId) return;
      const mid = Number(messageId);
      if (!mid) return;
      const nextReactions = Array.isArray(reactions) ? reactions : [];
      setMessages((prev) => prev.map((m) => (Number(m.id) === mid ? { ...m, reactions: nextReactions } : m)));
    });

    socket.on("message:deleted", ({ chatId, messageId }) => {
      const cid = Number(chatId);
      const mid = Number(messageId);
      if (!cid || !mid) return;
      const openChatId = selectedChatIdRef.current;
      if (openChatId && cid === openChatId) {
        setMessages((prev) => prev.filter((m) => Number(m.id) !== mid));
      }
      setChats((prev) =>
        prev.map((c) => {
          if (Number(c.id) !== cid) return c;
          const unpin =
            Number(c.pinnedMessageId) === mid ? { pinnedMessageId: null, pinnedPreview: null } : null;

          // If the deleted message is the chat list "last", update preview accordingly.
          if (c.last && Number(c.last.id) === mid) {
            const last = { ...c.last, text: t("noMessages"), id: null };
            return { ...c, ...(unpin || {}), last };
          }

          return unpin ? { ...c, ...unpin } : c;
        })
      );
    });

    socket.on("chat:pinnedUpdated", ({ chatId, pinnedMessageId, pinnedPreview } = {}) => {
      const cid = Number(chatId);
      if (!cid) return;
      const pid = pinnedMessageId != null ? Number(pinnedMessageId) : null;
      const pv = typeof pinnedPreview === "string" ? pinnedPreview : pinnedPreview == null ? null : String(pinnedPreview);
      setChats((prev) =>
        prev.map((c) =>
          c.id === cid ? { ...c, pinnedMessageId: pid, pinnedPreview: pv } : c
        )
      );
    });

    socket.on("user:roleUpdated", ({ userId, role }) => {
      const uid = Number(userId);
      if (!uid) return;
      setMe((prev) => (prev && prev.id === uid ? { ...prev, role } : prev));
    });

    socket.on("user:banned", ({ userId, banned }) => {
      const uid = Number(userId);
      if (!uid) return;
      if (me?.id && uid === me.id) {
        setMe((prev) => (prev ? { ...prev, banned: Boolean(banned) } : prev));
      }
    });

    socket.on("group:avatarUpdated", ({ chatId, avatar }) => {
      const cid = Number(chatId);
      if (!cid) return;
      const av = String(avatar || "");
      setChats((prev) =>
        prev.map((c) =>
          c.id === cid && (c.type === "group" || c.type === "channel") ? { ...c, avatar: av } : c
        )
      );
    });

    socket.on("user:auraColor", ({ userId, auraColor } = {}) => {
      const uid = Number(userId);
      if (!uid) return;
      const ac = typeof auraColor === "string" ? auraColor : "";
      setMe((prev) => (prev && prev.id === uid ? { ...prev, auraColor: ac } : prev));
      setChats((prev) =>
        prev.map((c) =>
          c.other?.id === uid ? { ...c, other: { ...c.other, auraColor: ac } } : c
        )
      );
      setMessages((prev) =>
        prev.map((m) =>
          Number(m.senderId) === uid && m.sender
            ? { ...m, sender: { ...m.sender, auraColor: ac } }
            : m
        )
      );
    });

    socket.on("user:tagUpdated", ({ userId, tag, tagColor, tagStyle } = {}) => {
      const uid = Number(userId);
      if (!uid) return;
      const tg = typeof tag === "string" ? tag : "";
      const tc = typeof tagColor === "string" ? tagColor : "";
      const ts = tagStyle === "gradient" ? "gradient" : "solid";
      setMe((prev) =>
        prev && prev.id === uid ? { ...prev, tag: tg, tagColor: tc, tagStyle: ts } : prev
      );
      setChats((prev) =>
        prev.map((c) =>
          c.other?.id === uid
            ? { ...c, other: { ...c.other, tag: tg, tagColor: tc, tagStyle: ts } }
            : c
        )
      );
      setMessages((prev) =>
        prev.map((m) =>
          Number(m.senderId) === uid && m.sender
            ? { ...m, sender: { ...m.sender, tag: tg, tagColor: tc, tagStyle: ts } }
            : m
        )
      );
    });

    socket.on("user:profileStatus", ({ userId, statusKind, statusText } = {}) => {
      const uid = Number(userId);
      if (!uid) return;
      const sk = typeof statusKind === "string" ? statusKind : "";
      const st = typeof statusText === "string" ? statusText : "";
      setMe((prev) =>
        prev && prev.id === uid ? { ...prev, statusKind: sk, statusText: st } : prev
      );
      setChats((prev) =>
        prev.map((c) =>
          c.other?.id === uid ? { ...c, other: { ...c.other, statusKind: sk, statusText: st } } : c
        )
      );
    });

    socket.on("user:messageCount", ({ userId, messageCount } = {}) => {
      const uid = Number(userId);
      if (!uid) return;
      const mc = Math.max(0, Number(messageCount) || 0);
      setMe((prev) => (prev && prev.id === uid ? { ...prev, messageCount: mc } : prev));
      setChats((prev) =>
        prev.map((c) =>
          c.other?.id === uid ? { ...c, other: { ...c.other, messageCount: mc } } : c
        )
      );
      setMessages((prev) =>
        prev.map((m) =>
          Number(m.senderId) === uid && m.sender
            ? { ...m, sender: { ...m.sender, messageCount: mc } }
            : m
        )
      );
    });

    socket.on("chat:sendRateLimited", ({ retryAfterMs } = {}) => {
      const sec = Math.max(1, Math.ceil(Number(retryAfterMs || 10_000) / 1000));
      const lang = normalizeLang(settingsRef.current?.lang);
      setSendRateLimitNotice(tr(lang, "sendRateLimited").replace("{seconds}", String(sec)));
    });

    return () => {
      if (socketResyncTimerRef.current) {
        window.clearTimeout(socketResyncTimerRef.current);
        socketResyncTimerRef.current = null;
      }
      socket.off("connect_error");
      socket.io?.off?.("reconnect");
      socket.io?.off?.("reconnect_error");
      socket.off("chat:message");
      socket.off("user:avatar");
      socket.off("user:presence");
      socket.off("chat:typing");
      socket.off("chat:message:status");
      socket.off("message:edited");
      socket.off("message:reactionsUpdated");
      socket.off("message:deleted");
      socket.off("chat:pinnedUpdated");
      socket.off("user:roleUpdated");
      socket.off("user:banned");
      socket.off("group:avatarUpdated");
      socket.off("user:auraColor");
      socket.off("user:tagUpdated");
      socket.off("user:profileStatus");
      socket.off("user:messageCount");
      socket.off("chat:sendRateLimited");
      socket.off("call:incoming");
      socket.off("call:ringing");
      socket.off("call:accept");
      socket.off("call:connecting");
      socket.off("call:reject");
      socket.off("call:ended");
      socket.off("call:end");
      socket.off("webrtc:offer");
      socket.off("webrtc:answer");
      socket.off("webrtc:ice-candidate");
      socket.disconnect();
    };
  }, [token, socketEndpoint, me?.id]);

  useEffect(() => {
    if (!token) return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const s = socketRef.current;
      if (!s) return;
      // On Android, background/foreground can stall the WebSocket; nudging connect helps.
      if (!s.connected) {
        try {
          s.connect();
        } catch {
          // ignore
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [token]);

  useEffect(() => {
    if (!sendRateLimitNotice) return;
    const id = window.setTimeout(() => setSendRateLimitNotice(""), 12_000);
    return () => window.clearTimeout(id);
  }, [sendRateLimitNotice]);

  useEffect(() => {
    if (!realtimeSendNotice) return;
    const id = window.setTimeout(() => setRealtimeSendNotice(""), 6_000);
    return () => window.clearTimeout(id);
  }, [realtimeSendNotice]);

  async function refreshMessages(chatId) {
    const loadSeq = ++messagesLoadSeqRef.current;
    const list = await getMessages(chatId, 50);
    setMessages((prev) => {
      if (Number(selectedChatIdRef.current || 0) !== Number(chatId)) return prev;
      if (messagesLoadSeqRef.current !== loadSeq) return prev;
      return mergeFetchedMessages(chatId, list, prev);
    });
  }

  async function handleSetChatPin(messageId) {
    const cid = selectedChatId;
    if (!cid) return;
    try {
      const data = await patchChatPin(cid, messageId);
      setChats((prev) =>
        prev.map((c) =>
          c.id === Number(cid)
            ? {
                ...c,
                pinnedMessageId: data.pinnedMessageId ?? null,
                pinnedPreview: data.pinnedPreview ?? null,
              }
            : c
        )
      );
    } catch {
      /* ignore; Chat stays consistent on next refresh */
    }
  }

  async function selectChat(chatId) {
    setSendRateLimitNotice("");
    const loadSeq = ++messagesLoadSeqRef.current;
    setSelectedChatId(chatId);
    setChats((prev) =>
      prev.map((c) => (Number(c.id) === Number(chatId) ? { ...c, unreadCount: 0 } : c))
    );
    setMessages([]);
    const list = await getMessages(chatId, 50);
    setMessages((prev) => {
      if (Number(selectedChatIdRef.current || 0) !== Number(chatId)) return prev;
      if (messagesLoadSeqRef.current !== loadSeq) return prev;
      return mergeFetchedMessages(chatId, list, prev);
    });
    const lastId = list.length ? list[list.length - 1].id : 0;
    if (lastId && socketRef.current && socketReady) {
      socketRef.current.emit("chat:read", { chatId, upToMessageId: lastId });
    }
  }

  openChatFromNotificationRef.current = (chatId) => {
    if (!chatId) return;
    if (isMobile) setMobileTab("chats");
    void selectChat(chatId);
  };

  async function startChat(withUserId) {
    const chatId = await createChat(withUserId);
    await selectChat(chatId);
  }

  async function handleCreateGroup({ title, memberUserIds }) {
    const chatId = await createGroup({ title, memberUserIds });
    const list = await getChats();
    setChats(list);
    await selectChat(chatId);
  }

  async function handleCreateChannel({ title, avatar, memberUserIds }) {
    const chatId = await createChannel({ title, avatar, memberUserIds });
    const list = await getChats();
    setChats(list);
    await selectChat(chatId);
  }

  async function refreshChatsList() {
    try {
      const list = await getChats();
      setChats(list);
    } catch {
      // ignore
    }
  }

  async function handleChatListPinToggle(chatId, nextPinned) {
    await patchChatListPin(chatId, nextPinned);
    await refreshChatsList();
  }

  async function handleChatMembershipDelete(chatId) {
    await deleteChatMembership(chatId);
    setChats((prev) => prev.filter((c) => Number(c.id) !== Number(chatId)));
    if (Number(selectedChatId) === Number(chatId)) {
      setSelectedChatId(null);
      setMessages([]);
    }
  }

  function handleSend(payload) {
    const isObj = payload && typeof payload === "object" && !Array.isArray(payload);
    const text = isObj ? String(payload.text ?? "").trim() : String(payload ?? "").trim();
    const imageUrl = isObj && payload.imageUrl ? String(payload.imageUrl).trim() : "";
    const audioUrl = isObj && payload.audioUrl ? String(payload.audioUrl).trim() : "";
    const videoUrl = isObj && payload.videoUrl ? String(payload.videoUrl).trim() : "";
    const replyToMessageId = isObj && payload.replyToMessageId ? Number(payload.replyToMessageId) : 0;
    if (!text && !imageUrl && !audioUrl && !videoUrl) return;
    if (!selectedChatId) return;
    if (me?.banned) return;
    const activeChat = chats.find((c) => Number(c.id) === Number(selectedChatId));
    if (activeChat && activeChat.canPostMessage === false) return;

    const clientTempId = makeClientTempId();
    const nowIso = new Date().toISOString();
    const optimisticMessage = {
      id: -Date.now(), // local-only; replaced when server confirms
      chatId: Number(selectedChatId),
      senderId: Number(me?.id || 0),
      sender: {
        id: Number(me?.id || 0),
        username: me?.username || "",
        avatar: me?.avatar || "",
        auraColor: me?.auraColor || "",
        isOnline: Boolean(me?.isOnline),
        lastSeenAt: me?.lastSeenAt || null,
        statusKind: me?.statusKind || "",
        statusText: me?.statusText || "",
        messageCount: Math.max(0, Number(me?.messageCount) || 0),
        tag: me?.tag ?? null,
        tagColor: me?.tagColor || "",
        tagStyle: me?.tagStyle || "solid",
      },
      type: "text",
      text,
      imageUrl: imageUrl || null,
      audioUrl: audioUrl || null,
      videoUrl: videoUrl || null,
      replyTo: replyToMessageId
        ? (() => {
            const r = messages.find((m) => Number(m?.id) === Number(replyToMessageId));
            if (!r) return { id: Number(replyToMessageId), senderId: null, senderUsername: "", text: "" };
            return {
              id: Number(r.id),
              senderId: r.senderId != null ? Number(r.senderId) : null,
              senderUsername: r.sender?.username || "",
              text: r.text || "",
              imageUrl: r.imageUrl || null,
              audioUrl: r.audioUrl || null,
              videoUrl: r.videoUrl || null,
            };
          })()
        : null,
      reactions: [],
      deliveredAt: null,
      readAt: null,
      editedAt: null,
      createdAt: nowIso,
      clientTempId,
      localStatus: "sending",
      _optimistic: true,
      _optimisticPayload: { text, imageUrl, audioUrl, videoUrl, replyToMessageId },
    };

    // Optimistically render immediately in the open chat.
    setMessages((prev) => prev.concat(optimisticMessage));

    // Optimistically update chat list preview (safe; id may be null until server confirms).
    setChats((prev) => {
      const cid = Number(selectedChatId);
      const next = prev.map((c) => {
        if (Number(c.id) !== cid) return c;
        const last = {
          id: null,
          text: previewTextForMessage(optimisticMessage),
          createdAt: nowIso,
          senderId: Number(me?.id || 0),
        };
        return { ...c, last };
      });
      return reorderChatsByActivity(next, Number(selectedChatId));
    });

    // If the server never confirms, show a failed state (but keep the bubble).
    const failAfterMs = 15_000;
    const timeoutId = window.setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m && typeof m.clientTempId === "string" && m.clientTempId === clientTempId && m.localStatus === "sending"
            ? { ...m, localStatus: "failed" }
            : m
        )
      );
      optimisticSendTimersRef.current.delete(clientTempId);
    }, failAfterMs);
    optimisticSendTimersRef.current.set(clientTempId, timeoutId);

    if (!socketRef.current || !socketReady) {
      setRealtimeSendNotice(t("realtimeReconnecting"));
      // Mark failed immediately (still visible), user can retry after reconnect.
      setMessages((prev) =>
        prev.map((m) =>
          m && typeof m.clientTempId === "string" && m.clientTempId === clientTempId
            ? { ...m, localStatus: "failed" }
            : m
        )
      );
      return;
    }

    // Sending implies typing stopped.
    socketRef.current.emit("chat:typing", { chatId: selectedChatId, isTyping: false });
    socketRef.current.emit("chat:send", {
      chatId: selectedChatId,
      clientTempId,
      text,
      ...(imageUrl ? { imageUrl } : {}),
      ...(audioUrl ? { audioUrl } : {}),
      ...(videoUrl ? { videoUrl } : {}),
      ...(replyToMessageId ? { replyToMessageId } : {}),
    });
  }

  function handleRetrySend(msg) {
    if (!msg || typeof msg !== "object") return;
    if (!selectedChatId || Number(msg.chatId) !== Number(selectedChatId)) return;
    if (me?.banned) return;
    const payload = msg._optimisticPayload || {};
    const text = String(payload.text ?? "").trim();
    const imageUrl = payload.imageUrl ? String(payload.imageUrl).trim() : "";
    const audioUrl = payload.audioUrl ? String(payload.audioUrl).trim() : "";
    const videoUrl = payload.videoUrl ? String(payload.videoUrl).trim() : "";
    const replyToMessageId = payload.replyToMessageId ? Number(payload.replyToMessageId) : 0;
    if (!text && !imageUrl && !audioUrl && !videoUrl) return;

    const newClientTempId = makeClientTempId();
    setMessages((prev) =>
      prev.map((m) =>
        m && typeof m.clientTempId === "string" && m.clientTempId === String(msg.clientTempId)
          ? { ...m, clientTempId: newClientTempId, localStatus: "sending" }
          : m
      )
    );

    const failAfterMs = 15_000;
    const timeoutId = window.setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m && typeof m.clientTempId === "string" && m.clientTempId === newClientTempId && m.localStatus === "sending"
            ? { ...m, localStatus: "failed" }
            : m
        )
      );
      optimisticSendTimersRef.current.delete(newClientTempId);
    }, failAfterMs);
    optimisticSendTimersRef.current.set(newClientTempId, timeoutId);

    if (!socketRef.current || !socketReady) {
      setRealtimeSendNotice(t("realtimeReconnecting"));
      setMessages((prev) =>
        prev.map((m) =>
          m && typeof m.clientTempId === "string" && m.clientTempId === newClientTempId
            ? { ...m, localStatus: "failed" }
            : m
        )
      );
      return;
    }

    socketRef.current.emit("chat:typing", { chatId: selectedChatId, isTyping: false });
    socketRef.current.emit("chat:send", {
      chatId: selectedChatId,
      clientTempId: newClientTempId,
      text,
      ...(imageUrl ? { imageUrl } : {}),
      ...(audioUrl ? { audioUrl } : {}),
      ...(videoUrl ? { videoUrl } : {}),
      ...(replyToMessageId ? { replyToMessageId } : {}),
    });
  }

  function handleTyping(isTyping) {
    if (!socketRef.current || !socketReady) return;
    if (!selectedChatId) return;
    if (me?.banned) return;
    const activeChat = chats.find((c) => Number(c.id) === Number(selectedChatId));
    if (activeChat && activeChat.canPostMessage === false) return;
    socketRef.current.emit("chat:typing", { chatId: selectedChatId, isTyping: Boolean(isTyping) });
  }

  async function handleEditMessage(messageId, text) {
    if (me?.banned) return;
    const data = await updateMessage(messageId, text);
    const msg = data.message;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m))
    );
  }

  async function handleToggleReaction(messageId, emoji) {
    if (me?.banned) return;
    const mid = Number(messageId);
    const data = await toggleReaction(mid, emoji);
    const reactions = data.reactions || [];
    setMessages((prev) => prev.map((m) => (Number(m.id) === mid ? { ...m, reactions } : m)));
  }

  async function handleAdminDeleteMessage(messageId) {
    if (me?.banned) return;
    const mid = Number(messageId);
    await adminDeleteMessage(mid);
    setMessages((prev) => prev.filter((m) => Number(m.id) !== mid));
  }

  async function handleLogin(data) {
    const res = await login(data);
    localStorage.setItem("token", res.token);
    setToken(res.token);
    setAuthError("");
  }

  async function handleRegister(data) {
    let inviteCode = "";
    try {
      inviteCode = String(localStorage.getItem("inviteCode") || "").trim();
    } catch {
      inviteCode = "";
    }
    const res = await register({ ...data, inviteCode });
    localStorage.setItem("token", res.token);
    setToken(res.token);
    setAuthError("");
    try {
      localStorage.removeItem("inviteCode");
    } catch {
      // ignore
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setToken("");
    setMe(null);
    setInstallDownloadOpen(false);
  }

  async function changeMyAvatar(dataUrl) {
    setMe((prev) => (prev ? { ...prev, avatar: dataUrl || "" } : prev));
    const updated = await updateMyAvatar(dataUrl || "");
    setMe(updated);
  }

  async function changeMyProfile(next) {
    const statusKind = typeof next?.statusKind === "string" ? next.statusKind : "";
    const statusText = typeof next?.statusText === "string" ? next.statusText : "";
    const about = typeof next?.about === "string" ? next.about : "";
    const auraColor = next?.auraColor !== undefined ? next.auraColor : undefined;
    const profileBackground =
      typeof next?.profileBackground === "string" ? String(next.profileBackground) : undefined;
    setMe((prev) =>
      prev
        ? {
            ...prev,
            statusKind,
            statusText,
            about,
            ...(auraColor !== undefined ? { auraColor } : {}),
            ...(profileBackground !== undefined ? { profileBackground } : {}),
          }
        : prev
    );
    const updated = await updateMyProfile({
      statusKind,
      statusText,
      about,
      ...(auraColor !== undefined ? { auraColor } : {}),
      ...(profileBackground !== undefined ? { profileBackground } : {}),
    });
    setMe(updated);
  }

  function goMobileTab(tab) {
    setMobileTab(tab);
    setSelectedChatId(null);
    setMessages([]);
  }

  function handleMobileBackFromChat() {
    setSelectedChatId(null);
    setMessages([]);
  }

  const sessionRestoring = Boolean(token) && me == null;

  if (sessionRestoring) {
    return (
      <div className="appRoot appRoot--authBoot">
        <AuthBootSplash t={t} />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="appRoot appRoot--auth">
        <Auth onLogin={handleLogin} onRegister={handleRegister} error={authError} t={t} />
      </div>
    );
  }

  const userMenuProps = {
    me,
    onLogout: logout,
    onChangeAvatar: changeMyAvatar,
    onChangeProfile: changeMyProfile,
    settings,
    onChangeSettings: (next) => setSettings((prev) => ({ ...prev, ...next })),
    t,
  };

  const sidebarProps = {
    chats,
    me,
    onSelectChat: selectChat,
    onStartChat: startChat,
    onCreateGroup: handleCreateGroup,
    onCreateChannel: handleCreateChannel,
    onChatListPinToggle: handleChatListPinToggle,
    onChatDelete: handleChatMembershipDelete,
    t,
    lang: settings.lang,
  };

  const chatPropsBase = {
    chatId: selectedChatId,
    chat: chats.find((c) => c.id === selectedChatId) || null,
    otherTyping: Boolean(selectedChatId && typingUntil[selectedChatId] > Date.now()),
    messages,
    meId: me.id,
    meAvatar: me.avatar,
    meUsername: me.username,
    chatTheme: settings.chatTheme,
    chatBackgroundImageUrl: settings.chatBackgroundImageUrl || null,
    onSend: handleSend,
    onRetrySend: handleRetrySend,
    onEditMessage: handleEditMessage,
    onToggleReaction: handleToggleReaction,
    isAdmin: me.role === "admin",
    onAdminDeleteMessage: handleAdminDeleteMessage,
    isBanned: Boolean(me.banned),
    onTyping: handleTyping,
    onGroupMetaChanged: refreshChatsList,
    presenceTick,
    t,
    lang: settings.lang,
    sendRateLimitNotice,
    realtimeReady: socketReady,
    realtimeSendNotice,
    meAuraColor: me?.auraColor,
    onSetChatPin: handleSetChatPin,
    onStartCall: beginOutgoingCall,
    callUiBlocked: call.phase !== "idle",
  };

  const chatPropsDesktop = { ...chatPropsBase, onMobileBack: undefined };
  const chatPropsMobile = { ...chatPropsBase, onMobileBack: handleMobileBackFromChat };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[Xasma] shell", {
      isMobile,
      mobileTab,
      selectedChatId,
    });
  }

  const desktopShell = (
    <div className="appShell appShell--desktop">
      <div className="topBar">
        <div className="topBarLeft">
          <div className="appTitleRow">
            <img src={XASMA_LOGO_SRC} alt="" className="appLogo" width={36} height={36} decoding="async" />
            <span className="appTitle">{t("appTitle")}</span>
            <span className="appBetaBadge">BETA</span>
          </div>
          <div className="statusTag">
            {socketReady ? t("realtimeOn") : t("realtimeReconnecting")}
          </div>
        </div>
        <div className="topBarRight">
          <button
            type="button"
            className="topBarDownloadBtn"
            onClick={() => setDesktopCallsOpen(true)}
            aria-label={t("navCalls")}
            title={t("navCalls")}
          >
            <span className="topBarDownloadIcon" aria-hidden>
              <IconPhone size={18} />
            </span>
            <span className="topBarDownloadText">{t("navCalls")}</span>
          </button>
          <button
            type="button"
            className="topBarDownloadBtn"
            onClick={() => setInstallDownloadOpen(true)}
            aria-label={t("downloadButton")}
            title={t("downloadButton")}
          >
            <span className="topBarDownloadIcon" aria-hidden>
              <IconDownload size={18} />
            </span>
            <span className="topBarDownloadText">{t("downloadButton")}</span>
          </button>
          <div className="desktopTopBarMenuGroup" ref={desktopMenuClusterRef}>
            {DEBUG_DESKTOP_SETTINGS_FIXED_TEST ? (
              <button
                type="button"
                style={{
                  position: "fixed",
                  top: "20px",
                  right: "20px",
                  zIndex: 999999,
                  background: "red",
                  color: "white",
                  padding: "10px",
                  fontSize: "16px",
                }}
                onClick={() => desktopUserMenuRef.current?.toggleDropdown()}
              >
                TEST SETTINGS
              </button>
            ) : (
              <button
                type="button"
                className={desktopMenuOpen ? "desktopSettingsBtn desktopSettingsBtn--open" : "desktopSettingsBtn"}
                onClick={() => desktopUserMenuRef.current?.toggleDropdown()}
                aria-haspopup="menu"
                aria-expanded={desktopMenuOpen}
                title={t("menu")}
              >
                <IconSettings />
              </button>
            )}
            <UserMenu
              ref={desktopUserMenuRef}
              {...userMenuProps}
              variant="dropdown"
              hideDropdownTrigger
              menuClusterRef={desktopMenuClusterRef}
              onDropdownOpenChange={setDesktopMenuOpen}
            />
          </div>
        </div>
      </div>

      <div className="appBody">
        <Sidebar {...sidebarProps} />
        <Chat {...chatPropsDesktop} />
      </div>
    </div>
  );

  const mobileShell = (
    <div className="appShell appShell--mobile">
      <div className="mobileStage">
        {mobileTab === "chats" && !selectedChatId ? (
          <div className="mobilePane mobilePane--inbox">
            <header className="mobileMainHeader">
              <div className="mobileMainHeaderText">
                <div className="mobileBrandRow">
                  <img src={XASMA_LOGO_SRC} alt="" className="appLogo" width={36} height={36} decoding="async" />
                  <span className="mobileBrandTitle">{t("appTitle")}</span>
                  <span className="appBetaBadge">BETA</span>
                </div>
                <div className={`mobileSocketPill${socketReady ? " mobileSocketPill--on" : ""}`}>
                  {socketReady ? t("realtimeOn") : t("realtimeReconnecting")}
                </div>
              </div>
              <div className="mobileMainHeaderActions">
                <button
                  type="button"
                  className="mobileDownloadBtn"
                  onClick={() => setInstallDownloadOpen(true)}
                >
                  {t("downloadButton")}
                </button>
                {sidebarProps.onCreateGroup ? (
                  <button
                    type="button"
                    className="mobileHeaderIconBtn"
                    onClick={() => mobileInboxSidebarRef.current?.openCreateGroup?.()}
                    aria-label={t("createGroup")}
                    title={t("createGroup")}
                  >
                    <span className="mobileHeaderIconPlus" aria-hidden>
                      +
                    </span>
                  </button>
                ) : null}
                {sidebarProps.onCreateChannel ? (
                  <button
                    type="button"
                    className="mobileHeaderIconBtn"
                    onClick={() => mobileInboxSidebarRef.current?.openCreateChannel?.()}
                    aria-label={t("createChannel")}
                    title={t("createChannel")}
                  >
                    <span className="mobileHeaderIconChannel" aria-hidden>
                      #
                    </span>
                  </button>
                ) : null}
                <UserMenu {...userMenuProps} variant="dropdown" />
              </div>
            </header>
            <Sidebar ref={mobileInboxSidebarRef} {...sidebarProps} mobileLayout />
          </div>
        ) : null}

        {mobileTab === "chats" && selectedChatId ? (
          <div className="mobilePane mobilePane--conversation">
            <div className="mobileChatShell">
              <Chat {...chatPropsMobile} />
            </div>
          </div>
        ) : null}

        {mobileTab === "calls" ? (
          <div className="mobilePane mobilePane--calls">
            <CallsScreen
              t={t}
              lang={settings.lang}
              logs={callLogs}
              onOpenChat={(cid) => {
                if (!cid) return;
                setMobileTab("chats");
                void selectChat(cid);
              }}
              onRedial={(cid) => {
                const row = chatsRef.current.find((c) => Number(c.id) === Number(cid));
                if (!row?.other?.id) return;
                setMobileTab("chats");
                void selectChat(cid);
                beginOutgoingCall({ chatId: cid, other: row.other });
              }}
            />
          </div>
        ) : null}

        {mobileTab === "settings" ? (
          <div className="mobilePane mobilePane--settings">
            <header className="mobileSubHeader">
              <h1 className="mobileSubHeaderTitle">{t("navSettings")}</h1>
            </header>
            <div className="mobileSettingsScroll">
              <UserMenu {...userMenuProps} variant="mobilePage" />
            </div>
          </div>
        ) : null}
      </div>

      {mobileTab === "chats" && selectedChatId ? null : (
        <nav className="mobileBottomNav" aria-label={t("mobileNavLabel")}>
          <button
            type="button"
            className={`mobileNavItem${mobileTab === "chats" ? " mobileNavItem--active" : ""}`}
            onClick={() => goMobileTab("chats")}
          >
            <span className="mobileNavIcon" aria-hidden>
              <IconChats size={20} />
            </span>
            <span className="mobileNavLabel">{t("navChats")}</span>
          </button>
          <button
            type="button"
            className={`mobileNavItem${mobileTab === "calls" ? " mobileNavItem--active" : ""}`}
            onClick={() => goMobileTab("calls")}
          >
            <span className="mobileNavIcon" aria-hidden>
              <IconPhone size={20} />
            </span>
            <span className="mobileNavLabel">{t("navCalls")}</span>
          </button>
          <button
            type="button"
            className={`mobileNavItem${mobileTab === "settings" ? " mobileNavItem--active" : ""}`}
            onClick={() => goMobileTab("settings")}
          >
            <span className="mobileNavIcon" aria-hidden>
              <IconSettings size={20} />
            </span>
            <span className="mobileNavLabel">{t("navSettings")}</span>
          </button>
        </nav>
      )}
    </div>
  );

  const callOverlay = (
    <CallOverlay
      call={call}
      t={t}
      onAccept={acceptIncomingCall}
      onReject={rejectIncomingCall}
      onEnd={endOrCancelCall}
      onToggleMute={toggleMuteUi}
    />
  );

  return (
    <AppRuntimeErrorBoundary>
      <div className={`appRoot${mobileConversationOpen ? " appRoot--mobileConversationOpen" : ""}`}>
        {isMobile ? (
          <MobileLayoutErrorBoundary fallback={desktopShell}>{mobileShell}</MobileLayoutErrorBoundary>
        ) : (
          desktopShell
        )}
      </div>
      {callOverlay}
      {desktopCallsOpen && !isMobile ? (
        <div className="modalBackdrop modalBackdrop--app" role="dialog" aria-modal="true">
          <div className="modalCard modalCard--mobileFriendly" style={{ maxWidth: 560, width: "min(560px, calc(100vw - 24px))" }}>
            <div className="modalHeader">
              <div className="modalTitle">{t("navCalls")}</div>
              <button className="ghostBtn" type="button" onClick={() => setDesktopCallsOpen(false)}>
                {t("close")}
              </button>
            </div>
            <div className="modalBody">
              <CallsScreen
                t={t}
                lang={settings.lang}
                logs={callLogs}
                onOpenChat={(cid) => {
                  if (!cid) return;
                  setDesktopCallsOpen(false);
                  void selectChat(cid);
                }}
                onRedial={(cid) => {
                  const row = chatsRef.current.find((c) => Number(c.id) === Number(cid));
                  if (!row?.other?.id) return;
                  setDesktopCallsOpen(false);
                  void selectChat(cid);
                  beginOutgoingCall({ chatId: cid, other: row.other });
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        // Avoid `display:none` (can break playback on Safari/WebViews).
        style={{ position: "fixed", left: "-9999px", top: "-9999px", width: "1px", height: "1px", opacity: 0 }}
      />
      <InstallDownloadPanel open={installDownloadOpen} onClose={() => setInstallDownloadOpen(false)} t={t} />
    </AppRuntimeErrorBoundary>
  );
}

/** Catches render errors in the mobile tree and shows desktop layout (no blank frame). */
class MobileLayoutErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[Xasma] MobileLayoutErrorBoundary", error, info?.componentStack);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[Xasma] showing desktop shell fallback after mobile layout error");
    }
  }

  render() {
    if (this.state.error && this.props.fallback != null) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/** Shows a crash screen with the exact runtime error text (avoids silent blank app). */
class AppRuntimeErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[Xasma] AppRuntimeErrorBoundary", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const e = this.state.error;
      const msg = e?.message ? String(e.message) : String(e);
      const stack = e?.stack ? String(e.stack) : "";
      return (
        <div className="appRoot appRoot--auth" style={{ padding: 16 }}>
          <div className="authCard" style={{ maxWidth: 720 }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>App crashed</div>
            <div className="authError" style={{ marginBottom: 10 }}>
              {msg}
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                opacity: 0.9,
                maxHeight: "55vh",
                overflow: "auto",
                margin: 0,
              }}
            >
              {stack}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function isWindowActive() {
  // "Active enough" heuristic: visible + focused (where supported).
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
  if (typeof document !== "undefined" && typeof document.hasFocus === "function") {
    return document.hasFocus();
  }
  return true;
}

