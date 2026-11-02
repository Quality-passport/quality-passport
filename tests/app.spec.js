// End-to-end tests in mock mode (local runs never call the real API). `npm test`
// Test ids (NR-, SE-, QU-, FR-, PA-, TO-) refer to the local test plan "Quality Passport séries recette.md".
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../config.js';

const EMAIL = 'helene.muller@ipsen.com';
const SHOTS = fileURLToPath(new URL('./screenshots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const EN = CONFIG.TEXT.en;
const FR = CONFIG.TEXT.fr;

const sheet = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('wqw_mock_sheet') || '[]'));
const state = (page) => page.evaluate(() => window.__wqw.state());
const visible = (page, name) => expect(page.locator(`#screen-${name}`)).toBeVisible();
// Mock sheet row: [Timestamp, Email, Pillar, Answer, ClientId, Series, Question]
const SERIES = 5;
const QUESTION = 6;

async function answer(page, p, text = `My answer for pillar ${p}`, s = 2) {
  await page.goto(`?s=${s}&p=${p}`);
  await visible(page, 'question');
  await page.fill('#answer', text);
  await page.click('#submit-btn');
}

/** Seeds localStorage once, then loads `path`. */
async function seed(page, value, path = '') {
  await page.goto('');
  await page.evaluate((v) => { localStorage.clear(); Object.entries(v).forEach(([k, x]) => localStorage.setItem(k, JSON.stringify(x))); }, value);
  await page.goto(path);
}

const allStars = { 1: '2026-10-05T09:00:00Z', 2: '2026-10-05T10:00:00Z', 3: '2026-10-06T11:00:00Z', 4: '2026-10-06T12:00:00Z' };
/** Questions of the test plan: "[S2P3] …" for each series and pillar. */
const recetteQuestions = Object.fromEntries([1, 2, 3].map((s) => [s, Object.fromEntries([1, 2, 3, 4].map((p) => [p, `[S${s}P${p}] ${s === 1 ? 'Qu’avez-vous retenu ?' : 'What did you take away?'}`]))]));

