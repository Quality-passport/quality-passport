// Shared UI helpers: static texts (in the page's language), theme, config checks, toast, star icon.
import { CONFIG } from '../config.js';
import { IS_LOCAL, LETTERS, MOCK, SERIES_IDS, isQuiz } from './env.js';
import { LANG, PAGE_SERIES } from './lang.js';
import { $ } from './util.js';

const TEXTS = CONFIG.TEXT[LANG];
/** Interface texts in the language of this page (see lang.js). A quiz series announces its rule
 *  (one try, right answers only) on the welcome screen; everything else is shared. */
export const T = isQuiz(PAGE_SERIES) ? { ...TEXTS, welcomeSubtitle: TEXTS.quizWelcomeSubtitle } : TEXTS;

export function applyTheme() {
  const map = { primary: '--primary', accent: '--accent', surface: '--surface', star: '--star' };
  Object.entries(map).forEach(([k, v]) => {
    if (CONFIG.THEME?.[k]) document.documentElement.style.setProperty(v, CONFIG.THEME[k]);
  });
}

/** Fills [data-t] with TEXT keys and [data-config] with CONFIG keys; sets the page language and title. */
export function applyStaticText() {
  document.documentElement.lang = LANG;
  document.title = T.pageTitle;
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = T[el.dataset.t] ?? ''; });
  document.querySelectorAll('[data-config]').forEach((el) => { el.textContent = CONFIG[el.dataset.config] ?? ''; });
}

/** Configuration checks, reported in the browser console only (developers), never on screen. */
export function checkConfig() {
  const problems = [];
  const placeholder = /\bTODO\b|lorem|ipsum/i;
  const ids = CONFIG.PILLARS.map((p) => p.id).sort().join(',');
  if (ids !== '1,2,3,4') problems.push('PILLARS must have ids 1 to 4');
  if (CONFIG.PILLARS.some((p) => placeholder.test(p.name))) problems.push('pillar names are placeholders');
  SERIES_IDS.forEach((s) => { if (!CONFIG.TEXT[CONFIG.SERIES[s]?.lang]) problems.push(`series ${s} has no texts for its language`); });
  SERIES_IDS.filter(isQuiz).forEach((s) => CONFIG.PILLARS.forEach(({ id }) => {
    const q = CONFIG.QUIZ?.[s]?.[id];
    if (!q?.question || !LETTERS.every((l) => q.options?.[l]) || !LETTERS.includes(q.answer)) {
      problems.push(`quiz of series ${s}, pillar ${id}: question, options A-D and answer needed (open question shown instead)`);
    }
  }));
  const keys = Object.keys(CONFIG.TEXT.en);
  Object.entries(CONFIG.TEXT).forEach(([lang, texts]) => {
    const missing = keys.filter((k) => !texts[k]);
    if (missing.length) problems.push(`TEXT.${lang} misses ${missing.join(', ')}`);
    if (Object.values(texts).some((v) => placeholder.test(v))) problems.push(`TEXT.${lang} has placeholders`);
  });
  if (MOCK) problems.push(IS_LOCAL ? 'mock mode: answers stay in this browser' : 'API_URL is empty, answers are not saved');
  if (problems.length) console.warn('[Quality Passport] Config: ' + problems.join(' · '));
}

let toastTimer;
export function toast(msg, ms = 3500) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const STAR_PATH = 'M12 1.8l3.05 6.6 7.2.72-5.4 4.86 1.56 7.1L12 17.4l-6.4 3.7 1.55-7.1L1.75 9.1l7.2-.72z';

export function starSvg(lit) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'star-svg');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', STAR_PATH);
  path.setAttribute('stroke-linejoin', 'round');
  if (lit) {
    path.setAttribute('fill', 'var(--star)');
  } else {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--line-strong)');
    path.setAttribute('stroke-width', '1.2');
  }
  svg.appendChild(path);
  return svg;
}

export function fillStars(el, n, lit) {
  el.replaceChildren(...Array.from({ length: n }, (_, i) => starSvg(i < lit)));
}

/** Button label swap while an async action runs. */
export function busy(btn, on) {
  btn.disabled = on;
  btn.textContent = on ? T.preparing : T[btn.dataset.t];
}
