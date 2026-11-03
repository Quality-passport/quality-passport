// Quiz (series 2): one multiple-choice question per pillar. Choose, confirm, and see the verdict at once
// (worked out on the phone: no network needed). Right: the star. Wrong: no star, and the pillar is never
// played again. The open-question screen (question.js) is not used by a quiz series.
import { dropPillarParam, IDS, LETTERS, quizOf } from '../env.js';
import { iconSvg } from '../icons.js';
import { flush } from '../queue.js';
import { go, register } from '../router.js';
import { state, hasPlayed, hasStar, quizOver, recordQuizAnswer, starCount, syncFromOtherTabs } from '../state.js';
import { T, starSvg } from '../ui.js';
import { $, fmt, pillar } from '../util.js';

const form = $('quiz-form');
const options = $('qz-options');
const confirmBtn = $('qz-confirm');
const nextBtn = $('qz-next');
const verdict = $('qz-verdict');
let current = null; // { series, pillar, quiz } on screen, until the answer is confirmed
let next = null;    // [screen, opts] that "Continue" leads to

const chosen = () => options.querySelector('input:checked')?.value || null;

options.addEventListener('change', () => {
  options.querySelectorAll('.qz-option').forEach((el) => el.classList.toggle('selected', el.dataset.letter === chosen()));
  confirmBtn.disabled = !current || !chosen();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const letter = chosen();
  if (!current || !letter) return;
  const { series, pillar: p, quiz } = current;
  current = null; // a second tap does nothing
  // Answered in another tab meanwhile (the same QR code scanned twice): nothing is recorded.
  syncFromOtherTabs();
  if (hasPlayed(p)) {
    dropPillarParam();
    go('passport', { already: p });
    return;
  }
  const right = letter === quiz.answer;
  recordQuizAnswer(series, p, quiz.question, `${letter}. ${quiz.options[letter]}`, letter, right);
  dropPillarParam(); // a reload now shows the passport
  showVerdict(letter, quiz.answer, right);
  if (starCount() === 4 && !state.celebrated) next = ['celebration'];
  else if (quizOver() && !state.resultShown) next = ['result'];
  else next = ['passport', right ? { earned: p } : { missed: p }];
  flush(); // background, never blocks the participant
});

nextBtn.addEventListener('click', () => {
  const [name, opts] = next || ['passport'];
  next = null;
  go(name, opts);
});

/** Options frozen; the right one marked ✓, a wrong choice marked ✕; a sentence says it too. */
function showVerdict(letter, answer, right) {
  options.querySelectorAll('input').forEach((input) => { input.disabled = true; });
  options.querySelectorAll('.qz-option').forEach((el) => {
    const l = el.dataset.letter;
    el.classList.toggle('right', l === answer);
    el.classList.toggle('wrong', l === letter && !right);
    el.querySelector('.qz-mark').textContent = l === answer ? '✓' : l === letter ? '✕' : '';
  });
  $('qz-mini-stars').replaceChildren(...IDS.map((i) => starSvg(hasStar(i)))); // the star just earned lights up here too
  verdict.textContent = right ? T.quizRight : fmt(T.quizWrong, { letter: answer });
  verdict.className = `qz-verdict ${right ? 'right' : 'wrong'}`;
  verdict.hidden = false;
  $('qz-intro').style.visibility = 'hidden'; // keeps its room: the options do not jump
  confirmBtn.hidden = true;
  nextBtn.hidden = false;
  // Small phones (iPhone SE): bring the verdict and "Continue" into view; no effect when everything fits.
  nextBtn.scrollIntoView({ block: 'nearest' });
}

function option(letter, text) {
  const label = document.createElement('label');
  label.className = 'qz-option';
  label.dataset.letter = letter;
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'qz';
  input.value = letter;
  const sr = document.createElement('span');
  sr.className = 'visually-hidden';
  sr.textContent = `${fmt(T.quizOption, { letter })}: `;
  const badge = document.createElement('span');
  badge.className = 'qz-letter';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = letter;
  const body = document.createElement('span');
  body.className = 'qz-text';
  body.textContent = text;
  const mark = document.createElement('span');
  mark.className = 'qz-mark';
  mark.setAttribute('aria-hidden', 'true');
  label.append(input, sr, badge, body, mark);
  return label;
}

register('quiz', {
  show({ series, pillar: id }) {
    const p = pillar(id);
    const quiz = quizOf(series, id);
    current = { series, pillar: id, quiz };
    next = null;
    $('qz-label').textContent = fmt(T.pillarLabel, { n: id });
    $('qz-name').textContent = p.name;
    $('qz-icon').replaceChildren(iconSvg(p.icon));
    $('qz-mini-stars').replaceChildren(...IDS.map((i) => starSvg(hasStar(i))));
    $('qz-question').textContent = quiz.question;
    $('qz-intro').textContent = T.quizIntro;
    $('qz-intro').style.visibility = '';
    options.replaceChildren(...LETTERS.map((l) => option(l, quiz.options[l])));
    verdict.hidden = true;
    verdict.textContent = '';
    confirmBtn.hidden = false;
    confirmBtn.disabled = true;
    nextBtn.hidden = true;
  },
});
