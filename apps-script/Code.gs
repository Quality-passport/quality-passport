/**
 * Quality Passport — Google Apps Script, bound to the Sheet "Quality Report".
 *
 * Paste this file in the Sheet: Extensions > Apps Script. Then:
 *   1. Run `setup` once (authorises the script, creates the missing tabs: Questions, Responses S1-S3, Stars).
 *      It never changes the data of an existing tab. Menu: Quality Passport > Create missing tabs.
 *   2. Deploy > New deployment > Web app: Execute as "Me", Access "Anyone".
 *   3. Put the /exec URL in SHEET_URL of worker/wrangler.jsonc, then deploy the Worker.
 *      (The app talks to the Cloudflare Worker only; the Worker talks to this script.)
 *
 * Tabs
 *   Questions          one row per series × pillar: Série | Langue | Pilier | Nom du pilier | Question.
 *                      Rows are found by their Série and Pilier values, so they can be sorted or moved.
 *   Responses S1/S2/S3 answers of each series: Timestamp | Email | Pillar | Question | Answer | ClientId
 *   Responses          answers without series (sent before the series existed, or by an older app)
 *   Stars              one row per email, all series: Email | Series | 1 | 2 | 3 | 4 | Total (values, rebuilt)
 *   Columns are found by their header name, so they can be moved without breaking anything.
 *
 * Routes
 *   POST {action:'batch', rows:[{id, ts, email, pillar, answer, series, question}]} -> {ok:true, added:n}  (from the Worker)
 *   POST {email, p, answer, id[, s, question]}     -> {ok:true[, duplicate:true]} | {ok:false, error:'invalid'|'busy'}  (older direct calls)
 *   GET  ?action=questions                         -> {ok:true, rows:n, questions:{"1":{"1":"text"}}} | {ok:false, error}
 *   GET  ?email=...                                -> {stars: {"1": "ISO date of first answer", ...}}
 */

const RESPONSES = 'Responses';
const SERIES_TABS = { 1: 'Responses S1', 2: 'Responses S2', 3: 'Responses S3' };
const STARS = 'Stars';
const QUESTIONS = 'Questions';
const MAX_ANSWER = 2000;
const MAX_QUESTION = 500;
const SERIES = [1, 2, 3];
const PILLARS = [1, 2, 3, 4];
// First character cannot start a spreadsheet formula (= + - @).
const EMAIL_RE = /^[^@\s=+\-][^@\s]*@[^@\s]+\.[^@\s]+$/;
const SERIES_HEADER = ['Timestamp', 'Email', 'Pillar', 'Question', 'Answer', 'ClientId'];
const LEGACY_HEADER = ['Timestamp', 'Email', 'Pillar', 'Answer', 'ClientId'];
const STARS_HEADER = ['Email', 'Series', 1, 2, 3, 4, 'Total'];
const QUESTIONS_HEADER = ['Série', 'Langue', 'Pilier', 'Nom du pilier', 'Question'];
// Same as config.js: language of each series, pillar names, default question of each language.
const SERIES_LANG = { 1: 'FR', 2: 'EN', 3: 'EN' };
const PILLAR_NAMES = { 1: 'Quality as Enabler', 2: 'Building Trust', 3: 'Efficiency & Speed', 4: 'Quality Driving Innovation' };
const DEFAULT_QUESTION = { FR: 'Dites-nous ce que vous en retenez.', EN: 'Tell us what you took away from it.' };

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'invalid' }); }
  if (d && d.action === 'batch') return saveBatch_(d.rows);
  // A single answer (direct call from an app version older than the Worker).
  const row = clean_({ id: d.id, email: d.email, pillar: d.p, answer: d.answer, series: d.s, question: d.question });
  if (!row) return json({ ok: false, error: 'invalid' });
  // Critical section kept as short as possible: duplicate check + one write.
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(30000)) return json({ ok: false, error: 'busy' });
    const ss = SpreadsheetApp.getActive();
    // A resend (Google's reply was slow or lost, but the row was written) is not written twice.
    if (row.id && knownIds_(ss)[row.id]) return json({ ok: true, duplicate: true });
    appendRows_(responseTab_(ss, tabName_(row)), [row]);
    SpreadsheetApp.flush();
  } catch (err) {
    return json({ ok: false, error: 'busy' });
  } finally {
    lock.releaseLock();
  }
  // The answer is saved. Stars is refreshed outside the lock, once for a burst of answers.
  try { refreshStars_(); } catch (err) { /* Stars catches up on the next answer */ }
  return json({ ok: true });
}

