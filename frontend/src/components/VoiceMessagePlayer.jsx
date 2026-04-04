import React, { useCallback, useEffect, useRef, useState } from "react";

/** Sparse, soft bars — calm waveform, not dense */
const BAR_COUNT = 14;

function smoothPeaks(arr) {
  if (arr.length < 3) return arr;
  let a = [...arr];
  for (let pass = 0; pass < 2; pass++) {
    a = a.map((v, i) => {
      const p = a[Math.max(0, i - 1)];
      const n = a[Math.min(a.length - 1, i + 1)];
      return (p + v * 2 + n) / 4;
    });
  }
  return a;
}

function seededBars(seed, n) {
  let s = Number(seed) || 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    out.push(0.18 + (s / 233280) * 0.72);
  }
  return out;
}

function formatAudioTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Custom voice bubble: hidden <audio>, play/pause, times, waveform bars + progress.
 * Waveform from decodeAudioData when CORS allows; else deterministic fallback bars.
 */
export default function VoiceMessagePlayer({
  src,
  messageId,
  isOwn,
  playLabel,
  pauseLabel,
  ariaLabel = "Voice message",
  seekAriaLabel = "Seek voice message",
}) {
  const audioRef = useRef(null);
  const trackRef = useRef(null);
  const rafProgressRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState(() => seededBars(messageId, BAR_COUNT));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const onMeta = () => {
      const d = audio.duration;
      if (Number.isFinite(d) && d > 0) setDuration(d);
    };
    const onTime = () => setCurrent(audio.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [src]);

  useEffect(() => {
    if (!playing) return undefined;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const a = audioRef.current;
      if (a) setCurrent(a.currentTime);
      rafProgressRef.current = requestAnimationFrame(tick);
    };
    rafProgressRef.current = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafProgressRef.current);
    };
  }, [playing]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(src, { mode: "cors", credentials: "omit" });
        if (!res.ok) throw new Error("fetch");
        const buf = await res.arrayBuffer();
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        const audioBuf = await ctx.decodeAudioData(buf.slice(0));
        await ctx.close();
        if (cancelled) return;
        const ch = audioBuf.getChannelData(0);
        const n = BAR_COUNT;
        const chunk = Math.max(1, Math.floor(ch.length / n));
        const peaks = [];
        for (let i = 0; i < n; i++) {
          let sum = 0;
          const start = i * chunk;
          const end = Math.min(start + chunk, ch.length);
          for (let j = start; j < end; j++) {
            const v = ch[j];
            sum += v * v;
          }
          peaks.push(Math.sqrt(sum / (end - start)));
        }
        const max = Math.max(...peaks, 1e-8);
        const norm = smoothPeaks(peaks.map((p) => Math.min(1, (p / max) * 1.05)));
        setWaveform(norm);
      } catch {
        if (!cancelled) setWaveform(seededBars(messageId, BAR_COUNT));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, messageId]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else void a.play().catch(() => {});
  }, [playing]);

  const onTrackSeek = useCallback(
    (e) => {
      e.stopPropagation();
      const track = trackRef.current;
      const a = audioRef.current;
      if (!track || !a || !Number.isFinite(duration) || duration <= 0) return;
      const rect = track.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.min(1, Math.max(0, x / rect.width));
      a.currentTime = ratio * duration;
      setCurrent(a.currentTime);
    },
    [duration]
  );

  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  return (
    <div
      className={`voiceMsgPill ${isOwn ? "voiceMsgPillOwn" : ""}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="group"
      aria-label={ariaLabel}
    >
      <audio
        ref={audioRef}
        className="voiceMsgAudioEl"
        src={src}
        preload="metadata"
        crossOrigin="anonymous"
      />
      <button
        type="button"
        className="voiceMsgPlayBtn"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        aria-label={playing ? pauseLabel : playLabel}
      >
        {playing ? (
          <span className="voiceMsgPauseIcon" aria-hidden />
        ) : (
          <svg className="voiceMsgPlayGlyph" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 7.5v9l7.5-4.5L9 7.5z" fill="currentColor" />
          </svg>
        )}
      </button>
      <div className="voiceMsgContent">
        <div
          ref={trackRef}
          className="voiceMsgWaveTrack"
          role="button"
          tabIndex={0}
          aria-label={seekAriaLabel}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            onTrackSeek(e);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" && duration > 0) {
              e.preventDefault();
              const a = audioRef.current;
              if (a) {
                a.currentTime = Math.max(0, a.currentTime - 5);
                setCurrent(a.currentTime);
              }
            } else if (e.key === "ArrowRight" && duration > 0) {
              e.preventDefault();
              const a = audioRef.current;
              if (a) {
                a.currentTime = Math.min(duration, a.currentTime + 5);
                setCurrent(a.currentTime);
              }
            }
          }}
        >
            <div className="voiceMsgWaveBars" aria-hidden="true">
              {waveform.map((h, i) => {
                const reveal = (i + 0.5) / BAR_COUNT <= progress;
                return (
                  <span
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    className={`voiceMsgWaveBar ${reveal ? "voiceMsgWaveBarPlayed" : ""}`}
                    style={{ transform: `scaleY(${0.25 + h * 0.75})` }}
                  />
                );
              })}
            </div>
            <div className="voiceMsgProgressRail" aria-hidden="true">
              <div className="voiceMsgProgressFill" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        <div className="voiceMsgTimes" aria-live="polite">
          <span className="voiceMsgTimeCurrent">{formatAudioTime(current)}</span>
          <span className="voiceMsgTimesSep">/</span>
          <span className="voiceMsgTimeTotal">{formatAudioTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
