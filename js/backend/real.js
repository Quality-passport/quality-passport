// Cloudflare Worker backend (worker/): answers go to D1, then to the Google Sheet every minute;
// the questions written in the Sheet are served from a copy kept close to each participant.
// POST as text/plain and plain GET = "simple" requests: no CORS preflight.
import { CONFIG } from '../../config.js';

const TIMEOUT_MS = 20000;
const api = (path) => CONFIG.API_URL.replace(/\/+$/, '') + path;
const body = (item) => JSON.stringify({ email: item.email, s: item.s, p: item.p, question: item.question, answer: item.answer, id: item.id });

/** Resolves to 'ok' (saved), 'drop' (rejected for good) or 'retry'. */
export async function send(item) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(api('/answer'), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body(item),
      signal: ctrl.signal,
    });
    const d = await r.json();
    if (d?.ok) return 'ok';
    return d?.error === 'invalid' ? 'drop' : 'retry';
  } catch {
    return 'retry';
  } finally {
    clearTimeout(timer);
  }
}

/** { pillarId: ISO date of first answer } for this email. */
export async function stars(email) {
  const r = await fetch(api('/stars?email=' + encodeURIComponent(email)));
  const d = await r.json();
  return d?.stars || {};
}

/** { "1": { "1": "question text", ... }, ... } for the 3 series. */
export async function questions() {
  const r = await fetch(api('/questions'));
  const d = await r.json();
  if (!d?.ok) throw new Error('no questions');
  return d.questions || {};
}

/** Last chance when the page is being closed: the browser delivers these even after the tab
 *  is gone. The answers stay queued; a later resend is recognised as a duplicate. */
export function beacon(items) {
  if (!navigator.sendBeacon) return;
  items.forEach((item) => {
    try { navigator.sendBeacon(api('/answer'), new Blob([body(item)], { type: 'text/plain;charset=utf-8' })); } catch { /* ignore */ }
  });
}
