// Question: one open question per pillar and series. Any non-blank answer earns the star.
// The answer is saved with the exact question shown (questions can change in the Sheet at any time).
import { CONFIG } from '../../config.js';
import { dropPillarParam, IDS } from '../env.js';
import { questionText } from '../questions.js';
import { flush } from '../queue.js';
import { go, register } from '../router.js';
import { state, recordAnswer, starCount, hasStar } from '../state.js';
import { iconSvg } from '../icons.js';
import { T, starSvg } from '../ui.js';
import { $, fmt, pillar } from '../util.js';

const answer = $('answer');
const submit = $('submit-btn');
const counter = $('answer-counter');
let current = null; // { series, pillar } on screen

function update() {
  const v = answer.value;
  submit.disabled = v.trim().length < CONFIG.MIN_CHARS;
  const left = CONFIG.MAX_CHARS - v.length;
  counter.textContent = left <= 200 ? `${v.length} / ${CONFIG.MAX_CHARS}` : '';
}
answer.addEventListener('input', update);

$('question-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = answer.value.trim().slice(0, CONFIG.MAX_CHARS);
  if (!current || text.length < CONFIG.MIN_CHARS) return;
  const { series, pillar: p } = current;
  current = null;
  recordAnswer(series, p, $('q-text').textContent, text);
  dropPillarParam();
  if (starCount() === 4 && !state.celebrated) go('celebration');
  else go('passport', { earned: p });
  flush(); // background, never blocks the participant
});

document.querySelectorAll('[data-go="passport"]').forEach((el) => el.addEventListener('click', () => go('passport')));

// A newer version of the questions arrived: update the question on screen,
// unless the participant has started writing (the text they answer must not change).
window.addEventListener('wqw:questions', () => {
  if (!current || $('screen-question').hidden || answer.value) return;
  $('q-text').textContent = questionText(current.series, current.pillar);
});

register('question', {
  show({ series, pillar: id }) {
    const p = pillar(id);
    current = { series, pillar: id };
    $('q-label').textContent = fmt(T.pillarLabel, { n: id });
    $('q-name').textContent = p.name;
    $('q-text').textContent = questionText(series, id);
    $('q-icon').replaceChildren(iconSvg(p.icon));
    $('q-mini-stars').replaceChildren(...IDS.map((i) => starSvg(hasStar(i))));
    answer.maxLength = CONFIG.MAX_CHARS;
    answer.placeholder = T.answerHint;
    answer.value = '';
    update();
  },
});
