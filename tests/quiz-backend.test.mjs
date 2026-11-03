// Series 2 quiz on the server side: the Cloudflare Worker (real SQLite) and the Apps Script (fake Google).
// Test ids (DQ-) refer to the local test plan "Quality Passport quiz série 2 recette.md".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { load } from './harness/code-gs.mjs';
import { MIGRATIONS, setup } from './harness/worker.mjs';

const EMAIL = 'recette.quiz1@ipsen.com';
const Q1 = 'How does Quality help ensure business continuity?';
const Q3 = 'Why are approved templates valuable?';
const quiz = (over = {}) => ({ email: EMAIL, s: 2, p: 3, question: Q3, answer: 'C. They reduce errors, save time and simplify reviews', choice: 'C', correct: true, id: 'q-1', ...over });
const wrong1 = (over = {}) => quiz({ p: 1, question: Q1, answer: 'B. By reducing product prices', choice: 'B', correct: false, id: 'q-2', ...over });

test('DQ-01. a quiz answer is stored with its choice and verdict', async () => {
  const { call, rows } = setup();
  assert.deepEqual((await call('POST', '/answer', quiz())).body, { ok: true });
  const [r] = rows();
  assert.deepEqual([r.series, r.pillar, r.question, r.answer, r.choice, r.correct], [2, 3, Q3, 'C. They reduce errors, save time and simplify reviews', 'C', 1]);
});

test('DQ-02/03. the first answer to a pillar counts: a later quiz answer is ignored, as a duplicate', async () => {
  const { call, rows } = setup();
  await call('POST', '/answer', wrong1());
  assert.deepEqual((await call('POST', '/answer', wrong1({ answer: 'A. By assessing risks…', choice: 'A', correct: true, id: 'q-3' }))).body, { ok: true, duplicate: true });
  // DQ-03: a pillar already answered as an open question (any series): the quiz answer is ignored too
  await call('POST', '/answer', { email: EMAIL, s: 1, p: 2, question: 'Q', answer: 'open answer', id: 'o-1' });
  assert.deepEqual((await call('POST', '/answer', quiz({ p: 2, id: 'q-4' }))).body, { ok: true, duplicate: true });
  assert.deepEqual(rows().map((r) => [r.id, r.pillar, r.correct]).sort(), [['o-1', 2, null], ['q-2', 1, 0]]);
  // Open answers stay as they are: all kept, even for a pillar already answered (RQ-08, NR-Q06)
  assert.deepEqual((await call('POST', '/answer', { email: EMAIL, s: 3, p: 1, question: 'Q', answer: 'open again', id: 'o-2' })).body, { ok: true });
});

test('DQ-04. two quiz answers to the same pillar at the same time: exactly one is kept', async () => {
  const { call, rows } = setup();
  const replies = await Promise.all([call('POST', '/answer', wrong1({ id: 'a' })), call('POST', '/answer', wrong1({ id: 'b', choice: 'A', correct: true }))]);
  assert.deepEqual(replies.map((r) => r.body.ok), [true, true]);
  assert.equal(rows().length, 1);
});

test('DQ-05. restore: stars without the wrong quiz answers, and the pillars missed', async () => {
  const { call } = setup();
  await call('POST', '/answer', wrong1());
  await call('POST', '/answer', quiz());
  const { body } = await call('GET', `/stars?email=${EMAIL}`);
  assert.deepEqual(Object.keys(body.stars), ['3']);
  assert.deepEqual(Object.keys(body.missed), ['1']);
  // Open answers only: the reply has no "missed" key, as before the quiz
  await call('POST', '/answer', { email: 'open@ipsen.com', s: 1, p: 1, question: 'Q', answer: 'x', id: 'o-1' });
  assert.deepEqual(Object.keys((await call('GET', '/stars?email=open@ipsen.com')).body), ['stars']);
});

test('DQ-06. a malformed verdict is refused for good', async () => {
  const { call, rows } = setup();
  for (const bad of [quiz({ correct: 'yes' }), quiz({ correct: 1 }), quiz({ choice: 'E' }), quiz({ choice: undefined }), quiz({ choice: 'c' })]) {
    const r = await call('POST', '/answer', bad);
    assert.deepEqual([r.status, r.body], [400, { ok: false, error: 'invalid' }], JSON.stringify(bad));
  }
  assert.equal(rows().length, 0);
});

