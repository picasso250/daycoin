import { Interface, keccak256, parseEther, formatEther } from './ethers.min.js';

export const CHAIN = '0xaa36a7';
export const ADDRESS = '0x407892d5606b0FB91D77C62aC306566E01963674';
export const RUNTIME_HASH = '0x2c4e7b4318fa60fc3bf7b1560997d350585a8d474c82aa8def4818e91effe6db';
export const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
export const abi = new Interface([
  'function positions(address) view returns (uint64 cursor,uint256 principal)',
  'function pending(address) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function requiredDeposit() view returns (uint256)',
  'function deposit() payable', 'function claim()', 'function withdraw()',
]);
export const amount = formatEther;
export function depositValue(input) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(input)) throw Error('请输入正数 ETH 金额，最多 18 位小数。');
  const value = parseEther(input);
  if (value <= 0n || value >= 2n ** 256n) throw Error('存款金额必须大于 0 且在有效范围内。');
  return value;
}
export async function rpc(method, params = []) {
  const response = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('Sepolia 数据服务不可用，请稍后刷新。');
  const data = await response.json();
  if (data.error || !Object.hasOwn(data, 'result')) throw Error('Sepolia 数据读取失败，请稍后刷新。');
  return data.result;
}
export function checkBlock(block, now = Date.now()) {
  if (!block?.number || !block?.hash || !block?.timestamp) throw Error('无法读取有效区块。');
  const age = now / 1000 - Number(BigInt(block.timestamp));
  if (age > 600 || age < -60) throw Error('区块数据过旧或本机时间不正确，请检查后重试。');
}
export async function verifiedBlock(read = rpc) {
  const [chain, block] = await Promise.all([read('eth_chainId'), read('eth_getBlockByNumber', ['latest', false])]);
  if (BigInt(chain) !== BigInt(CHAIN)) throw Error('数据服务不是 Ethereum Sepolia。');
  checkBlock(block);
  const code = await read('eth_getCode', [ADDRESS, block.number]);
  if (keccak256(code) !== RUNTIME_HASH) throw Error('合约 Runtime Hash 不匹配，已阻止操作。');
  return block;
}
export async function readPosition(account, read = rpc) {
  const block = await verifiedBlock(read);
  const call = async (name, args = []) => abi.decodeFunctionResult(name,
    await read('eth_call', [{ to: ADDRESS, data: abi.encodeFunctionData(name, args) }, block.number]));
  const [[cursor, principal], [pending], [balance], [required]] = await Promise.all([
    call('positions', [account]), call('pending', [account]), call('balanceOf', [account]), call('requiredDeposit'),
  ]);
  return { block, cursor, principal, pending, balance, required };
}

// Keep the injected object out of ethers and Promise resolution. Only read the
// EIP-1193 methods we use; never enumerate or inspect optional vendor flags.
export class Wallet {
  constructor(provider, onChange = () => {}) {
    const request = provider.request;
    this.request = (method, params = []) => Reflect.apply(request, provider, [{ method, params }]);
    this.revision = 0;
    const changed = () => { this.revision++; onChange(); };
    const on = provider.on;
    for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) {
      Reflect.apply(on, provider, [event, changed]);
    }
    this.dispose = () => {
      const remove = provider.removeListener;
      for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) Reflect.apply(remove, provider, [event, changed]);
      this.revision++;
    };
  }
  async identity() {
    const revision = this.revision;
    const [chain, accounts] = await Promise.all([this.request('eth_chainId'), this.request('eth_accounts')]);
    if (revision !== this.revision) throw Error('钱包已变化，请重新操作。');
    if (BigInt(chain) !== BigInt(CHAIN)) throw Error('请在钱包中切换到 Ethereum Sepolia（11155111）。');
    if (!/^0x[\da-f]{40}$/i.test(accounts?.[0] || '')) throw Error('请先连接钱包账户。');
    return { account: accounts[0].toLowerCase(), revision };
  }
  async assertIdentity(expected) {
    const actual = await this.identity();
    if (actual.account !== expected.account || actual.revision !== expected.revision) throw Error('账户或网络已变化，操作已取消。');
  }
}

