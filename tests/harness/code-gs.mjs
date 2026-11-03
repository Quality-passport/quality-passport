// Runs apps-script/Code.gs in Node against fake Google services (shared by the tests and the reference).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function load() {
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
  vm.runInContext(readFileSync(new URL('../../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const post = (d) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(d) } }).body);
  const get = (email) => JSON.parse(ctx.doGet({ parameter: { email } }).body);
  const batch = (rows) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'batch', rows }) } }).body);
  const questions = () => JSON.parse(ctx.doGet({ parameter: { action: 'questions' } }).body);
  const rename = (from, to) => { tabs[to] = tabs[from]; tabs[to].name = to; delete tabs[from]; };
  return { ctx, tabs, formats, post, get, batch, questions, rename, lock: (v) => { locked = v; } };
}
