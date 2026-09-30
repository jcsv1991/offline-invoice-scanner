import { createWorker, PSM, type Worker } from 'tesseract.js';

export interface OcrProgress {
  status: string;
  /** 0..1 */
  progress: number;
}

export interface OcrResult {
  text: string;
  /** Tesseract's own mean confidence, 0..100. */
  confidence: number;
}

/** True when the browser can run the faster SIMD build of the OCR engine. */
function supportsSimd(): boolean {
  try {
    return WebAssembly.validate(
      new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]),
    );
  } catch {
    return false;
  }
}

/** Absolute URL of a file under the app's base path (works at "/" and at "/<repo>/"). */
export function assetUrl(path: string): string {
  return new URL(import.meta.env.BASE_URL + path, document.baseURI).href;
}

/**
 * Everything OCR needs is served from THIS origin (copied into /ocr at install/build time),
 * never from a CDN. The service worker precaches these files, which is what makes OCR work
 * with no signal at all.
 */
export function ocrAssetUrls() {
  return {
    worker: assetUrl('ocr/worker.min.js'),
    core: assetUrl(supportsSimd() ? 'ocr/tesseract-core-simd-lstm.wasm.js' : 'ocr/tesseract-core-lstm.wasm.js'),
    langDir: assetUrl('ocr'),
    lang: assetUrl('ocr/eng.traineddata.gz'),
  };
}

let workerPromise: Promise<Worker> | null = null;
let onProgress: ((p: OcrProgress) => void) | null = null;

function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const urls = ocrAssetUrls();
    const worker = await createWorker('eng', 1 /* LSTM only: matches the bundled model */, {
      workerPath: urls.worker,
      corePath: urls.core, // ending in .js pins this exact core instead of auto-picking (and fetching) one
      langPath: urls.langDir,
      gzip: true,
      workerBlobURL: false,
      logger: (m) => onProgress?.({ status: m.status, progress: m.progress }),
    });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1', // keeps the gaps between table columns, which the parser relies on
    });
    return worker;
  })().catch((err) => {
    workerPromise = null; // allow a retry
    throw err;
  });
  return workerPromise;
}

export async function recognize(
  image: HTMLCanvasElement | Blob,
  progress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  onProgress = progress ?? null;
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    return { text: data.text, confidence: data.confidence };
  } finally {
    onProgress = null;
  }
}