export class Transactions {
  busy = false;
  uncertain = false;
  constructor(read = rpc) { this.read = read; }
  async run(wallet, expected, kind, value, confirm, report = () => {}) {
    if (this.busy || this.uncertain) throw Error('已有交易待处理，请先在钱包和区块浏览器中核对。');
    if (!['deposit', 'claim', 'withdraw'].includes(kind)) throw Error('无效操作。');
    if (kind === 'deposit' && (typeof value !== 'bigint' || value <= 0n)) throw Error('无效存款金额。');
    this.busy = true;
    let submitted = false;
    try {
      await wallet.assertIdentity(expected);
      const position = await readPosition(expected.account, this.read);
      if (kind === 'withdraw' && position.principal === 0n) throw Error('当前账户没有可取本金。');
      if (kind === 'claim' && position.pending === 0n) throw Error('当前没有可领取奖励。');
      await wallet.assertIdentity(expected);
      if (!await confirm(position)) return;
      // Recheck after the human confirmation, which may have stayed open long.
      const block = await verifiedBlock(this.read);
      const walletBlock = await wallet.request('eth_getBlockByNumber', ['latest', false]);
      checkBlock(walletBlock);
      const gap = BigInt(walletBlock.number) - BigInt(block.number);
      if (gap > 12n || gap < -12n) throw Error('钱包与数据服务区块高度不一致，请稍后重试。');
      const walletCode = await wallet.request('eth_getCode', [ADDRESS, walletBlock.number]);
      if (keccak256(walletCode) !== RUNTIME_HASH) throw Error('钱包侧合约 Runtime Hash 不匹配。');
      await wallet.assertIdentity(expected);
      if (wallet.revision !== expected.revision) throw Error('钱包已变化，操作已取消。');
      // No asynchronous work between this identity check and sending. Explicit
      // from + chainId bind the request; the wallet owns the final approval.
      const tx = { from: expected.account, to: ADDRESS, chainId: CHAIN,
        data: abi.encodeFunctionData(kind), value: '0x' + (kind === 'deposit' ? value : 0n).toString(16) };
      submitted = true;
      let hash;
      try { hash = await wallet.request('eth_sendTransaction', [tx]); }
      catch (error) { if (error?.code === 4001) submitted = false; throw error; }
      if (!/^0x[\da-f]{64}$/i.test(hash)) throw Error('钱包没有返回有效交易哈希。');
      report(hash);
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        const receipt = await this.read('eth_getTransactionReceipt', [hash]);
        if (receipt) {
          if (BigInt(await this.read('eth_chainId')) !== BigInt(CHAIN)) throw Error('回执网络不匹配。');
          const canonical = await this.read('eth_getBlockByNumber', [receipt.blockNumber, false]);
          if (receipt.transactionHash?.toLowerCase() !== hash.toLowerCase() ||
              receipt.from?.toLowerCase() !== expected.account || receipt.to?.toLowerCase() !== ADDRESS.toLowerCase() ||
              !canonical?.hash || canonical.hash !== receipt.blockHash || !['0x0', '0x1'].includes(receipt.status)) {
            throw Error('无法确认交易回执。');
          }
          submitted = false;
          if (receipt.status === '0x0') throw Error('交易执行失败，已消耗 Gas；请在钱包查看详情。');
          return hash;
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      throw Error('等待回执超时。');
    } catch (error) {
      if (submitted) {
        this.uncertain = true;
        throw Error('交易结果未知，本页已停止后续交易。请在钱包与 Sepolia 浏览器核对；刷新不会取消已提交交易，也不代表交易失败。');
      }
      if (error?.code === 4001) throw Error('已取消钱包请求。');
      throw error;
    } finally { this.busy = false; }
  }
}
