// Run against the local Vite app. PLAYWRIGHT_MODULE may point to an existing
// Playwright installation; fixtures never read or change the learner's database.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const checks = [];
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    const NativeAudio = window.AudioContext;
    window.testAudio = [];
    window.failAudio = false;
    window.AudioContext = class extends NativeAudio {
      constructor(...args) { super(...args); window.testAudio.push(this); }
      createBuffer(...args) {
        if (window.failAudio) { window.failAudio = false; throw new Error('Audio device temporarily unavailable'); }
        return super.createBuffer(...args);
      }
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const fixture = { docsFail: true, empty: false, generateFail: true, generated: false,
    nextFail: true, responseFail: false, endFail: false, exhausted: false, sessions: 0,
    responses: [], questionId: 1, mode: 'question', requests: [], signedIn: true };
  const docs = [{ document_id: 1, filename: 'Biology notes.txt' }, { document_id: 2, filename: 'Maths notes.txt' }];
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const path = url.pathname.replace('/api', '');
    fixture.requests.push(path);
    const ok = data => route.fulfill({ json: data });
    const fail = message => route.fulfill({ status: 503, json: { detail: message } });
    if (path === '/auth/me') return fixture.signedIn ? ok({ user_id: 1, email: 'test@example.com' }) : route.fulfill({ status: 401, json: { detail: 'Sign in' } });
    if (path === '/auth/logout') { fixture.signedIn = false; return route.fulfill({ status: 204 }); }
    if (path === '/documents') return fixture.docsFail ? fail('Materials temporarily unavailable') : ok(fixture.empty ? [] : docs);
    if (/\/documents\/\d+\/questions$/.test(path)) return ok(fixture.generated ? [{ question_id: 1 }] : []);
    if (path.endsWith('/generate')) {
      if (fixture.generateFail) { fixture.generateFail = false; return fail('Could not prepare questions. Try again.'); }
      fixture.generated = true; return ok({ questions: [{ question_id: 1 }] });
    }
    if (path === '/sessions') return ok({ session_id: ++fixture.sessions });
    if (path.endsWith('/next')) {
      if (fixture.nextFail) { fixture.nextFail = false; return fail('Question temporarily unavailable'); }
      fixture.mode = url.searchParams.get('mode');
      return ok({ question: fixture.exhausted ? null : { question_id: fixture.questionId, prompt_text: `Practice question ${fixture.questionId}?`, options: ['A', 'B', 'C'], ...(fixture.mode === 'flashcard' ? { correct_answer: 'A' } : {}) }, remaining: 3, adaptation: {} });
    }
    if (path === '/responses') {
      if (fixture.responseFail) { fixture.responseFail = false; return fail('Response could not be saved. Try again.'); }
      const payload = request.postDataJSON(); fixture.responses.push(payload); fixture.questionId++;
      return ok({ is_correct: payload.response_mode === 'flashcard' ? payload.recalled : payload.answer_text === 'A', correct_answer: 'A', adaptation: { suggest_break: true, reason: 'Keep practicing.' } });
    }
    if (path.endsWith('/end')) {
      if (fixture.endFail) { fixture.endFail = false; return fail('Session could not be ended. Try again.'); }
      return ok({ session_id: fixture.sessions });
    }
    if (path.startsWith('/analytics/')) return fail('No analytics in this isolated fixture');
    if (path.startsWith('/review/') || path.startsWith('/learning-state/')) return ok([]);
    throw new Error(`Unexpected API route: ${path}`);
  });
  const button = name => page.getByRole('button', { name, exact: true });
  const click = name => button(name).click();
  const visible = name => button(name).waitFor();
  const alert = text => page.getByRole('alert').filter({ hasText: text }).waitFor();
  const saved = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('mindpace-study-1')));
  await page.clock.install();
  await page.goto('http://localhost:5173/study-time');
  await visible('Retry loading materials'); fixture.docsFail = false;
  await click('Retry loading materials'); await visible('Begin study time');
  checks.push('Materials retry recovers without refresh');

  await visible('Resume room motion');
  assert.equal(await page.locator('.room-rain').first().evaluate(e => getComputedStyle(e).animationName), 'none');
  await click('Resume room motion');
  assert.notEqual(await page.locator('.room-rain').first().evaluate(e => getComputedStyle(e).animationName), 'none');
  await click('Pause room motion'); await page.reload(); await visible('Resume room motion');
  await click('Resume room motion');
  checks.push('Motion follows system initially, accepts explicit override, and persists');

  await page.evaluate(() => window.failAudio = true);
  await click('Turn rain sound on'); await alert('Audio device temporarily unavailable');
  await click('Turn rain sound on'); await page.getByLabel('Rain volume').fill('0.75');
  assert.equal(await page.evaluate(() => window.testAudio.at(-1).state), 'running');
  await click('Turn rain sound off');
  assert.equal(await page.evaluate(() => window.testAudio.at(-1).state), 'suspended');
  checks.push('Rain recovers after initialization failure; sound and volume controls work');

  await click('Enter full screen'); await visible('Exit full screen');
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
  await click('Exit full screen'); await visible('Enter full screen');
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
  checks.push('Full screen enters and exits');

  await page.getByLabel('Your study material').selectOption('2');
  await click('Begin study time'); await alert('Could not prepare questions');
  assert.equal(fixture.sessions, 0);
  await click('Begin study time'); await visible('Retry question');
  assert.equal(fixture.sessions, 1);
  assert.equal((await saved()).timer.deadline, null);
  await page.reload(); await visible('Retry question');
  await click('Retry question'); await visible('Check answer');
  assert.equal(fixture.sessions, 1);
  assert.equal((await saved()).documentId, '2');
  assert.equal((await saved()).pendingStart, false);
  checks.push('Start retries generation and first question without orphaning the session; retry survives refresh');

  await click('Pause'); const paused = (await saved()).timer.remaining;
  await page.clock.fastForward(10_000); assert.equal((await saved()).timer.remaining, paused);
  await page.reload(); await visible('Resume focus'); await click('Resume focus');
  await page.clock.fastForward(2_000); assert.ok((await saved()).timer.remaining < paused);
  checks.push('Pause/resume and refresh preserve timer progress');

  await page.getByRole('radio', { name: 'A', exact: true }).check();
  await page.getByRole('slider', { name: /How confident/ }).fill('0.85');
  fixture.responseFail = true;
  await click('Check answer'); await alert('Response could not be saved');
  assert.equal(await page.getByRole('radio', { name: 'A', exact: true }).isChecked(), true);
  await click('Check answer'); await visible('Continue');
  assert.equal(fixture.responses.at(-1).confidence, .85);
  assert.equal(fixture.responses.at(-1).answer_text, 'A');
  assert.ok(fixture.responses.at(-1).response_time_ms >= 0);
  checks.push('Answer selection, confidence, saving, and retry retain the response');

  await click('Take a break'); await page.getByRole('heading', { name: 'A little time away' }).waitFor();
  assert.ok((await saved()).timer.deadline);
  await click('Pause'); await visible('Start break'); await click('Start break');
  await page.getByRole('link', { name: 'Visit Activities', exact: true }).click();
  await page.waitForURL('**/activities');
  await page.locator('.sidebar').getByRole('link', { name: 'Study time', exact: true }).click();
  await page.clock.fastForward(301_000); await visible('Resume focus');
  await click('Resume focus'); await visible('Continue');
  checks.push('Suggested break starts, pauses, resumes, survives Activities, and returns to the saved feedback');

  fixture.nextFail = true;
  await click('Continue'); await alert('Question temporarily unavailable');
  await click('Continue'); await visible('Check answer');
  checks.push('Continue retries a failed next-question request');

  fixture.endFail = true;
  await click('End session'); await alert('Session could not be ended');
  await click('End session'); await visible('A fresh start');
  await page.getByRole('link', { name: 'View learning analytics' }).click();
  await page.waitForURL('**/dashboard');
  await page.locator('.sidebar').getByRole('link', { name: 'Study time', exact: true }).click();
  await click('A fresh start'); await visible('Begin study time');
  assert.equal((await saved()).sessionId, null); assert.equal(fixture.sessions, 1);
  checks.push('End-session retry, analytics link, and fresh start work');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('radio', { name: 'Flashcards', exact: true }).check();
  await click('Begin study time'); await visible('Reveal answer');
  await click('Reveal answer'); await visible('I recalled it');
  await click('Practice again'); await visible('Continue');
  assert.equal(fixture.responses.at(-1).response_mode, 'flashcard');
  assert.equal(fixture.responses.at(-1).recalled, false);
  await click('Continue'); await click('Reveal answer'); await click('I recalled it');
  await visible('Continue'); assert.equal(fixture.responses.at(-1).recalled, true);
  fixture.exhausted = true;
  await click('Continue'); await visible('A fresh start');
  await click('A fresh start'); await visible('Begin study time');
  assert.equal(await page.locator('.app-content').evaluate(e => e.scrollWidth > e.clientWidth), false);
  checks.push('Mobile flashcards, both recall ratings, and completion of the bank work');

  fixture.empty = true;
  await page.reload();
  await page.getByRole('link', { name: 'Upload to begin' }).click(); await page.waitForURL('**/upload');
  await page.locator('.sidebar').getByRole('link', { name: 'Study time', exact: true }).click();
  await page.getByRole('link', { name: 'Upload a document' }).click(); await page.waitForURL('**/upload');
  checks.push('Empty-library start and desk upload links both open Upload');

  fixture.empty = false;
  await page.locator('.sidebar').getByRole('link', { name: 'Study time', exact: true }).click();
  await click('Turn rain sound on'); await visible('Turn rain sound off');
  await page.locator('.sidebar').getByRole('link', { name: 'Review', exact: true }).click();
  await page.waitForURL('**/review');
  assert.equal(await page.evaluate(() => window.testAudio.every(a => a.state === 'closed')), true);
  await page.locator('.sidebar').getByRole('link', { name: 'Study time', exact: true }).click();
  await click('Log out'); await page.waitForURL('**/login');
  checks.push('Sidebar navigation and logout work; leaving the room closes audio');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: checks.length, checks, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
