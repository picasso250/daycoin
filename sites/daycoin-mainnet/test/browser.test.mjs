import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { overviewAbi } from '../dist/dashboard.mjs';
import { ADDRESS, CHAIN, abi } from '../dist/core.mjs';

import { startPreview } from '../preview.mjs';
const server = await startPreview(0);
const base = `http://127.0.0.1:${server.address().port}`;
const code = (await readFile(new URL('./fixtures/runtime.hex', import.meta.url), 'utf8')).trim();
const account = '0x' + '12'.repeat(20), hash = '0x' + 'ab'.repeat(32);
const block = { number: '0x100', timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16), hash: '0x' + 'cd'.repeat(32) };
let browser;
before(async () => { browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true }); });
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
async function setup(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage(); const errors = [], rpcCalls = [], journeyEvents = [];
  const headers = await readFile(new URL('../dist/_headers', import.meta.url), 'utf8');
  const csp = headers.match(/Content-Security-Policy: (.+)/)[1];
  await page.route(base + '/**', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  await page.route(base + '/api/journey', async route => {
    journeyEvents.push(route.request().postDataJSON());
    await route.fulfill({ status: 204, body: '' });
  });
  let releaseThreshold;
  const thresholdGate = options.holdThreshold ? new Promise(resolve => { releaseThreshold = resolve; }) : null;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://ethereum-rpc.publicnode.com/**', async route => {
    const { method, params } = route.request().postDataJSON(); rpcCalls.push(method); let result;
    if (method === 'eth_getBalance') {
      if (options.balanceError) { await route.fulfill({ json: { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'unavailable' } } }); return; }
      result = params[0].toLowerCase() === ADDRESS.toLowerCase() ? '0x16345785d8a0000' : '0x29a2241af62c0000';
    }
    if (method === 'eth_chainId') result = CHAIN;
    if (method === 'eth_getCode') result = code;
    if (method === 'eth_getBlockByNumber') result = block;
    if (method === 'eth_getTransactionReceipt') result = { transactionHash: hash, from: account, to: ADDRESS, blockNumber: block.number, blockHash: block.hash, status: '0x1' };
    if (method === 'eth_call') {
      const parsed = abi.parseTransaction(params[0]) || overviewAbi.parseTransaction(params[0]);
      const name = parsed.name;
      if (name === 'requiredDeposit' && thresholdGate) await thresholdGate;
      const values = { positions: [options.activeReward ? BigInt(block.timestamp) : 1n, 100000000000000000n], pending: [options.activeReward ? 0n : 500000000000000000n], balanceOf: [2n * 10n ** 18n], requiredDeposit: [options.activeReward ? 100000000000000000n : 200000000000000000n], totalSupply: [3000000000000000000n], currentEpoch: [options.activeReward ? 0n : 1n], genesisTime: [options.activeReward ? BigInt(block.timestamp) - 3600n : 1600000000n], EPOCH_DURATION: [86400000n] };
      result = (abi.getFunction(name) ? abi : overviewAbi).encodeFunctionResult(name, values[name]);
    }
    await route.fulfill({ json: { jsonrpc: '2.0', id: 1, result } });
  });
  await page.addInitScript(({ account, chain, code, block, hash, options }) => {
    const events = new Map(); window.testWallet = { account, chain, sent: [], authorizations: 0, ...options };
    const provider = new Proxy({
      async request({ method, params }) {
        if (method === 'eth_requestAccounts') { window.testWallet.authorizations++; if (options.reject) throw { code: 4001 }; }
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [window.testWallet.account];
        if (method === 'eth_chainId') return window.testWallet.chain;
        if (method === 'eth_getCode') return code;
        if (method === 'eth_getBlockByNumber') return block;
        if (method === 'eth_sendTransaction') { window.testWallet.sent.push(params[0]); if (window.testWallet.fail) throw Error('lost response'); return hash; }
        throw Error(method);
      },
      on(event, callback) { events.set(event, callback); },
      removeListener(event) { events.delete(event); },
    }, { get(target, key) {
      if (!['request', 'on', 'removeListener'].includes(key)) throw Error('Proxy property: ' + String(key));
      return Reflect.get(target, key);
    } });
    window.announceRabby = () => {
      const rabby = new Proxy(provider, { get(target, key) {
        if (key === 'request') return async ({ method, params }) => {
          if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['0x' + '34'.repeat(20)];
          return target.request({ method, params });
        };
        return Reflect.get(target, key);
      } });
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { name: 'Rabby' }, provider: rabby } }));
    };
    window.testWallet.emit = event => events.get(event)?.();
    if (!options.noWallet) window.addEventListener('eip6963:requestProvider', () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { name: 'Test EIP-1193' }, provider } })));
  }, { account, chain: CHAIN, code, block, hash, options });
  await page.goto(base + (options.lang === 'en' ? '/' : '/zh/'));
  await page.evaluate(() => document.fonts.ready);
  return { page, context, errors, rpcCalls, journeyEvents, releaseThreshold };
}
test('deposit amount defaults to the live on-chain threshold and stays editable', async () => {
  const { page, context, errors } = await setup();
  try {
    assert.equal(await page.locator('.test-strip').count(), 0);
    assert.equal(await page.locator('header').evaluate(el => el.getBoundingClientRect().top), 0);
    assert.match(await page.locator('#panel-deposit .action-copy > p').first().textContent(), /每天累计 1 枚 DC1（按秒计算，需手动领取）/);
    assert.match(await page.locator('#panel-deposit .action-copy > p').first().textContent(), /未达标不会累计；多存也不会更快/);
    await page.waitForFunction(() => document.querySelector('#amount-help').textContent.includes('0.2 ETH'));
    assert.equal(await page.locator('#amount-help').textContent(), '当前发行门槛：0.2 ETH');
    assert.equal(await page.locator('#deposit-amount').inputValue(), '0.2');
    assert.equal(await page.locator('#deposit-amount').getAttribute('placeholder'), null);
    await page.locator('#connect').click();
    await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#deposit').disabled);
    assert.equal(await page.evaluate(() => testWallet.sent.length), 0);
    await page.locator('#deposit').click();
    await page.locator('#confirmation').waitFor({ state: 'visible' });
    assert.ok((await page.locator('#confirm-body').textContent()).includes('0.2 ETH'));
    assert.equal(await page.evaluate(() => testWallet.sent.length), 0);
    await page.locator('#confirmation button[value="cancel"]').click();
    await page.locator('#deposit-amount').fill('0.02');
    await page.locator('#connect').click();
    await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#deposit').disabled);
    assert.equal(await page.locator('#deposit-amount').inputValue(), '0.02');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('manual input before the chain response is preserved when the threshold arrives', async () => {
  const { page, context, errors, releaseThreshold } = await setup({ holdThreshold: true });
  try {
    assert.equal(await page.locator('#deposit-amount').inputValue(), '0.1');
    assert.equal(await page.locator('#amount-help').textContent(), '当前发行门槛：读取中…');
    await page.locator('#deposit-amount').fill('0.07');
    releaseThreshold();
    await page.waitForFunction(() => document.querySelector('#amount-help').textContent === '当前发行门槛：0.2 ETH');
    assert.equal(await page.locator('#deposit-amount').inputValue(), '0.07');
    assert.deepEqual(errors, []);
  } finally { releaseThreshold(); await context.close(); }
});

test('desktop/mobile layout, fixed contract, strict Proxy wallet and historical claim eligibility', async () => {
  const { page, context, errors } = await setup();
  try {
    await page.locator('#connect').click(); await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('#claim').disabled);
    assert.equal(await page.locator('#principal').textContent(), '0.1000');
    assert.equal(await page.locator('#pending').textContent(), '0.50000');
    assert.equal(await page.locator('#balance').textContent(), '2.0000');
    assert.match(await page.locator('#eligibility').textContent(), /未达标/);
    assert.equal(await page.locator('#contract').textContent(), ADDRESS);
    assert.equal(await page.locator('.status-pill').textContent(), 'ETHEREUM MAINNET');
    assert.equal(await page.locator('meta[name="description"]').getAttribute('content').then(s => s.includes('v0.2')), false);
    assert.equal(await page.locator('.intro p').textContent().then(s => s.includes('UBI 是远景，DC1 是从今天开始的实验。')), true);
    assert.equal(await page.locator('.intro p').textContent().then(s => s.includes('没有主人，只有规则。自由加入，自由离开。')), true);
    assert.equal(await page.locator('.footer-network').getAttribute('href'), `https://etherscan.io/address/${ADDRESS}`);
    await mkdir(new URL('../test-output/', import.meta.url), { recursive: true });
    await page.screenshot({ path: new URL('../test-output/desktop.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: new URL('../test-output/mobile.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), fullPage: true });
    await page.setViewportSize({ width: 820, height: 1000 });
    assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#pending')).fontSize) > parseFloat(getComputedStyle(document.querySelector('.stamp-number')).fontSize)), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
for (const kind of ['deposit', 'claim', 'withdraw']) test(`browser ${kind} requires confirmation and sends only expected call`, async () => {
  const { page, context, errors } = await setup();
  try {
    await page.locator('#connect').click(); await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('#claim').disabled);
    await page.locator('#deposit-amount').fill('0.000000000000000001');
    await page.locator('#tab-' + kind).click(); await page.locator('#' + kind).click(); await page.locator('#confirmation').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => testWallet.sent.length), 0);
    if (kind === 'deposit') assert.match(await page.locator('#confirm-warning').textContent(), /永久归零/);
    if (kind === 'withdraw') assert.match(await page.locator('#confirm-body').textContent(), /全部记录本金：0.1 ETH/);
    await page.getByRole('button', { name: '我已了解，继续到钱包' }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('交易已在 Mainnet 确认'));
    const sent = await page.evaluate(() => testWallet.sent);
    assert.equal(sent.length, 1); assert.equal(sent[0].to, ADDRESS); assert.equal(sent[0].chainId, CHAIN);
    assert.equal(sent[0].data, abi.encodeFunctionData(kind)); assert.equal(sent[0].value, kind === 'deposit' ? '0x1' : '0x0');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
test('account event closes open confirmation, clears old balances, sends nothing', async () => {
  const { page, context } = await setup();
  try {
    await page.locator('#connect').click(); await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('#claim').disabled);
    await page.locator('#tab-withdraw').click(); await page.locator('#withdraw').click(); await page.locator('#confirmation').waitFor({ state: 'visible' });
    await page.evaluate(() => { testWallet.account = '0x' + '34'.repeat(20); testWallet.emit('accountsChanged'); });
    await page.locator('#confirmation').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#principal').textContent(), '—');
    assert.equal(await page.evaluate(() => testWallet.sent.length), 0);
    assert.equal(await page.locator('#deposit').isDisabled(), true);
  } finally { await context.close(); }
});
test('wrong network has no enabled transaction buttons', async () => {
  const { page, context } = await setup({ chain: '0xaa36a7' });
  try {
    await page.locator('#connect').click(); await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click(); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('请在钱包中切换'));
    for (const kind of ['deposit', 'claim', 'withdraw']) assert.equal(await page.locator('#' + kind).isDisabled(), true);
  } finally { await context.close(); }
});
test('unknown broadcast blocks all later transactions without a manual refresh control', async () => {
  const { page, context } = await setup({ fail: true });
  try {
    await page.locator('#connect').click(); await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('#claim').disabled);
    await page.locator('#tab-claim').click(); await page.locator('#claim').click(); await page.getByRole('button', { name: '我已了解，继续到钱包' }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('交易结果未知'));
    assert.equal(await page.locator('#refresh').count(), 0);
    for (const kind of ['deposit', 'claim', 'withdraw']) assert.equal(await page.locator('#' + kind).isDisabled(), true);
    assert.equal(await page.evaluate(() => testWallet.sent.length), 1);
  } finally { await context.close(); }
});
test('keyboard tabs, reduced motion and narrow viewport preserve accessible actions', async () => {
  const { page, context } = await setup();
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.locator('#tab-deposit').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#tab-claim').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#panel-claim').isVisible(), true);
    await page.keyboard.press('End');
    assert.equal(await page.locator('#panel-withdraw').isVisible(), true);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#panel-withdraw')).animationName), 'none');
    await page.evaluate(() => { document.querySelector('#pending').textContent = '123456.123456789012345678'; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.ok(await page.locator('body').textContent().then(s => s.includes('真实 ETH') && !/Sepolia|测试 ETH|Top Up/.test(s)));
  } finally { await context.close(); }
});

test('protocol is exactly six metrics in two columns on desktop and small phones', async () => {
  for (const lang of ['en', 'zh']) {
    const { page, context, errors } = await setup({ lang });
    try {
      await page.waitForFunction(() => document.querySelector('#total-principal').textContent !== '—');
      assert.equal(await page.locator('.protocol-grid > div').count(), 6);
      assert.equal(await page.locator('#total-supply').textContent(), '3');
      assert.equal(await page.locator('#total-principal').textContent(), '0.1');
      assert.equal(await page.locator('#protocol-required').textContent(), '0.2');
      assert.match(await page.locator('#total-accrued').textContent(), /^\d+(?:\.\d{1,4})?$/);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        const columns = await page.locator('.protocol-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
        assert.equal(columns, 2, `${lang} at ${width}px`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('wallet picker detects before authorization, displays full address and supports copy and switching', async () => {
  const { page, context, errors } = await setup();
  try {
    assert.equal(await page.locator('select').count(), 0);
    await page.locator('#connect').click();
    assert.match(await page.locator('#wallet-feedback').textContent(), /Loading/);
    assert.equal(await page.evaluate(() => testWallet.authorizations), 0);
    await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#claim').disabled);
    assert.equal(await page.locator('#connect').textContent(), '0x1212…1212 ▾');
    assert.deepEqual(await page.locator('#connect').evaluate(el => ({ padding: getComputedStyle(el).paddingLeft, minWidth: getComputedStyle(el).minWidth })), { padding: '12px', minWidth: '0px' });
    assert.equal(await page.locator('#eth-balance').textContent(), '3.0000');
    assert.equal(await page.locator('#gap-status').textContent(), '距离达标还差：0.1 ETH');
    assert.equal(await page.locator('#total-supply').textContent(), '3');
    assert.equal(await page.locator('#total-principal').textContent(), '0.1');
    assert.notEqual(await page.locator('#total-accrued').textContent(), '—');
    assert.equal(await page.locator('#current-epoch').textContent(), '1');
    assert.equal(await page.locator('#next-epoch').textContent(), new Date(1772800000 * 1000).toISOString().slice(0, 16).replace('T', ' '));
    await page.locator('#connect').click();
    assert.equal(await page.locator('#full-account').textContent(), account);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#copy-address').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), account);
    await page.evaluate(() => announceRabby());
    await page.getByRole('button', { name: 'Rabby ↗', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#connect').textContent.includes('0x3434'));
    await page.waitForFunction(() => !document.querySelector('#claim').disabled);
    await page.locator('#connect').click();
    assert.equal(await page.locator('#full-account').textContent(), '0x' + '34'.repeat(20));
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: new URL('../test-output/wallet-menu.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
  } finally { await context.close(); }
});
test('missing wallets show installation guidance without an authorization request', async () => {
  const { page, context } = await setup({ noWallet: true });
  try {
    await page.locator('#connect').click();
    await page.waitForFunction(() => document.querySelector('#wallet-feedback').textContent.includes('未检测到钱包'));
    assert.equal(await page.locator('.wallet-choice').count(), 0);
    assert.equal(await page.evaluate(() => testWallet.authorizations), 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#wallet-menu').isVisible(), false);
  } finally { await context.close(); }
});
test('failed ETH read displays dash while principal and operations remain available', async () => {
  const { page, context } = await setup({ balanceError: true });
  try {
    await page.locator('#connect').click();
    await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#claim').disabled);
    assert.equal(await page.locator('#eth-balance').textContent(), '—');
    assert.equal(await page.locator('#principal').textContent(), '0.1000');
  } finally { await context.close(); }
});
test('pending ticks locally each second with five decimals and no repeated RPC reads', async () => {
  const { page, context, errors, rpcCalls } = await setup({ activeReward: true });
  try {
    assert.equal(await page.locator('#refresh').count(), 0);
    await page.locator('#connect').click();
    await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#eth-balance').textContent !== '—');
    assert.equal(await page.locator('#gap-status').textContent(), '✓ 已达标');
    assert.equal(await page.locator('#amount-help').textContent(), '当前发行门槛：0.1 ETH');
    const first = await page.locator('#pending').textContent();
    assert.match(first, /^\d+\.\d{5}$/);
    const calls = rpcCalls.length;
    await page.waitForFunction(previous => Number(document.querySelector('#pending').textContent) > Number(previous), first, { timeout: 4000 });
    const second = await page.locator('#pending').textContent();
    assert.match(second, /^\d+\.\d{5}$/);
    assert.equal(rpcCalls.length, calls, 'timer must not poll RPC');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('connection rejection stays in menu with a retryable wallet choice', async () => {
  const { page, context } = await setup({ reject: true });
  try {
    await page.locator('#connect').click();
    await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#wallet-feedback').textContent.includes('已取消连接'));
    assert.equal(await page.locator('#wallet-menu').isVisible(), true);
    assert.equal(await page.locator('.wallet-choice').isEnabled(), true);
    assert.equal(await page.locator('#connect').textContent(), '连接钱包 ↗');
  } finally { await context.close(); }
});

for (const kind of ['deposit', 'claim', 'withdraw']) test(`English ${kind}: exact transaction, cancellation, disclosures and responsive layout`, async () => {
  const { page, context, errors } = await setup({ lang: 'en' });
  try {
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.locator('#connect').click();
    await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#claim').disabled);
    assert.match(await page.locator('#eligibility').textContent(), /Below threshold/);
    await page.locator('#deposit-amount').fill('0.000000000000000001');
    await page.locator('#tab-' + kind).click();
    await page.locator('#' + kind).click();
    await page.locator('#confirmation').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => testWallet.sent.length), 0);
    if (kind === 'deposit') assert.match(await page.locator('#confirm-warning').textContent(), /permanently forfeits.*0.5 DC1.*cancel and Claim first/s);
    if (kind === 'withdraw') {
      assert.match(await page.locator('#confirm-warning').textContent(), /does not automatically Claim.*forfeited/s);
      assert.match(await page.locator('#confirm-body').textContent(), /all recorded principal: 0.1 ETH/);
    }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('.language-switch').isVisible(), true);
      assert.equal(await page.locator('#confirmation').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      await page.screenshot({ path: new URL(`../test-output/en-${kind}-${width}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), fullPage: true });
    }
    assert.doesNotMatch((await page.locator('body').textContent()).replace('中文', ''), /\p{Script=Han}/u);
    await page.locator('#confirmation button[value="cancel"]').click();
    assert.equal(await page.evaluate(() => testWallet.sent.length), 0);
    await page.locator('#' + kind).click();
    await page.getByRole('button', { name: 'I understand. Continue to wallet' }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Transaction confirmed on Mainnet'));
    const sent = await page.evaluate(() => testWallet.sent);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], { from: account, to: ADDRESS, chainId: CHAIN, data: abi.encodeFunctionData(kind), value: kind === 'deposit' ? '0x1' : '0x0' });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const [options, expected] of [
  [{ chain: '0xaa36a7' }, 'Switch your wallet to Ethereum Mainnet'],
  [{ noWallet: true }, 'No wallet detected'],
  [{ reject: true }, 'Connection cancelled'],
  [{ fail: true }, 'Transaction outcome unknown'],
]) test(`English wallet error: ${expected}`, async () => {
  const { page, context, errors } = await setup({ lang: 'en', ...options });
  try {
    await page.locator('#connect').click();
    if (!options.noWallet) await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click();
    if (options.fail) {
      await page.waitForFunction(() => !document.querySelector('#claim').disabled);
      await page.locator('#tab-claim').click(); await page.locator('#claim').click();
      await page.getByRole('button', { name: 'I understand. Continue to wallet' }).click();
    }
    await page.waitForFunction(text => document.body.textContent.includes(text), expected);
    for (const kind of ['deposit', 'claim', 'withdraw']) assert.equal(await page.locator('#' + kind).isDisabled(), true);
    assert.equal(await page.evaluate(() => testWallet.sent.length), options.fail ? 1 : 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('English amount validation and identity change never send a transaction', async () => {
  const { page, context, errors } = await setup({ lang: 'en' });
  try {
    await page.locator('#connect').click(); await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#deposit').disabled);
    await page.locator('#deposit-amount').fill('1e3'); await page.locator('#deposit').click();
    assert.match(await page.locator('#status').textContent(), /positive ETH amount/);
    await page.locator('#tab-withdraw').click(); await page.locator('#withdraw').click();
    await page.locator('#confirmation').waitFor({ state: 'visible' });
    await page.evaluate(() => testWallet.emit('accountsChanged'));
    await page.locator('#confirmation').waitFor({ state: 'hidden' });
    assert.match(await page.locator('#status').textContent(), /Operation cancelled|Your wallet account or network changed/);
    assert.equal(await page.locator('#deposit').isDisabled(), true);
    assert.equal(await page.evaluate(() => testWallet.sent.length), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('language links preserve page and anchor without wallet authorization', async () => {
  const { page, context } = await setup({ lang: 'en' });
  try {
    await page.goto(base + '/#protocol');
    await page.locator('.language-switch').click();
    assert.equal(page.url(), base + '/zh/#protocol');
    assert.equal(await page.evaluate(() => testWallet.authorizations), 0);
    for (const slug of ['whitepaper', 'manifesto']) {
      await page.goto(base + '/' + slug + '#section-3');
      await page.locator('.language-switch').click();
      assert.equal(page.url(), base + '/zh/' + slug + '#section-3');
      assert.equal(await page.locator('#section-3').count(), 1);
      await page.locator('.language-switch').click();
      assert.equal(page.url(), base + '/' + slug + '#section-3');
    }
  } finally { await context.close(); }
});

test('anonymous journey uses one temporary session across language navigation', async () => {
  const { page, context, errors, journeyEvents } = await setup({ lang: 'en' });
  try {
    await page.waitForFunction(() => sessionStorage.getItem('dc1_journey_v1'));
    await page.locator('#connect').click();
    await page.getByRole('button', { name: 'Test EIP-1193 ↗', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#deposit').disabled);
    await page.locator('#tab-claim').click();
    await page.locator('.language-switch').click();
    await page.waitForFunction(() => document.documentElement.lang === 'zh-CN');
    await page.waitForFunction(() => sessionStorage.getItem('dc1_journey_v1'));
    await page.waitForTimeout(200);
    const events = journeyEvents.map(x => x.event);
    for (const name of ['page_view', 'connect_click', 'wallet_select', 'connect_success', 'tab_claim']) assert.ok(events.includes(name), name);
    const ids = new Set(journeyEvents.map(x => x.session));
    assert.equal(ids.size, 1);
    assert.ok(journeyEvents.some(x => x.page === 'home_en'));
    assert.ok(journeyEvents.some(x => x.page === 'home_zh'));
    for (const item of journeyEvents) assert.deepEqual(Object.keys(item).sort(), ['event', 'page', 'session', 'step']);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
