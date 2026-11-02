// Runs apps-script/Code.gs in Node against fake Google services.
// Covers validation, formula injection, duplicates, star restoration, tab creation,
// answers sorted by series, columns found by name, and the Questions tab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const tabs = {};
  const formats = [];
  const makeSheet = (name) => {
    const rows = [];
    const range = (r = 1, c = 1, nr = 1, nc = 1) => ({
      getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')); },
      setValues(v) { v.forEach((vr, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; vr.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; }); }); return this; },
      clearContent() { for (let i = 0; i < nr; i++) if (rows[r - 1 + i]) for (let j = 0; j < nc; j++) rows[r - 1 + i][c - 1 + j] = ''; return this; },
      setFontWeight() { return this; }, setWrap() { return this; }, setHorizontalAlignment() { return this; },
      setNumberFormat(f) { formats.push([name, c, f]); return this; },
    });
    const display = (v) => (v instanceof Date ? v.toISOString() : String(v ?? ''));
    return {
      name,
      rows,
      getName() { return this.name; },
      getMaxRows: () => 1000,
      getLastColumn() { return rows.reduce((m, r) => Math.max(m, r ? r.length : 0), 0); },
      appendRow(r) { rows.push(r); },
      getLastRow() { let n = rows.length; while (n && (rows[n - 1] || []).every((x) => x === '' || x == null)) n--; return n; },
      getDataRange() { return { getValues: () => rows.map((r) => r.slice()), getDisplayValues: () => rows.map((r) => r.map(display)) }; },
      getRange: (a, b, c, d) => (typeof a === 'string' ? range() : range(a, b, c, d)),
      setFrozenRows() {}, setColumnWidth() {},
    };
  };
  const ss = {
    flushCalls: 0,
    getSheetByName: (n) => tabs[n] || null,
    insertSheet: (n) => (tabs[n] = makeSheet(n)),
    toast() {},
  };
  let locked = false;
  const props = {};
  const ctx = {
    SpreadsheetApp: { getActive: () => ss, flush() {} },
    LockService: {
      getScriptLock: () => ({ tryLock: () => !locked, releaseLock() {} }),
      getDocumentLock: () => ({ tryLock: () => true, releaseLock() {} }),
    },
    PropertiesService: { getScriptProperties: () => ({ setProperty(k, v) { props[k] = v; }, getProperty: (k) => props[k] ?? null, deleteProperty(k) { delete props[k]; } }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ body: s, setMimeType() { return this; } }),
    },
    Date,
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const post = (d) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(d) } }).body);
  const get = (email) => JSON.parse(ctx.doGet({ parameter: { email } }).body);
  const batch = (rows) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'batch', rows }) } }).body);
  const questions = () => JSON.parse(ctx.doGet({ parameter: { action: 'questions' } }).body);
  const rename = (from, to) => { tabs[to] = tabs[from]; tabs[to].name = to; delete tabs[from]; };
  return { ctx, tabs, formats, post, get, batch, questions, rename, lock: (v) => { locked = v; } };
}

test('valid answer is appended with a lower-cased email', () => {
  const { post, tabs } = load();
  assert.deepEqual(post({ email: ' Jean.Dupont@X.com ', p: 2, answer: ' hello ', id: 'abc-1' }), { ok: true });
  const row = tabs.Responses.rows[1];
  assert.equal(row[1], 'jean.dupont@x.com');
  assert.equal(row[2], 2);
  assert.equal(row[3], 'hello');
  assert.equal(row[4], 'abc-1');
});

test('invalid input is rejected with error "invalid"', () => {
  const { post, tabs } = load();
  for (const d of [
    { email: 'nope', p: 1, answer: 'a' },
    { email: 'a@b.co', p: 5, answer: 'a' },
    { email: 'a@b.co', p: 1, answer: '   ' },
    { email: '=cmd@b.co', p: 1, answer: 'a' },
  ]) assert.deepEqual(post(d), { ok: false, error: 'invalid' });
  assert.equal(tabs.Responses, undefined); // nothing written, not even the tab
});

test('formula injection is neutralised, ids are sanitised, answers capped', () => {
  const { post, tabs } = load();
  post({ email: 'a@b.co', p: 1, answer: '=HYPERLINK("x")', id: '=1+1' });
  post({ email: 'a@b.co', p: 3, answer: 'x'.repeat(5000) });
  assert.equal(tabs.Responses.rows[1][3], '\'=HYPERLINK("x")');
  assert.equal(tabs.Responses.rows[1][4], '11');
  assert.equal(tabs.Responses.rows[2][3].length, 2000);
});

test('busy lock answers "busy" so the client retries', () => {
  const { post, lock } = load();
  lock(true);
  assert.deepEqual(post({ email: 'a@b.co', p: 1, answer: 'a' }), { ok: false, error: 'busy' });
});

