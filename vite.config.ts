import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH lets the same build run at "/" (local, custom domain) or "/<repo>/" (GitHub Pages).
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Offline Invoice Scanner',
        short_name: 'Invoice Scanner',
        description:
          'Scan paper invoices with on-device OCR, generate a delivery note, and sync when the connection returns.',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs to run with zero signal is precached at install time:
        // the app shell, the OCR worker, the WASM OCR core and the English language data.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}', 'ocr/eng.traineddata.gz'],
        // The non-SIMD fallback core is only needed on very old browsers; it is cached on first use instead.
        globIgnores: ['ocr/tesseract-core-lstm.wasm.js'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ocr-runtime', expiration: { maxEntries: 8 } },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2022' },
});
