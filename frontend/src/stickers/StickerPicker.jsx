import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { STICKER_PACK } from "./stickerPack.js";
import StickerView from "./StickerView.jsx";

export default function StickerPicker({ open, onClose, onPick, t }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="stickerPickerRoot" role="dialog" aria-modal="true" aria-label={t("stickerPickerTitle")}>
      <button type="button" className="stickerPickerBackdrop" aria-label={t("close")} onClick={onClose} />
      <div className="stickerPickerSheet">
        <div className="stickerPickerHeader">
          <span className="stickerPickerTitle">{t("stickerPickerTitle")}</span>
          <button type="button" className="stickerPickerClose" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>
        <div className="stickerPickerGrid">
          {STICKER_PACK.map((s) => (
            <button
              key={s.id}
              type="button"
              className="stickerPickerCell"
              onClick={() => {
                onPick?.(s.id);
                onClose?.();
              }}
              title={t(s.labelKey)}
            >
              <StickerView stickerId={s.id} size={72} />
              <span className="stickerPickerLabel">{t(s.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