/** Batch from the Cloudflare Worker: each answer goes to its series' tab (or Responses without series).
 *  Rows whose ClientId is already in any answers tab are skipped (the Worker resends until it gets ok). */
function saveBatch_(rows) {
  if (!Array.isArray(rows)) return json({ ok: false, error: 'invalid' });
  const lock = LockService.getScriptLock();
  let added = 0;
  try {
    if (!lock.tryLock(30000)) return json({ ok: false, error: 'busy' });
    const ss = SpreadsheetApp.getActive();
    const known = knownIds_(ss);
    const byTab = {};
    rows.forEach(function (r) {
      const row = clean_(r);
      if (!row || !row.id || known[row.id]) return;
      known[row.id] = true;
      const name = tabName_(row);
      (byTab[name] = byTab[name] || []).push(row);
    });
    Object.keys(byTab).forEach(function (name) {
      appendRows_(responseTab_(ss, name), byTab[name]);
      added += byTab[name].length;
    });
    SpreadsheetApp.flush();
  } catch (err) {
    return json({ ok: false, error: 'busy' });
  } finally {
    lock.releaseLock();
  }
  if (added) { try { rebuildStars_(); } catch (err) { /* catches up next time */ } }
  return json({ ok: true, added: added });
}

/** Validated, cleaned answer, or null. Texts that could start a formula get a leading apostrophe. */
function clean_(r) {
  const email = String(r.email || '').trim().toLowerCase().slice(0, 254);
  const p = Number(r.pillar);
  const s = r.series === null || r.series === undefined || r.series === '' ? null : Number(r.series);
  const answer = String(r.answer || '').trim().slice(0, MAX_ANSWER);
  const question = String(r.question || '').trim().slice(0, MAX_QUESTION);
  const id = String(r.id || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
  if (!EMAIL_RE.test(email) || PILLARS.indexOf(p) === -1 || !answer || (s !== null && SERIES.indexOf(s) === -1)) return null;
  const ts = r.ts ? new Date(r.ts) : new Date();
  return { id: id, ts: isNaN(ts) ? new Date() : ts, email: email, pillar: p, series: s, answer: safe_(answer), question: safe_(question) };
}

/** Blocks formula injection: the text is shown, never run. */
function safe_(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function tabName_(row) {
  return row.series ? SERIES_TABS[row.series] : RESPONSES;
}

/** Appends rows below the last one, each value under the column of the same header name. */
function appendRows_(sheet, rows) {
  const head = header_(sheet);
  const values = rows.map(function (row) {
    const byName = { timestamp: row.ts, email: row.email, pillar: row.pillar, question: row.question, answer: row.answer, clientid: row.id };
    return head.map(function (h) { return h in byName ? byName[h] : ''; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, head.length).setValues(values);
}

/** Header row, normalised: lower case, no accents, no spaces ("Nom du pilier" -> "nomdupilier"). */
function header_(sheet) {
  const width = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, width).getValues()[0].map(norm_);
}

function norm_(v) {
  return String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').toLowerCase();
}

/** Existing answers tabs (series tabs and the one without series). */
function responseTabs_(ss) {
  return [RESPONSES, SERIES_TABS[1], SERIES_TABS[2], SERIES_TABS[3]]
    .map(function (name) { return ss.getSheetByName(name); })
    .filter(function (sheet) { return sheet; });
}

/** Rows of an answers tab as objects {email, pillar, ts, id}, located by header name. */
function readAnswers_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values[0].map(norm_);
  const c = { email: head.indexOf('email'), pillar: head.indexOf('pillar'), ts: head.indexOf('timestamp'), id: head.indexOf('clientid') };
  return values.slice(1).map(function (r) {
    return {
      email: c.email < 0 ? '' : String(r[c.email]).toLowerCase(),
      pillar: c.pillar < 0 ? NaN : Number(r[c.pillar]),
      ts: c.ts < 0 ? '' : (r[c.ts] instanceof Date ? r[c.ts].toISOString() : String(r[c.ts])),
      id: c.id < 0 ? '' : String(r[c.id]),
    };
  });
}

/** ClientIds already present in any answers tab. */
function knownIds_(ss) {
  const known = {};
  responseTabs_(ss).forEach(function (sheet) {
    readAnswers_(sheet).forEach(function (a) { if (a.id) known[a.id] = true; });
  });
  return known;
}

/** Returns the answers tab, creating it with its header when missing (renamed or deleted tabs come back). */
function responseTab_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  const head = name === RESPONSES ? LEGACY_HEADER : SERIES_HEADER;
  sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  head.forEach(function (h, i) {
    if (h === 'Timestamp') sheet.getRange(1, i + 1, sheet.getMaxRows(), 1).setNumberFormat('dd/mm/yyyy hh:mm:ss'); // date and time
    if (h === 'Question') sheet.setColumnWidth(i + 1, 320);
    if (h === 'Answer') sheet.setColumnWidth(i + 1, 480);
    if (h === 'Question' || h === 'Answer') sheet.getRange(1, i + 1, sheet.getMaxRows(), 1).setWrap(true);
  });
  return sheet;
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action === 'questions') return json(readQuestions_());
  const email = String(params.email || '').trim().toLowerCase();
  const stars = {};
  if (email) {
    responseTabs_(SpreadsheetApp.getActive()).forEach(function (sheet) {
      readAnswers_(sheet).forEach(function (a) {
        if (a.email !== email || PILLARS.indexOf(a.pillar) === -1) return;
        if (!stars[a.pillar] || a.ts < stars[a.pillar]) stars[a.pillar] = a.ts;
      });
    });
  }
  return json({ stars: stars });
}

/** The Questions tab as {s: {p: text}}. Rows are found by their Série and Pilier values;
 *  rows with another series or pillar are ignored; for a series and pillar given twice, the highest
 *  non-empty row wins. Texts are taken as displayed (a formula gives its result), trimmed, 500 at most. */
function readQuestions_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(QUESTIONS);
  if (!sheet) return { ok: false, error: 'no Questions tab' };
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { ok: false, error: 'no rows' };
  const head = values[0].map(norm_);
  const cs = firstIndex_(head, ['serie', 'series']);
  const cp = firstIndex_(head, ['pilier', 'pillar']);
  const cq = head.indexOf('question');
  if (cs < 0 || cp < 0 || cq < 0) return { ok: false, error: 'columns Série, Pilier, Question not found' };
  const questions = {};
  let rows = 0;
  for (let i = 1; i < values.length; i++) {
    const s = Number(String(values[i][cs]).trim());
    const p = Number(String(values[i][cp]).trim());
    if (SERIES.indexOf(s) === -1 || PILLARS.indexOf(p) === -1) continue;
    rows++;
    questions[s] = questions[s] || {};
    if (!questions[s][p]) questions[s][p] = String(values[i][cq]).trim().slice(0, MAX_QUESTION);
  }
  if (!rows) return { ok: false, error: 'no valid row' };
  return { ok: true, rows: rows, questions: questions };
}

