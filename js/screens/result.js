// End of the quiz with fewer than 4 stars: the score and a thank-you. Never a second try, nor a
// "next time": a pillar is played once. Shown once after the last pillar, then from the passport
// ("See my result"). With 4 stars, the celebration is shown instead, as in every series.
import { IDS } from '../env.js';
import { go, register } from '../router.js';
import { state, save, starCount } from '../state.js';
import { T, starSvg } from '../ui.js';
import { $, fmt } from '../util.js';

$('r-back').addEventListener('click', () => go('passport'));

register('result', {
  show() {
    state.resultShown = true;
    save();
    const n = starCount();
    $('r-stars').replaceChildren(...IDS.map((_, i) => starSvg(i < n)));
    $('r-title').textContent = T[`resultTitle${n}`] || fmt(T.quizDoneScore, { n });
    $('r-score').textContent = fmt(T.quizDoneScore, { n }); // read by screen readers (the stars are pictures)
  },
});
