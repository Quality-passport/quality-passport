// The 12 questions (3 series × 4 pillars), written in the Google Sheet's "Questions" tab and
// served by the Worker. They are kept on the phone, so a question shows at once on later scans,
// even without network. A question that is empty or unknown falls back to TEXT.defaultQuestion.
import { backend } from './backend/index.js';
import { T } from './ui.js';
import { sleep } from './util.js';

const KEY = 'wqw_questions';
const TIMEOUT_MS = 15000;

/** { "1": { "1": "text", ... }, ... } as last received, or null if never received on this phone. */
let known = read();
let loading = null;

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && typeof v.q === 'object' && v.q ? v.q : null;
  } catch { return null; }
}

/** Asks the Worker for the questions (once per page). Resolves to true when they arrived.
 *  When they differ from those kept on the phone, fires 'wqw:questions'. */
export function loadQuestions() {
  if (!loading) {
    loading = (async () => {
      try {
        const q = await Promise.race([backend.questions(), sleep(TIMEOUT_MS).then(() => { throw new Error('timeout'); })]);
        if (!q || typeof q !== 'object') return false;
        const changed = JSON.stringify(q) !== JSON.stringify(known);
        known = q;
        try { localStorage.setItem(KEY, JSON.stringify({ at: new Date().toISOString(), q })); } catch { /* session only */ }
        if (changed) window.dispatchEvent(new Event('wqw:questions'));
        return true;
      } catch {
        return false; // offline or slow: keep what the phone has
      }
    })();
  }
  return loading;
}

/** True when the phone already has a copy of the questions. */
export const haveQuestions = () => known !== null;

/** Waits for the questions at most `ms` (resolves early if they arrive or fail). */
export function waitForQuestions(ms) {
  return Promise.race([loadQuestions(), sleep(ms)]);
}

/** Text to show for series s, pillar p: the Sheet's question, else the default one of the page's language. */
export function questionText(s, p) {
  const text = known?.[s]?.[p];
  return typeof text === 'string' && text.trim() ? text.trim() : T.defaultQuestion;
}
