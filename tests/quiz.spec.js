// Series 2 quiz, in mock mode. Test ids (QZ-, FN-) refer to the local test plan
// "Quality Passport quiz série 2 recette.md"; the rules (RQ-) to "Quality Passport quiz série 2 spec.md".
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../config.js';

const EMAIL = 'helene.muller@ipsen.com';
const EN = CONFIG.TEXT.en;
const SHOTS = fileURLToPath(new URL('./screenshots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const RIGHT = { 1: 'A', 2: 'D', 3: 'C', 4: 'C' };
const TS = '2026-11-06T09:00:00.000Z';
// Mock sheet row: [Timestamp, Email, Pillar, Answer, ClientId, Series, Question, Correct, Choice]
const C = { ANSWER: 3, ID: 4, SERIES: 5, QUESTION: 6, CORRECT: 7, CHOICE: 8 };

const sheet = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('wqw_mock_sheet') || '[]'));
const state = (page) => page.evaluate(() => window.__wqw.state());
const visible = (page, name) => expect(page.locator(`#screen-${name}`)).toBeVisible();
const fresh = (extra = {}) => ({ wqw_state: { email: EMAIL, stars: {}, pending: [], ...extra } });

async function seed(page, value, path = '') {
  await page.goto('');
  await page.evaluate((v) => { localStorage.clear(); Object.entries(v).forEach(([k, x]) => localStorage.setItem(k, JSON.stringify(x))); }, value);
  await page.goto(path);
}

/** Opens ?s=2&p=P, picks `letter`, confirms: the verdict is on screen. */
async function play(page, p, letter) {
  await page.goto(`?s=2&p=${p}`);
  await visible(page, 'quiz');
  await page.click(`.qz-option[data-letter="${letter}"]`);
  await page.click('#qz-confirm');
  await expect(page.locator('#qz-verdict')).toBeVisible();
}

