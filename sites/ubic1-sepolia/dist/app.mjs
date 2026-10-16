import { ADDRESS, RUNTIME_HASH, Wallet, Transactions, amount, depositValue, readPosition } from './core.mjs';

const $ = id => document.getElementById(id);
const transactions = new Transactions();
const providers = [];
let wallet, identity, position, loading = false, version = 0;
const explorer = 'https://sepolia.etherscan.io';
$('contract').textContent = ADDRESS;
$('contract').href = `${explorer}/address/${ADDRESS}`;
$('runtime').textContent = RUNTIME_HASH;
function status(message, error = false) {
  $('status').textContent = message;
  $('status').parentElement.dataset.error = String(error);
}
function render() {
  const locked = loading || transactions.busy || transactions.uncertain;
  $('connect').disabled = locked;
  $('wallets').disabled = locked;
  $('refresh').disabled = !wallet || loading || transactions.busy;
  $('deposit').disabled = locked || !position;
  $('claim').disabled = locked || !position || position.pending === 0n;
  $('withdraw').disabled = locked || !position || position.principal === 0n;
  $('account').textContent = identity ? identity.account : '连接钱包以查看仓位';
  for (const key of ['principal', 'pending', 'balance', 'required']) $(key).textContent = position ? amount(position[key]) : '—';
  $('claimable').textContent = position ? (position.pending > 0n ? '可领取 · 不受当前累计资格影响' : '暂无可领取奖励') : '连接后查看领取资格';
  $('eligibility').textContent = !position ? '等待有效链上数据' : position.principal >= position.required ? '● 当前达标 · 正在累计奖励' : position.principal === 0n ? '○ 尚未存入本金' : '○ 当前未达标 · 不再累计新奖励';
  $('updated').textContent = position ? `区块 ${BigInt(position.block.number)} · ${new Date(Number(BigInt(position.block.timestamp)) * 1000).toLocaleTimeString('zh-CN')} 快照` : '链上快照 · 未读取';
}
function invalidate() {
  version++; identity = undefined; position = undefined;
  if ($('confirmation').open) $('confirmation').close('cancel');
  status(transactions.uncertain ? '交易结果未知，请先核对钱包历史；刷新不代表交易失败。' : '钱包账户或网络已变化，请重新连接或刷新。', true);
  render();
}
function addProvider(provider, name) {
  if (!provider || providers.some(item => item.provider === provider)) return;
  providers.push({ provider, name });
  const option = document.createElement('option');
  option.value = String(providers.length - 1); option.textContent = name;
  if (providers.length === 1) $('wallets').replaceChildren();
  $('wallets').append(option);
}
window.addEventListener('eip6963:announceProvider', event => {
  if (event.detail?.provider) addProvider(event.detail.provider, String(event.detail.info?.name || '浏览器钱包'));
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
// Legacy injection is read only on connect, after modern wallet announcements.
async function refresh() {
  if (!wallet || loading) return;
  loading = true; position = undefined; const currentVersion = ++version; render();
  try {
    const nextIdentity = await wallet.identity();
    const nextPosition = await readPosition(nextIdentity.account);
    await wallet.assertIdentity(nextIdentity);
    if (currentVersion !== version) return;
    identity = nextIdentity; position = nextPosition;
    if (!transactions.uncertain) status('链上数据已更新，合约 Runtime Hash 核对通过。');
  } catch (error) {
    if (currentVersion === version) { identity = undefined; position = undefined; status(error.message, true); }
  } finally { loading = false; render(); }
}
$('connect').addEventListener('click', async () => {
  if (loading || transactions.busy || transactions.uncertain) return;
  loading = true; render();
  try {
    if (!providers.length) addProvider(window.ethereum, '浏览器钱包');
    const selected = providers[Number($('wallets').value)];
    if (!selected) throw Error('未发现钱包。请安装支持 EIP-1193 的浏览器钱包，或在钱包内置浏览器打开。');
    wallet?.dispose(); invalidate();
    wallet = new Wallet(selected.provider, invalidate);
    await wallet.request('eth_requestAccounts');
    status('正在读取 Sepolia 链上数据…');
  } catch (error) { status(error.code === 4001 ? '已取消连接。' : error.message, true); loading = false; render(); return; }
  loading = false; await refresh();
});
$('wallets').addEventListener('change', () => { wallet?.dispose(); wallet = undefined; invalidate(); });
$('refresh').addEventListener('click', refresh);
function confirmOperation(kind, value, snapshot) {
  $('confirm-title').textContent = { deposit: '存入测试 ETH', claim: '领取 UBIC1', withdraw: '取回全部本金' }[kind];
  $('confirm-account').textContent = identity.account;
  $('confirm-body').textContent = kind === 'deposit' ? `本次存入 ${amount(value)} ETH。` : kind === 'withdraw' ? `将取回全部记录本金：${amount(snapshot.principal)} ETH。` : `当前可领取 ${amount(snapshot.pending)} UBIC1；实际奖励以执行时的链上结果为准。`;
  $('confirm-warning').textContent = kind === 'deposit' ? `未领取奖励和计时将永久归零。目前待领 ${amount(snapshot.pending)} UBIC1，执行前新增的奖励也会作废。若要保留，请取消并先 Claim。` : kind === 'withdraw' ? `所有未领取奖励将作废，目前为 ${amount(snapshot.pending)} UBIC1。若要保留，请取消并先 Claim。` : '领取奖励不会减少本金。';
  const dialog = $('confirmation'); dialog.returnValue = 'cancel'; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}
async function transact(kind) {
  if (!identity || !position || transactions.busy || transactions.uncertain || loading) return;
  const activeWallet = wallet, expected = identity;
  let value;
  try { value = kind === 'deposit' ? depositValue($('deposit-amount').value.trim()) : 0n; }
  catch (error) { status(error.message, true); return; }
  $('transaction').hidden = true;
  status('正在核对账户、网络和合约…');
  try {
    const run = () => transactions.run(activeWallet, expected, kind, value,
      snapshot => confirmOperation(kind, value, snapshot), hash => {
        $('transaction').href = `${explorer}/tx/${hash}`; $('transaction').hidden = false;
        status('交易已提交，正在等待 Sepolia 回执…');
      });
    // Optional same-origin coordination, without persistent transaction records.
    const operation = navigator.locks ? navigator.locks.request(`ubic1-sepolia:${expected.account}`, { ifAvailable: true }, lock => {
      if (!lock) throw Error('此账户在另一个标签页有操作，请先完成该操作。');
      const result = run(); render(); return result;
    }) : run();
    render();
    const hash = await operation;
    if (hash) {
      await refresh();
      status(`交易已在 Sepolia 确认（1 个区块）。${position ? '仓位已更新。' : '仓位暂未更新，请刷新。'}`);
    } else status('已取消操作，未向钱包发送交易。');
  } catch (error) { status(error.message, true); }
  finally { render(); }
}
for (const kind of ['deposit', 'claim', 'withdraw']) $(kind).addEventListener('click', () => transact(kind));
render();
