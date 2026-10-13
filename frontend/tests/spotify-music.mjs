import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [], completions = [], commands = [], searches = [];
  let connected = false, failComplete = true;
  let failPlayback = false;
  const playback = { active: true, playing: false, shuffle: false, device: 'Test laptop', track: null, disallows: {} };
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
    if (path === '/spotify/search') {
      searches.push(Object.fromEntries(url.searchParams));
      const type = url.searchParams.get('kind');
      return ok({ items: [{ type, id: 'd'.repeat(22), name: type === 'track' ? 'Rain piano song' : 'Rain piano playlist', subtitle: 'Spotify result' }], next_offset: url.searchParams.get('offset') === '0' ? 10 : null });
    }
    if (path === '/spotify/playback') {
      if (request.method() === 'GET') return ok(playback);
      if (failPlayback) { failPlayback = false; return route.fulfill({ status: 404, json: { detail: 'Open Spotify and play a song there, then try again here.' } }); }
      const command = request.postDataJSON(); commands.push(command);
      if (command.action === 'shuffle') playback.shuffle = command.shuffle;
      if (command.action === 'play') { playback.playing = true; playback.track = { name: 'Now playing song', subtitle: 'Test artist' }; }
      if (command.action === 'pause') playback.playing = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/spotify/connection') { connected = false; return route.fulfill({ status: 204 }); }
    throw new Error(`Unexpected route ${path}`);
  });
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
  await dialog.waitFor({ state: 'hidden' });
  const player = page.locator('.room-music-dock');
  await page.getByRole('button', { name: 'Pause Spotify', exact: true }).waitFor();
  assert.equal(commands[0].uri, 'spotify:playlist:' + 'b'.repeat(22));
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).waitFor();
  assert.equal(await player.isVisible(), true);
  await page.getByRole('button', { name: 'Next song', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Next song"]').disabled);
  await page.getByRole('button', { name: 'Previous song', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Shuffle"]').disabled);
  await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Shuffle"]').getAttribute('aria-pressed') === 'true');
  assert.deepEqual(commands.slice(1).map(command => command.action), ['next', 'previous', 'shuffle']);
  await page.getByRole('button', { name: 'Spotify music', exact: true }).click();
  await dialog.getByRole('button', { name: 'Search', exact: true }).click();
  await dialog.getByLabel('Song, artist, or playlist', { exact: true }).fill('rain & piano');
  await dialog.getByRole('button', { name: 'Search Spotify', exact: true }).click();
  await dialog.getByRole('button', { name: /Rain piano song/ }).waitFor();
  await dialog.getByRole('button', { name: 'Load more', exact: true }).click();
  await dialog.getByRole('button', { name: 'Load more', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(searches.at(-1).offset, '10');
  await dialog.getByLabel('Search Spotify for', { exact: true }).selectOption('playlist');
  await dialog.getByRole('button', { name: 'Search Spotify', exact: true }).click();
  await dialog.getByRole('button', { name: /Rain piano playlist/ }).waitFor();
  assert.equal(searches.at(-1).q, 'rain & piano');
  assert.equal(searches.at(-1).kind, 'playlist');
  await page.screenshot({ path: '../output/spotify-fullscreen-search.png' });
  await dialog.getByRole('button', { name: 'Close Spotify music', exact: true }).click();
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Full screen', exact: true }).waitFor();
  assert.equal(await player.isVisible(), true);
  await page.getByRole('button', { name: 'Spotify music', exact: true }).click();
  await dialog.getByRole('button', { name: 'Saved songs', exact: true }).click();
  await dialog.getByRole('button', { name: /My saved song/ }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !document.querySelector('[aria-label="Next song"]').disabled);
  assert.equal(commands.at(-1).uri, 'spotify:track:' + 'c'.repeat(22));
  failPlayback = true;
  await page.getByRole('button', { name: 'Next song', exact: true }).click();
  await player.getByRole('alert').filter({ hasText: 'Open Spotify' }).waitFor();
  await page.getByRole('button', { name: 'Next song', exact: true }).click();
  await player.getByRole('alert').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Spotify music', exact: true }).click();
  await dialog.getByRole('button', { name: 'Disconnect Spotify' }).waitFor();
  await page.screenshot({ path: '../output/spotify-library-mobile.png' });
  assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await dialog.getByRole('button', { name: 'Disconnect Spotify' }).click();
  await dialog.getByRole('button', { name: 'Connect Spotify', exact: true }).waitFor();
  assert.equal(await player.getByRole('button', { name: 'Next song', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '../output/spotify-dock-mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  console.log('PASS: popup callback, connection retry, playlists/songs, playback commands, fullscreen controls/search, search pagination, device error recovery, mobile layout, disconnect. Spotify API calls were mocked.');
} finally { await browser.close(); }
