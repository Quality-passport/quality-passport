// Language of the page, fixed at load: the series of the QR code scanned, else the series
// last scanned on this phone, else the phone's own language (French if it starts with "fr").
// Also formats dates in that language.
import { CONFIG } from '../config.js';
import { seriesParam } from './env.js';
import { state } from './state.js';

/** Series of this page (URL first, then the phone's last series), or null. */
export const PAGE_SERIES = seriesParam() || state.series || null;

function phoneLang() {
  try { return String(navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en'; } catch { return 'en'; }
}

const wanted = PAGE_SERIES ? CONFIG.SERIES[PAGE_SERIES]?.lang : phoneLang();
export const LANG = CONFIG.TEXT[wanted] ? wanted : 'en';

const LOCALE = { en: 'en-GB', fr: 'fr-FR' };
const DATE_FORMATS = {
  short: { day: 'numeric', month: 'short' },                  // 24 Sept · 24 sept.
  stamp: { day: 'numeric', month: 'short', year: 'numeric' }, // 24 Sept 2026 · 24 sept. 2026
  long: { day: 'numeric', month: 'long', year: 'numeric' },   // 24 September 2026 · 24 septembre 2026
};
/** ISO string -> formatted date; format: 'short' | 'stamp' | 'long' (true = long).
 *  English dates are British (day before month) whatever the country; in French, the 1st is "1er". */
export function fmtDate(iso, format = 'short') {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const out = d.toLocaleDateString(LOCALE[LANG] || 'en-GB', DATE_FORMATS[format === true ? 'long' : format] || DATE_FORMATS.short);
  return LANG === 'fr' && d.getDate() === 1 ? out.replace(/^1(?=\s)/, '1er') : out;
}
