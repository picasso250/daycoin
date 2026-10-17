import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ADDRESS, CHAIN, abi } from '../dist/core.mjs';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5174';
const code = (await readFile(new URL('./fixtures/runtime.hex', import.meta.url), 'utf8')).trim();
const account = '0x' + '12'.repeat(20), hash = '0x' + 'ab'.repeat(32);
const block = { number: '0x100', timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16), hash: '0x' + 'cd'.repeat(32) };
let browser;
before(async () => { browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true }); });
after(async () => { await browser?.close(); });
async function setup(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://ethereum-rpc.publicnode.com/**', async route => {
    const { method, params } = route.request().postDataJSON(); let result;
    if (method === 'eth_chainId') result = CHAIN;
    if (method === 'eth_getCode') result = code;
    if (method === 'eth_getBlockByNumber') result = block;
    if (method === 'eth_getTransactionReceipt') result = { transactionHash: hash, from: account, to: ADDRESS, blockNumber: block.number, blockHash: block.hash, status: '0x1' };
    if (method === 'eth_call') {
      const name = abi.parseTransaction(params[0]).name;
      const values = { positions: [1n, 100000000000000000n], pending: [500000000000000000n], balanceOf: [2n * 10n ** 18n], requiredDeposit: [200000000000000000n] };
      result = abi.encodeFunctionResult(name, values[name]);
    }
    await route.fulfill({ json: { jsonrpc: '2.0', id: 1, result } });
  });
  await page.addInitScript(({ account, chain, code, block, hash, options }) => {
    const events = new Map(); window.testWallet = { account, chain, sent: [], ...options };
    const provider = new Proxy({
      async request({ method, params }) {
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
    window.testWallet.emit = event => events.get(event)?.();
    window.addEventListener('eip6963:requestProvider', () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { name: 'Test EIP-1193' }, provider } })));
  }, { account, chain: CHAIN, code, block, hash, options });
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  return { page, context, errors };
}
test('desktop/mobile layout, fixed contract, strict Proxy wallet and historical claim eligibility', async () => {
  const { page, context, errors } = await setup();
  try {
    await page.locator('#connect').click(); await page.waitForFunction(() => !document.querySelector('#claim').disabled);
    assert.equal(await page.locator('#principal').textContent(), '0.1');
    assert.equal(await page.locator('#pending').textContent(), '0.5');
    assert.equal(await page.locator('#balance').textContent(), '2.0');
    assert.match(await page.locator('#eligibility').textContent(), /未达标/);
    assert.equal(await page.locator('#contract').textContent(), ADDRESS);
    await mkdir(new URL('../test-output/', import.meta.url), { recursive: true });
    await page.screenshot({ path: new URL('../test-output/desktop.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: new URL('../test-output/mobile.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
for (const kind of ['deposit', 'claim', 'withdraw']) test(`browser ${kind} requires confirmation and sends only expected call`, async () => {
  const { page, context, errors } = await setup();
  try {
    await page.locator('#connect').click(); await page.waitForFunction(() => !document.querySelector('#claim').disabled);
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
    await page.locator('#connect').click(); await page.waitForFunction(() => !document.querySelector('#claim').disabled);
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
    await page.locator('#connect').click(); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('请在钱包中切换'));
    for (const kind of ['deposit', 'claim', 'withdraw']) assert.equal(await page.locator('#' + kind).isDisabled(), true);
  } finally { await context.close(); }
});
test('unknown broadcast blocks all later transactions, including after refresh', async () => {
  const { page, context } = await setup({ fail: true });
  try {
    await page.locator('#connect').click(); await page.waitForFunction(() => !document.querySelector('#claim').disabled);
    await page.locator('#tab-claim').click(); await page.locator('#claim').click(); await page.getByRole('button', { name: '我已了解，继续到钱包' }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('交易结果未知'));
    await page.locator('#refresh').click(); await page.waitForFunction(() => !document.querySelector('#refresh').disabled);
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
