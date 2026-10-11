import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [1366, 390]) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ json:
        route.request().url().includes('/auth/me') ? { user_id: 1, email: 'test@example.com' } : [] }));
      await page.goto('http://localhost:5173/study-time');
      await page.getByRole('button', { name: 'Start focus' }).waitFor();
      const companion = page.locator('.room-companion');
      const transform = () => companion.evaluate(element => getComputedStyle(element).transform);
      assert.equal(await page.getByRole('button', { name: /Pause animations|Enable animations/ }).count(), 0);
      const before = await transform(); await page.waitForTimeout(350);
      assert.notEqual(await transform(), before);
      await page.reload(); await page.getByRole('button', { name: 'Start focus' }).waitFor();
      assert.equal(await companion.evaluate(element => getComputedStyle(element).animationPlayState), 'running');
      await page.locator('.sidebar').getByRole('link', { name: 'Upload', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: /Pause animations|Enable animations/ }).count(), 0);
      assert.equal(await page.locator('.doodle-buddy').evaluate(element => getComputedStyle(element).animationPlayState), 'running');
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px / ${reducedMotion}: animations keep running after reload and navigation, without a motion button`);
      await context.close();
    }
  }
} finally { await browser.close(); }
