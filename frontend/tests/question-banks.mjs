import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }); page.setDefaultTimeout(10000);
  const errors = [], responses = [], requests = [];
  const topics = [], docs = [], banks = {};
  let failRemoval = true;
  let sessionId = 0, answered = new Set(), failGeneration = true, failNext = true, failAnswer = true;
  page.on('pageerror', error => errors.push(error.message));
  const makeBank = (title, base) => Array.from({ length: 5 }, (_, i) => ({ question_id: base + i,
    prompt_text: `${title}: What would happen if condition ${i + 1} changed, and why?`,
    options: ['A', 'B', 'C', 'D'], correct_answer: 'A', difficulty: i % 3 + 1,
    explanation: 'The changed condition removes the original constraint. A follows from the causal mechanism; the other choices assume the constraint is unchanged.' }));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api', '');
    requests.push(path);
    const ok = json => route.fulfill({ json });
    const fail = detail => route.fulfill({ status: 502, json: { detail } });
    if (path === '/auth/me') return ok({ user_id: 1, email: 'test@example.com' });
    if (path === '/question-topics') return ok(topics);
    if (path === '/study-topics' && request.method() === 'DELETE') {
      if (failRemoval) { failRemoval = false; return fail('Could not remove concept. Please retry.'); }
      const { topic } = request.postDataJSON();
      const index = topics.findIndex(item => item.topic === topic);
      if (index >= 0) topics.splice(index, 1);
      return route.fulfill({ status: 204 });
    }
    if (path === '/study-topics') { const { topic } = request.postDataJSON(); topics.push({ topic, question_count: 0 }); return ok({ topic }); }
    if (path === '/documents' && request.method() === 'POST') {
      const doc = { document_id: 7, filename: 'Plants.txt', question_count: 0, extracted_text: 'Plants use light to make sugars.' }; docs.push(doc); return ok(doc);
    }
    if (path === '/documents') return ok(docs);
    if (path === '/questions/generate') {
      if (failGeneration) { failGeneration = false; return fail('Gemini is temporarily unavailable'); }
      const { topic } = request.postDataJSON(); banks[topic] ||= makeBank(topic, 10); return ok(banks[topic]);
    }
    if (path === '/documents/7/generate') { banks.document ||= makeBank('Plants', 30); return ok({ questions: banks.document }); }
    if (path === '/sessions') { answered = new Set(); return ok({ session_id: ++sessionId }); }
    if (path.endsWith('/next')) {
      if (failNext) { failNext = false; return fail('Question unavailable. Retry your saved session.'); }
      const bank = path === '/study-topic/next' ? banks[url.searchParams.get('topic')] : banks.document;
      const remaining = bank.filter(question => !answered.has(question.question_id));
      const question = remaining[0] ? { ...remaining[0] } : null;
      if (question) { delete question.correct_answer; delete question.explanation; }
      return ok({ question, remaining: remaining.length, adaptation: {} });
    }
    if (path === '/responses') {
      if (failAnswer) { failAnswer = false; return fail('Could not save answer'); }
      const response = request.postDataJSON(); responses.push(response); answered.add(response.question_id);
      return ok({ ...response, is_correct: response.answer_text === 'A', correct_answer: 'A', explanation: makeBank('', 1)[0].explanation,
        adaptation: { reason: 'Apply this principle to another situation.' } });
    }
    if (path.endsWith('/end')) return ok({ session_id: sessionId });
    throw new Error(`Unexpected API request: ${path}`);
  });
  await page.goto('http://localhost:5173/upload');
  await page.getByLabel('Topic or concept').fill('  AI data centres  ');
  await page.getByRole('button', { name: 'Choose this concept' }).click();
  const choices = page.getByRole('region', { name: 'Choose how to learn' });
  const requestsBeforeCancel = requests.length;
  const closeConcept = choices.getByRole('button', { name: 'Remove concept: AI data centres', exact: true });
  const confirmation = page.getByRole('dialog', { name: 'Remove this concept?' });
  await closeConcept.click();
  await confirmation.waitFor();
  assert.equal(await confirmation.getByRole('button', { name: 'Keep concept' }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  await confirmation.waitFor({ state: 'hidden' });
  assert.equal(await closeConcept.evaluate(el => el === document.activeElement), true);
  await closeConcept.click();
  await page.screenshot({ path: '../output/concept-confirmation-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await confirmation.evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await page.screenshot({ path: '../output/concept-confirmation-mobile.png' });
  await confirmation.getByRole('button', { name: 'Keep concept' }).click();
  assert.equal(requests.length, requestsBeforeCancel, 'Cancel must not send a removal request');
  assert.equal(await choices.getByRole('heading', { name: 'AI data centres', exact: true }).count(), 1);
  await page.setViewportSize({ width: 1366, height: 900 });
  await closeConcept.click();
  await confirmation.getByRole('button', { name: 'Remove concept', exact: true }).click();
  await confirmation.getByRole('alert').filter({ hasText: 'Could not remove concept' }).waitFor();
  assert.equal(await choices.getByRole('heading', { name: 'AI data centres', exact: true }).count(), 1);
  await confirmation.getByRole('button', { name: 'Remove concept', exact: true }).click();
  await choices.waitFor({ state: 'detached' });
  await page.reload();
  await page.getByText('Your next idea starts here', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'AI data centres', exact: true }).count(), 0);
  await page.getByLabel('Topic or concept').fill('AI data centres');
  await page.getByRole('button', { name: 'Choose this concept' }).click();
  await choices.getByRole('link', { name: 'Keep me company' }).click();
  await page.waitForURL('**/study-time?topic=AI%20data%20centres');
  await page.getByRole('heading', { name: 'AI data centres', exact: true }).waitFor();
  assert.equal(requests.includes('/questions/generate'), false);
  assert.equal(requests.includes('/sessions'), false);
  assert.equal(await page.getByRole('timer').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Check answer' }).count(), 0);
  await page.getByRole('button', { name: 'Start focus' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.locator('.sidebar').getByRole('link', { name: 'Upload', exact: true }).click();
  await page.getByRole('link', { name: 'Dive In', exact: true }).click();
  await page.waitForURL('**/questions?topic=AI%20data%20centres');
  await page.getByRole('alert').filter({ hasText: 'Gemini is temporarily unavailable' }).waitFor();
  await page.getByRole('button', { name: 'Retry questions' }).click();
  await page.getByRole('alert').filter({ hasText: 'saved session' }).waitFor();
  assert.equal(sessionId, 1);
  await page.reload();
  await page.getByRole('button', { name: 'Retry questions' }).click();
  await page.getByRole('button', { name: 'Check answer' }).waitFor();
  assert.equal(sessionId, 1);
  assert.equal(await page.getByRole('timer').count(), 0);
  assert.equal(await page.getByText(/flashcard|time remaining|start focus/i).count(), 0);
  assert.equal(await page.getByText(/The changed condition/).count(), 0);
  await page.getByRole('radio', { name: 'A', exact: true }).check();
  await page.getByRole('slider', { name: /How confident/ }).fill('0.85');
  await page.reload(); await page.getByRole('button', { name: 'Check answer' }).waitFor();
  assert.equal(await page.getByRole('radio', { name: 'A', exact: true }).isChecked(), true);
  await page.getByRole('button', { name: 'Check answer' }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not save answer' }).waitFor();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await page.getByRole('heading', { name: 'Why this works' }).waitFor();
  assert.equal(responses[0].confidence, .85);
  assert.equal('response_time_ms' in responses[0], false);
  assert.equal('recalled' in responses[0], false);
  for (let i = 1; i < 5; i++) {
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('radio', { name: 'A', exact: true }).check();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await page.getByRole('heading', { name: 'Why this works' }).waitFor();
  }
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('heading', { name: 'Practice complete' }).waitFor();
  assert.equal(new Set(responses.map(item => item.question_id)).size, 5);
  assert.equal(requests.filter(path => path === '/questions/generate').length, 2);
  await page.locator('.sidebar').getByRole('link', { name: 'Upload', exact: true }).click();
  await page.getByLabel('Choose a document (PDF, DOCX, or TXT)').setInputFiles({ name: 'Plants.txt', mimeType: 'text/plain', buffer: Buffer.from('Plants use light to make sugars.') });
  await page.getByRole('button', { name: 'Upload document' }).click();
  await choices.getByRole('link', { name: 'Keep me company' }).click();
  await page.getByText('Read your material', { exact: true }).click();
  await page.getByText('Plants use light to make sugars.', { exact: true }).waitFor();
  assert.equal(requests.includes('/documents/7/generate'), false);
  await page.locator('.sidebar').getByRole('link', { name: 'Upload', exact: true }).click();
  await page.locator('.platform-list > li').filter({ hasText: 'Plants.txt' }).getByRole('link', { name: 'Dive In' }).click();
  await page.getByRole('button', { name: 'Check answer' }).waitFor();
  assert.equal(await page.getByRole('timer').count(), 0);
  await page.locator('.sidebar').getByRole('link', { name: 'Questions', exact: true }).click();
  await page.getByRole('button', { name: 'Remove concept: AI data centres', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Remove concept', exact: true }).click();
  await page.getByRole('heading', { name: 'AI data centres', exact: true }).waitFor({ state: 'detached' });
  await page.reload();
  await page.getByRole('heading', { name: 'Plants.txt', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'AI data centres', exact: true }).count(), 0);
  await page.getByRole('link', { name: 'Dive In', exact: true }).click();
  await page.getByRole('button', { name: 'Check answer', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '../output/separate-questions-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: both learning paths, no AI in company mode, independent timer, question retries/resume, explanations after answering, no question timing or flashcards, document reader, mobile layout.');
} finally { await browser.close(); }
