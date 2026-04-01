import React, { useEffect, useRef, useState } from "react";

const MAX_SEC = 60;

function pickVideoMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=h264,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const t of types) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      // ignore
    }
  }
  return "";
}

function extFromVideoMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("mp4")) return ".mp4";
  return ".webm";
}

/**
 * Circular camera preview, record short clip, review, send or retake.
 */
export default function VideoNoteRecorder({ onSend, onClose, t }) {
  const [phase, setPhase] = useState("init");
  const [error, setError] = useState("");
  const [sec, setSec] = useState(0);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const tickRef = useRef(null);
  const reviewUrlRef = useRef(null);
  const reviewBlobRef = useRef(null);

  function cleanupStream() {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function openCamera() {
    setPhase("init");
    setError("");
    setSec(0);
    cleanupStream();
    if (reviewUrlRef.current) {
      URL.revokeObjectURL(reviewUrlRef.current);
      reviewUrlRef.current = null;
    }
    reviewBlobRef.current = null;
    if (videoRef.current) {
      videoRef.current.src = "";
      videoRef.current.loop = false;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 480 },
          height: { ideal: 480 },
        },
        audio: true,
      });
      streamRef.current = s;
      requestAnimationFrame(() => {
        const el = videoRef.current;
        if (el && streamRef.current === s) {
          el.srcObject = s;
          el.muted = true;
          el.playsInline = true;
          void el.play().catch(() => {});
        }
      });
      setPhase("ready");
    } catch {
      setError(t("videoNoteCameraDenied"));
      setPhase("error");
    }
  }

  useEffect(() => {
    openCamera();
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      cleanupStream();
      if (reviewUrlRef.current) {
        URL.revokeObjectURL(reviewUrlRef.current);
        reviewUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startRecord() {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") {
      setError(t("videoNoteNotSupported"));
      return;
    }
    const mime = pickVideoMime();
    let rec;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      try {
        rec = new MediaRecorder(stream);
      } catch {
        setError(t("videoNoteNotSupported"));
        return;
      }
    }
    recorderRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
      chunksRef.current = [];
      if (blob.size < 64) {
        setError(t("videoNoteTooShort"));
        void openCamera();
        return;
      }
      reviewBlobRef.current = blob;
      cleanupStream();
      if (reviewUrlRef.current) URL.revokeObjectURL(reviewUrlRef.current);
      const url = URL.createObjectURL(blob);
      reviewUrlRef.current = url;
      const el = videoRef.current;
      if (el) {
        el.srcObject = null;
        el.src = url;
        el.muted = true;
        el.loop = true;
        el.playsInline = true;
        void el.play().catch(() => {});
      }
      setPhase("review");
    };
    rec.start(250);
    setSec(0);
    setPhase("recording");
    tickRef.current = setInterval(() => {
      setSec((s) => {
        if (s + 1 >= MAX_SEC) {
          stopRecord();
          return MAX_SEC;
        }
        return s + 1;
      });
    }, 1000);
  }

  function stopRecord() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  async function retake() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    reviewBlobRef.current = null;
    if (reviewUrlRef.current) {
      URL.revokeObjectURL(reviewUrlRef.current);
      reviewUrlRef.current = null;
    }
    const el = videoRef.current;
    if (el) {
      el.src = "";
      el.loop = false;
    }
    setError("");
    await openCamera();
  }

  function handleSend() {
    const blob = reviewBlobRef.current;
    if (!blob || phase !== "review") return;
    const ext = extFromVideoMime(blob.type);
    const file = new File([blob], `videonote-${Date.now()}${ext}`, {
      type: blob.type || "video/webm",
    });
    onSend(file);
  }

  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  const maxMm = String(Math.floor(MAX_SEC / 60)).padStart(2, "0");
  const maxSs = String(MAX_SEC % 60).padStart(2, "0");

  return (
    <div className="videoNoteRoot" role="dialog" aria-label={t("videoNoteTitle")}>
      <div className="videoNotePreviewWrap">
        <video
          ref={videoRef}
          className="videoNotePreview"
          playsInline
          muted={phase !== "review"}
          loop={phase === "review"}
          autoPlay
        />
      </div>
      {phase === "init" ? <div className="videoNoteHint">{t("videoNoteStarting")}</div> : null}
      {error ? <div className="videoNoteErr">{error}</div> : null}
      <div className="videoNoteActions">
        {phase === "error" ? (
          <button type="button" className="videoNoteBtn videoNoteBtnPrimary" onClick={() => void openCamera()}>
            {t("videoNoteRetry")}
          </button>
        ) : null}
        {phase === "ready" ? (
          <>
            <button type="button" className="videoNoteBtn videoNoteBtnPrimary" onClick={startRecord}>
              {t("videoNoteRecord")}
            </button>
            <button type="button" className="videoNoteBtn" onClick={onClose}>
              {t("videoNoteCancel")}
            </button>
          </>
        ) : null}
        {phase === "recording" ? (
          <div className="videoNoteRecordingRow">
            <span className="videoNoteTimer" aria-live="polite">
              {mm}:{ss} / {maxMm}:{maxSs}
            </span>
            <button type="button" className="videoNoteBtn videoNoteBtnStop" onClick={stopRecord}>
              {t("videoNoteStop")}
            </button>
          </div>
        ) : null}
        {phase === "review" ? (
          <>
            <button type="button" className="videoNoteBtn videoNoteBtnPrimary" onClick={handleSend}>
              {t("videoNoteSend")}
            </button>
            <button type="button" className="videoNoteBtn" onClick={() => void retake()}>
              {t("videoNoteRetake")}
            </button>
            <button type="button" className="videoNoteBtn" onClick={onClose}>
              {t("videoNoteCancel")}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
