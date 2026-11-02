// Fake backend used when CONFIG.API_URL is empty, and always on localhost (unless ?live=1).
// Rows live in localStorage 'wqw_mock_sheet': [Timestamp, Email, Pillar, Answer, ClientId, Series, Question]
// (Series and Question are null for answers queued by an older version).
// Questions come from localStorage 'wqw_mock_questions' ({ "1": { "1": "text" } }, {} when unset),
// after 'wqw_mock_questions_delay' ms if set. ?mockfail=1 makes every call fail.
import { CONFIG } from '../../config.js';
import { EMAIL_RE, IDS, MOCK_FAIL, SERIES_IDS } from '../env.js';
import { sleep } from '../util.js';

const KEY = 'wqw_mock_sheet';
const LATENCY_MS = 800;

function rows() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

export async function send(item) {
  await sleep(LATENCY_MS);
  if (MOCK_FAIL) return 'retry';
  const email = String(item.email || '').trim().toLowerCase();
  const answer = String(item.answer || '').trim().slice(0, CONFIG.MAX_CHARS);
  const s = item.s == null ? null : Number(item.s);
  if (!EMAIL_RE.test(email) || !IDS.includes(Number(item.p)) || !answer || (s !== null && !SERIES_IDS.includes(s))) return 'drop';
  const all = rows();
  if (item.id && all.some((r) => r[4] === item.id)) return 'ok'; // a resend: ignored, like the Worker does
  all.push([new Date().toISOString(), email, Number(item.p), answer, item.id, s, item.question ? String(item.question).slice(0, 500) : null]);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { return 'retry'; }
  return 'ok';
}

export async function stars(email) {
  await sleep(LATENCY_MS);
  if (MOCK_FAIL) throw new Error('mock failure');
  const out = {};
  rows().forEach(([ts, e, p]) => { if (e === email && !out[p]) out[p] = ts; });
  return out;
}

export async function questions() {
  let delay = LATENCY_MS;
  try { delay = Number(localStorage.getItem('wqw_mock_questions_delay')) || LATENCY_MS; } catch { /* default */ }
  await sleep(delay);
  if (MOCK_FAIL) throw new Error('mock failure');
  try { return JSON.parse(localStorage.getItem('wqw_mock_questions')) || {}; } catch { return {}; }
}

export function beacon() { /* the mock has nothing to deliver after the page closes */ }
