export interface PreparedImage {
  /** Grayscale, contrast-stretched, sensibly sized copy handed to the OCR engine. */
  canvas: HTMLCanvasElement;
  /** Small JPEG data-URL kept with the note as a visual reference. */
  thumbnail: string;
  /** Bigger preview shown while OCR runs. */
  preview: string;
}

const MAX_LONG_SIDE = 2200; // phone photos are 4000+ px; OCR gets slower, not better, beyond this
const MIN_LONG_SIDE = 1600; // tiny screenshots benefit from upscaling

async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // "from-image" applies the EXIF rotation, so a portrait phone photo is not sideways.
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawScaled(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

/** Grayscale + stretch so the 1st..99th percentile of brightness fills 0..255. */
export function grayscaleAutoContrast(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = g;
    hist[g]++;
  }
  const total = canvas.width * canvas.height;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total * 0.01) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= total * 0.01) {
      hi = v;
      break;
    }
  }
  if (hi - lo > 40) {
    const scale = 255 / (hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, (d[i] - lo) * scale));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export async function prepareImage(blob: Blob): Promise<PreparedImage> {
  const bmp = await loadBitmap(blob);
  const long = Math.max(bmp.width, bmp.height);
  let scale = 1;
  if (long > MAX_LONG_SIDE) scale = MAX_LONG_SIDE / long;
  else if (long < MIN_LONG_SIDE) scale = Math.min(MIN_LONG_SIDE / long, 2.5);

  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));

  // Colour preview / thumbnail first (before we destroy colour for OCR).
  const colour = drawScaled(bmp, w, h);
  const preview = drawScaled(colour, 900, Math.round(h * (900 / w))).toDataURL('image/jpeg', 0.8);
  const thumbnail = drawScaled(colour, 320, Math.round(h * (320 / w))).toDataURL('image/jpeg', 0.7);

  grayscaleAutoContrast(colour);
  if ('close' in bmp) bmp.close();
  return { canvas: colour, thumbnail, preview };
}
