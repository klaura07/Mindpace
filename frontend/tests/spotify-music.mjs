import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [], completions = [];
  let connected = false, failComplete = true;
  page.on('pageerror', error => errors.push(error.message));
  const state = 'spotify-test-state-with-at-least-20-characters';
  const callback = 'http://127.0.0.1:5173/spotify-callback.html';
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api', '');
    const ok = json => route.fulfill({ json });
    if (path === '/auth/me') return ok({ user_id: 1, email: 'test@example.com' });
    if (path === '/spotify/status') return ok({ configured: true, connected, redirect_uri: callback });
    if (path === '/spotify/connect') return ok({ state, redirect_uri: callback, authorize_url: `${callback}?state=${state}&code=test-code` });
    if (path === '/spotify/complete') {
      completions.push(request.postDataJSON());
      if (failComplete) { failComplete = false; return route.fulfill({ status: 502, json: { detail: 'Spotify temporarily unavailable' } }); }
      connected = true; return ok({ connected });
    }
    if (path === '/spotify/library') {
      const tracks = url.searchParams.get('kind') === 'tracks';
      return ok({ items: [{ type: tracks ? 'track' : 'playlist', id: (tracks ? 'c' : 'b').repeat(22), name: tracks ? 'My saved song' : 'My focus mix', subtitle: 'My account' }], next_offset: null });
    }
    if (path === '/spotify/connection') { connected = false; return route.fulfill({ status: 204 }); }
    throw new Error(`Unexpected route ${path}`);
  });
  await page.route('https://open.spotify.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Spotify playback fixture</p>' }));
  await page.goto('http://localhost:5173/study-time');
  await page.getByRole('button', { name: 'Spotify music', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your Spotify music' });
  await dialog.getByRole('button', { name: 'Connect Spotify', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'temporarily unavailable' }).waitFor();
  await dialog.getByRole('button', { name: 'Connect Spotify', exact: true }).click();
  await dialog.getByRole('button', { name: /My focus mix/ }).waitFor();
  assert.equal(completions.length, 2);
  assert.deepEqual(completions[1], { state, code: 'test-code' });
  await dialog.getByRole('button', { name: /My focus mix/ }).click();
  const player = page.locator('iframe[title="Your selected Spotify music"]');
  await player.waitFor();
  assert.match(await player.getAttribute('src'), /embed\/playlist\/bbbbbbbbbbbbbbbbbbbbbb/);
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).waitFor();
  assert.equal(await player.isVisible(), false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Full screen', exact: true }).waitFor();
  assert.equal(await player.isVisible(), true);
  await page.getByRole('button', { name: 'Spotify music', exact: true }).click();
  await dialog.getByRole('button', { name: 'Saved songs', exact: true }).click();
  await dialog.getByRole('button', { name: /My saved song/ }).click();
  assert.match(await player.getAttribute('src'), /embed\/track\/cccccccccccccccccccccc/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Spotify music', exact: true }).click();
  await dialog.getByRole('button', { name: 'Disconnect Spotify' }).waitFor();
  await page.screenshot({ path: '../output/spotify-library-mobile.png' });
  assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await dialog.getByRole('button', { name: 'Disconnect Spotify' }).click();
  await dialog.getByRole('button', { name: 'Connect Spotify', exact: true }).waitFor();
  assert.equal(await player.count(), 0);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('PASS: actual callback page/popup handoff, connection retry, own playlists/songs, selected playback, fullscreen hides music panel, mobile dialog, disconnect. Spotify API calls were mocked.');
} finally { await browser.close(); }
