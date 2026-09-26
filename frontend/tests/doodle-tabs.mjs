// Isolated functional checks for the themed tabs; no personal data is changed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = [], checks = [], uploads = [], responses = [];
  page.on('pageerror', e => errors.push(e.message));
  let docs = [], reviewed = false, generationCount = 0;
  const question = { question_id: 7, prompt_text: 'Which key uniquely identifies a record?', options: ['Primary key', 'Foreign key'], correct_answer: 'Primary key' };
  const metric = { overall: { attempts: 8, accuracy: .75, confidence: .8, median_response_ms: 12000, calibration_gap: .05 }, topics: [{ document_id: 1, topic: 'Database fundamentals', attempts: 8, accuracy: .75, confidence: .8, median_response_ms: 12000, state: 'Build confidence', reason: 'Try a little more practice.', pace: 'Keep your own pace.' }] };
  await page.route('**/api/**', route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace('/api', '');
    const ok = json => route.fulfill({ json });
    if (path === '/auth/me') return ok({ user_id: 1, email: 'theme-test@example.com' });
    if (path === '/analytics/1') return ok({ question: metric, flashcard: metric });
    if (path === '/documents' && req.method() === 'POST') {
      uploads.push(req.postData());
      const doc = { document_id: docs.length + 1, filename: `Notes ${docs.length + 1}.txt`, uploaded_at: '2026-09-26' };
      docs.push(doc); return ok(doc);
    }
    if (path === '/documents') return ok(docs);
    if (path.endsWith('/generate')) { generationCount++; return ok({ questions: [question] }); }
    if (path.endsWith('/questions')) return ok([question]);
    if (path === '/sessions') return ok({ session_id: 1 });
    if (path === '/study/1/next') return ok({ question, remaining: 1, adaptation: {} });
    if (path === '/learning-state/1') return ok([{ topic: 'Database fundamentals', counts: { 'Build confidence': reviewed ? 0 : 1 } }]);
    if (path === '/review/1') return ok(reviewed ? [] : [{ ...question, topic: 'Database fundamentals' }]);
    if (path === '/questions/7/reframe') return ok({ ...question, question_id: 8, prompt_text: 'Choose the key that identifies one row.' });
    if (path === '/responses') {
      const answer = req.postDataJSON(); responses.push(answer);
      return ok({ ...answer, answer_text: answer.answer_text, is_correct: true, correct_answer: 'Primary key', adaptation: { reason: 'Well remembered.' } });
    }
    if (path === '/sessions/1/end') { reviewed = true; return ok({ session_id: 1 }); }
    if (path === '/assistant') return ok({ reply: 'Take one small step at a time.' });
    throw new Error(`Unexpected test route ${path}`);
  });
  const nav = async name => {
    await page.locator('.sidebar').getByRole('link', { name, exact: true }).click();
    await page.getByRole('heading', { name, exact: true }).waitFor();
  };
  await page.goto('http://localhost:5173/dashboard');
  await page.locator('.doodle-stats').waitFor();
  assert.deepEqual(await page.locator('.doodle-stat strong').allTextContents(), ['8', '8', '75%']);
  await page.getByLabel('Choose a document (PDF, DOCX, or TXT)').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('A primary key identifies a record.') });
  await page.getByRole('button', { name: 'Upload document', exact: true }).click();
  await page.getByRole('link', { name: 'Start studying' }).waitFor();
  assert.equal(uploads.length, 1); checks.push('Dashboard shows real-shaped metrics and uploads material');
  await page.getByRole('button', { name: 'Open Zen assistant' }).click();
  await page.getByPlaceholder('Ask a question...').fill('Help me get started');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('Take one small step at a time.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Close Zen', exact: true }).click();
  checks.push('The themed Dashboard retains the assistant interaction');
  await nav('Upload');
  await page.getByLabel('Upload a document (PDF, DOCX, or TXT)').setInputFiles({ name: 'chapter.txt', mimeType: 'text/plain', buffer: Buffer.from('A foreign key refers to another table.') });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await page.getByText('Notes 2.txt', { exact: true }).waitFor(); assert.equal(uploads.length, 2);
  await page.getByRole('button', { name: 'Generate questions + flashcards' }).first().click();
  await page.getByRole('status').filter({ hasText: '1 questions ready' }).waitFor();
  assert.equal(generationCount, 1);
  await page.getByRole('button', { name: 'Start study time', exact: true }).first().click();
  await page.waitForURL('**/study-time?document=1');
  assert.equal(await page.getByLabel('Your study material').inputValue(), '1');
  checks.push('Upload, library, generation, and document-specific Study navigation work');
  await nav('Review'); await page.getByRole('button', { name: 'Review now' }).click();
  await page.getByRole('radio', { name: 'Primary key', exact: true }).check();
  await page.getByRole('slider', { name: /How confident/ }).fill('0.9');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByText('Correct!', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByText('All caught up', { exact: true }).waitFor();
  assert.equal(responses[0].question_id, 8); assert.equal(responses[0].confidence, .9);
  checks.push('Review generates a variant, scores an answer, and clears the completed item');
  await nav('Activities');
  await page.getByRole('link', { name: 'Return to study time', exact: true }).click();
  await page.waitForURL('**/study-time'); checks.push('Activities returns to Study time');
  await page.getByRole('button', { name: 'Pause room motion' }).click();
  for (const name of ['Dashboard', 'Upload', 'Review', 'Activities', 'Study time']) {
    await nav(name); await page.getByRole('button', { name: 'Resume room motion' }).waitFor();
  }
  await page.getByRole('button', { name: 'Resume room motion' }).click();
  for (const name of ['Dashboard', 'Upload', 'Review', 'Activities']) {
    await nav(name); await page.getByRole('button', { name: 'Pause room motion' }).waitFor();
    const buddy = page.locator('.doodle-buddy'); const before = await buddy.evaluate(e => getComputedStyle(e).transform);
    await page.waitForTimeout(300); assert.notEqual(await buddy.evaluate(e => getComputedStyle(e).transform), before);
  }
  checks.push('Motion setting is shared by all tabs and every new illustration animates');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['Dashboard', 'Upload', 'Review', 'Activities', 'Study time']) {
      await nav(name);
      assert.equal(await page.locator('.app-content').evaluate(e => e.scrollWidth > e.clientWidth), false, `${name}: ${width}px overflow`);
      await page.locator('.app-content').evaluate(e => e.scrollTop = 0);
      const motionBox = await page.getByRole('button', { name: 'Pause room motion' }).boundingBox();
      assert.ok(motionBox && motionBox.x >= 64 && motionBox.x + motionBox.width <= width && motionBox.y >= 0, `${name}: motion control outside viewport at ${width}px: ${JSON.stringify(motionBox)}`);
    }
  }
  checks.push('All five tabs fit 320px, 390px, and 768px widths');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: checks.length, checks, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
