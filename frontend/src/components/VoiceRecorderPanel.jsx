import React, { useEffect, useRef, useState } from "react";

const BAR_COUNT = 28;

/**
 * Live recording UI: AnalyserNode-driven level bars + elapsed time + stop/cancel.
 * Real microphone levels via frequency data (not random).
 */
export default function VoiceRecorderPanel({ audioStream, onStopSend, onCancel, t }) {
  const [levels, setLevels] = useState(() => Array(BAR_COUNT).fill(0.08));
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef(0);
  const rafRef = useRef(0);
  const lastEmitRef = useRef(0);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const freqDataRef = useRef(null);

  useEffect(() => {
    if (!audioStream) return undefined;

    startTimeRef.current = performance.now();
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx;
    try {
      ctx = new AC();
    } catch {
      return undefined;
    }
    ctxRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume();

    const source = ctx.createMediaStreamSource(audioStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser);
    analyserRef.current = analyser;
    freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);

    const tickDuration = () => {
      setElapsedMs(Math.floor(performance.now() - startTimeRef.current));
    };
    const durationId = window.setInterval(tickDuration, 200);

    const sampleLevels = () => {
      const analyser = analyserRef.current;
      const freq = freqDataRef.current;
      if (!analyser || !freq) return Array(BAR_COUNT).fill(0.12);
      analyser.getByteFrequencyData(freq);
      const binCount = analyser.frequencyBinCount;
      const startBin = 1;
      const usable = binCount - startBin - 2;
      const out = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        const idx = startBin + Math.floor((i / BAR_COUNT) * usable);
        out.push(Math.min(1, (freq[idx] / 255) * 1.35));
      }
      return out;
    };

    const loop = (now) => {
      if (now - lastEmitRef.current >= 48) {
        lastEmitRef.current = now;
        setLevels(sampleLevels());
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    lastEmitRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearInterval(durationId);
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        // ignore
      }
      ctxRef.current = null;
      analyserRef.current = null;
      freqDataRef.current = null;
      ctx.close().catch(() => {});
    };
  }, [audioStream]);

  const sec = Math.floor(elapsedMs / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");

  return (
    <div className="voiceRecorderPanel" role="status">
      <div className="voiceRecorderTitle">{t("voiceRecording")}</div>
      <div className="voiceRecorderMeter" aria-hidden="true">
        {levels.map((h, i) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className="voiceRecorderMeterBar"
            style={{ transform: `scaleY(${0.12 + h * 0.88})` }}
          />
        ))}
      </div>
      <div className="voiceRecorderFooter">
        <span className="voiceRecorderDuration">
          {mm}:{ss}
        </span>
        <div className="voiceRecorderActions">
          <button type="button" className="voiceBarBtn voiceBarBtnPrimary" onClick={onStopSend}>
            {t("voiceStopSend")}
          </button>
          <button type="button" className="voiceBarBtn" onClick={onCancel}>
            {t("voiceCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
