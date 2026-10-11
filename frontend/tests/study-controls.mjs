import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const requests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api', ''); requests.push(path);
    if (path === '/auth/me') return route.fulfill({ json: { user_id: 1, email: 'test@example.com' } });
    throw new Error(`Focus must not depend on question services: ${path}`);
  });
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.Audio = class extends NativeAudio { constructor(...args) { super(...args); window.testRainPlayer = this; } };
  });
  await page.clock.install();
  await page.goto('http://localhost:5173/study-time?topic=Systems%20thinking');
  await page.getByRole('heading', { name: 'Systems thinking' }).waitFor();
  const button = name => page.getByRole('button', { name, exact: true });
  await button('Start focus').click(); await page.clock.fastForward(5000);
  await button('Pause').click(); const paused = await page.getByRole('timer').textContent();
  await page.clock.fastForward(60000); assert.equal(await page.getByRole('timer').textContent(), paused);
  await page.reload(); await button('Resume focus').waitFor();
  assert.equal(await page.getByRole('timer').textContent(), paused);
  await button('Resume focus').click(); await page.clock.fastForward(25 * 60 * 1000);
  await button('Start break').waitFor(); assert.equal(await page.getByRole('timer').textContent(), '05:00');
  await page.clock.fastForward(60000); assert.equal(await page.getByRole('timer').textContent(), '05:00');
  await button('Start break').click(); await page.clock.fastForward(5 * 60 * 1000);
  await button('Start focus').waitFor();
  for (let round = 2; round <= 4; round++) {
    await button('Start focus').click(); await page.clock.fastForward(25 * 60 * 1000); await button('Start break').waitFor();
    assert.equal(await page.getByRole('timer').textContent(), round === 4 ? '15:00' : '05:00');
    if (round < 4) { await button('Start break').click(); await page.clock.fastForward(5 * 60 * 1000); await button('Start focus').waitFor(); }
  }
  await button('Reset timer').click(); assert.equal(await page.getByRole('timer').textContent(), '25:00');
  await button('Play rain sound').click(); await button('Stop rain sound').waitFor();
  assert.equal(await page.evaluate(() => window.testRainPlayer.currentSrc.endsWith('/audio/rain.mp3')), true);
  assert.equal(await page.evaluate(() => window.testRainPlayer.loop && !window.testRainPlayer.paused && window.testRainPlayer.duration > 0), true);
  await page.getByLabel('Rain volume').fill('0.15');
  assert.equal(await page.evaluate(() => window.testRainPlayer.volume), .15);
  await button('Stop rain sound').click();
  assert.equal(await page.evaluate(() => window.testRainPlayer.paused), true);
  for (const size of [{ width: 1366, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await button('Full screen').click();
    await button('Exit full screen').waitFor();
    assert.equal(await page.evaluate(() => document.fullscreenElement?.classList.contains('study-room')), true);
    await page.getByText('Press', { exact: false }).filter({ has: page.locator('kbd') }).waitFor();
    assert.equal(await page.locator('.room-workspace').isVisible(), false);
    assert.equal(await page.locator('.study-room').evaluate(el => !el.contains(document.querySelector('.sidebar'))), true);
    const beforeScroll = await page.locator('.study-room').evaluate(el => ({ top: el.scrollTop, height: el.clientHeight, content: el.scrollHeight }));
    assert.equal(beforeScroll.height, beforeScroll.content);
    await page.mouse.wheel(0, 900);
    assert.equal(await page.locator('.study-room').evaluate(el => el.scrollTop), beforeScroll.top);
    const timerButton = await button('Start focus').boundingBox();
    assert.ok(timerButton.y >= 0 && timerButton.y + timerButton.height <= size.height);
    await page.screenshot({ path: `../output/focus-fullscreen-${size.width}.png` });
    await page.keyboard.press('Escape');
    await button('Full screen').waitFor();
    assert.equal(await page.evaluate(() => document.fullscreenElement), null);
    assert.equal(await page.locator('.room-workspace').isVisible(), true);
  }

  assert.equal(await page.getByRole('button', { name: /motion|animation/i }).count(), 0);
  assert.equal(await page.locator('.room-companion').evaluate(element => getComputedStyle(element).animationPlayState), 'running');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('iframe').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Open rain playlist' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Spotify music', exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '../output/company-timer-mobile.png', fullPage: true });
  assert.ok(requests.every(path => path === '/auth/me')); assert.deepEqual(errors, []);
  await button('Play rain sound').click(); await button('Stop rain sound').waitFor();
  await page.locator('.sidebar').getByRole('link', { name: 'Activities', exact: true }).click();
  await page.getByRole('heading', { name: 'Activities', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.testRainPlayer.paused && !window.testRainPlayer.getAttribute('src')), true);
  console.log('PASS: Pomodoro without material or Gemini dependency, pause/refresh, phase boundaries, fourth long break, reset, audio, ongoing animation, mobile layout.');
} finally { await browser.close(); }