test.describe('quiz screen', () => {
  test('QZ-15. the quiz is the one given on 3 Nov, character for character', async ({}, info) => {
    test.skip(info.project.name !== 'iPhone 13', 'data only');
    expect(CONFIG.SERIES[2].mode).toBe('quiz');
    expect(CONFIG.SERIES[1].mode).toBeUndefined();
    expect(CONFIG.SERIES[3].mode).toBeUndefined();
    expect(CONFIG.QUIZ[2]).toEqual({
      1: { question: 'How does Quality help ensure business continuity?', answer: 'A', options: {
        A: 'By assessing risks, planning preventively and collaborating across functions', B: 'By reducing product prices',
        C: 'By reacting only after disruptions occur', D: 'By increasing the number of approvals required' } },
      2: { question: 'What is the main benefit of effective complaint management?', answer: 'D', options: {
        A: 'Reducing the number of patients using the product', B: 'Eliminating the need for documentation',
        C: 'Shortening regulatory requirements', D: 'Learning from feedback to improve quality, compliance and patient protection' } },
      3: { question: 'Why are approved templates valuable?', answer: 'C', options: {
        A: 'They make documents longer', B: 'They replace content review',
        C: 'They reduce errors, save time and simplify reviews', D: 'They eliminate the need for training' } },
      4: { question: 'At what point should Quality become involved in an innovative (GxP) project?', answer: 'C', options: {
        A: 'When the idea is ready to launch', B: 'When a problem occurs', C: 'From the start', D: 'As the final checkpoint in the flow' } },
    });
  });

  test('QZ-01. right answer: verdict at once, star, answer saved with its verdict', async ({ page }) => {
    await seed(page, fresh(), '?s=2&p=3');
    await visible(page, 'quiz');
    await expect(page.locator('#qz-label')).toHaveText('Pillar 3 of 4');
    await expect(page.locator('#qz-name')).toHaveText('Efficiency & Speed');
    await expect(page.locator('#qz-question')).toHaveText('Why are approved templates valuable?');
    await expect(page.locator('.qz-letter')).toHaveText(['A', 'B', 'C', 'D']);
    await expect(page.locator('.qz-text')).toHaveText(['They make documents longer', 'They replace content review', 'They reduce errors, save time and simplify reviews', 'They eliminate the need for training']);
    await expect(page.locator('#qz-intro')).toHaveText('One try. Choose carefully.');
    await expect(page.locator('#screen-quiz')).not.toContainText('No right or wrong answer');
    await expect(page.locator('#qz-confirm')).toBeDisabled();
    await page.click('.qz-option[data-letter="C"]');
    await expect(page.locator('#qz-confirm')).toBeEnabled();
    await page.click('#qz-confirm');
    await expect(page.locator('#qz-verdict')).toHaveText('Right answer. Star earned.');
    await expect(page.locator('#qz-mini-stars .star-svg path[fill="var(--star)"]')).toHaveCount(1); // B2: lit at once
    await expect(page.locator('#qz-options input:enabled')).toHaveCount(0);
    await expect(page.locator('.qz-option.right')).toHaveAttribute('data-letter', 'C');
    await expect(page.locator('.qz-option.wrong')).toHaveCount(0);
    await expect(page.locator('.qz-option[data-letter="C"] .qz-mark')).toHaveText('✓');
    await expect(page.locator('#qz-confirm')).toBeHidden();
    expect(new URL(page.url()).search).toBe('?s=2');
    await expect.poll(async () => (await sheet(page)).length).toBe(1);
    const [row] = await sheet(page);
    expect([row[1], row[2], row[C.SERIES], row[C.QUESTION], row[C.ANSWER], row[C.CORRECT], row[C.CHOICE]])
      .toEqual([EMAIL, 3, 2, 'Why are approved templates valuable?', 'C. They reduce errors, save time and simplify reviews', true, 'C']);
    await page.click('#qz-next');
    await visible(page, 'passport');
    await expect(page.locator('#p-count')).toHaveText('1 of 4');
    await expect(page.locator('#p-earned-label')).toHaveText('Star earned');
    await expect(page.locator('#p-earned-name')).toHaveText('Efficiency & Speed');
  });

  test('QZ-02. wrong answer: the right one shown, no star, the pillar shows "No star"', async ({ page }) => {
    await seed(page, fresh(), '?s=2&p=1');
    await visible(page, 'quiz');
    await page.click('.qz-option[data-letter="B"]');
    await page.click('#qz-confirm');
    await expect(page.locator('#qz-verdict')).toHaveText('Not quite. The right answer is A.');
    await expect(page.locator('.qz-option.wrong')).toHaveAttribute('data-letter', 'B');
    await expect(page.locator('.qz-option.right')).toHaveAttribute('data-letter', 'A');
    await expect(page.locator('.qz-mark')).toHaveText(['✓', '✕', '', '']);
    await expect.poll(async () => (await sheet(page)).length).toBe(1);
    const [row] = await sheet(page);
    expect([row[C.ANSWER], row[C.CORRECT], row[C.CHOICE]]).toEqual(['B. By reducing product prices', false, 'B']);
    const s = await state(page);
    expect([Object.keys(s.stars), Object.keys(s.missed)]).toEqual([[], ['1']]);
    await page.click('#qz-next');
    await visible(page, 'passport');
    await expect(page.locator('#p-count')).toHaveText('0 of 4');
    await expect(page.locator('#p-title')).toHaveText('My Quality Passport'); // still to play: the usual title
    await expect(page.locator('#p-earned-label')).toHaveText('Answered, no star');
    await expect(page.locator('#p-earned-name')).toHaveText('Quality as Enabler');
    const node = page.locator('.node').first();
    await expect(node).toHaveClass(/missed/);
    await expect(node).toHaveAttribute('aria-label', 'Quality as Enabler: answered, no star');
    await expect(node.locator('.lbl')).toHaveText('Quality as Enabler');
    await expect(node.locator('.date')).toHaveText('No star');
    await expect(node.locator('.slot .star-svg')).toHaveCount(0);
    await expect(page.locator('#p-next')).toBeVisible();
  });

  test('QZ-03. changing one\'s mind before confirming: only the last choice counts', async ({ page }) => {
    await seed(page, fresh(), '?s=2&p=2');
    await visible(page, 'quiz');
    await page.click('.qz-option[data-letter="A"]');
    await page.click('.qz-option[data-letter="D"]');
    await expect(page.locator('.qz-option.selected')).toHaveCount(1);
    await expect(page.locator('.qz-option.selected')).toHaveAttribute('data-letter', 'D');
    await page.click('#qz-confirm');
    await expect.poll(async () => (await sheet(page)).length).toBe(1);
    const [row] = await sheet(page);
    expect([row[C.ANSWER], row[C.CORRECT]]).toEqual(['D. Learning from feedback to improve quality, compliance and patient protection', true]);
  });

  test('QZ-04. every answer of every pillar: a star only for A, D, C, C', async ({ page }) => {
    for (const p of [1, 2, 3, 4]) {
      for (const letter of ['A', 'B', 'C', 'D']) {
        await seed(page, fresh());
        await play(page, p, letter);
        const s = await state(page);
        const right = RIGHT[p] === letter;
        expect([p, letter, p in s.stars, p in s.missed]).toEqual([p, letter, right, !right]);
      }
    }
  });

  test('QZ-05/17. a played pillar never reopens: "Already answered" or "Already stamped"', async ({ page }) => {
    await seed(page, fresh({ series: 2, stars: { 3: TS, 2: TS }, missed: { 1: TS } }), '?s=2&p=1');
    await visible(page, 'passport');
    await expect(page.locator('#p-earned-label')).toHaveText('Already answered');
    await expect(page.locator('#p-earned-name')).toHaveText('Quality as Enabler');
    await page.goto('?s=2&p=3');
    await visible(page, 'passport');
    await expect(page.locator('#p-earned-label')).toHaveText('Already stamped');
    await page.goto('?s=2&p=2'); // QZ-17: pillar 2 starred (an open answer, any series): no quiz
    await visible(page, 'passport');
    await expect(page.locator('#p-earned-label')).toHaveText('Already stamped');
  });

  test('QZ-05b. a pillar answered wrongly in the quiz does not open the open question of another series', async ({ page }) => {
    await seed(page, fresh({ series: 2, missed: { 2: TS } }), '?s=1&p=2');
    await visible(page, 'passport');
    await expect(page.locator('#p-earned-label')).toHaveText('Déjà répondu');
  });

  test('QZ-06. reload during the verdict: the passport, the pillar is played', async ({ page }) => {
    await seed(page, fresh());
    await play(page, 4, 'C');
    await page.reload();
    await visible(page, 'passport');
    expect(Object.keys((await state(page)).stars)).toEqual(['4']);
  });

  test('QZ-07. back to the passport before confirming: nothing recorded, the question opens again', async ({ page }) => {
    await seed(page, fresh(), '?s=2&p=4');
    await visible(page, 'quiz');
    await page.click('.qz-option[data-letter="C"]');
    await page.click('#screen-quiz [data-go="passport"]');
    await visible(page, 'passport');
    await expect(page.locator('.node').nth(3)).toHaveClass(/hidden-pillar/);
    await page.goto('?s=2&p=4');
    await visible(page, 'quiz');
    await expect(page.locator('#qz-options input:checked')).toHaveCount(0);
    await expect(page.locator('#qz-confirm')).toBeDisabled();
    await page.waitForTimeout(1000);
    expect(await sheet(page)).toHaveLength(0);
  });

  test('QZ-08. double tap on confirm: one answer', async ({ page }) => {
    await seed(page, fresh(), '?s=2&p=3');
    await visible(page, 'quiz');
    await page.click('.qz-option[data-letter="C"]');
    await page.evaluate(() => { const b = document.getElementById('qz-confirm'); b.click(); b.click(); });
    await expect(page.locator('#qz-verdict')).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await sheet(page)).toHaveLength(1);
    expect((await state(page)).pending).toHaveLength(0);
  });

  test('QZ-09. offline: verdict at once, the answer leaves with its verdict when the network is back', async ({ page }) => {
    await seed(page, fresh(), '?s=2&p=3&mockfail=1');
    await visible(page, 'quiz');
    await page.click('.qz-option[data-letter="C"]');
    await page.click('#qz-confirm');
    await expect(page.locator('#qz-verdict')).toHaveText('Right answer. Star earned.');
    await page.waitForTimeout(1200);
    const s = await state(page);
    expect([s.pending.length, s.pending[0].choice, s.pending[0].correct]).toEqual([1, 'C', true]);
    await page.goto('?s=2');
    await expect.poll(async () => (await state(page)).pending.length, { timeout: 5000 }).toBe(0);
    const [row] = await sheet(page);
    expect([row[C.CORRECT], row[C.CHOICE]]).toEqual([true, 'C']);
  });

  test('QZ-10. two tabs on the same question: the second records nothing', async ({ page, context }) => {
    await seed(page, fresh(), '?s=2&p=4');
    await visible(page, 'quiz');
    const other = await context.newPage();
    await other.goto('?s=2&p=4');
    await visible(other, 'quiz');
    await page.click('.qz-option[data-letter="B"]');
    await page.click('#qz-confirm');
    await expect(page.locator('#qz-verdict')).toHaveText('Not quite. The right answer is C.');
    await other.click('.qz-option[data-letter="C"]');
    await other.click('#qz-confirm');
    await visible(other, 'passport');
    await expect(other.locator('#p-earned-label')).toHaveText('Already answered');
    await expect.poll(async () => (await sheet(page)).length).toBe(1);
    await page.waitForTimeout(1500);
    const rows = await sheet(page);
    expect(rows.map((r) => r[C.CHOICE])).toEqual(['B']);
    const s = await state(other);
    expect([4 in s.stars, 4 in s.missed]).toEqual([false, true]);
  });

  test('QZ-11/FN-06. new browser, same email: stars and pillars answered wrongly come back', async ({ page, browser }, info) => {
    const q = (p) => CONFIG.QUIZ[2][p].question;
    const rows = [
      [TS, EMAIL, 3, 'C. They reduce errors, save time and simplify reviews', 'id-a', 2, q(3), true, 'C'],
      [TS, EMAIL, 1, 'B. By reducing product prices', 'id-b', 2, q(1), false, 'B'],
    ];
    const ctx = await browser.newContext({ ...info.project.use });
    const other = await ctx.newPage();
    await other.addInitScript((r) => {
      if (!sessionStorage.getItem('seeded')) { localStorage.setItem('wqw_mock_sheet', JSON.stringify(r)); sessionStorage.setItem('seeded', '1'); }
    }, rows);
    const url = (path) => new URL(path, info.project.use.baseURL || 'http://localhost:4174/').href;
    await other.goto(url('?s=2&p=1'));
    await visible(other, 'welcome');
    await other.fill('#email', EMAIL);
    await other.click('#welcome-btn');
    await visible(other, 'passport');
    await expect(other.locator('#p-earned-label')).toHaveText('Already answered');
    await expect(other.locator('#p-count')).toHaveText('1 of 4');
    await expect(other.locator('.node').nth(0)).toHaveClass(/missed/);
    await expect(other.locator('.node').nth(2)).toHaveClass(/\bon\b/);
    // FN-06: the two other pillars played elsewhere too: the end screen, once
    await other.evaluate((r) => localStorage.setItem('wqw_mock_sheet', JSON.stringify(r)), [...rows,
      [TS, EMAIL, 2, 'D. Learning from feedback to improve quality, compliance and patient protection', 'id-c', 2, q(2), true, 'D'],
      [TS, EMAIL, 4, 'C. From the start', 'id-d', 2, q(4), true, 'C']]);
    await other.evaluate(() => { const s = JSON.parse(localStorage.getItem('wqw_state')); s.stars = {}; s.missed = {}; localStorage.setItem('wqw_state', JSON.stringify(s)); });
    await other.goto(url(''));
    await visible(other, 'result');
    await expect(other.locator('#r-title')).toHaveText('Four pillars. Three stars.');
    await other.goto(url(''));
    await visible(other, 'passport');
    await ctx.close();
  });

  test('QZ-12. the welcome screen of series 2 announces the rule; series 3 keeps its text', async ({ page }) => {
    await page.goto('?s=3&p=1');
    await visible(page, 'welcome');
    await expect(page.locator('#screen-welcome .lead')).toHaveText(EN.welcomeSubtitle);
    await page.goto('?s=2&p=1');
    await visible(page, 'welcome');
    await expect(page.locator('#screen-welcome h1')).toHaveText(EN.welcomeTitle);
    await expect(page.locator('#screen-welcome .lead')).toHaveText('Four pillars, one question each, one try. Every right answer earns a star.');
    await page.fill('#email', EMAIL);
    await page.click('#welcome-btn');
    await visible(page, 'quiz');
  });

  test('QZ-13. accessible: a radio group, options named, keyboard, verdict announced', async ({ page }) => {
    await seed(page, fresh(), '?s=2&p=3');
    await visible(page, 'quiz');
    const group = page.getByRole('radiogroup', { name: 'Why are approved templates valuable?' });
    await expect(group.getByRole('radio')).toHaveCount(4);
    const c = page.getByRole('radio', { name: 'Answer C: They reduce errors, save time and simplify reviews' });
    await c.focus();
    await page.keyboard.press('Space');
    await expect(c).toBeChecked();
    await expect(page.locator('#qz-confirm')).toBeEnabled();
    await page.keyboard.press('Enter'); // submits the form
    await expect(page.locator('#qz-verdict')).toHaveAttribute('role', 'status');
    await expect(page.locator('#qz-verdict')).toHaveText('Right answer. Star earned.');
  });

  test('QZ-14. the question, its options and the verdict fit the screen without scrolling', async ({ page }) => {
    const fits = () => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth);
    for (const p of [1, 2, 3, 4]) {
      await seed(page, fresh(), `?s=2&p=${p}`);
      await visible(page, 'quiz');
      expect([p, 'choice', await fits()]).toEqual([p, 'choice', true]);
      await page.click(`.qz-option[data-letter="${RIGHT[p] === 'A' ? 'B' : 'A'}"]`);
      await page.click('#qz-confirm');
      await expect(page.locator('#qz-verdict')).toBeVisible();
      expect([p, 'verdict', await fits()]).toEqual([p, 'verdict', true]);
    }
  });

  test('QZ-14b @layout. smallest phone (iPhone SE): overflow measured, buttons reachable', async ({ page }, info) => {
    const over = () => page.evaluate(() => ({ h: document.documentElement.scrollHeight - innerHeight, w: document.documentElement.scrollWidth - innerWidth }));
    const out = [];
    for (const p of [1, 2, 3, 4]) {
      await seed(page, fresh(), `?s=2&p=${p}`);
      await visible(page, 'quiz');
      const a = await over();
      await page.click(`.qz-option[data-letter="${RIGHT[p] === 'A' ? 'B' : 'A'}"]`);
      await page.locator('#qz-confirm').scrollIntoViewIfNeeded();
      await expect(page.locator('#qz-confirm')).toBeInViewport();
      await page.click('#qz-confirm');
      await expect(page.locator('#qz-verdict')).toBeVisible();
      const b = await over();
      // The verdict and "Continue" come into view by themselves
      await expect(page.locator('#qz-verdict')).toBeInViewport();
      await expect(page.locator('#qz-next')).toBeInViewport();
      expect([a.w, b.w]).toEqual([0, 0]);
      out.push(`P${p}: ${a.h} pt (choice), ${b.h} pt (verdict)`);
    }
    info.annotations.push({ type: 'overflow', description: out.join(' · ') });
    console.log(`[${info.project.name}] scroll needed: ${out.join(' · ')}`);
  });

  test('QZ-16. the quiz never waits for the Sheet\'s questions', async ({ page }) => {
    await page.addInitScript(() => {
      window.__loading = [];
      new MutationObserver(() => { const t = document.getElementById('loading-text')?.textContent; if (t) window.__loading.push(t); })
        .observe(document, { subtree: true, childList: true, characterData: true });
    });
    await seed(page, { ...fresh(), wqw_mock_questions_delay: 8000 }, '?s=2&p=2');
    await expect(page.locator('#screen-quiz')).toBeVisible({ timeout: 2500 });
    expect(await page.evaluate(() => window.__loading)).not.toContain(EN.loadingQuestion);
  });

  test('QZ-18. old phone state (stars as a list, no missed pillars) is still read', async ({ page }) => {
    await seed(page, { wqw_state: { email: EMAIL, stars: [1, 3] } }, '?s=2&p=2');
    await visible(page, 'quiz');
    await expect(page.locator('#qz-mini-stars .star-svg path[fill="var(--star)"]')).toHaveCount(2);
  });
});