test.describe('existing behaviour (non-regression)', () => {
  test('NR-01..04. full journey in any order, rescan, celebration', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    // 1. First scan ?s=2&p=3: Welcome, invalid email refused, valid email leads to question 3
    await page.goto('?s=2&p=3');
    await visible(page, 'welcome');
    await page.fill('#email', 'not-an-email');
    await page.click('#welcome-btn');
    await expect(page.locator('#email-error')).not.toBeEmpty();
    await visible(page, 'welcome');
    await page.fill('#email', ' Helene.Muller@Ipsen.com ');
    await page.click('#welcome-btn');
    await visible(page, 'question');
    await expect(page.locator('#q-label')).toHaveText('Pillar 3 of 4');

    // 2. Empty answer: button disabled. Answer: passport with 1 star, row in the fake sheet
    await expect(page.locator('#submit-btn')).toBeDisabled();
    await page.fill('#answer', '   ');
    await expect(page.locator('#submit-btn')).toBeDisabled();
    await page.fill('#answer', 'Doing it right the first time.');
    await expect(page.locator('#submit-btn')).toBeEnabled();
    await page.click('#submit-btn');
    await visible(page, 'passport');
    await expect(page.locator('#p-count')).toHaveText('1 of 4');
    await expect(page.locator('#p-earned-name')).toHaveText('Efficiency & Speed');
    await expect.poll(async () => (await sheet(page)).length).toBe(1);
    const [row] = await sheet(page);
    expect(row.slice(1, 4)).toEqual([EMAIL, 3, 'Doing it right the first time.']);
    expect(row[SERIES]).toBe(2);
    expect(row[QUESTION]).toBe(EN.defaultQuestion);

    // 3. Rescan ?s=2&p=3: passport, not the question
    await page.goto('?s=2&p=3');
    await visible(page, 'passport');
    await expect(page.locator('#p-earned-label')).toHaveText('Already stamped');

    // 4. Pillars 1, 4, 2: celebration after the 4th
    await answer(page, 1);
    await visible(page, 'passport');
    await answer(page, 4);
    await visible(page, 'passport');
    await answer(page, 2);
    await visible(page, 'celebration');
    await expect(page.locator('#cert-name')).toHaveText('Helene Muller');
    await expect.poll(async () => (await sheet(page)).length).toBe(4);
    expect((await state(page)).celebrated).toBe(true);

    // Celebration shown once, then the passport; still reachable from it
    await page.goto('');
    await visible(page, 'passport');
    await page.click('#p-open-celebration');
    await visible(page, 'celebration');

    // NR-17. Local runs never call the real API
    expect(requests.filter((u) => u.includes('workers.dev'))).toEqual([]);
  });

  test('NR-03. answer limits: counter from 1800 characters, 2000 at most', async ({ page }) => {
    await seed(page, { wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=2&p=1');
    await visible(page, 'question');
    await page.fill('#answer', 'x');
    await expect(page.locator('#submit-btn')).toBeEnabled();
    await page.fill('#answer', 'a'.repeat(1799));
    await expect(page.locator('#answer-counter')).toHaveText('');
    await page.fill('#answer', 'a'.repeat(1800));
    await expect(page.locator('#answer-counter')).toHaveText('1800 / 2000');
    await page.fill('#answer', 'a'.repeat(10000));
    expect((await page.inputValue('#answer')).length).toBe(2000);
    await page.click('#submit-btn');
    await expect.poll(async () => (await sheet(page)).length).toBe(1);
    expect((await sheet(page))[0][3].length).toBe(2000);
  });

  test('NR-05. offline queue: star lit, answer kept, sent after reload', async ({ page }) => {
    await seed(page, { wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=2&p=2&mockfail=1');
    await visible(page, 'question');
    await page.fill('#answer', 'Sent while offline');
    await page.click('#submit-btn');
    await visible(page, 'passport');
    await expect(page.locator('#p-count')).toHaveText('1 of 4');
    await page.waitForTimeout(1200); // mock latency + failure
    let s = await state(page);
    expect(s.pending).toHaveLength(1);
    expect(await sheet(page)).toHaveLength(0);

    await page.goto('?s=2'); // network back
    await expect.poll(async () => (await state(page)).pending.length, { timeout: 5000 }).toBe(0);
    const rows = await sheet(page);
    expect(rows).toHaveLength(1);
    expect(rows[0][3]).toBe('Sent while offline');
    expect(rows[0][SERIES]).toBe(2);
    expect(rows[0][QUESTION]).toBe(EN.defaultQuestion);
  });

  test('NR-06. new browser, same email: stars restored', async ({ page, browser }, info) => {
    await seed(page, { wqw_state: { email: EMAIL, stars: {}, pending: [] } });
    await answer(page, 1);
    await visible(page, 'passport');
    await answer(page, 3);
    await visible(page, 'passport');
    await expect.poll(async () => (await sheet(page)).length).toBe(2);
    const rows = await sheet(page);

    // A different browser (in-app scanner): no local state, same "server" rows.
    const ctx = await browser.newContext({ ...info.project.use });
    const other = await ctx.newPage();
    await other.addInitScript((r) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('wqw_mock_sheet', JSON.stringify(r));
        sessionStorage.setItem('seeded', '1');
      }
    }, rows);
    await other.goto(new URL('?s=2&p=3', info.project.use.baseURL || 'http://localhost:4174/').href);
    await visible(other, 'welcome');
    await other.fill('#email', EMAIL);
    await other.click('#welcome-btn');
    await visible(other, 'passport'); // pillar 3 already done elsewhere: no question
    await expect(other.locator('#p-count')).toHaveText('2 of 4');
    await ctx.close();
  });

  test('NR-07 (QA-06). two tabs never lose each other\'s star or queued answer', async ({ page, context }) => {
    await seed(page, { wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=2&p=1');
    await visible(page, 'question');
    const other = await context.newPage();
    await other.goto('?s=2&p=2&mockfail=1');
    await visible(other, 'question');
    await other.fill('#answer', 'answer from tab B');
    await other.click('#submit-btn');
    await visible(other, 'passport');
    await page.fill('#answer', 'answer from tab A');
    await page.click('#submit-btn');
    await visible(page, 'passport');
    const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('wqw_state')));
    expect(Object.keys(raw.stars).sort()).toEqual(['1', '2']);
    await expect.poll(async () => (await sheet(page)).map((r) => r[3]).sort(), { timeout: 8000 }).toContain('answer from tab A');
    await page.goto('?s=2'); // tab B's answer, queued while failing, goes out from here
    await expect.poll(async () => (await sheet(page)).map((r) => r[3]), { timeout: 8000 }).toContain('answer from tab B');
  });

  test('NR-08 (QA-01). invalid ?s or ?p never opens a question', async ({ page }) => {
    await seed(page, { wqw_state: { email: EMAIL, stars: { 1: '2026-10-05T09:00:00Z' }, pending: [] } });
    for (const p of ['0', '5', 'abc', '1.5', '-1', '', '%3Cscript%3E']) {
      await page.goto(`?s=2&p=${p}`);
      await visible(page, 'passport');
    }
    for (const s of ['0', '4', 'abc', '1.5', '-1', '', '%3Cscript%3E']) {
      await page.goto(`?s=${s}&p=2`);
      await visible(page, 'passport');
    }
    await page.goto('?p=2'); // old QR code, without series
    await visible(page, 'passport');
    await expect(page.locator('#p-earned')).toBeHidden();
  });

  test('NR-09. passport download: non-empty PDF', async ({ page }) => {
    await seed(page, { wqw_state: { email: EMAIL, stars: allStars, pending: [], celebrated: false } });
    await visible(page, 'celebration');
    await page.click('#edit-name');
    await page.fill('#holder', 'Hélène Müller');
    await expect(page.locator('#cert-name')).toHaveText('Hélène Müller');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download-btn')]);
    expect(download.suggestedFilename()).toBe('Quality-Passport.pdf');
    const path = await download.path();
    const buf = readFileSync(path);
    expect(buf.length).toBeGreaterThan(20000);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('NR-10. Share: shares the PDF, or downloads it where files cannot be shared', async ({ page }) => {
    await page.addInitScript(() => { delete Navigator.prototype.canShare; delete Navigator.prototype.share; });
    await seed(page, { wqw_state: { email: EMAIL, stars: allStars, pending: [], celebrated: false } });
    await visible(page, 'celebration');
    await expect(page.locator('#share-btn')).toHaveText('Share');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#share-btn')]);
    expect(download.suggestedFilename()).toBe('Quality-Passport.pdf');
  });

  test('NR-12. after sending, a reload shows the passport and keeps the series', async ({ page }) => {
    await seed(page, { wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=3&p=1');
    await answer(page, 1, 'x', 3);
    await visible(page, 'passport');
    expect(new URL(page.url()).search).toBe('?s=3');
    await page.reload();
    await visible(page, 'passport');
  });

  test('NR-15. old phone state (stars as a list) is still read', async ({ page }) => {
    await seed(page, { wqw_state: { email: EMAIL, stars: [1, 3] } });
    await visible(page, 'passport');
    await expect(page.locator('#p-count')).toHaveText('2 of 4');
  });
});

test.describe('series', () => {
  test('SE-01/02. each QR code opens its own question; the answer keeps the question shown', async ({ page }) => {
    await seed(page, { wqw_mock_questions: recetteQuestions, wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=2');
    await visible(page, 'passport');
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem('wqw_questions'))).toBe(true); // kept on the phone
    for (const s of [1, 2, 3]) {
      for (const p of [1, 2, 3, 4]) {
        await page.goto(`?s=${s}&p=${p}`);
        await visible(page, 'question');
        await expect(page.locator('#q-text')).toHaveText(recetteQuestions[s][p]);
        await expect(page.locator('#q-label')).toHaveText(s === 1 ? `Pilier ${p} sur 4` : `Pillar ${p} of 4`);
      }
    }
    await page.fill('#answer', 'Answer to S3P4');
    await page.click('#submit-btn');
    await expect.poll(async () => (await sheet(page)).length).toBe(1);
    const [row] = await sheet(page);
    expect([row[SERIES], row[2], row[QUESTION]]).toEqual([3, 4, recetteQuestions[3][4]]);
  });

  test('SE-01. series 1, new participant on an English phone: French from the welcome screen', async ({ page }) => {
    await page.goto('?s=1&p=1');
    await visible(page, 'welcome');
    await expect(page.locator('#screen-welcome h1')).toHaveText(FR.welcomeTitle);
    expect(await page.evaluate(() => [document.documentElement.lang, document.title])).toEqual(['fr', FR.pageTitle]);
    await page.fill('#email', 'recette.s1@ipsen.com');
    await page.click('#welcome-btn');
    await visible(page, 'question');
    await expect(page.locator('#q-text')).toHaveText(FR.defaultQuestion); // QU-02, French default
  });

  test('SE-03/04. passport QR code, and one passport for all series', async ({ page }) => {
    await seed(page, { wqw_state: { email: EMAIL, stars: { 2: '2026-10-05T09:00:00Z' }, pending: [] } }, '?s=3');
    await visible(page, 'passport');
    await expect(page.locator('#p-count')).toHaveText('1 of 4');
    await page.goto('?s=3&p=2'); // pillar 2 already starred (in series 2)
    await visible(page, 'passport');
    await expect(page.locator('#p-earned-label')).toHaveText('Already stamped');
  });

  test('SE-05. another series on the same phone (should not happen): question, star and language follow it', async ({ page }) => {
    await seed(page, { wqw_state: { email: EMAIL, series: 2, stars: { 1: '2026-10-05T09:00:00Z' }, pending: [] } }, '?s=1&p=2');
    await visible(page, 'question');
    await expect(page.locator('#q-label')).toHaveText('Pilier 2 sur 4');
    await page.fill('#answer', 'Test');
    await page.click('#submit-btn');
    await visible(page, 'passport');
    await expect(page.locator('#p-count')).toHaveText('2 sur 4');
    await expect.poll(async () => (await sheet(page)).length).toBe(1);
    expect((await sheet(page))[0][SERIES]).toBe(1);
    await page.goto('');
    await expect(page.locator('#p-count')).toHaveText('2 sur 4');
  });

  test('SE-07. ?s twice: the first counts; "02" is series 2', async ({ page }) => {
    await seed(page, { wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=1&s=2&p=3');
    await expect(page.locator('#q-label')).toHaveText('Pilier 3 sur 4');
    await page.goto('?s=02&p=1');
    await expect(page.locator('#q-label')).toHaveText('Pillar 1 of 4');
  });

  test('TO-04. two tabs, two series: each answer in its series, each tab in its language', async ({ page, context }) => {
    await seed(page, { wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=1&p=1');
    const other = await context.newPage();
    await other.goto('?s=2&p=2');
    await expect(page.locator('#q-label')).toHaveText('Pilier 1 sur 4');
    await expect(other.locator('#q-label')).toHaveText('Pillar 2 of 4');
    await page.fill('#answer', 'A');
    await other.fill('#answer', 'B');
    await page.click('#submit-btn');
    await other.click('#submit-btn');
    await expect.poll(async () => (await sheet(page)).map((r) => `${r[3]}:${r[SERIES]}`).sort(), { timeout: 8000 }).toEqual(['A:1', 'B:2']);
  });

  test('TO-01. double tap on submit: one answer', async ({ page }) => {
    await seed(page, { wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=2&p=1');
    await page.fill('#answer', 'once');
    await page.evaluate(() => { const b = document.getElementById('submit-btn'); b.click(); b.click(); });
    await visible(page, 'passport');
    await page.waitForTimeout(1500);
    expect(await sheet(page)).toHaveLength(1);
  });
});

test.describe('questions from the Sheet', () => {
  test('QU-10. first scan, no answer from Cloudflare: loading at most 5 s, then the default question', async ({ page }) => {
    await seed(page, { wqw_mock_questions: recetteQuestions, wqw_mock_questions_delay: 8000, wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=2&p=1');
    const t0 = Date.now();
    await visible(page, 'loading');
    await expect(page.locator('#loading-text')).toHaveText(EN.loadingQuestion);
    await expect(page.locator('#screen-question')).toBeVisible({ timeout: 8000 });
    const waited = Date.now() - t0;
    expect(waited).toBeLessThan(6500);
    await expect(page.locator('#q-text')).toHaveText(EN.defaultQuestion);
    await page.fill('#answer', 'typed before the questions came');
    await page.click('#submit-btn');
    await expect.poll(async () => (await sheet(page)).length).toBe(1);
    expect((await sheet(page))[0][QUESTION]).toBe(EN.defaultQuestion);
  });

  test('QU-11. questions already on the phone, Cloudflare unreachable: question at once', async ({ page }) => {
    await seed(page, { wqw_questions: { q: { 2: { 1: '[S2P1] kept on the phone' } } }, wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=2&p=1&mockfail=1');
    await visible(page, 'question');
    await expect(page.locator('#q-text')).toHaveText('[S2P1] kept on the phone');
  });

  test('QU-12. a newer question replaces the one on screen only while nothing is typed', async ({ page }) => {
    const v1 = { q: { 2: { 1: '[S2P1] v1' } } };
    const v2 = { 2: { 1: '[S2P1] v2' } };
    // A: the participant has started writing: v1 stays and is the question saved
    await seed(page, { wqw_questions: v1, wqw_mock_questions: v2, wqw_mock_questions_delay: 2000, wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=2&p=1');
    await expect(page.locator('#q-text')).toHaveText('[S2P1] v1');
    await page.fill('#answer', 'abc');
    await page.waitForTimeout(2600);
    await expect(page.locator('#q-text')).toHaveText('[S2P1] v1');
    await page.click('#submit-btn');
    await expect.poll(async () => (await sheet(page)).length).toBe(1);
    expect((await sheet(page))[0][QUESTION]).toBe('[S2P1] v1');
    // B: nothing typed: v2 replaces v1
    await seed(page, { wqw_questions: v1, wqw_mock_questions: v2, wqw_mock_questions_delay: 2000, wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=2&p=1');
    await expect(page.locator('#q-text')).toHaveText('[S2P1] v1');
    await expect(page.locator('#q-text')).toHaveText('[S2P1] v2', { timeout: 4000 });
  });

  test('QU-02/07. empty question gives the default one; line breaks kept, HTML shown as text', async ({ page }) => {
    const q = { 1: { 4: '' }, 3: { 4: '   ' }, 2: { 2: 'Line one\nLine two <b>bold</b>' } };
    await seed(page, { wqw_mock_questions: q, wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=3&p=4');
    await expect(page.locator('#q-text')).toHaveText(EN.defaultQuestion);
    await page.goto('?s=1&p=4');
    await expect(page.locator('#q-text')).toHaveText(FR.defaultQuestion);
    await page.goto('?s=2&p=2');
    await expect(page.locator('#q-text')).toHaveText('Line one\nLine two <b>bold</b>');
    expect(await page.locator('#q-text b').count()).toBe(0);
    expect(await page.locator('#q-text').evaluate((el) => el.getClientRects()[0].height > 40)).toBe(true); // two lines
  });

  test('QU-05/06 @layout. question lengths on the smallest phone', async ({ page }) => {
    const q139 = 'Pendant cette semaine, quel geste simple avez-vous vu ou appris qui rendrait demain votre travail plus sûr pour les patients et pour vous ?';
    expect(q139.length).toBe(139);
    const q500 = 'abcdefghij '.repeat(46).slice(0, 500);
    await seed(page, { wqw_mock_questions: { 1: { 1: q139, 2: q500, 3: 'x'.repeat(60) } }, wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=1&p=1');
    await expect(page.locator('#q-text')).toHaveText(q139);
    const fits = () => page.evaluate(() => ({ h: document.documentElement.scrollHeight <= innerHeight, w: document.documentElement.scrollWidth <= innerWidth }));
    expect(await fits()).toEqual({ h: true, w: true });
    await page.screenshot({ path: `${SHOTS}layout-question-139.png` });
    await page.goto('?s=1&p=2');
    await expect(page.locator('#q-text')).toHaveText(q500);
    await page.locator('#submit-btn').scrollIntoViewIfNeeded();
    await expect(page.locator('#submit-btn')).toBeInViewport();
    expect((await fits()).w).toBe(true);
    await page.goto('?s=1&p=3');
    expect((await fits()).w).toBe(true);
  });
});

test.describe('French (series 1)', () => {
  /** No English interface text left on screen (pillar, event and programme names excepted). */
  async function noEnglish(page) {
    const text = await page.evaluate(() => document.body.innerText);
    const leaks = Object.entries(EN)
      .filter(([k, v]) => v !== FR[k] && !['fileName', 'pageTitle'].includes(k))
      .flatMap(([, v]) => v.split(/\{\w+\}/).map((x) => x.trim()).filter((x) => x.length >= 4))
      .filter((x) => new RegExp(`(^|\\W)${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\W)`).test(text));
    expect(leaks).toEqual([]);
  }

  test('FR-01. the whole series 1 journey is in French', async ({ page }) => {
    await page.goto('?s=1&p=1&mockfail=1');
    await visible(page, 'welcome');
    await page.fill('#email', 'pas-un-email');
    await page.click('#welcome-btn');
    await expect(page.locator('#email-error')).toHaveText(FR.emailInvalid);
    await noEnglish(page);
    await page.fill('#email', EMAIL);
    await page.click('#welcome-btn');
    await visible(page, 'question');
    await noEnglish(page);
    await page.fill('#answer', 'Une réponse');
    await page.click('#submit-btn');
    await visible(page, 'passport');
    await expect(page.locator('#screen-passport [data-sync]')).toContainText(FR.waiting, { timeout: 5000 });
    await noEnglish(page);
    expect(await page.locator('.node.on').getAttribute('aria-label')).toBe('Quality as Enabler : étoile gagnée');
    await seed(page, { wqw_state: { email: EMAIL, series: 1, stars: allStars, pending: [], celebrated: false } });
    await visible(page, 'celebration');
    await page.waitForTimeout(1800);
    await noEnglish(page);
    await page.click('#close-btn');
    await visible(page, 'passport');
    await noEnglish(page);
  });

  test('FR-02/03. French dates (1er) and French PDF', async ({ page }) => {
    await seed(page, { wqw_state: { email: EMAIL, series: 1, stars: { 1: '2026-12-01T10:00:00Z', 2: '2026-11-06T10:00:00Z' }, pending: [] } });
    await expect(page.locator('.node.on .date')).toHaveText(['1er déc.', '6 nov.']);
    await seed(page, { wqw_state: { email: EMAIL, series: 1, stars: { ...allStars, 4: '2026-12-01T10:00:00Z' }, pending: [], celebrated: false } });
    await visible(page, 'celebration');
    await expect(page.locator('#cert-date')).toHaveText('1er décembre 2026');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download-btn')]);
    expect(download.suggestedFilename()).toBe('Passeport-Qualite.pdf');
    expect(readFileSync(await download.path()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test.describe('phone set to French', () => {
    test.use({ locale: 'fr-FR' });
    test('SE-06/FR-06. no series: phone language; English series stay English', async ({ page }) => {
      await page.goto('');
      await expect(page.locator('#screen-welcome h1')).toHaveText(FR.welcomeTitle);
      await page.goto('?s=2&p=1');
      await expect(page.locator('#screen-welcome h1')).toHaveText(EN.welcomeTitle);
    });
  });

  test.describe('phone set to German', () => {
    test.use({ locale: 'de-DE' });
    test('SE-06. no series, phone neither French nor English: English', async ({ page }) => {
      await page.goto('');
      await expect(page.locator('#screen-welcome h1')).toHaveText(EN.welcomeTitle);
    });
  });
});

test.describe('several countries', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('PA-04. dates are the participant\'s local date', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-07T01:00:00Z')); // 6 Nov, 20:00 in New York
    await seed(page, { wqw_state: { email: EMAIL, stars: {}, pending: [] } }, '?s=2&p=1');
    await page.fill('#answer', 'From New York');
    await page.click('#submit-btn');
    await expect(page.locator('.node.on .date')).toHaveText('6 Nov');
    expect((await state(page)).stars[1]).toBe('2026-11-07T01:00:00.000Z');
  });
});

for (const { lang, s } of [{ lang: 'en', s: 2 }, { lang: 'fr', s: 1 }]) {
  for (const scheme of ['light', 'dark']) {
    test.describe(`screenshots (${lang}, ${scheme})`, () => {
      test.use({ colorScheme: scheme });
      test(`every screen, ${lang}, ${scheme} @shots`, async ({ page }, info) => {
        const shot = (name) => page.screenshot({ path: `${SHOTS}${info.project.name.replace(/[\s()]/g, '')}-${lang}-${scheme}-${name}.png`, fullPage: true });
        await page.goto(`?s=${s}&p=1`);
        await visible(page, 'welcome');
        await page.waitForTimeout(900);
        await shot('1-welcome');
        await page.fill('#email', EMAIL);
        await page.click('#welcome-btn');
        await visible(page, 'question');
        await page.fill('#answer', 'Quality means doing it right the first time, every time.');
        await page.waitForTimeout(700);
        await shot('2-question');
        await page.click('#submit-btn');
        await visible(page, 'passport');
        await page.waitForTimeout(1200);
        await shot('3-passport');
        await seed(page, { wqw_state: { email: EMAIL, series: s, stars: allStars, pending: [], celebrated: false, holder: 'Hélène Müller' } });
        await visible(page, 'celebration');
        await page.waitForTimeout(2600);
        await shot('4-celebration');
        const src = await page.evaluate(() => window.__wqw.passportImage('Hélène Müller'));
        writeFileSync(`${SHOTS}${info.project.name.replace(/[\s()]/g, '')}-${lang}-${scheme}-5-passport-document.jpg`, Buffer.from(src.split(',')[1], 'base64'));
        await page.click('#close-btn');
        await visible(page, 'passport');
        await page.waitForTimeout(800);
        await shot('6-passport-complete');
      });
    });
  }
}

test('PA-05 @shots. names in every alphabet on the passport document', async ({ page }, info) => {
  test.skip(info.project.name !== 'iPhone 13', 'one device is enough for the document');
  await seed(page, { wqw_state: { email: EMAIL, stars: allStars, pending: [], celebrated: true } });
  for (const [i, name] of ['Ольга Иванова', 'Γιώργος Παπαδόπουλος', '王小明', 'محمد علي'].entries()) {
    const src = await page.evaluate((n) => window.__wqw.passportImage(n), name);
    writeFileSync(`${SHOTS}names-${i + 1}.jpg`, Buffer.from(src.split(',')[1], 'base64'));
  }
});
