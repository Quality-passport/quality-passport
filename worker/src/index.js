// Quality Passport API (Cloudflare Worker + D1 + KV).
// - POST /answer   {email, s, p, question, answer, id} -> {ok:true[, duplicate:true]} | {ok:false, error:'invalid'|'busy'}
//                  s (series 1-3) and question are absent in answers queued by an older version: accepted.
// - GET  /stars?email=                    -> {stars: {"1": "ISO date of first answer", ...}}  (all series: one passport)
// - GET  /questions                       -> {ok:true, questions: {"1": {"1": "text", ...}, ...}}
//                  read from KV, a copy served close to each participant; Google is never called here.
// - every minute: new answers are copied to the Google Sheet in one batch, and the Sheet's
//   "Questions" tab is read back into KV (written only when it changed; a failed read keeps the copy).
// Requests are "simple" (text/plain POST, plain GET): no CORS preflight needed.

const EMAIL_RE = /^[^@\s=+\-][^@\s]*@[^@\s]+\.[^@\s]+$/; // same rule as the app and the Apps Script
const MAX_ANSWER = 2000;
const MAX_QUESTION = 500;
const SERIES = [1, 2, 3];
const PILLARS = [1, 2, 3, 4];
const SYNC_BATCH = 400;
const QUESTIONS_KEY = 'questions';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (url.pathname === '/answer' && request.method === 'POST') return await saveAnswer(request, env);
      if (url.pathname === '/stars' && request.method === 'GET') return await getStars(url, env);
      if (url.pathname === '/questions' && request.method === 'GET') return await getQuestions(env);
      if (url.pathname === '/health') return json({ ok: true });
      return json({ ok: false, error: 'not found' }, 404);
    } catch (err) {
      console.error('request failed', err);
      return json({ ok: false, error: 'busy' }, 503); // the app keeps the answer and retries
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(Promise.all([syncToSheet(env), refreshQuestions(env)]));
  },
};

async function saveAnswer(request, env) {
  let d;
  try { d = JSON.parse(await request.text()); } catch { return json({ ok: false, error: 'invalid' }, 400); }
  const email = String(d.email || '').trim().toLowerCase().slice(0, 254);
  const p = Number(d.p);
  const s = d.s == null || d.s === '' ? null : Number(d.s);
  const answer = String(d.answer || '').trim().slice(0, MAX_ANSWER);
  const question = String(d.question || '').trim().slice(0, MAX_QUESTION) || null;
  const id = String(d.id || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
  if (!id || !EMAIL_RE.test(email) || !PILLARS.includes(p) || !answer || (s !== null && !SERIES.includes(s))) {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const r = await env.DB
    .prepare('INSERT OR IGNORE INTO responses (id, ts, email, pillar, answer, series, question) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(id, new Date().toISOString(), email, p, answer, s, question)
    .run();
  return json(r.meta.changes ? { ok: true } : { ok: true, duplicate: true });
}

async function getStars(url, env) {
  const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
  const stars = {};
  if (email) {
    const { results } = await env.DB
      .prepare('SELECT pillar, MIN(ts) AS ts FROM responses WHERE email = ?1 GROUP BY pillar')
      .bind(email)
      .all();
    for (const row of results) stars[row.pillar] = row.ts;
  }
  return json({ stars });
}

/** Before the first copy from the Sheet there are no questions: the app shows its default ones. */
async function getQuestions(env) {
  const copy = env.QUESTIONS ? await env.QUESTIONS.get(QUESTIONS_KEY, 'json') : null;
  return json({ ok: true, questions: copy?.questions || {} });
}

/** Keeps only series 1-3 × pillars 1-4, texts trimmed and capped. Null when nothing valid
 *  (Google down, tab missing or renamed, no valid row): the current copy must then be kept. */
function cleanQuestions(reply) {
  if (!reply?.ok || !reply.questions || typeof reply.questions !== 'object') return null;
  const out = {};
  let rows = 0;
  for (const s of SERIES) {
    for (const p of PILLARS) {
      const text = reply.questions[s]?.[p];
      if (typeof text !== 'string') continue;
      (out[s] = out[s] || {})[p] = text.trim().slice(0, MAX_QUESTION);
      rows++;
    }
  }
  return rows ? out : null;
}

/** Reads the Sheet's "Questions" tab (Apps Script, action=questions) into KV, only when it changed. */
async function refreshQuestions(env) {
  if (!env.SHEET_URL || !env.QUESTIONS) return;
  let reply = null;
  try {
    const url = new URL(env.SHEET_URL);
    url.searchParams.set('action', 'questions');
    reply = await (await fetch(url, { redirect: 'follow' })).json();
  } catch (err) {
    console.warn('questions: no usable reply, keeping the current copy', String(err));
    return;
  }
  const questions = cleanQuestions(reply);
  if (!questions) {
    console.warn('questions: nothing valid in the reply, keeping the current copy', JSON.stringify(reply)?.slice(0, 200));
    return;
  }
  const current = await env.QUESTIONS.get(QUESTIONS_KEY, 'json');
  if (JSON.stringify(current?.questions) === JSON.stringify(questions)) return;
  await env.QUESTIONS.put(QUESTIONS_KEY, JSON.stringify({ questions, at: new Date().toISOString() }));
  console.log('questions: new copy saved');
}

/** Copies answers not yet in the Sheet, in one Apps Script call. On any failure the rows
 *  stay unsynced and go out next minute; the script ignores ids it already has. */
async function syncToSheet(env) {
  if (!env.SHEET_URL) return;
  const { results } = await env.DB
    .prepare('SELECT id, ts, email, pillar, answer, series, question FROM responses WHERE synced = 0 ORDER BY ts LIMIT ?1')
    .bind(SYNC_BATCH)
    .all();
  if (!results.length) return;

  let reply = null;
  try {
    const res = await fetch(env.SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'batch', rows: results }),
      redirect: 'follow',
    });
    reply = await res.json();
  } catch (err) {
    console.warn('sheet sync: no usable reply, will retry', String(err));
    return;
  }
  if (!reply || !reply.ok) {
    console.warn('sheet sync refused, will retry', JSON.stringify(reply));
    return;
  }
  // Mark as synced, 90 ids per statement (D1 bound-parameter limit is 100).
  const stmts = [];
  for (let i = 0; i < results.length; i += 90) {
    const ids = results.slice(i, i + 90).map((r) => r.id);
    stmts.push(env.DB.prepare(`UPDATE responses SET synced = 1 WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids));
  }
  await env.DB.batch(stmts);
  console.log(`sheet sync: ${results.length} sent, ${reply.added ?? '?'} added`);
}
