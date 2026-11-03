// Runtime environment, derived once from the URL and CONFIG.
import { CONFIG } from '../config.js';

export const params = new URLSearchParams(location.search);
export const IDS = [1, 2, 3, 4];
export const SERIES_IDS = [1, 2, 3];
export const LETTERS = ['A', 'B', 'C', 'D']; // options of a quiz question
// Same rule as apps-script/Code.gs. First char cannot start a spreadsheet formula.
export const EMAIL_RE = /^[^@\s=+\-][^@\s]*@[^@\s]+\.[^@\s]+$/;
export const IS_LOCAL = location.protocol === 'file:' ||
  ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
// Local runs (tests, `npm run serve`) never write to the real Sheet unless ?live=1.
export const MOCK = !CONFIG.API_URL || (IS_LOCAL && params.get('live') !== '1');
export const MOCK_FAIL = params.get('mockfail') === '1';

/** Pillar id from ?p=, or null. */
export function pillarParam() {
  const p = Number(params.get('p'));
  return IDS.includes(p) ? p : null;
}

/** Series id from ?s= (the QR code's series), or null. Same rule as ?p=: "02" is 2, "1.5" is nothing. */
export function seriesParam() {
  const s = Number(params.get('s'));
  return SERIES_IDS.includes(s) ? s : null;
}

/** True for a quiz series (multiple choice, one try per pillar): CONFIG.SERIES[s].mode === 'quiz'. */
export function isQuiz(s) {
  return CONFIG.SERIES[s]?.mode === 'quiz';
}

/** Quiz question of series s, pillar p ({ question, options: {A..D}, answer }), or null (open question). */
export function quizOf(s, p) {
  return (isQuiz(s) && CONFIG.QUIZ?.[s]?.[p]) || null;
}

/** Removes ?p= from the address bar so a reload shows the passport, keeps other params. */
export function dropPillarParam() {
  if (!params.has('p')) return;
  params.delete('p');
  const q = params.toString();
  try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch { /* ignore */ }
}