function firstIndex_(head, names) {
  for (let i = 0; i < names.length; i++) { const at = head.indexOf(names[i]); if (at >= 0) return at; }
  return -1;
}

/** Run once from the editor (or the menu): authorises the script and creates the missing tabs.
 *  Existing tabs keep their data; Stars (computed) is rebuilt. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(QUESTIONS)) createQuestions_(ss);
  SERIES.forEach(function (s) { responseTab_(ss, SERIES_TABS[s]); });
  rebuildStars_();
  ss.toast('Quality Passport: tabs Questions, Responses S1-S3 and Stars are ready.');
}

/** Questions tab, pre-filled with each language's default question (what participants see today). */
function createQuestions_(ss) {
  const sheet = ss.insertSheet(QUESTIONS, 0);
  const rows = [];
  SERIES.forEach(function (s) {
    PILLARS.forEach(function (p) {
      const lang = SERIES_LANG[s];
      rows.push([s, lang, p, PILLAR_NAMES[p], DEFAULT_QUESTION[lang]]);
    });
  });
  sheet.getRange(1, 1, 1, QUESTIONS_HEADER.length).setValues([QUESTIONS_HEADER]).setFontWeight('bold');
  sheet.getRange(2, 1, rows.length, QUESTIONS_HEADER.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(4, 220);
  sheet.setColumnWidth(5, 520);
  sheet.getRange(1, 5, sheet.getMaxRows(), 1).setWrap(true);
  return sheet;
}

/** Menu in the Sheet: Quality Passport > Rebuild Stars, Create missing tabs. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Quality Passport')
    .addItem('Rebuild Stars', 'rebuildStars')
    .addItem('Create missing tabs', 'setup')
    .addToUi();
}

function rebuildStars() {
  rebuildStars_();
  SpreadsheetApp.getActive().toast('Stars rebuilt from the answers tabs.');
}

/** Rebuilds Stars unless another execution is already doing it; that one then runs
 *  once more, so answers arriving during a rebuild are never left out. */
function refreshStars_() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('starsDirty', '1');
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(0)) return; // someone else is rebuilding and will see the flag
  try {
    for (let i = 0; i < 5 && props.getProperty('starsDirty') === '1'; i++) {
      props.deleteProperty('starsDirty');
      rebuildStars_();
    }
  } finally {
    lock.releaseLock();
  }
}

