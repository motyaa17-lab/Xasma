import { useEffect, useRef, useState } from "react";

function streamSig(stream) {
  if (!stream || typeof stream.getAudioTracks !== "function") return "";
  const tr = stream.getAudioTracks()[0];
  return tr ? `${tr.id}:${tr.enabled ? "1" : "0"}` : String(stream.id || "");
}

function rmsTimeDomain(u8) {
  let s = 0;
  for (let i = 0; i < u8.length; i++) {
    const v = (u8[i] - 128) / 128;
    s += v * v;
  }
  return Math.min(1, Math.sqrt(s / Math.max(1, u8.length)) * 3.5);
}

/**
 * RMS levels for local / remote streams (0..1), for call UI voice visualization.
 */
export function useCallVoiceLevels(active, localStreamRef, remoteStreamRef, micMuted) {
  const [levels, setLevels] = useState({ local: 0, remote: 0 });
  const ctxRef = useRef(null);
  const localSigRef = useRef("");
  const remoteSigRef = useRef("");
  const localAnalyserRef = useRef(null);
  const remoteAnalyserRef = useRef(null);
  const localSourceRef = useRef(null);
  const remoteSourceRef = useRef(null);
  const bufLocalRef = useRef(null);
  const bufRemoteRef = useRef(null);

  useEffect(() => {
    if (!active) {
      setLevels({ local: 0, remote: 0 });
      return undefined;
    }

    let raf = 0;
    let lastSet = 0;

    function disconnectLocal() {
      try {
        localSourceRef.current?.disconnect?.();
      } catch {
        /* ignore */
      }
      localSourceRef.current = null;
      localAnalyserRef.current = null;
      localSigRef.current = "";
      bufLocalRef.current = null;
    }

    function disconnectRemote() {
      try {
        remoteSourceRef.current?.disconnect?.();
      } catch {
        /* ignore */
      }
      remoteSourceRef.current = null;
      remoteAnalyserRef.current = null;
      remoteSigRef.current = "";
      bufRemoteRef.current = null;
    }

    function ensureGraph() {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!ctxRef.current) ctxRef.current = new Ctx();
        const ctx = ctxRef.current;
        if (ctx.state === "suspended") void ctx.resume?.();

        const ls = localStreamRef?.current;
        const lsSig = streamSig(ls);
        if (!ls) {
          if (localSigRef.current) disconnectLocal();
        } else if (lsSig !== localSigRef.current) {
          disconnectLocal();
          localSigRef.current = lsSig;
          const src = ctx.createMediaStreamSource(ls);
          const an = ctx.createAnalyser();
          an.fftSize = 512;
          an.smoothingTimeConstant = 0.62;
          src.connect(an);
          localSourceRef.current = src;
          localAnalyserRef.current = an;
          bufLocalRef.current = new Uint8Array(an.fftSize);
        }

        const rs = remoteStreamRef?.current;
        const rsSig = streamSig(rs);
        if (!rs) {
          if (remoteSigRef.current) disconnectRemote();
        } else if (rsSig !== remoteSigRef.current) {
          disconnectRemote();
          remoteSigRef.current = rsSig;
          const src = ctx.createMediaStreamSource(rs);
          const an = ctx.createAnalyser();
          an.fftSize = 512;
          an.smoothingTimeConstant = 0.62;
          src.connect(an);
          remoteSourceRef.current = src;
          remoteAnalyserRef.current = an;
          bufRemoteRef.current = new Uint8Array(an.fftSize);
        }
      } catch {
        /* ignore */
      }
    }

    function tick() {
      ensureGraph();
      let l = 0;
      let r = 0;
      const locAn = localAnalyserRef.current;
      const bufL = bufLocalRef.current;
      if (locAn && bufL && localStreamRef?.current) {
        locAn.getByteTimeDomainData(bufL);
        l = rmsTimeDomain(bufL);
      }
      const remAn = remoteAnalyserRef.current;
      const bufR = bufRemoteRef.current;
      if (remAn && bufR && remoteStreamRef?.current) {
        remAn.getByteTimeDomainData(bufR);
        r = rmsTimeDomain(bufR);
      }
      if (micMuted) l = 0;

      const now = performance.now();
      if (now - lastSet > 48) {
        lastSet = now;
        setLevels((prev) => ({
          local: prev.local * 0.5 + l * 0.5,
          remote: prev.remote * 0.5 + r * 0.5,
        }));
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      disconnectLocal();
      disconnectRemote();
      try {
        ctxRef.current?.close?.();
      } catch {
        /* ignore */
      }
      ctxRef.current = null;
      setLevels({ local: 0, remote: 0 });
    };
  }, [active, localStreamRef, remoteStreamRef, micMuted]);

  return levels;
}
