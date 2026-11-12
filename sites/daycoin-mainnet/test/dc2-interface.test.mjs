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

test('registered wallet automatically shows live balance and Claim after GitHub login', async () => {
  const context=await browser.newContext({viewport:{width:1280,height:820}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(() => {
    const address='0x5E81BF553E9Ab75872a47bAd30A0fd3589AD215E';
    const word=n=>BigInt(n).toString(16).padStart(64,'0');
    const since=1794480351;
    window.ethereum={request:async({method,params})=>{
      if(method==='eth_accounts'||method==='eth_requestAccounts')return [address];
      if(method==='eth_chainId')return '0xa4b1';
      if(method==='eth_call'){
        const data=params[0].data;
        if(data.startsWith('0x61b5cb4b'))return '0x'+word(1884104);
        if(data.startsWith('0x99fbab88'))return '0x'+word(address)+word(since)+word(0);
        if(data.startsWith('0x70a08231'))return '0x'+word(2000000000000000000n);
      }
      if(method==='eth_getBlockByNumber')return {timestamp:'0x'+(since+43200).toString(16)};
      throw Error('Unexpected RPC: '+method);
    }};
  });
  await page.route('**/api/dc2/config',route=>route.fulfill({json:{loginReady:true,
    issuance:{enabled:true,chainId:42161,contract:'0xD891dc80535e885E5893B8139902F90F6aBA086b'}}}));
  await page.route('**/api/dc2/me',route=>route.fulfill({json:{authenticated:true,
    user:{id:1884104,login:'picasso250'},checkedAt:1794480000,refreshAfter:0,
    eligibility:{eligible:true,checks:{age:true,stars:true,prs:true,followers:true}},
    evidence:{daysOld:5260,createdAt:'2012-06-01T00:00:00Z',publicNonForkReposObserved:204,
      rawStarsObserved:762,externalMergedPRsObserved:37,followersObserved:153,
      coverage:{reposComplete:true,prsComplete:false}}}}));
  await page.goto(base+'/dc2/');
  await page.locator('#wallet-dashboard:not(.hidden)').waitFor();
  assert.equal(await page.locator('#wallet-balance').innerText(),'2');
  assert.equal(await page.locator('#wallet-pending').innerText(),'0.5');
  assert.equal(await page.locator('#claim').isEnabled(),true);
  assert.equal(await page.locator('#wallet-reload').count(),0);
  assert.equal(await page.locator('#enrollment').isVisible(),false);
  assert.match(await page.locator('#wallet-identity').innerText(),/GitHub ID 1884104/);
  assert.deepEqual(errors,[]);
  await context.close();
});

test('registered wallet state never inferred from GitHub eligibility alone', async () => {
  const context=await browser.newContext();const page=await context.newPage();
  await page.addInitScript(()=>{
    window.ethereum={request:async({method})=>{
      if(method==='eth_accounts')return ['0x5E81BF553E9Ab75872a47bAd30A0fd3589AD215E'];
      if(method==='eth_chainId')return '0xa4b1';
      if(method==='eth_call')return '0x'+(0n).toString(16).padStart(64,'0');
      throw Error('Unexpected '+method);
    }};
  });
  await page.route('**/api/dc2/config',route=>route.fulfill({json:{loginReady:true,
    issuance:{enabled:true,chainId:42161,contract:'0xD891dc80535e885E5893B8139902F90F6aBA086b'}}}));
  await page.route('**/api/dc2/me',route=>route.fulfill({json:{authenticated:true,
    user:{id:1884104,login:'picasso250'},checkedAt:1794480000,refreshAfter:0,
    eligibility:{eligible:true,checks:{age:true,stars:true,prs:true,followers:true}},
    evidence:{daysOld:5260,createdAt:'2012-06-01T00:00:00Z',publicNonForkReposObserved:204,
      rawStarsObserved:762,externalMergedPRsObserved:37,followersObserved:153,
      coverage:{reposComplete:true,prsComplete:false}}}}));
  await page.goto(base+'/dc2/');
  await page.locator('#wallet-connect-status').filter({hasText:'尚未登记'}).waitFor();
  assert.equal(await page.locator('#wallet-dashboard').isVisible(),false);
  assert.equal(await page.locator('#enrollment').isVisible(),true);
  await context.close();
});

test('Claim requires user confirmation, uses fixed selector, and waits for receipt before success', async () => {
  const context=await browser.newContext();const page=await context.newPage();
  const events=[];page.on('pageerror',e=>events.push(e.message));
  await page.addInitScript(()=>{
    const address='0x5E81BF553E9Ab75872a47bAd30A0fd3589AD215E';
    const word=n=>BigInt(n).toString(16).padStart(64,'0');
    const since=1794480351;
    window.__sent=[];
    window.ethereum={request:async({method,params})=>{
      if(method==='eth_accounts'||method==='eth_requestAccounts')return [address];
      if(method==='eth_chainId')return '0xa4b1';
      if(method==='eth_call'){
        const selector=params[0].data.slice(0,10);
        if(selector==='0x61b5cb4b')return '0x'+word(1884104);
        if(selector==='0x99fbab88')return '0x'+word(address)+word(since)+word(0);
        if(selector==='0x70a08231')return '0x'+word(0);
      }
      if(method==='eth_getBlockByNumber')return {timestamp:'0x'+(since+86400).toString(16)};
      if(method==='eth_sendTransaction'){
        window.__sent.push(params[0]);return '0x'+'ab'.repeat(32);
      }
      if(method==='eth_getTransactionReceipt')return {status:'0x1'};
      throw Error('Unexpected RPC: '+method);
    }};
  });
  await page.route('**/api/dc2/config',route=>route.fulfill({json:{loginReady:true,
    issuance:{enabled:true,chainId:42161,contract:'0xD891dc80535e885E5893B8139902F90F6aBA086b'}}}));
  await page.route('**/api/dc2/me',route=>route.fulfill({json:{authenticated:true,
    user:{id:1884104,login:'picasso250'},checkedAt:1794480000,refreshAfter:0,
    eligibility:{eligible:true,checks:{age:true,stars:true,prs:true,followers:true}},
    evidence:{daysOld:5260,createdAt:'2012-06-01T00:00:00Z',publicNonForkReposObserved:204,
      rawStarsObserved:762,externalMergedPRsObserved:37,followersObserved:153,
      coverage:{reposComplete:true,prsComplete:false}}}}));
  await page.goto(base+'/dc2/');
  await page.locator('#wallet-dashboard:not(.hidden)').waitFor();
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('#claim').click();
  assert.equal(await page.evaluate(()=>window.__sent.length),0);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#claim').click();
  await page.locator('#wallet-result').filter({hasText:'已在 Arbitrum One 确认'}).waitFor();
  const sent=await page.evaluate(()=>window.__sent);
  assert.equal(sent.length,1);
  assert.equal(sent[0].data,'0x4e71d92d');
  assert.equal(sent[0].to,'0xD891dc80535e885E5893B8139902F90F6aBA086b');
  assert.deepEqual(events,[]);
  await context.close();
});
