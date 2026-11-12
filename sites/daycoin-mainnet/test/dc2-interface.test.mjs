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
        eligibility: { eligible: true, checks: {age:true, stars:true, prs:true, followers:true} },
        evidence: { daysOld: 3500, publicNonForkReposObserved: 8, rawStarsObserved: 34,
          externalMergedPRsObserved: 11, followersObserved: 18,
          createdAt:'2017-01-01T00:00:00Z', coverage: { reposComplete: true, prsComplete: false } } }
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


test('mainnet consent remains required even if issuer is ready', async () => {
  const { page, context, errors } = await pageFor(true);
  // Reload to use the production-shaped issuer config.
  await page.route('**/api/dc2/config', route => route.fulfill({ json: {
    loginReady: true, issuance: { enabled: true, chainId: 42161,
      contract: '0xD891dc80535e885E5893B8139902F90F6aBA086b' }
  } }));
  await page.reload();
  assert.equal(await page.locator('#enroll').isDisabled(), true);
  await page.locator('#consent').check();
  assert.equal(await page.locator('#enroll').isEnabled(), true);
  assert.match(await page.locator('#enrollment-hint').innerText(), /Arbitrum One/);
  assert.deepEqual(errors, []);
  await context.close();
});


test('insufficient GitHub metrics identify failed criteria and block registration without wallet request', async () => {
  const {page,context,errors}=await pageFor(true);
  await page.route('**/api/dc2/config', route => route.fulfill({ json: {loginReady:true,
    issuance:{ enabled:true,chainId:42161,contract:'0xD891dc80535e885E5893B8139902F90F6aBA086b' }} }));
  await page.route('**/api/dc2/me', route => route.fulfill({json:{authenticated:true,user:{id:98765,login:'new-dev'},
    checkedAt:1794480000, refreshAfter:0,
    eligibility:{eligible:false,checks:{age:false,stars:false,prs:null,followers:true}},
    evidence:{daysOld:500,createdAt:'2025-01-01T00:00:00Z',publicNonForkReposObserved:2,
      rawStarsObserved:3,externalMergedPRsObserved:null,followersObserved:11,
      coverage:{reposComplete:true,prsComplete:false}}
  }}));
  await page.reload();
  assert.match(await page.locator('#qualification-summary').innerText(),/暂不符合/);
  assert.equal(await page.locator('#check-age').getAttribute('data-state'),'fail');
  assert.equal(await page.locator('#check-stars').getAttribute('data-state'),'fail');
  assert.equal(await page.locator('#check-prs').getAttribute('data-state'),'unknown');
  assert.equal(await page.locator('#check-followers').getAttribute('data-state'),'pass');
  await page.locator('#consent').check();
  assert.equal(await page.locator('#enroll').isDisabled(),true);
  assert.match(await page.locator('#qualification-explanation').innerText(),/不会发生链上 Gas/);
  assert.deepEqual(errors,[]);
  await context.close();
});

test('contract details and exact thresholds are public before GitHub login', async () => {
  const {page,context,errors}=await pageFor(false);
  assert.equal(await page.locator('.contract-reference code').innerText(), '0xD891dc80535e885E5893B8139902F90F6aBA086b');
  assert.match(await page.locator('.protocol-info').innerText(),/7 年/);
  assert.match(await page.locator('.protocol-info').innerText(),/10 Star/);
  assert.match(await page.locator('.protocol-info').innerText(),/Arbitrum One/);
  assert.deepEqual(errors,[]);
  await context.close();
});


test('realistic qualifying account data shows all four passed, never the fake failure state', async () => {
  const {page,context,errors}=await pageFor(true);
  await page.route('**/api/dc2/config',route=>route.fulfill({json:{loginReady:true,eligibilityApi:'v1',
    issuance:{enabled:true,chainId:42161,contract:'0xD891dc80535e885E5893B8139902F90F6aBA086b'}}}));
  await page.route('**/api/dc2/me',route=>route.fulfill({json:{authenticated:true,
    user:{id:1884104,login:'picasso250'},checkedAt:1794480000,refreshAfter:0,
    eligibility:{eligible:true,checks:{age:true,stars:true,prs:true,followers:true}},
    evidence:{createdAt:'2012-06-01T00:00:00Z',daysOld:5260,
      publicNonForkReposObserved:204,rawStarsObserved:764,externalMergedPRsObserved:37,
      followersObserved:154,coverage:{reposComplete:true,prsComplete:false}}}}));
  await page.reload();
  assert.match(await page.locator('#qualification-summary').innerText(),/符合登记门槛/);
  for(const id of ['check-age','check-stars','check-prs','check-followers'])
    assert.equal(await page.locator('#'+id).getAttribute('data-state'),'pass');
  await page.locator('#consent').check();
  assert.equal(await page.locator('#enroll').isEnabled(),true);
  assert.deepEqual(errors,[]);
  await context.close();
});


test('missing age evidence shows only age unknown; passing Star, PR and followers stay green', async () => {
  const {page,context,errors}=await pageFor(true);
  await page.route('**/api/dc2/config',route=>route.fulfill({json:{loginReady:true,eligibilityApi:'v1',
    issuance:{enabled:true,chainId:42161,contract:'0xD891dc80535e885E5893B8139902F90F6aBA086b'}}}));
  await page.route('**/api/dc2/me',route=>route.fulfill({json:{authenticated:true,
    user:{id:1884104,login:'picasso250'},checkedAt:1794480000,refreshAfter:0,
    eligibility:{eligible:false,checks:{age:null,stars:true,prs:true,followers:true}},
    evidence:{daysOld:5260,publicNonForkReposObserved:204,rawStarsObserved:762,
      externalMergedPRsObserved:37,followersObserved:153,
      coverage:{reposComplete:true,prsComplete:false}}}}));
  await page.reload();
  assert.equal(await page.locator('#check-age').getAttribute('data-state'),'unknown');
  for(const id of ['check-stars','check-prs','check-followers'])
    assert.equal(await page.locator('#'+id).getAttribute('data-state'),'pass');
  await page.locator('#consent').check();
  assert.equal(await page.locator('#enroll').isDisabled(),true);
  assert.deepEqual(errors,[]);
  await context.close();
});