test('malformed body is "invalid"', () => {
  const { ctx } = load();
  assert.deepEqual(JSON.parse(ctx.doPost({ postData: { contents: '{oops' } }).body), { ok: false, error: 'invalid' });
});

test('GET restores stars with the first date, duplicates ignored', () => {
  const { post, get } = load();
  post({ email: 'a@b.co', p: 3, answer: 'first' });
  post({ email: 'a@b.co', p: 3, answer: 'retry duplicate' });
  post({ email: 'a@b.co', p: 1, answer: 'x' });
  post({ email: 'other@b.co', p: 4, answer: 'x' });
  const { stars } = get('A@B.CO');
  assert.deepEqual(Object.keys(stars).sort(), ['1', '3']);
  assert.match(stars[3], /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(get('').stars, {});
});

const plain = (x) => JSON.parse(JSON.stringify(x)); // arrays from the vm have another realm's prototype

test('setup creates Questions, Responses S1-S3 and Stars with headers (RG-25)', () => {
  const { ctx, tabs } = load();
  ctx.setup();
  for (const s of [1, 2, 3]) assert.deepEqual(plain(tabs[`Responses S${s}`].rows[0]), ['Timestamp', 'Email', 'Pillar', 'Question', 'Answer', 'ClientId']);
  assert.deepEqual(plain(tabs.Stars.rows[0]), ['Email', 'Series', 1, 2, 3, 4, 'Total']);
  assert.deepEqual(plain(tabs.Questions.rows[0]), ['Série', 'Langue', 'Pilier', 'Nom du pilier', 'Question']);
  assert.equal(tabs.Questions.rows.length, 13);
  assert.deepEqual(plain(tabs.Questions.rows[1]), [1, 'FR', 1, 'Quality as Enabler', 'Dites-nous ce que vous en retenez.']);
  assert.deepEqual(plain(tabs.Questions.rows[12]), [3, 'EN', 4, 'Quality Driving Innovation', 'Tell us what you took away from it.']);
  assert.equal(tabs.Responses, undefined); // the tab without series only appears when such an answer arrives
});

test('Stars is rebuilt after each answer: one row per email, duplicates count once', () => {
  const { post, tabs } = load();
  post({ email: 'b@x.co', p: 3, answer: 'x' });
  post({ email: 'a@x.co', p: 1, answer: 'x' });
  post({ email: 'a@x.co', p: 1, answer: 'resend after timeout' });
  post({ email: 'a@x.co', p: 4, answer: 'x' });
  const body = plain(tabs.Stars.rows.slice(1).filter((r) => r[0]));
  assert.deepEqual(body, [
    ['a@x.co', '', '★', '', '', '★', 2],
    ['b@x.co', '', '', '', '★', '', 1],
  ]);
});

test('a resend with the same ClientId is not appended twice', () => {
  const { post, tabs } = load();
  assert.equal(post({ email: 'a@x.co', p: 2, answer: 'first try', id: 'abc-123' }).ok, true);
  const again = post({ email: 'a@x.co', p: 2, answer: 'first try', id: 'abc-123' });
  assert.equal(again.ok, true);
  assert.equal(tabs.Responses.rows.filter((r) => r[4] === 'abc-123').length, 1);
  post({ email: 'a@x.co', p: 3, answer: 'other', id: 'def-456' });
  assert.equal(tabs.Responses.rows.length, 3); // header + 2
});

test('batch from the Worker: one write, known ids skipped, invalid rows dropped', () => {
  const { ctx, tabs, post } = load();
  post({ email: 'a@x.co', p: 1, answer: 'single', id: 'id-1' });
  const out = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'batch', rows: [
    { id: 'id-1', ts: '2026-10-05T09:00:00Z', email: 'a@x.co', pillar: 1, answer: 'already there' },
    { id: 'id-2', ts: '2026-10-05T09:01:00Z', email: 'B@x.co', pillar: 2, answer: '=cmd' },
    { id: 'id-3', ts: '2026-10-05T09:02:00Z', email: 'c@x.co', pillar: 7, answer: 'bad pillar' },
    { id: 'id-2', ts: '2026-10-05T09:03:00Z', email: 'b@x.co', pillar: 2, answer: 'same id twice' },
  ] }) } }).body);
  assert.deepEqual(plain(out), { ok: true, added: 1 });
  const rows = plain(tabs.Responses.rows.slice(1));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1].slice(1), ['b@x.co', 2, "'=cmd", 'id-2']);
  const stars = plain(tabs.Stars.rows.slice(1).filter((r) => r[0]));
  assert.deepEqual(stars.map((r) => r[0]), ['a@x.co', 'b@x.co']);
});

