// Verify rendered animation frames, not just the button label or CSS class.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [1366, 390]) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', route => route.fulfill({ json:
        route.request().url().includes('/auth/me') ? { user_id: 1, email: 'motion-test@example.com' } : [] }));
      await page.goto('http://localhost:5173/study-time');
      await page.getByRole('link', { name: 'Upload to begin' }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const scene = page.locator('.room-scene');
      const companion = page.locator('.room-companion');
      const pause = () => page.getByRole('button', { name: 'Pause room motion' });
      const resume = () => page.getByRole('button', { name: 'Resume room motion' });
      const transform = () => companion.evaluate(e => getComputedStyle(e).transform);
      const animationFrame = () => scene.evaluate(e => [...e.querySelectorAll('.room-animated')].map(node => {
        const style = getComputedStyle(node);
        return { transform: style.transform, opacity: style.opacity,
          animations: node.getAnimations().map(a => ({ state: a.playState, time: a.currentTime })) };
      }));
      if (reducedMotion === 'reduce') {
        assert.equal(await resume().getAttribute('aria-pressed'), 'false');
        const a = await animationFrame();
        await page.waitForTimeout(400);
        assert.deepEqual(await animationFrame(), a, 'System reduced-motion default must be still');
        await resume().click();
      }
      assert.equal(await pause().getAttribute('aria-pressed'), 'true');
      // Playwright normally waits for stable elements before a screenshot;
      // the scene container is stable, while its inner SVG actually animates.
      const onFrame = await scene.screenshot();
      const onTransform = await transform();
      await page.waitForTimeout(500);
      assert.notEqual(await transform(), onTransform, 'The visible companion must move');
      assert.ok(!onFrame.equals(await scene.screenshot()), 'Rendered room frames must change when on');
      assert.ok(await page.locator('.room-animated').evaluateAll(elements => elements.every(e =>
        getComputedStyle(e).animationPlayState === 'running' && getComputedStyle(e).animationName !== 'none')));
      await pause().click();
      assert.equal(await resume().getAttribute('aria-pressed'), 'false');
      // Let the pause commit before sampling frames.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      // SVG edge anti-aliasing can change slightly between screenshots even
      // when paused. Compare every rendered transform/opacity and animation
      // timeline to detect actual movement without GPU rasterization noise.
      const offFrame = await animationFrame();
      const offTransform = await transform();
      await page.waitForTimeout(500);
      assert.equal(await transform(), offTransform);
      assert.deepEqual(await animationFrame(), offFrame, 'Every room animation must stop when off');
      await page.reload(); await resume().waitFor();
      await resume().focus(); await page.keyboard.press('Enter'); await pause().waitFor();
      await page.reload(); await pause().waitFor();
      const resumed = await transform(); await page.waitForTimeout(350);
      assert.notEqual(await transform(), resumed, 'Motion-on preference must survive refresh');
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px / ${reducedMotion}: actual frames move, pause, resume by keyboard, and persist`);
      await context.close();
    }
  }
} finally { await browser.close(); }