/** Stars = one row per email, all series together (one passport): the series answered in,
 *  a star per pillar answered in any answers tab, and the total. Plain values (no formulas),
 *  so it works whatever the Sheet's language. Duplicates count once. */
function rebuildStars_() {
  const ss = SpreadsheetApp.getActive();
  const byEmail = {};
  responseTabs_(ss).forEach(function (sheet) {
    const name = sheet.getName();
    const series = name === RESPONSES ? null : Number(name.slice(-1));
    readAnswers_(sheet).forEach(function (a) {
      if (!a.email || PILLARS.indexOf(a.pillar) === -1) return;
      const e = byEmail[a.email] = byEmail[a.email] || { pillars: {}, series: {} };
      e.pillars[a.pillar] = true;
      if (series) e.series[series] = true;
    });
  });
  const out = Object.keys(byEmail).sort().map(function (email) {
    const e = byEmail[email];
    const cells = PILLARS.map(function (p) { return e.pillars[p] ? '★' : ''; });
    const series = Object.keys(e.series).sort().join(', ');
    return [email, series].concat(cells, [cells.filter(String).length]);
  });
  let stars = ss.getSheetByName(STARS);
  if (!stars) {
    stars = ss.insertSheet(STARS);
    stars.setFrozenRows(1);
    stars.setColumnWidth(1, 280);
  }
  const width = Math.max(stars.getLastColumn(), STARS_HEADER.length);
  const last = stars.getLastRow();
  if (last > 0) stars.getRange(1, 1, last, width).clearContent();
  stars.getRange(1, 1, 1, STARS_HEADER.length).setValues([STARS_HEADER]).setFontWeight('bold');
  stars.getRange(1, 2, Math.max(out.length + 1, 1), STARS_HEADER.length - 1).setHorizontalAlignment('center');
  if (out.length) stars.getRange(2, 1, out.length, STARS_HEADER.length).setValues(out);
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
