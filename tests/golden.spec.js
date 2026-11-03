// Reference screens and requests of series 1 (French) and 3 (English), taken on the code before the
// series 2 quiz and compared after each change, pixel for pixel (RQ-20 of the quiz spec).
// Local only: tests/golden/ is ignored by git. `npm run golden:take` writes it, `npm run golden:check` compares.
import { test, expect } from '@playwright/test';

const EMAIL = 'helene.muller@ipsen.com';
const NOW = new Date('2026-11-06T10:00:00Z');
const allStars = { 1: '2026-10-05T09:00:00Z', 2: '2026-10-05T10:00:00Z', 3: '2026-10-06T11:00:00Z', 4: '2026-10-06T12:00:00Z' };

test.use({ reducedMotion: 'reduce' });

async function seed(page, value, path = '') {
  await page.goto('');
  await page.evaluate((v) => { localStorage.clear(); Object.entries(v).forEach(([k, x]) => localStorage.setItem(k, JSON.stringify(x))); }, value);
  await page.goto(path);
}
const visible = (page, name) => expect(page.locator(`#screen-${name}`)).toBeVisible();

for (const s of [1, 3]) {
  for (const scheme of ['light', 'dark']) {
    test.describe(`series ${s}, ${scheme}`, () => {
      test.use({ colorScheme: scheme });
      test(`every screen of series ${s}, ${scheme} @golden`, async ({ page }) => {
        const shot = (name) => expect(page).toHaveScreenshot(`s${s}-${scheme}-${name}.png`, { fullPage: true, maxDiffPixels: 0, animations: 'disabled' });
        await page.clock.setFixedTime(NOW);
        await page.goto(`?s=${s}&p=1`);
        await visible(page, 'welcome');
        await shot('1-welcome');
        await page.fill('#email', EMAIL);
        await page.click('#welcome-btn');
        await visible(page, 'question');
        await page.fill('#answer', 'Quality means doing it right the first time, every time.');
        await shot('2-question');
        await page.click('#submit-btn');
        await visible(page, 'passport');
        await expect(page.locator('#screen-passport [data-sync]')).toHaveClass(/fade/, { timeout: 8000 });
        await shot('3-passport-earned');
        await page.goto(`?s=${s}&p=1`); // rescan
        await visible(page, 'passport');
        await shot('4-passport-already');
        await seed(page, { wqw_state: { email: EMAIL, stars: {}, pending: [] }, wqw_mock_questions_delay: 8000 }, `?s=${s}&p=2`);
        await expect(page.locator('#loading-text')).toHaveText(s === 1 ? 'Chargement de la question…' : 'Loading the question…');
        await shot('5-loading');
        await seed(page, { wqw_state: { email: EMAIL, series: s, stars: allStars, pending: [], celebrated: false, holder: 'Hélène Müller' } });
        await visible(page, 'celebration');
        await shot('6-celebration');
        await page.click('#close-btn');
        await visible(page, 'passport');
        await shot('7-passport-complete');
        const src = await page.evaluate(() => window.__wqw.passportImage('Hélène Müller'));
        expect(Buffer.from(src.split(',')[1], 'base64')).toMatchSnapshot(`s${s}-${scheme}-8-document.jpg`);
      });
    });
  }
}

test('requests sent by series 1 and 3 @golden', async ({ page }, info) => {
  test.skip(info.project.name !== 'iPhone 13', 'one device is enough for the requests');
  const sent = [];
  await page.route('https://quality-passport-api.videoclubz.workers.dev/**', async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    sent.push(`${r.method()} ${u.pathname}${u.search} ${(r.postData() || '').replace(/"id":"[^"]+"/, '"id":"ID"')}`.trim());
    const body = u.pathname === '/answer' ? { ok: true } : u.pathname === '/stars' ? { stars: {} } : { ok: true, questions: {} };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  for (const s of [1, 3]) {
    await seed(page, { wqw_state: { email: EMAIL, stars: {}, pending: [] } }, `?s=${s}&p=2&live=1`);
    await visible(page, 'question');
    await page.fill('#answer', `Golden answer, series ${s}`);
    await page.click('#submit-btn');
    await expect.poll(() => sent.filter((x) => x.startsWith('POST')).length).toBe(s === 1 ? 1 : 2);
    await expect.poll(() => page.evaluate(() => window.__wqw.state().pending.length)).toBe(0);
  }
  expect([...sent].sort().join('\n')).toMatchSnapshot('requests.txt');
});
