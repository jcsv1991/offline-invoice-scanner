// Copies the OCR engine (Tesseract.js worker + WASM core + English language data)
// out of node_modules and into public/ocr so the app serves them from its OWN origin.
// That is what lets OCR run with zero network access: nothing is fetched from a CDN.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');
const nm = join(root, 'node_modules');

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // Pinned core variants (LSTM-only). SIMD is the fast path; the plain build is the fallback.
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  // "best_int" = the most accurate LSTM model, quantised to ~3 MB.
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
];

if (!existsSync(join(nm, 'tesseract.js'))) {
  console.log('[copy-ocr-assets] node_modules not installed yet - skipping.');
  process.exit(0);
}

mkdirSync(out, { recursive: true });
for (const [from, to] of files) {
  cpSync(join(nm, from), join(out, to));
}
console.log(`[copy-ocr-assets] copied ${files.length} OCR files to public/ocr`);
