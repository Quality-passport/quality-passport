// Reference of what series 1 and 3 (and answers without series) produce end to end:
// app request -> Worker -> D1 -> minute task -> Code.gs -> Sheet tabs, with the Worker's replies.
// Taken on the code before the series 2 quiz, compared after each change (RQ-20 of the quiz spec).
// Local only: tests/golden/ is ignored by git. `npm run golden:take` writes it, `npm run golden:check` compares.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { load } from './harness/code-gs.mjs';
import { setup } from './harness/worker.mjs';

const DIR = new URL('./golden/', import.meta.url);
const FILE = new URL('backend.json', DIR);
const MODE = process.env.GOLDEN;

test('golden: series 1 and 3, from the app request to the Sheet tabs', { skip: !MODE && 'run with GOLDEN=take or GOLDEN=check' }, async () => {
  // A clock that ticks one second per "now", so every run gives the same timestamps and row order.
  const RealDate = Date;
  let clock = RealDate.parse('2026-11-06T09:00:00Z');
  globalThis.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else { clock += 1000; super(clock); } }
    static now() { return clock; }
  };
  try {
    const gas = load();
    gas.ctx.setup();
    const { call, cron } = setup({
      batch: (body) => JSON.parse(gas.ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body),
      questions: () => JSON.parse(gas.ctx.doGet({ parameter: { action: 'questions' } }).body),
    });
    const http = [];
    const req = async (method, path, body) => { const r = await call(method, path, body); http.push([method, path, r.status, r.body]); };

    const s1 = { email: ' Recette.S1@Ipsen.com ', s: 1, p: 2, question: '[S1P2] Qu’avez-vous retenu ?', answer: 'Réponse de la série 1', id: 'g-1' };
    const s3 = { email: 'recette.s3@ipsen.com', s: 3, p: 3, question: '[S3P3] What did you take away?', answer: 'Answer of series 3', id: 'g-2' };
    await req('POST', '/answer', s1);
    await req('POST', '/answer', s3);
    await req('POST', '/answer', s3); // resend: duplicate
    await req('POST', '/answer', { ...s3, answer: 'Second answer, same pillar', id: 'g-3' }); // open answers are all kept
    await req('POST', '/answer', { email: 'recette.s1@ipsen.com', s: 1, p: 1, question: '=SUM(1;1)', answer: '+33 formula', id: 'g-4' });
    await req('POST', '/answer', { email: 'recette.old@ipsen.com', p: 4, answer: 'older app, no series', id: 'g-5' });
    await req('POST', '/answer', { email: 'not-an-email', s: 1, p: 1, answer: 'x', id: 'g-6' });
    for (const e of ['recette.s1@ipsen.com', 'recette.s3@ipsen.com', 'recette.old@ipsen.com', 'nobody@ipsen.com']) await req('GET', `/stars?email=${encodeURIComponent(e)}`);
    await cron();
    await req('GET', '/questions');
    await req('POST', '/answer', { ...s1, p: 3, id: 'g-7' }); // after the copy: stays for the next minute
    await cron();

    const cell = (v) => (v instanceof RealDate ? v.toISOString() : v);
    const tabs = Object.fromEntries(Object.keys(gas.tabs).sort().map((n) => [n, gas.tabs[n].rows.map((r) => (r || []).map(cell))]));
    const got = JSON.parse(JSON.stringify({ http, tabs }));

    if (MODE === 'take') {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(FILE, JSON.stringify(got, null, 1));
      return;
    }
    assert.ok(existsSync(FILE), 'no reference: run `npm run golden:take` on the code before the change');
    assert.deepEqual(got, JSON.parse(readFileSync(FILE, 'utf8')));
  } finally {
    globalThis.Date = RealDate;
  }
});
