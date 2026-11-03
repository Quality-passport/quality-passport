// Runs the Cloudflare Worker (worker/src/index.js) in Node against a real SQLite database
// (node:sqlite, with the D1 migrations), a fake KV and a fake Apps Script.
// Test ids refer to the local test plan "Quality Passport séries recette.md".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/src/index.js';
import { MIGRATIONS, setup } from './harness/worker.mjs';

const answer = (over = {}) => ({ email: 'Helene.Muller@Ipsen.com ', s: 2, p: 3, question: '[S2P3] What surprised you?', answer: 'Doing it right', id: 'id-1', ...over });

test('answer with series and question is stored; a resend is a duplicate (NR-13)', async () => {
  const { call, rows } = setup();
  assert.deepEqual((await call('POST', '/answer', answer())).body, { ok: true });
  assert.deepEqual((await call('POST', '/answer', answer())).body, { ok: true, duplicate: true });
  const all = rows();
  assert.equal(all.length, 1);
  assert.deepEqual([all[0].email, all[0].series, all[0].pillar, all[0].question, all[0].answer, all[0].synced],
    ['helene.muller@ipsen.com', 2, 3, '[S2P3] What surprised you?', 'Doing it right', 0]);
});

test('answer from an older app (no series, no question) is accepted (RG-27, DE-03)', async () => {
  const { call, rows } = setup();
  const old = { email: 'a@ipsen.com', p: 1, answer: 'old app', id: 'old-1' };
  assert.deepEqual((await call('POST', '/answer', old)).body, { ok: true });
  assert.deepEqual([rows()[0].series, rows()[0].question], [null, null]);
});

test('invalid answers are refused for good', async () => {
  const { call, rows } = setup();
  for (const bad of [
    answer({ s: 4 }), answer({ s: 'abc' }), answer({ s: 0 }), answer({ p: 5 }), answer({ email: 'nope' }),
    answer({ email: '=cmd@ipsen.com' }), answer({ answer: '   ' }), answer({ id: '' }),
  ]) {
    const r = await call('POST', '/answer', bad);
    assert.deepEqual([r.status, r.body], [400, { ok: false, error: 'invalid' }], JSON.stringify(bad));
  }
  assert.deepEqual((await call('POST', '/answer', '{oops')).body, { ok: false, error: 'invalid' });
  assert.equal(rows().length, 0);
});

test('answer capped at 2000 characters, question at 500 (RG-19)', async () => {
  const { call, rows } = setup();
  await call('POST', '/answer', answer({ answer: 'a'.repeat(5000), question: 'q'.repeat(900) }));
  assert.deepEqual([rows()[0].answer.length, rows()[0].question.length], [2000, 500]);
});

test('stars of all series count on one passport, first date kept (RG-16, RG-17)', async () => {
  const { call } = setup();
  await call('POST', '/answer', answer({ s: 2, p: 1, id: 'a' }));
  await new Promise((r) => setTimeout(r, 5));
  await call('POST', '/answer', answer({ s: 1, p: 2, id: 'b' }));
  await call('POST', '/answer', answer({ s: 1, p: 1, id: 'c', answer: 'again' }));
  const { body } = await call('GET', '/stars?email=HELENE.MULLER@ipsen.com');
  assert.deepEqual(Object.keys(body.stars).sort(), ['1', '2']);
  assert.match(body.stars[1], /^\d{4}-\d\d-\d\dT/);
});

test('questions: empty before the first copy, then the Sheet\'s copy (RG-12)', async () => {
  const q = { 1: { 1: '[S1P1] Qu’avez-vous retenu ?' }, 2: { 3: '  [S2P3] What?  ' } };
  const { call, cron, calls } = setup({ questions: () => ({ ok: true, rows: 2, questions: q }) });
  assert.deepEqual((await call('GET', '/questions')).body, { ok: true, questions: {} });
  await cron();
  assert.equal(calls.find((c) => !c.init.method).url.searchParams.get('action'), 'questions');
  assert.deepEqual((await call('GET', '/questions')).body, { ok: true, questions: { 1: { 1: '[S1P1] Qu’avez-vous retenu ?' }, 2: { 3: '[S2P3] What?' } } });
});

