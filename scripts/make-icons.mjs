// Generates the PWA icons from one SVG so there are no binary assets to keep in sync by hand.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(pub, { recursive: true });

const glyph = `
  <path d="M40 0h176l104 104v248a40 40 0 0 1-40 40H40a40 40 0 0 1-40-40V40A40 40 0 0 1 40 0z" fill="#ffffff"/>
  <path d="M216 0v80a24 24 0 0 0 24 24h80z" fill="#99f6e4"/>
  <rect x="48" y="140" width="150" height="16" rx="8" fill="#cbd5e1"/>
  <rect x="48" y="184" width="224" height="16" rx="8" fill="#cbd5e1"/>
  <rect x="48" y="228" width="224" height="16" rx="8" fill="#cbd5e1"/>
  <rect x="48" y="272" width="110" height="16" rx="8" fill="#cbd5e1"/>
  <circle cx="250" cy="330" r="62" fill="#0f766e" stroke="#ffffff" stroke-width="14"/>
  <path d="M222 331l20 20 38-42" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`;

const icon = (bg, scale, dx, dy, radius) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${bg}"/>
  <g transform="translate(${dx} ${dy}) scale(${scale})">${glyph}</g>
</svg>`;

const standard = icon('#0f766e', 1, 96, 56, 112); // rounded square, full-size glyph
const maskable = icon('#0f766e', 0.62, 97, 92, 0); // full-bleed, glyph kept inside the 80% safe zone
const apple = icon('#0f766e', 1, 96, 56, 0); // iOS rounds the corners itself

writeFileSync(join(pub, 'favicon.svg'), standard);
const png = (svg, size, name) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(pub, name));
await Promise.all([
  png(standard, 192, 'pwa-192.png'),
  png(standard, 512, 'pwa-512.png'),
  png(maskable, 512, 'pwa-maskable-512.png'),
  png(apple, 180, 'apple-touch-icon.png'),
]);
console.log('icons written to public/');
