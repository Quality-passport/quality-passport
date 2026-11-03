// Entry point: series and language, questions, theme, texts, sync, then the first screen.
import { seriesParam } from './env.js';
import { applyLogo } from './logo.js';
import { drawPassport } from './passport/draw.js';
import { preloadPdf } from './passport/pdf.js';
import { loadQuestions } from './questions.js';
import { restoreStars, retryRestoreInBackground, startAutoFlush } from './queue.js';
import { initSyncStatus } from './sync-status.js';
import { go, route } from './router.js';
import { playedCount, setSeries, state, syncFromOtherTabs } from './state.js';
import { T, applyStaticText, applyTheme, checkConfig } from './ui.js';
import { nameFromEmail } from './util.js';
import './screens/loading.js';
import './screens/welcome.js';
import './screens/question.js';
import './screens/passport.js';
import './screens/celebration.js';
import './screens/quiz.js';
import './screens/result.js';

// The QR code's series is remembered: it sets the language of later pages without a series.
setSeries(seriesParam());
// Questions are asked for at once: on a first scan they arrive while the email is typed.
loadQuestions();
applyTheme();
applyStaticText();
checkConfig();
applyLogo();
initSyncStatus();
startAutoFlush();
// Another tab (a new QR scan) saved: take its stars and queued answers in.
window.addEventListener('storage', (e) => { if (e.key === 'wqw_state') syncFromOtherTabs(); });

// Known email but no pillar played here (new browser, cleared storage): ask the backend first.
if (state.email && playedCount() === 0) {
  go('loading', { text: T.checking });
  restoreStars().then((ok) => { route(); if (!ok) retryRestoreInBackground(); });
} else {
  route();
}

setTimeout(preloadPdf, 1500);

// Read-only hook for automated tests.
window.__wqw = {
  state: () => structuredClone(state),
  nameFromEmail,
  passportImage: async (name) => (await drawPassport(name)).toDataURL('image/jpeg', 0.9),
};