test.describe('end of the quiz', () => {
  test('FN-01. four right answers: the celebration, as in every series', async ({ page }) => {
    await seed(page, fresh({ series: 2, stars: { 1: TS, 2: TS, 3: TS } }));
    await play(page, 4, 'C');
    await page.click('#qz-next');
    await visible(page, 'celebration');
  });

  test('FN-02/05. three stars: the end screen once, then "Quiz complete" on the passport', async ({ page }) => {
    await seed(page, fresh({ series: 2, stars: { 1: TS, 2: TS, 3: TS } }));
    await play(page, 4, 'B');
    await page.click('#qz-next');
    await visible(page, 'result');
    await expect(page.locator('#screen-result .eyebrow')).toHaveText('World Quality Week 2026');
    await expect(page.locator('#r-stars .star-svg')).toHaveCount(4);
    await expect(page.locator('#r-stars .star-svg path[fill="var(--star)"]')).toHaveCount(3);
    await expect(page.locator('#r-title')).toHaveText('Four pillars. Three stars.');
    await expect(page.locator('#r-score')).toHaveText('3 of 4 stars');
    await expect(page.locator('#screen-result .lead')).toHaveText(EN.resultSubtitle);
    // B1: not earned, so never called a passport here; never a second try
    await expect(page.locator('#screen-result')).not.toContainText(/passport|next time|again|retry|download/i);
    await expect(page.locator('#screen-result button')).toHaveText(['Done']);
    await page.goto('');
    await visible(page, 'passport'); // shown once
    await expect(page.locator('#p-title')).toHaveText('My stars'); // not earned: not called a passport
    await expect(page.locator('#p-quiz-done')).toBeVisible();
    await expect(page.locator('#p-quiz-score')).toHaveText('3 of 4 stars');
    await expect(page.locator('#p-next')).toBeHidden();
    await expect(page.locator('#p-complete')).toBeHidden();
    await expect(page.locator('#p-earned')).toBeHidden();
    await page.click('#p-open-result');
    await visible(page, 'result');
    await page.click('#r-back');
    await visible(page, 'passport');
  });

  test('FN-03. last answer right after an earlier mistake: the end screen, not the celebration', async ({ page }) => {
    await seed(page, fresh({ series: 2, stars: { 2: TS, 3: TS }, missed: { 1: TS } }));
    await play(page, 4, 'C');
    await page.click('#qz-next');
    await visible(page, 'result');
    await expect(page.locator('#r-title')).toHaveText('Four pillars. Three stars.');
  });

  test('FN-04. scores 0, 1 and 2', async ({ page }) => {
    for (const [stars, missed, title] of [
      [{}, { 1: TS, 2: TS, 3: TS }, 'Four pillars explored.'],
      [{ 1: TS }, { 2: TS, 3: TS }, 'Four pillars. One star.'],
      [{ 1: TS, 2: TS }, { 3: TS }, 'Four pillars. Two stars.'],
    ]) {
      await seed(page, fresh({ series: 2, stars, missed }));
      await play(page, 4, 'B');
      await page.click('#qz-next');
      await visible(page, 'result');
      await expect(page.locator('#r-title')).toHaveText(title);
    }
  });
});

