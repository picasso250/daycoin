import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startPreview } from '../preview.mjs';

const server = await startPreview(0);
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
before(async () => { browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true }); });
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });

async function pageFor(authenticated, refreshAfter = 0) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/dc2/config', route => route.fulfill({ json: { loginReady: true } }));
  await page.route('**/api/dc2/me', route => route.fulfill({ json: authenticated
    ? { authenticated: true, user: { id: 123, login: 'tester' },
        checkedAt: 1794480000, refreshAfter,
        evidence: { daysOld: 3500, publicNonForkReposObserved: 8, rawStarsObserved: 34,
          externalMergedPRsObserved: 11, followersObserved: 18,
          coverage: { reposComplete: true, prsComplete: false } } }
    : { authenticated: false } }));
  await page.goto(base + '/dc2/');
  await page.locator('#account:not(.hidden),#hero:not(.hidden)').first().waitFor();
  return { page, context, errors };
}

test('before GitHub login, introduction is first screen and analysis hidden', async () => {
  const { page, context, errors } = await pageFor(false);
  assert.equal(await page.locator('#hero').isVisible(), true);
  assert.equal(await page.locator('#account').isVisible(), false);
  assert.equal(await page.locator('#login').isVisible(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('after GitHub login, analysis replaces introduction and refresh icon stays clickable', async () => {
  const { page, context, errors } = await pageFor(true, Math.floor(Date.now() / 1000) + 280);
  assert.equal(await page.locator('#hero').isVisible(), false);
  assert.equal(await page.locator('#account').isVisible(), true);
  assert.equal(await page.locator('#logout').isVisible(), true);
  assert.equal(await page.locator('#enroll').isVisible(), true);
  assert.equal(await page.locator('#enroll').isDisabled(), true);
  assert.ok((await page.locator('#account').boundingBox()).y < 100);
  const refresh = page.locator('#recheck');
  assert.equal(await refresh.isEnabled(), true);
  assert.equal(await refresh.getAttribute('aria-label'), '重新检查 GitHub 数据');
  await refresh.click();
  assert.equal(await page.locator('#refresh-dialog').isVisible(), true);
  assert.match(await page.locator('#refresh-dialog-text').innerText(), /约 [1-5] 分钟/);
  await page.getByRole('button', { name: '知道了' }).click();
  assert.equal(await page.locator('#refresh-dialog').isVisible(), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('ready refresh click displays loading and starts OAuth redirect', async () => {
  const { page, context, errors } = await pageFor(true, 0);
  await page.route('**/api/dc2/login?refresh=1', route => route.fulfill({ status: 200, body: 'refresh started' }));
  await page.locator('#recheck').click();
  await page.waitForURL('**/api/dc2/login?refresh=1');
  assert.equal(await page.locator('body').innerText(), 'refresh started');
  assert.deepEqual(errors, []);
  await context.close();
});