test('DQ-07. migration 0003 keeps every answer; they still count as stars', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATIONS[0]);
  db.exec(MIGRATIONS[1]);
  db.prepare('INSERT INTO responses (id, ts, email, pillar, answer, series, question, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('t1', '2026-11-02T10:00:00Z', EMAIL, 2, 'before', 2, 'Q', 1);
  const before = db.prepare('SELECT * FROM responses').all().map((r) => ({ ...r }));
  db.exec(MIGRATIONS[2]);
  const after = db.prepare('SELECT * FROM responses').all().map((r) => ({ ...r }));
  assert.deepEqual(after.map(({ choice, correct, ...rest }) => rest), before);
  assert.ok(after.every((r) => r.choice === null && r.correct === null));
});

test('DQ-08/09/12. end to end: Correct column in Responses S2 only, ✗ in Stars, an answer without verdict is a star', async () => {
  const gas = load();
  gas.ctx.setup();
  const { call, cron } = setup({ batch: (body) => JSON.parse(gas.ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body) });
  await call('POST', '/answer', wrong1());
  await call('POST', '/answer', quiz());
  await call('POST', '/answer', { email: 'old.s2@ipsen.com', s: 2, p: 4, question: 'Tell us what you took away from it.', answer: 'open, before the quiz', id: 'old-1' });
  await call('POST', '/answer', { email: 'recette.s1@ipsen.com', s: 1, p: 2, question: 'Q', answer: 'série 1', id: 's1-1' });
  await cron();
  const s2 = gas.tabs['Responses S2'].rows;
  assert.deepEqual(s2[0], ['Timestamp', 'Email', 'Pillar', 'Question', 'Answer', 'ClientId', 'Correct']);
  const byId = Object.fromEntries(s2.slice(1).map((r) => [r[5], r]));
  assert.deepEqual([byId['q-2'][4], byId['q-2'][6]], ['B. By reducing product prices', 'No']);
  assert.deepEqual([byId['q-1'][4], byId['q-1'][6]], ['C. They reduce errors, save time and simplify reviews', 'Yes']);
  assert.equal(byId['old-1'][6], '');
  assert.deepEqual(gas.tabs['Responses S1'].rows[0], ['Timestamp', 'Email', 'Pillar', 'Question', 'Answer', 'ClientId']);
  assert.deepEqual(gas.tabs['Responses S3'].rows[0], ['Timestamp', 'Email', 'Pillar', 'Question', 'Answer', 'ClientId']);
  const stars = Object.fromEntries(gas.tabs.Stars.rows.slice(1).map((r) => [r[0], r.slice(1)]));
  assert.deepEqual(stars[EMAIL], ['2', '✗', '', '★', '', 1]);
  assert.deepEqual(stars['old.s2@ipsen.com'], ['2', '', '', '', '★', 1]);
  assert.deepEqual(stars['recette.s1@ipsen.com'], ['1', '', '★', '', '', 1]);
  // The script's own restore (older direct calls) gives no star for a wrong answer either
  assert.deepEqual(Object.keys(gas.get(EMAIL).stars), ['3']);
});

test('DQ-10. Correct moved by hand: values follow the header, Stars stays right', () => {
  const gas = load();
  gas.ctx.setup();
  gas.batch([{ id: 'a', ts: '2026-11-06T09:00:00Z', email: EMAIL, pillar: 1, answer: 'B. x', series: 2, question: Q1, choice: 'B', correct: 0 }]);
  const t = gas.tabs['Responses S2'];
  t.rows.forEach((r) => { const c = r.splice(6, 1)[0]; r.splice(1, 0, c); }); // Correct becomes the 2nd column
  gas.batch([{ id: 'b', ts: '2026-11-06T09:01:00Z', email: EMAIL, pillar: 3, answer: 'C. y', series: 2, question: Q3, choice: 'C', correct: 1 }]);
  assert.deepEqual(t.rows[0].slice(0, 2), ['Timestamp', 'Correct']);
  assert.deepEqual(t.rows.slice(1).map((r) => [r[1], r[6]]), [['No', 'a'], ['Yes', 'b']]);
  assert.equal(t.rows[0].filter((h) => h === 'Correct').length, 1); // not added twice
  assert.deepEqual(gas.tabs.Stars.rows[1].slice(2), ['✗', '', '★', '', 1]);
});

test('DQ-11. Responses S2 renamed: recreated with its headers, then Correct', () => {
  const gas = load();
  gas.ctx.setup();
  gas.rename('Responses S2', 'S2 old');
  gas.batch([{ id: 'a', ts: '2026-11-06T09:00:00Z', email: EMAIL, pillar: 1, answer: 'B. x', series: 2, question: Q1, choice: 'B', correct: false }]);
  assert.deepEqual(gas.tabs['Responses S2'].rows[0], ['Timestamp', 'Email', 'Pillar', 'Question', 'Answer', 'ClientId', 'Correct']);
  assert.equal(gas.tabs['S2 old'].rows.length, 1);
});
