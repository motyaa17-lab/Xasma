/**
 * Resize + JPEG-compress a gallery image for localStorage-backed chat backgrounds.
 * Output is a data URL (persists in settings JSON).
 */

const MAX_DATA_URL_CHARS = 1_900_000;
const MAX_EDGE_PX = 1920;
const MAX_HEIGHT_PX = 2880;

/**
 * @param {File} file
 * @returns {Promise<string>} data:image/jpeg;base64,...
 */
export async function compressImageFileToJpegDataUrl(file) {
  if (typeof document === "undefined") throw new Error("no document");

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (!w || !h) {
        reject(new Error("dims"));
        return;
      }
      if (w > MAX_EDGE_PX) {
        h = Math.round((h * MAX_EDGE_PX) / w);
        w = MAX_EDGE_PX;
      }
      if (h > MAX_HEIGHT_PX) {
        w = Math.round((w * MAX_HEIGHT_PX) / h);
        h = MAX_HEIGHT_PX;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("ctx"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);

      const tryEncode = (q) => {
        try {
          return canvas.toDataURL("image/jpeg", q);
        } catch {
          return "";
        }
      };

      let dataUrl = tryEncode(0.82);
      if (!dataUrl) {
        reject(new Error("encode"));
        return;
      }
      if (dataUrl.length > MAX_DATA_URL_CHARS) {
        dataUrl = tryEncode(0.68);
      }
      if (dataUrl.length > MAX_DATA_URL_CHARS) {
        dataUrl = tryEncode(0.55);
      }
      if (dataUrl.length > MAX_DATA_URL_CHARS) {
        reject(new Error("large"));
        return;
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load"));
    };
    img.src = url;
  });
}
