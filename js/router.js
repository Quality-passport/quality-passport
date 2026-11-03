// Screen registry and routing. Screens register themselves; navigation goes through go().
import { pillarParam, quizOf, seriesParam } from './env.js';
import { haveQuestions, waitForQuestions } from './questions.js';
import { state, starCount, hasPlayed, quizOver } from './state.js';
import { T } from './ui.js';

// First question on a phone that has no questions yet: wait for them at most this long,
// then show the default question.
const QUESTION_WAIT_MS = 5000;

const screens = {};

/** screen = { show(opts) } ; its DOM section is #screen-<name>. */
export function register(name, screen) { screens[name] = screen; }

/** Shows one screen, hides the others, moves focus to its title. */
export function go(name, opts) {
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== `screen-${name}`; });
  document.body.style.background = name === 'celebration' ? 'var(--ipsen-navy)' : '';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', name === 'celebration' ? '#000e56' : '#f7f6f2');
  screens[name]?.show(opts);
  window.scrollTo(0, 0);
  document.querySelector(`#screen-${name} h1`)?.focus({ preventScroll: true });
}

/** Decides the screen from the URL (?s=S&p=N) and the local state.
 *  A question opens only with a valid series AND pillar; without a series, ?p= is ignored.
 *  One passport for all series: a pillar played in any series (star, or quiz answered wrongly)
 *  shows the passport, never its question again. A quiz series opens its multiple-choice question. */
export function route() {
  if (!state.email) return go('welcome');
  const s = seriesParam();
  const p = s ? pillarParam() : null;
  if (p && !hasPlayed(p)) {
    if (quizOf(s, p)) return go('quiz', { series: s, pillar: p });
    if (haveQuestions()) return go('question', { series: s, pillar: p });
    go('loading', { text: T.loadingQuestion });
    waitForQuestions(QUESTION_WAIT_MS).then(() => {
      if (!$loadingShown()) return; // the participant moved on meanwhile
      if (hasPlayed(p)) return route(); // answered in another tab meanwhile
      go('question', { series: s, pillar: p });
    });
    return;
  }
  if (starCount() === 4 && !state.celebrated) return go('celebration');
  if (quizOver() && !state.resultShown) return go('result');
  go('passport', { already: p });
}

const $loadingShown = () => !document.getElementById('screen-loading').hidden;