// ---- Series, columns by name, Questions tab ---------------------------------------------------

const row = (over = {}) => ({ id: 'id-1', ts: '2026-11-06T09:00:00Z', email: 'a@x.co', pillar: 1, answer: 'an answer', series: 2, question: '[S2P1] Q', ...over });

test('batch: each answer in its series tab, without series in Responses; a resend adds nothing (DE-04, SE-08)', () => {
  const { tabs, batch } = load();
  const rows = [
    row({ id: 's1', series: 1, pillar: 1, question: '[S1P1] Q' }),
    row({ id: 's2', series: 2, pillar: 2, question: '[S2P2] Q' }),
    row({ id: 's3', series: 3, pillar: 3, question: '[S3P3] Q' }),
    row({ id: 'old', series: null, question: null, pillar: 1 }),
    row({ id: 's2', series: 2, pillar: 2, answer: 'same id twice' }),
    row({ id: 'bad', series: 4 }),
  ];
  assert.deepEqual(plain(batch(rows)), { ok: true, added: 4 });
  for (const [s, id, q] of [[1, 's1', '[S1P1] Q'], [2, 's2', '[S2P2] Q'], [3, 's3', '[S3P3] Q']]) {
    const body = plain(tabs[`Responses S${s}`].rows.slice(1));
    assert.equal(body.length, 1);
    assert.deepEqual(body[0].slice(1), ['a@x.co', s === 1 ? 1 : s, q, 'an answer', id]);
  }
  assert.deepEqual(plain(tabs.Responses.rows[0]), ['Timestamp', 'Email', 'Pillar', 'Answer', 'ClientId']);
  assert.deepEqual(plain(tabs.Responses.rows[1]).slice(1), ['a@x.co', 1, 'an answer', 'old']);
  assert.deepEqual(plain(batch(rows)), { ok: true, added: 0 });
});

test('batch: answer and question that could start a formula are neutralised (RG-22)', () => {
  const { tabs, batch } = load();
  batch([row({ answer: '=SUM(1;1)', question: '+33 test' })]);
  assert.deepEqual(plain(tabs['Responses S2'].rows[1]).slice(3, 5), ["'+33 test", "'=SUM(1;1)"]);
});

test('columns moved by hand: values follow the headers, duplicates still found', () => {
  const { tabs, batch } = load();
  batch([row({ id: 'first' })]);
  const t = tabs['Responses S2'];
  t.rows.forEach((r) => { [r[3], r[5]] = [r[5], r[3]]; }); // swap Question and ClientId
  assert.deepEqual(plain(t.rows[0]), ['Timestamp', 'Email', 'Pillar', 'ClientId', 'Answer', 'Question']);
  assert.deepEqual(plain(batch([row({ id: 'first' }), row({ id: 'second', question: 'Q2' })])), { ok: true, added: 1 });
  assert.deepEqual(plain(t.rows[2]).slice(3), ['second', 'an answer', 'Q2']);
});

test('a renamed answers tab is recreated with its header; the renamed one is untouched (RG-24, SE-10)', () => {
  const { tabs, batch, rename } = load();
  batch([row({ id: 'a' })]);
  rename('Responses S2', 'S2 old');
  batch([row({ id: 'b' })]);
  assert.deepEqual(plain(tabs['S2 old'].rows.slice(1)).map((r) => r[5]), ['a']);
  assert.deepEqual(plain(tabs['Responses S2'].rows[0]), ['Timestamp', 'Email', 'Pillar', 'Question', 'Answer', 'ClientId']);
  assert.deepEqual(plain(tabs['Responses S2'].rows.slice(1)).map((r) => r[5]), ['b']);
});

test('Stars: one row per email, all series, with the series answered in (RG-21, SE-09)', () => {
  const { tabs, batch } = load();
  batch([
    row({ id: '1', email: 'recette.b@x.co', series: 2, pillar: 1 }),
    row({ id: '2', email: 'recette.b@x.co', series: 1, pillar: 2 }),
    row({ id: '3', email: 'r@x.co', series: 1, pillar: 1 }),
    row({ id: '4', email: 'r@x.co', series: 2, pillar: 2 }),
    row({ id: '5', email: 'r@x.co', series: 3, pillar: 3 }),
    row({ id: '6', email: 'r@x.co', series: null, pillar: 1 }),
    row({ id: '7', email: 'c@x.co', series: 3, pillar: 4 }),
    row({ id: '8', email: 'c@x.co', series: 3, pillar: 4, answer: 'again' }),
  ]);
  assert.deepEqual(plain(tabs.Stars.rows.slice(1).filter((r) => r[0])), [
    ['c@x.co', '3', '', '', '', '★', 1],
    ['r@x.co', '1, 2, 3', '★', '★', '★', '', 3],
    ['recette.b@x.co', '1, 2', '★', '★', '', '', 2],
  ]);
});

