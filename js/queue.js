// Offline-first sync: answers are queued locally and sent in the background.
// A failed send stays in the queue and is retried later, silently.
import { backend } from './backend/index.js';
import { state, removePending, mergeRemote } from './state.js';
import { withTimeout } from './util.js';

const RETRY_EVERY_MS = 30000;
let flushing = null;

/** Sends queued answers in order; stops at the first failure. */
// Busy or failed send: try again after 4 to 10 s (random, so a crowd does not resend at the same instant).
let soon = null;
function retrySoon() {
  if (soon) return;
  soon = setTimeout(() => { soon = null; flush(); }, 4000 + Math.random() * 6000);
}

/** Tells the screens how sending goes: 'sending' | 'saved' | 'waiting' (queued, will retry). */
function status(s) { window.dispatchEvent(new CustomEvent('wqw:sync', { detail: s })); }

export function flush() {
  if (flushing) return flushing;
  if (!state.pending.length) return Promise.resolve();
  status('sending');
  const run = (async () => {
    await null; // always async, so `flushing` is set before the loop can finish
    try {
      while (state.pending.length) {
        const item = state.pending[0];
        const r = await backend.send(item);
        if (r === 'retry') { retrySoon(); break; }
        removePending(item.id); // 'ok' or 'drop' (invalid for good)
      }
    } catch { /* retry later */ }
  })();
  flushing = run.finally(() => {
    flushing = null;
    status(state.pending.length ? 'waiting' : 'saved');
  });
  return flushing;
}

/** Retries on launch, on reconnection, on return to the tab, and every 30 s
 *  (event wifi often comes back without firing 'online'). */
export function startAutoFlush() {
  flush();
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });
  setInterval(() => { if (state.pending.length) flush(); }, RETRY_EVERY_MS);
  // Page being closed or hidden with answers still queued: hand them to the browser.
  const lastChance = () => { if (state.pending.length) backend.beacon(state.pending); };
  window.addEventListener('pagehide', lastChance);
  document.addEventListener('visibilitychange', () => { if (document.hidden) lastChance(); });
}

/** Restores stars earned in another browser, and quiz pillars answered wrongly there.
 *  Resolves to true when the backend answered. Generous timeout for poor event wifi. */
export async function restoreStars(timeoutMs = 15000) {
  try {
    const before = JSON.stringify([state.stars, state.missed]);
    mergeRemote(await withTimeout(backend.stars(state.email), timeoutMs));
    if (JSON.stringify([state.stars, state.missed]) !== before) window.dispatchEvent(new Event('wqw:stars'));
    return true;
  } catch {
    return false; // offline or slow: keep the local state
  }
}

/** Keeps trying in the background (every 20 s, 5 times) after a failed restore. */
export function retryRestoreInBackground(attempts = 5) {
  if (attempts <= 0 || !state.email) return;
  setTimeout(async () => {
    if (!(await restoreStars(25000))) retryRestoreInBackground(attempts - 1);
  }, 20000);
}
