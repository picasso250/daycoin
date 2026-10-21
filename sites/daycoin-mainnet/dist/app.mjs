import { t, locale, errorMessage } from './i18n.mjs';
import { track } from './journey.mjs';
import { readDashboard } from './dashboard.mjs';
import { estimatePending, fixedAmount, roundedAmount } from './pending.mjs';
import { ADDRESS, RUNTIME_HASH, Wallet, Transactions, amount, depositValue, readPosition } from './core.mjs';

const $ = id => document.getElementById(id);
const transactions = new Transactions();
const providers = [];
let wallet, identity, position, dashboard, connectedAccount = '', loading = false, version = 0, overviewVersion = 0;
let detecting = false;
let depositAmountEdited = false;
$('deposit-amount').addEventListener('input', () => { depositAmountEdited = true; });
const explorer = 'https://etherscan.io';
$('contract').textContent = ADDRESS;
$('contract').href = `${explorer}/address/${ADDRESS}`;
$('runtime').textContent = RUNTIME_HASH;
function displayAmount(value, digits = 4) {
  return fixedAmount(value, digits);
}
function renderPending() {
  const pending = position ? estimatePending(position, dashboard, Math.floor(Date.now() / 1000)) : null;
  $('pending').textContent = pending === null ? '—' : displayAmount(pending, 5);
  $('claimable').textContent = pending === null ? t('连接后查看领取资格') : pending > 0n
    ? t('可领取 · 本地按秒估算，以链上执行结果为准') : t('暂无可领取奖励');
  $('claim').disabled = loading || transactions.busy || transactions.uncertain || pending === null || pending === 0n;
}
function status(message, error = false) {
  $('status').textContent = message;
  $('status').parentElement.dataset.error = String(error);
}
function render() {
  const locked = loading || transactions.busy || transactions.uncertain;
  $('connect').disabled = loading || transactions.busy;
  $('connect').textContent = connectedAccount ? `${connectedAccount.slice(0, 6)}…${connectedAccount.slice(-4)} ▾` : t('连接钱包 ↗');
  $('connected-wallet').hidden = !connectedAccount;
  $('full-account').textContent = connectedAccount;
  renderWallets();
  $('deposit').disabled = locked || !position;
  $('withdraw').disabled = locked || !position || position.principal === 0n;
  $('eth-balance').textContent = dashboard?.ethBalance != null && position ? displayAmount(dashboard.ethBalance, 4) : '—';
  $('eth-balance').title = dashboard?.ethBalance != null && position ? `${amount(dashboard.ethBalance)} ETH` : '';
  $('gap-status').textContent = !position ? t('距离达标还差：— ETH') : position.principal >= position.required
    ? t('✓ 已达标') : t`距离达标还差：${amount(position.required - position.principal)} ETH`;
  for (const key of ['principal', 'balance', 'required']) $(key).textContent = position ? (key === 'required' ? amount(position[key]) : displayAmount(position[key], 4)) : '—';
  renderPending();
  $('eligibility').textContent = !position ? t('等待有效链上数据') : position.principal >= position.required ? t('● 当前达标 · 正在累计奖励') : position.principal === 0n ? t('○ 尚未存入本金') : t('○ 当前未达标 · 不再累计新奖励');
  renderProtocol();
  $('updated').textContent = position ? t`区块 ${BigInt(position.block.number)} · ${new Date(Number(BigInt(position.block.timestamp)) * 1000).toLocaleTimeString(locale)} 快照` : t('链上快照 · 未读取');
}
function invalidate() {
  version++; identity = undefined; position = undefined; connectedAccount = '';
  $('wallet-feedback').textContent = '';
  if ($('confirmation').open) $('confirmation').close('cancel');
  status(transactions.uncertain ? t('交易结果未知，请先核对钱包历史；刷新不代表交易失败。') : t('钱包账户或网络已变化，请重新连接或重新打开页面。'), true);
  render();
}
function renderProtocol() {
  for (const [id, key, format] of [
    ['total-supply', 'totalSupply', roundedAmount],
    ['total-accrued', 'estimatedTotalAccrued', roundedAmount],
    ['total-principal', 'totalPrincipal', roundedAmount],
    ['protocol-required', 'requiredDeposit', roundedAmount],
    ['current-epoch', 'currentEpoch', String],
    ['next-epoch', 'nextEpochTime', value => new Date(Number(value) * 1000).toISOString().slice(0, 16).replace('T', ' ')],
  ]) $(id).textContent = dashboard?.[key] != null ? format(dashboard[key]) : '—';
  $('protocol-updated').textContent = dashboard ? t`主网区块 ${BigInt(dashboard.block.number)} · 快照` : t('链上数据未读取');
  const threshold = position?.required ?? dashboard?.requiredDeposit;
  $('amount-help').textContent = threshold != null ? t`当前发行门槛：${amount(threshold)} ETH`
    : dashboard ? t('当前发行门槛：暂不可用') : t('当前发行门槛：读取中…');
  if (threshold != null && !depositAmountEdited) $('deposit-amount').value = amount(threshold);
}
function renderWallets() {
  $('wallet-list').replaceChildren();
  for (const item of providers) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'wallet-choice';
    button.textContent = `${item.name} ↗`;
    button.disabled = detecting || loading || transactions.busy || transactions.uncertain;
    button.addEventListener('click', () => { track('wallet_select'); connectWallet(item); });
    $('wallet-list').append(button);
  }
}
function addProvider(provider, name) {
  if (!provider || providers.some(item => item.provider === provider)) return;
  providers.push({ provider, name }); renderWallets();
  if ($('wallet-menu').open && !detecting && !loading) $('wallet-feedback').textContent = t('选择一个钱包以继续。');
}
window.addEventListener('eip6963:announceProvider', event => {
  if (event.detail?.provider) addProvider(event.detail.provider, String(event.detail.info?.name || t('浏览器钱包')));
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
$('connect').addEventListener('click', () => {
  track('connect_click');
  const menu = $('wallet-menu');
  $('wallet-title').textContent = connectedAccount ? t('你的钱包') : t('连接你的钱包');
  $('copy-address').textContent = t('复制地址');
  detecting = true; $('wallet-feedback').textContent = t('Loading · 正在检测钱包…');
  renderWallets(); menu.showModal();
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  setTimeout(() => {
    if (!providers.length) {
      try { addProvider(window.ethereum, t('浏览器钱包')); } catch { /* unavailable injection */ }
    }
    detecting = false; renderWallets();
    $('wallet-feedback').textContent = transactions.uncertain ? t('交易结果未知，请先在钱包核对；本页暂不允许切换钱包或发送交易。') : providers.length ? t('选择一个钱包以继续。') : t('未检测到钱包。请安装 MetaMask、Rabby 等浏览器钱包，或使用钱包内置浏览器打开。');
  }, 350);
});
$('wallet-close').addEventListener('click', () => $('wallet-menu').close());
$('wallet-menu').addEventListener('click', event => {
  if (event.target !== $('wallet-menu')) return;
  const bounds = event.target.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.target.close();
});
$('copy-address').addEventListener('click', async () => {
  if (!connectedAccount) return;
  try { await navigator.clipboard.writeText(connectedAccount); $('copy-address').textContent = t('已复制 ✓'); }
  catch { $('wallet-feedback').textContent = t('无法访问剪贴板，请选中上方完整地址复制。'); }
});
async function loadProtocol() {
  const request = ++overviewVersion;
  dashboard = undefined; renderProtocol();
  try {
    const next = await readDashboard();
    if (request !== overviewVersion) return;
    dashboard = next; renderProtocol();
  } catch {
    if (request === overviewVersion) $('protocol-updated').textContent = t('读取失败 · 重新打开页面后重试');
  }
}
async function refresh() {
  if (loading) return;
  if (!wallet) { await loadProtocol(); return; }
  loading = true; position = undefined; dashboard = undefined; ++overviewVersion;
  const currentVersion = ++version; render();
  try {
    const nextIdentity = await wallet.identity();
    const nextPosition = await readPosition(nextIdentity.account);
    const nextDashboard = await readDashboard(nextIdentity.account, nextPosition.block);
    await wallet.assertIdentity(nextIdentity);
    if (currentVersion !== version) return;
    const firstConnection = !identity;
    identity = nextIdentity; connectedAccount = nextIdentity.account; position = nextPosition; dashboard = nextDashboard;
    if (firstConnection) track('connect_success');
    if (!transactions.uncertain) status(t('链上数据已更新，合约 Runtime Hash 核对通过。'));
  } catch (error) {
    if (currentVersion === version) { if (!identity) track('connect_error'); identity = undefined; position = undefined; status(errorMessage(error), true); }
  } finally { loading = false; render(); }
}
async function connectWallet(selected) {
  if (detecting || loading || transactions.busy || transactions.uncertain) return;
  loading = true; ++overviewVersion; render();
  try {
    wallet?.dispose(); invalidate();
    wallet = new Wallet(selected.provider, invalidate);
    $('wallet-feedback').textContent = t('请在钱包中确认连接授权…');
    const accounts = await wallet.request('eth_requestAccounts');
    connectedAccount = /^0x[0-9a-f]{40}$/i.test(accounts?.[0] || '') ? accounts[0] : '';
    $('wallet-menu').close(); status(t('正在读取 Mainnet 链上数据…'));
  } catch (error) {
    const message = error.code === 4001 ? t('已取消连接。') : errorMessage(error);
    track(error.code === 4001 ? 'connect_cancel' : 'connect_error');
    status(message, true); $('wallet-feedback').textContent = message;
    loading = false; render(); return;
  }
  loading = false; await refresh();
}
function confirmOperation(kind, value, snapshot) {
  $('confirm-title').textContent = { deposit: t('存入ETH'), claim: t('领取 DC1'), withdraw: t('取回全部本金') }[kind];
  $('confirm-account').textContent = identity.account;
  $('confirm-body').textContent = kind === 'deposit' ? t`本次存入 ${amount(value)} ETH。` : kind === 'withdraw' ? t`将取回全部记录本金：${amount(snapshot.principal)} ETH。` : t`当前可领取 ${amount(snapshot.pending)} DC1；实际奖励以执行时的链上结果为准。`;
  $('confirm-warning').textContent = kind === 'deposit' ? t`未领取奖励和计时将永久归零。目前待领 ${amount(snapshot.pending)} DC1，执行前新增的奖励也会作废。若要保留，请取消并先 Claim。` : kind === 'withdraw' ? t`所有未领取奖励将作废，目前为 ${amount(snapshot.pending)} DC1。若要保留，请取消并先 Claim。` : t('领取奖励不会减少本金。');
  const dialog = $('confirmation'); dialog.returnValue = 'cancel'; dialog.showModal();
  track('confirmation_open');
  return new Promise(resolve => dialog.addEventListener('close', () => {
    track(dialog.returnValue === 'confirm' ? 'confirmation_confirm' : 'confirmation_cancel');
    resolve(dialog.returnValue === 'confirm');
  }, { once: true }));
}
async function transact(kind) {
  if (!identity || !position || transactions.busy || transactions.uncertain || loading) return;
  track(kind + '_click');
  const activeWallet = wallet, expected = identity;
  let value;
  try { value = kind === 'deposit' ? depositValue($('deposit-amount').value.trim()) : 0n; }
  catch (error) { status(errorMessage(error), true); return; }
  $('transaction').hidden = true;
  status(t('正在核对账户、网络和合约…'));
  try {
    const run = () => transactions.run(activeWallet, expected, kind, value,
      snapshot => confirmOperation(kind, value, snapshot), hash => {
        $('transaction').href = `${explorer}/tx/${hash}`; $('transaction').hidden = false;
        status(t('交易已提交，正在等待 Mainnet 回执…'));
        track('transaction_submitted');
      });
    // Optional same-origin coordination, without persistent transaction records.
    const operation = navigator.locks ? navigator.locks.request(`daycoin-mainnet:${expected.account}`, { ifAvailable: true }, lock => {
      if (!lock) throw Error('此账户在另一个标签页有操作，请先完成该操作。');
      const result = run(); render(); return result;
    }) : run();
    render();
    const hash = await operation;
    if (hash) {
      track('transaction_confirmed');
      await refresh();
      status(t`交易已在 Mainnet 确认（1 个区块）。${position ? t('仓位已更新。') : t('仓位暂未更新，请重新加载页面。')}`);
    } else status(t('已取消操作，未向钱包发送交易。'));
  } catch (error) { track('transaction_error'); status(errorMessage(error), true); }
  finally { render(); }
}
for (const kind of ['deposit', 'claim', 'withdraw']) $(kind).addEventListener('click', () => transact(kind));
render();
// This clock updates only the visible estimate; it never polls the chain.
setInterval(renderPending, 250);

// Tabs only select a view. Sending always uses the existing guarded operation.
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  track('tab_' + tab.dataset.action);
  for (const item of tabs) {
    const selected = item === tab;
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    $(item.getAttribute('aria-controls')).hidden = !selected;
  }
}
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); selectTab(tabs[next]); tabs[next].focus();
  });
}

loadProtocol();