test('Stars: the old 6-column layout is replaced by the new header', () => {
  const { ctx, tabs, post } = load();
  post({ email: 'a@x.co', p: 1, answer: 'x', id: 'x1' }); // old layout from an older run
  tabs.Stars.rows[0] = ['Email', 1, 2, 3, 4, 'Total'];
  ctx.rebuildStars();
  assert.deepEqual(plain(tabs.Stars.rows[0]), ['Email', 'Series', 1, 2, 3, 4, 'Total']);
  assert.deepEqual(plain(tabs.Stars.rows[1]), ['a@x.co', '', '★', '', '', '', 1]);
});

test('GET restores stars from every answers tab', () => {
  const { batch, get } = load();
  batch([row({ id: '1', series: 2, pillar: 1 }), row({ id: '2', series: 1, pillar: 3 }), row({ id: '3', series: null, pillar: 4 })]);
  assert.deepEqual(Object.keys(get('a@x.co').stars).sort(), ['1', '3', '4']);
});

test('setup keeps existing data and can run twice (SE-11)', () => {
  const { ctx, tabs, post } = load();
  post({ email: 'a@x.co', p: 1, answer: 'kept', id: 'k1' });
  const before = JSON.stringify(tabs.Responses.rows);
  ctx.setup();
  tabs.Questions.rows[1][4] = 'Edited question';
  ctx.setup();
  assert.equal(JSON.stringify(tabs.Responses.rows), before);
  assert.equal(tabs.Questions.rows[1][4], 'Edited question');
  assert.equal(tabs.Questions.rows.length, 13);
});

test('questions: read by Série and Pilier values, whatever the row order (RG-08, RG-09)', () => {
  const { ctx, tabs, questions } = load();
  ctx.setup();
  const q = tabs.Questions;
  q.rows[2][4] = '  [S1P2] Qu’est-ce qui vous a surpris ?  ';
  q.rows.splice(1, q.rows.length - 1, ...q.rows.slice(1).reverse()); // rows sorted the other way
  const out = questions();
  assert.equal(out.ok, true);
  assert.equal(out.rows, 12);
  assert.equal(out.questions[1][2], '[S1P2] Qu’est-ce qui vous a surpris ?');
  assert.equal(out.questions[3][4], 'Tell us what you took away from it.');
});

test('questions: highest non-empty row wins, invalid rows ignored, 500 characters, displayed value (QU-04, QU-05, QU-07)', () => {
  const { tabs, questions, ctx } = load();
  ctx.setup();
  const q = tabs.Questions;
  q.rows.splice(1, 0, [2, 'EN', 1, '', ''], [2, 'EN', 1, '', 'A']); // above the pre-filled S2-P1
  q.rows.push([4, 'EN', 1, '', 'bad series'], [1, 'FR', 5, '', 'bad pillar'], ['deux', '', 1, '', 'bad']);
  q.rows[5][4] = 'x'.repeat(501);
  q.rows[6][4] = new Date('2026-11-06T00:00:00Z'); // a formula's result is taken as displayed
  const out = questions();
  assert.equal(out.questions[2][1], 'A');
  assert.equal(out.rows, 14);
  assert.equal(Object.values(out.questions).flatMap(Object.values).filter((t) => t.length === 500).length, 1);
  assert.ok(!('4' in out.questions) && !('5' in out.questions[1]));
});

test('questions: missing tab, header only or columns not found answer ok:false (the Worker keeps its copy)', () => {
  const { tabs, questions, ctx, rename } = load();
  assert.equal(questions().ok, false);
  ctx.setup();
  rename('Questions', 'Old questions');
  assert.equal(questions().ok, false);
  rename('Old questions', 'Questions');
  tabs.Questions.rows.splice(1);
  assert.equal(questions().ok, false);
  tabs.Questions.rows[0] = ['A', 'B', 'C'];
  tabs.Questions.rows.push([1, 1, 'x']);
  assert.equal(questions().ok, false);
});

test('questions: columns found by name, in English too, in any order', () => {
  const { tabs, questions, ctx } = load();
  ctx.setup();
  tabs.Questions.rows.splice(0, Infinity, ['Question', 'Pillar', 'Series'], ['Hello', 4, 3]);
  assert.deepEqual(plain(questions()), { ok: true, rows: 1, questions: { 3: { 4: 'Hello' } } });
});

test('new answers tabs show the Timestamp with date and time', () => {
  const { ctx, formats } = load();
  ctx.setup();
  for (const s of [1, 2, 3]) assert.ok(formats.some(([tab, col, f]) => tab === `Responses S${s}` && col === 1 && f === 'dd/mm/yyyy hh:mm:ss'));
});
