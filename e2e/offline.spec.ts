import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const PHOTO = fileURLToPath(new URL('./fixtures/invoice-photo.jpg', import.meta.url));

/** First visit: wait until the service worker has cached everything (app + OCR engine + language data). */
async function waitUntilOfflineReady(page: Page) {
  await page.goto('./');
  await expect(page.getByTestId('offline-ready')).toHaveAttribute('data-state', 'ready', { timeout: 90_000 });
}

test.describe('offline-first invoice scanning', () => {
  test('a real photo is scanned with NO network, queued, survives a reload, then syncs by itself when the connection returns', async ({ page, context }) => {
    await waitUntilOfflineReady(page);

    // ---- go fully offline and reload: the app must still open ----
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Offline Invoice Scanner' })).toBeVisible();
    await expect(page.getByTestId('connection-badge')).toHaveAttribute('data-state', 'offline');
    // negative control: prove "offline" really is in effect - something that was never cached must fail
    expect(await page.evaluate(() => fetch('/__never-cached__').then(() => 'reachable', () => 'unreachable'))).toBe('unreachable');

    // ---- scan a photographed invoice (rotated, shadowed, noisy) ----
    await page.getByTestId('file-input').setInputFiles(PHOTO);
    await expect(page.getByTestId('review-form')).toBeVisible({ timeout: 120_000 });

    await expect(page.getByTestId('field-vendor')).toHaveValue('Coastal Fresh Produce Co.');
    await expect(page.getByTestId('field-invoice-number')).toHaveValue('CF-7783');
    await expect(page.getByTestId('field-date')).toHaveValue('2026-09-27');
    await expect(page.getByTestId('item-row')).toHaveCount(4);
    await expect(page.getByLabel('Total', { exact: true })).toHaveValue('595.35');
    await expect(page.getByTestId('math-issues')).toHaveCount(0); // the numbers cross-check

    // ---- confirm -> note is generated on the spot ----
    await page.getByTestId('field-received-by').fill('Sam');
    await page.getByTestId('generate-note').click();
    await expect(page.getByTestId('note-card')).toBeVisible();
    await expect(page.getByTestId('note-number')).toHaveText(/^DN-\d{8}-0001$/);
    await expect(page.getByTestId('note-total')).toContainText('595.35');
    await expect(page.getByTestId('sync-banner').getByTestId('status-pill')).toHaveAttribute('data-status', 'pending');
    await expect(page.getByTestId('pending-count')).toContainText('1 waiting to sync');

    // ---- the queue is durable: reload while still offline, the note is still there ----
    await page.reload();
    await page.getByTestId('nav-notes').click();
    await expect(page.getByTestId('note-row')).toHaveCount(1);
    await expect(page.getByTestId('note-row').getByTestId('status-pill')).toHaveAttribute('data-status', 'pending');

    // ---- connection returns: syncs automatically, nobody presses anything ----
    await context.setOffline(false);
    await expect(page.getByTestId('note-row').getByTestId('status-pill')).toHaveAttribute('data-status', 'synced', { timeout: 30_000 });
    await expect(page.getByTestId('pending-count')).toHaveCount(0);

    // ---- and the "server" really got it, exactly once ----
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('cloud-inbox').getByRole('listitem')).toHaveCount(1);
    await expect(page.getByTestId('cloud-inbox')).toContainText('Coastal Fresh Produce Co.');
  });

  test('the whole flow makes zero requests to third-party hosts (OCR engine + language data are self-hosted)', async ({ page }) => {
    const foreign: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) foreign.push(r.url());
    });
    await waitUntilOfflineReady(page);
    await page.getByTestId('try-sample').click();
    await expect(page.getByTestId('review-form')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('field-vendor')).toHaveValue('Harvest Lane Wholesale Ltd.');
    expect(foreign).toEqual([]);
  });

  test('"Simulate offline" queues notes for the demo, and unticking it syncs them', async ({ page }) => {
    await waitUntilOfflineReady(page);
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('simulate-offline').check();
    await expect(page.getByTestId('connection-badge')).toHaveAttribute('data-state', 'simulated-offline');

    await page.getByTestId('nav-scan').click();
    await page.getByTestId('try-sample').click();
    await expect(page.getByTestId('review-form')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('item-row')).toHaveCount(5);
    await page.getByTestId('generate-note').click();
    await expect(page.getByTestId('sync-banner').getByTestId('status-pill')).toHaveAttribute('data-status', 'pending');

    await page.getByTestId('nav-settings').click();
    await page.getByTestId('simulate-offline').uncheck();
    await page.getByTestId('nav-notes').click();
    await expect(page.getByTestId('note-row').getByTestId('status-pill')).toHaveAttribute('data-status', 'synced', { timeout: 30_000 });
  });

  test('manual entry works when OCR is not wanted, and bad math is flagged', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('manual-entry').click();
    await expect(page.getByTestId('generate-note')).toBeDisabled();

    await page.getByTestId('field-vendor').fill('Bluebird Supplies');
    await page.getByTestId('add-item').click();
    await page.getByLabel('Item 1 description').fill('Paper cups');
    await page.getByLabel('Item 1 quantity').fill('4');
    await page.getByLabel('Item 1 unit price').fill('12.5');
    await expect(page.getByLabel('Item 1 amount')).toHaveValue('50.00');

    await page.getByLabel('Subtotal', { exact: true }).fill('60'); // wrong on purpose
    await expect(page.getByTestId('math-issues')).toContainText('add up to 50.00');
    await page.getByRole('button', { name: 'Set subtotal to 50.00' }).click();
    await expect(page.getByTestId('math-issues')).toHaveCount(0);

    await page.getByTestId('generate-note').click();
    await expect(page.getByTestId('note-card')).toContainText('Bluebird Supplies');
    await expect(page.getByTestId('note-card')).toContainText('Paper cups');
  });

  test('an unreadable image fails politely and offers the manual route', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('file-input').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await expect(page.getByRole('alert')).toContainText(/couldn't read that image/i);
    await expect(page.getByTestId('manual-entry')).toBeVisible();
  });
});
