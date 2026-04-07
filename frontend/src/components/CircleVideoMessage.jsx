import React, { useEffect, useRef, useState } from "react";

/**
 * Telegram-style circular video: autoplay muted, loop, tap to toggle sound.
 */
export default function CircleVideoMessage({ src, tapSoundLabel, soundOnLabel }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [hadError, setHadError] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    v.muted = muted;
    const tryPlay = () => {
      void v.play().catch(() => {});
    };
    tryPlay();
    v.addEventListener("canplay", tryPlay);
    v.addEventListener("loadedmetadata", tryPlay);
    return () => v.removeEventListener("canplay", tryPlay);
  }, [src, muted]);

  function toggleSound(e) {
    e.stopPropagation();
    setMuted((m) => !m);
  }

  return (
    <div className="circleVideoMsg">
      <video
        ref={videoRef}
        className="circleVideoEl"
        src={src}
        muted={muted}
        loop
        playsInline
        autoPlay
        preload="metadata"
        onError={() => {
          setHadError(true);
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn("[Xasma] circle video error", { src });
          }
        }}
      />
      {hadError ? (
        <a className="circleVideoFallbackLink" href={src} target="_blank" rel="noopener noreferrer">
          Open video
        </a>
      ) : null}
      <button
        type="button"
        className="circleVideoSoundBtn"
        onClick={toggleSound}
        aria-label={muted ? tapSoundLabel : soundOnLabel}
        title={muted ? tapSoundLabel : soundOnLabel}
      >
        {muted ? (
          <svg className="circleVideoSoundIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M11 5L6 9H2v6h4l5 4V5zM15.5 9.5l5 5M20.5 9.5l-5 5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg className="circleVideoSoundIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M11 5L6 9H2v6h4l5 4V5zM15.5 10.5a3 3 0 0 1 0 3M17 8a6 6 0 0 1 0 8"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
