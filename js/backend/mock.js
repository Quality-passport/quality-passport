// Fake backend used when CONFIG.API_URL is empty, and always on localhost (unless ?live=1).
// Rows live in localStorage 'wqw_mock_sheet': [Timestamp, Email, Pillar, Answer, ClientId, Series, Question, Correct, Choice]
// (Series and Question are null for answers queued by an older version; Correct and Choice are null
// for open questions). Like the Worker, a quiz answer is kept only if the email has no answer yet for
// that pillar.
// Questions come from localStorage 'wqw_mock_questions' ({ "1": { "1": "text" } }, {} when unset),
// after 'wqw_mock_questions_delay' ms if set. ?mockfail=1 makes every call fail.
import { CONFIG } from '../../config.js';
import { EMAIL_RE, IDS, LETTERS, MOCK_FAIL, SERIES_IDS } from '../env.js';
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
  const quiz = item.correct != null;
  if (!EMAIL_RE.test(email) || !IDS.includes(Number(item.p)) || !answer || (s !== null && !SERIES_IDS.includes(s))) return 'drop';
  if (quiz && (typeof item.correct !== 'boolean' || !LETTERS.includes(item.choice))) return 'drop';
  const all = rows();
  if (item.id && all.some((r) => r[4] === item.id)) return 'ok'; // a resend: ignored, like the Worker does
  if (quiz && all.some((r) => r[1] === email && r[2] === Number(item.p))) return 'ok'; // the first answer counts
  all.push([new Date().toISOString(), email, Number(item.p), answer, item.id, s, item.question ? String(item.question).slice(0, 500) : null,
    quiz ? item.correct : null, quiz ? item.choice : null]);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { return 'retry'; }
  return 'ok';
}

export async function stars(email) {
  await sleep(LATENCY_MS);
  if (MOCK_FAIL) throw new Error('mock failure');
  const stars = {};
  const missed = {};
  rows().forEach(([ts, e, p, , , , , correct]) => {
    if (e !== email) return;
    if (correct === false) { if (!missed[p]) missed[p] = ts; } else if (!stars[p]) stars[p] = ts;
  });
  Object.keys(stars).forEach((p) => { delete missed[p]; });
  return { stars, missed };
}

export async function questions() {
  let delay = LATENCY_MS;
  try { delay = Number(localStorage.getItem('wqw_mock_questions_delay')) || LATENCY_MS; } catch { /* default */ }
  await sleep(delay);
  if (MOCK_FAIL) throw new Error('mock failure');
  try { return JSON.parse(localStorage.getItem('wqw_mock_questions')) || {}; } catch { return {}; }
}

export function beacon() { /* the mock has nothing to deliver after the page closes */ }
