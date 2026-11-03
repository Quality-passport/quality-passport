// Passport: progress on the track, the star just earned, and what to do next.
// Quiz series: a pillar answered wrongly shows "No star"; at the end, the score and "See my result".
import { renderPath } from '../path.js';
import { go, register } from '../router.js';
import { state, starCount, hasStar, hasMissed, playedCount, quizOver } from '../state.js';
import { T, starSvg } from '../ui.js';
import { $, fmt, pillar } from '../util.js';

$('p-open-celebration').addEventListener('click', () => go('celebration'));
$('p-open-result').addEventListener('click', () => go('result'));

// Stars arrived late from the backend (slow restore): refresh the passport if it is on screen.
window.addEventListener('wqw:stars', () => {
  if (!$('screen-passport').hidden) go('passport');
});

register('passport', {
  show({ earned = null, missed = null, already = null } = {}) {
    const n = starCount();
    const played = playedCount(); // = n for the open-question series
    const count = $('p-count');
    count.textContent = fmt(T.count, { n });
    count.classList.toggle('done', n === 4);
    renderPath($('p-path'), { lit: hasStar, missed: hasMissed, date: (id) => state.stars[id], fresh: earned || missed });

    // The pillar just answered (or the one just rescanned), while some pillar is still to play
    const focus = played < 4 ? (earned || missed || already) : null;
    $('p-earned').hidden = !focus;
    if (focus) {
      const star = hasStar(focus);
      $('p-earned-star').replaceChildren(starSvg(star));
      $('p-earned-label').textContent = earned ? T.starEarned : missed ? T.answeredNoStar : star ? T.alreadyStamped : T.alreadyAnswered;
      $('p-earned-name').textContent = pillar(focus).name;
    }
    $('p-next').hidden = played === 4;
    $('p-complete').hidden = n !== 4;
    const over = quizOver();
    $('p-quiz-done').hidden = !over;
    if (over) $('p-quiz-score').textContent = fmt(T.quizDoneScore, { n });
  },
});