test('B3. French score of the end screen agrees with any number of stars', async ({}, info) => {
  test.skip(info.project.name !== 'iPhone 13', 'data only');
  const fr = CONFIG.TEXT.fr.quizDoneScore;
  for (const n of [0, 1, 2, 3]) expect(fr.replace('{n}', n)).not.toMatch(/\b[01] étoiles/);
  expect(CONFIG.TEXT.en.quizDoneScore.replace('{n}', 1)).toBe('1 of 4 stars');
});

test('quiz screens @shots', async ({ page }, info) => {
  const shot = (name) => page.screenshot({ path: `${SHOTS}${info.project.name.replace(/[\s()]/g, '')}-quiz-${name}.png`, fullPage: true });
  await page.goto('?s=2&p=1');
  await visible(page, 'welcome');
  await page.waitForTimeout(700);
  await shot('0-welcome');
  await seed(page, fresh(), '?s=2&p=1');
  await visible(page, 'quiz');
  await page.waitForTimeout(500);
  await shot('1-question');
  await page.click('.qz-option[data-letter="B"]');
  await shot('2-selected');
  await page.click('#qz-confirm');
  await page.waitForTimeout(500);
  await shot('3-wrong');
  await page.click('#qz-next');
  await visible(page, 'passport');
  await page.waitForTimeout(1200);
  await shot('4-passport-missed');
  await play(page, 3, 'C');
  await page.waitForTimeout(500);
  await shot('5-right');
  await seed(page, fresh({ series: 2, stars: { 2: TS, 3: TS }, missed: { 1: TS } }));
  await play(page, 4, 'B');
  await page.click('#qz-next');
  await visible(page, 'result');
  await page.waitForTimeout(600);
  await shot('6-result-2');
  await page.click('#r-back');
  await visible(page, 'passport');
  await page.waitForTimeout(1200);
  await shot('7-passport-done');
  await seed(page, fresh({ series: 2, missed: { 1: TS, 2: TS, 3: TS } }));
  await play(page, 4, 'A');
  await page.click('#qz-next');
  await visible(page, 'result');
  await page.waitForTimeout(600);
  await shot('8-result-0');
});
