import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Wallet, Transactions, CHAIN, ADDRESS, RUNTIME_HASH, abi, depositValue, readPosition, checkBlock } from '../dist/core.mjs';
import { keccak256 } from '../dist/ethers.min.js';

const code = readFileSync(new URL('./fixtures/runtime.hex', import.meta.url), 'utf8').trim();
const account = '0x' + '12'.repeat(20), other = '0x' + '34'.repeat(20), hash = '0x' + 'ab'.repeat(32);
const block = () => ({ number: '0x100', timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16), hash: '0x' + 'cd'.repeat(32) });
function fixture(options = {}) {
  const events = new Map(), sent = [], calls = [];
  const state = { account, chain: CHAIN, principal: 100000000000000000n, pending: 500000000000000000n, ...options };
  const read = async (method, params = []) => {
    calls.push({ method, params });
    if (method === 'eth_chainId') return state.rpcChain || CHAIN;
    if (method === 'eth_getCode') return state.code ?? code;
    if (method === 'eth_getBlockByNumber') return state.block ?? block();
    if (method === 'eth_getTransactionReceipt') {
      if (state.receiptError) throw Error('offline');
      return { transactionHash: hash, from: account, to: ADDRESS, blockNumber: '0x100', blockHash: block().hash, status: '0x1', ...state.receipt };
    }
    if (method === 'eth_call') {
      const name = abi.parseTransaction(params[0]).name;
      const results = { positions: [123n, state.principal], pending: [state.pending], balanceOf: [2n * 10n ** 18n], requiredDeposit: [200000000000000000n] };
      return abi.encodeFunctionResult(name, results[name]);
    }
    throw Error(method);
  };
  const provider = {
    async request({ method, params }) {
      if (method === 'eth_accounts') return [state.account];
      if (method === 'eth_chainId') return state.chain;
      if (method === 'eth_sendTransaction') { sent.push(params[0]); if (state.sendError) throw state.sendError; return state.hash ?? hash; }
      if (method === 'eth_getBlockByNumber' && state.walletBlock) return state.walletBlock;
      if (method === 'eth_getCode' && state.walletCode) return state.walletCode;
      return read(method, params);
    },
    on(event, listener) { events.set(event, listener); },
    removeListener(event) { events.delete(event); },
  };
  const guarded = new Proxy(provider, { get(target, key) {
    if (!['request', 'on', 'removeListener'].includes(key)) throw Error(`Unexpected Proxy property: ${String(key)}`);
    return Reflect.get(target, key);
  } });
  const wallet = new Wallet(guarded);
  const transactions = new Transactions(read);
  const run = async (kind = 'deposit', confirm = async () => true) => transactions.run(wallet, await wallet.identity(), kind, 1n, confirm);
  return { wallet, transactions, run, sent, state, events, read, calls };
}
test('fixture is the exact fixed deployed runtime', () => assert.equal(keccak256(code), RUNTIME_HASH));
test('ETH input uses exact wei, rejects zero, exponent, negatives and >18 decimals', () => {
  assert.equal(depositValue('0.000000000000000001'), 1n);
  assert.equal(depositValue('0.1'), 10n ** 17n);
  for (const input of ['0', '-1', '1e-3', 'NaN', '.1', '01', '1.0000000000000000001', '']) assert.throws(() => depositValue(input));
});
test('all displayed amounts come from the same block; historical reward remains claimable below threshold', async () => {
  const f = fixture(); const p = await readPosition(account, f.read);
  assert.ok(p.principal < p.required); assert.ok(p.pending > 0n);
  assert.equal(p.balance, 2n * 10n ** 18n);
  assert.ok(f.calls.filter(c => c.method === 'eth_call').every(c => c.params[1] === p.block.number));
  await f.run('claim'); assert.equal(f.sent[0].data, abi.encodeFunctionData('claim'));
});
test('strict Proxy wallet works without then/vendor property access; sends fixed chain/address/account and exact wei', async () => {
  const f = fixture(); await f.run();
  assert.deepEqual(f.sent, [{ from: account, to: ADDRESS, chainId: CHAIN, data: abi.encodeFunctionData('deposit'), value: '0x1' }]);
  f.wallet.dispose();
});
test('withdraw is parameterless and sends zero ETH, even below reward threshold', async () => {
  const f = fixture({ pending: 0n }); await f.run('withdraw');
  assert.equal(f.sent[0].value, '0x0'); assert.equal(f.sent[0].data, abi.encodeFunctionData('withdraw'));
});
for (const [label, options, pattern] of [
  ['wrong wallet chain', { chain: '0x1' }, /Sepolia/],
  ['wrong data chain', { rpcChain: '0x1' }, /Sepolia/],
  ['runtime mismatch', { code: '0x' }, /Hash/],
  ['wallet runtime mismatch', { walletCode: '0x00' }, /Hash/],
  ['stale block', { block: { ...block(), timestamp: '0x1' } }, /过旧/],
  ['wallet too far behind', { walletBlock: { ...block(), number: '0x10' } }, /高度/],
]) test(`${label} blocks every send`, async () => {
  const f = fixture(options); await assert.rejects(f.run(), pattern); assert.equal(f.sent.length, 0);
});
for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) test(`${event} during confirmation aborts send`, async () => {
  const f = fixture(); await assert.rejects(f.run('deposit', async () => { f.events.get(event)(); return true; }), /变化/);
  assert.equal(f.sent.length, 0);
});
test('account change without event is caught by final eth_accounts', async () => {
  const f = fixture(); await assert.rejects(f.run('deposit', async () => { f.state.account = other; return true; }), /变化/);
  assert.equal(f.sent.length, 0);
});
test('cancel confirmation sends nothing', async () => { const f = fixture(); await f.run('deposit', async () => false); assert.equal(f.sent.length, 0); });
test('empty positions cannot withdraw and zero rewards cannot claim', async () => {
  const f = fixture({ principal: 0n, pending: 0n });
  await assert.rejects(f.run('withdraw'), /本金/); await assert.rejects(f.run('claim'), /奖励/); assert.equal(f.sent.length, 0);
});
test('synchronous lock rejects simultaneous operations', async () => {
  const f = fixture(); let resume, entered;
  const ready = new Promise(r => { entered = r; });
  const first = f.run('deposit', () => new Promise(r => { resume = r; entered(); }));
  await ready; await assert.rejects(f.run(), /已有交易/); resume(true); await first; assert.equal(f.sent.length, 1);
});
test('explicit wallet rejection releases lock', async () => {
  const f = fixture({ sendError: { code: 4001 } }); await assert.rejects(f.run(), /取消/);
  assert.equal(f.transactions.uncertain, false); f.state.sendError = null; await f.run();
});
for (const options of [{ sendError: Error('connection lost') }, { hash: 'bad' }, { receiptError: true }, { receipt: { to: other } }, { receipt: { blockHash: '0x0' } }]) {
  test(`ambiguous send/receipt locks the page: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options); await assert.rejects(f.run(), /结果未知/);
    assert.equal(f.transactions.uncertain, true); await assert.rejects(f.run(), /已有交易/); assert.equal(f.sent.length, 1);
  });
}
test('confirmed revert is failure, not unknown; releases lock', async () => {
  const f = fixture({ receipt: { status: '0x0' } }); await assert.rejects(f.run(), /执行失败/); assert.equal(f.transactions.uncertain, false);
});
test('future-dated blocks fail closed', () => assert.throws(() => checkBlock({ ...block(), timestamp: '0xffffffffff' }), /时间/));