test('questions: invalid series or pillar ignored, 500 characters at most (QU-04, QU-05)', async () => {
  const q = { 1: { 1: 'x'.repeat(501), 5: 'bad pillar' }, 4: { 1: 'bad series' } };
  const { call, cron } = setup({ questions: () => ({ ok: true, questions: q }) });
  await cron();
  const { questions } = (await call('GET', '/questions')).body;
  assert.deepEqual(Object.keys(questions), ['1']);
  assert.deepEqual(Object.keys(questions[1]), ['1']);
  assert.equal(questions[1][1].length, 500);
});

test('questions: the copy is kept when Google fails, sends HTML, or has no valid row (QU-08, QU-09)', async () => {
  let reply = { ok: true, questions: { 2: { 1: 'v1' } } };
  const { call, cron, env } = setup({ questions: () => reply });
  await cron();
  for (const bad of [new Error('network'), '<html>Drive error</html>', { ok: false, error: 'no Questions tab' }, { ok: true, questions: {} }, { ok: true, questions: { 9: { 9: 'x' } } }]) {
    reply = bad;
    await cron();
    assert.deepEqual((await call('GET', '/questions')).body.questions, { 2: { 1: 'v1' } }, String(bad));
  }
  assert.equal(env.QUESTIONS.puts, 1);
});

test('questions: KV is written only when the Sheet changed', async () => {
  let reply = { ok: true, questions: { 2: { 1: 'v1' } } };
  const { cron, env } = setup({ questions: () => reply });
  await cron();
  await cron();
  assert.equal(env.QUESTIONS.puts, 1);
  reply = { ok: true, questions: { 2: { 1: 'v2' } } };
  await cron();
  assert.equal(env.QUESTIONS.puts, 2);
});

test('sheet sync sends series and question, marks rows only when the script says ok (DE-07)', async () => {
  let reply = '<html>Drive error</html>';
  const sent = [];
  const { call, cron, rows } = setup({ batch: (b) => { sent.push(b); return reply; } });
  await call('POST', '/answer', answer());
  await call('POST', '/answer', { email: 'a@ipsen.com', p: 1, answer: 'old app', id: 'old-1' });
  await cron();
  assert.deepEqual(rows().map((r) => r.synced), [0, 0]);
  reply = { ok: true, added: 2 };
  await cron();
  assert.deepEqual(rows().map((r) => r.synced), [1, 1]);
  const last = sent.at(-1);
  assert.equal(last.action, 'batch');
  const byId = Object.fromEntries(last.rows.map((r) => [r.id, r]));
  assert.deepEqual([byId['id-1'].series, byId['id-1'].question], [2, '[S2P3] What surprised you?']);
  assert.deepEqual([byId['old-1'].series, byId['old-1'].question], [null, null]);
  await cron();
  assert.equal(sent.length, 2); // nothing left to send
});

test('migration 0002 keeps existing answers, with no series (DE-01)', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATIONS[0]);
  const ins = db.prepare('INSERT INTO responses (id, ts, email, pillar, answer, synced) VALUES (?, ?, ?, ?, ?, ?)');
  ins.run('t1', '2026-09-25T10:00:00Z', 'test.claude@ipsen.com', 1, 'before', 1);
  ins.run('t2', '2026-09-25T10:01:00Z', 'test.claude@ipsen.com', 2, 'before too', 0);
  const before = db.prepare('SELECT id, ts, email, pillar, answer, synced FROM responses ORDER BY id').all().map((r) => ({ ...r }));
  db.exec(MIGRATIONS[1]);
  const after = db.prepare('SELECT * FROM responses ORDER BY id').all().map((r) => ({ ...r }));
  assert.deepEqual(after.map(({ series, question, ...rest }) => rest), before);
  assert.ok(after.every((r) => r.series === null && r.question === null));
});

test('health, CORS preflight, unknown route', async () => {
  const { call } = setup();
  assert.deepEqual((await call('GET', '/health')).body, { ok: true });
  const pre = await worker.fetch(new Request('https://api.test/answer', { method: 'OPTIONS' }), {});
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await call('GET', '/nope')).status, 404);
});
