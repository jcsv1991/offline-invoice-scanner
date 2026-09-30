import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const PHOTO = fileURLToPath(new URL('./fixtures/invoice-photo.jpg', import.meta.url));

/**
 * The strictest offline test there is: the web server is not just "unreachable" - it is SHUT DOWN.
 * Whatever still works afterwards is running purely from what the service worker cached on the device.
 */
test('with the web server completely shut down, the installed app still opens, reads an invoice and queues the note', async ({ page }) => {
  const server = await preview({ preview: { port: 4179, strictPort: true, host: '127.0.0.1' }, logLevel: 'silent' });
  const base = `http://127.0.0.1:4179${process.env.BASE_PATH ?? '/'}`;

  await page.goto(base);
  await expect(page.getByTestId('offline-ready')).toHaveAttribute('data-state', 'ready', { timeout: 90_000 });

  // ---- kill the server, and prove it is dead (this request goes from Node, not through the page/service worker) ----
  server.httpServer.closeAllConnections();
  await server.close();
  await expect(page.request.get(base, { timeout: 3000 })).rejects.toThrow();

  // ---- the app still loads (from the service worker cache) ----
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Offline Invoice Scanner' })).toBeVisible();

  // ---- ...still reads a photographed invoice with the on-device OCR engine ----
  await page.getByTestId('file-input').setInputFiles(PHOTO);
  await expect(page.getByTestId('review-form')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('field-vendor')).toHaveValue('Coastal Fresh Produce Co.');
  await expect(page.getByLabel('Total', { exact: true })).toHaveValue('595.35');

  // ---- ...and still produces a note, kept safely in the on-device queue ----
  await page.getByTestId('generate-note').click();
  await expect(page.getByTestId('note-card')).toContainText('CF-7783');
  await expect(page.getByTestId('sync-banner').getByTestId('status-pill')).toHaveAttribute('data-status', 'pending');
});
