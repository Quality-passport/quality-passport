// The Cloudflare Worker in Node: real SQLite (node:sqlite, with the D1 migrations), fake KV, fake Apps Script.
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../../worker/src/index.js';

// Every migration of worker/migrations, in order (as `wrangler d1 migrations apply` does).
const DIR = new URL('../../worker/migrations/', import.meta.url);
export const MIGRATIONS = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(new URL(f, DIR), 'utf8'));
export const SHEET_URL = 'https://script.google.com/macros/s/TEST/exec';

/** D1-like wrapper over SQLite: prepare().bind().run()/all(), batch(). */
export function fakeD1(migrations = MIGRATIONS) {
  const db = new DatabaseSync(':memory:');
  migrations.forEach((sql) => db.exec(sql));
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...params).changes) } }),
    all: async () => ({ results: db.prepare(sql).all(...params).map((r) => ({ ...r })) }),
  });
  return { db, prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())) };
}

export function fakeKV() {
  const store = new Map();
  return {
    store,
    puts: 0,
    async get(key, type) { const v = store.get(key); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(key, value) { this.puts++; store.set(key, value); },
  };
}

/** Apps Script stand-in. `questions` answers ?action=questions; `batch` answers POST batches. */
export function fakeSheet({ questions = () => ({ ok: true, questions: {} }), batch = () => ({ ok: true, added: 0 }) } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: u, init });
    const reply = init.method === 'POST' ? batch(JSON.parse(init.body)) : questions(u);
    if (reply instanceof Error) throw reply;
    return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply));
  };
  return calls;
}

export function setup(opts) {
  const env = { DB: fakeD1(), QUESTIONS: fakeKV(), SHEET_URL };
  const calls = fakeSheet(opts);
  const call = async (method, path, body) => {
    const res = await worker.fetch(new Request(`https://api.test${path}`, { method, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), env);
    return { status: res.status, body: await res.json() };
  };
  const cron = async () => {
    const waits = [];
    await worker.scheduled({}, env, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };
  const rows = () => env.DB.db.prepare('SELECT * FROM responses ORDER BY ts').all().map((r) => ({ ...r }));
  return { env, calls, call, cron, rows };
}
