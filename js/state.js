// Local state, persisted in localStorage under 'wqw_state'.
// Storage may be unavailable (private mode, in-app browsers): the app then works for the session only.
import { IDS, SERIES_IDS } from './env.js';
import { uid } from './util.js';

const KEY = 'wqw_state';

/**
 * email: lower-cased work email
 * series: series of the QR code last scanned on this phone (1-3), sets the language; null if none yet
 * stars: { [pillarId]: ISO date of the answer | null when unknown }. One passport for all series.
 * pending: answers not yet confirmed by the backend [{ id, email, s, p, question, answer, ts }]
 *          (answers queued by an older version have no s nor question)
 * celebrated: the celebration screen was shown once
 * holder: name typed for the passport document
 */
export const state = normalize(read());

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

function normalize(s) {
  s = s && typeof s === 'object' ? s : {};
  let raw = {};
  if (Array.isArray(s.stars)) s.stars.forEach((p) => { raw[p] = null; }); // legacy [1,3]
  else if (s.stars && typeof s.stars === 'object') raw = s.stars;
  const stars = {};
  IDS.forEach((id) => { if (id in raw) stars[id] = raw[id] || null; });
  return {
    email: typeof s.email === 'string' ? s.email : '',
    series: SERIES_IDS.includes(s.series) ? s.series : null,
    stars,
    pending: Array.isArray(s.pending) ? s.pending.filter((x) => x && x.id && x.p && x.answer) : [],
    celebrated: !!s.celebrated,
    holder: typeof s.holder === 'string' ? s.holder : '',
  };
}

// Answers this tab has confirmed as sent, so a merge never brings them back.
const removed = new Set();

/** Merges what another tab saved (QR scans often open a new tab each time):
 *  stars and queued answers are only ever added, never lost. */
function mergeFromDisk() {
  const disk = normalize(read());
  Object.entries(disk.stars).forEach(([id, ts]) => { if (!(id in state.stars)) state.stars[id] = ts; });
  const known = new Set(state.pending.map((x) => x.id));
  disk.pending.forEach((x) => { if (!known.has(x.id) && !removed.has(x.id)) state.pending.push(x); });
  state.celebrated = state.celebrated || disk.celebrated;
  if (!state.email) state.email = disk.email;
  if (!state.series) state.series = disk.series;
  if (!state.holder) state.holder = disk.holder;
}

export function save() {
  try {
    mergeFromDisk();
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* session only */ }
}

/** Keeps this tab up to date when another tab saves. Returns true if something changed. */
export function syncFromOtherTabs() {
  const before = JSON.stringify(state);
  try { mergeFromDisk(); } catch { return false; }
  return JSON.stringify(state) !== before;
}

export const starCount = () => Object.keys(state.stars).length;
export const hasStar = (id) => id in state.stars;

/** Remembers the series of the QR code just scanned (it sets the language of later pages). */
export function setSeries(s) {
  if (!SERIES_IDS.includes(s) || state.series === s) return;
  state.series = s;
  save();
}

/** Records an answer to question `question` of series `s`, pillar `p`:
 *  lights the star immediately and queues the upload. */
export function recordAnswer(s, p, question, answer) {
  const ts = new Date().toISOString();
  state.stars[p] = ts;
  state.pending.push({ id: uid(), email: state.email, s, p, question, answer, ts });
  save();
}

/** Merges stars known by the backend ({ pillarId: ISO date }). Local dates win. */
export function mergeStars(remote) {
  Object.entries(remote || {}).forEach(([k, ts]) => {
    const id = Number(k);
    if (IDS.includes(id) && !(id in state.stars)) state.stars[id] = ts || null;
  });
  save();
}

export function removePending(id) {
  removed.add(id);
  state.pending = state.pending.filter((x) => x.id !== id);
  save();
}
