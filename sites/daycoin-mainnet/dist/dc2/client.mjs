import { beginMainnetRegistration } from './registration.mjs';
import { connectWallet, readPosition, sendClaim, waitForReceipt, accrued, formatDC2, DC2_CONTRACT } from './wallet.mjs';
const $ = id => document.getElementById(id);
const status = $('status');
const login = $('login');
const logout = $('logout');
const account = $('account');
const hero = $('hero');
const recheck = $('recheck');
const refreshDialog = $('refresh-dialog');
let refreshAfter = 0;
let loginReady = false;
let authenticated = false;
let issuanceConfig = null;
let eligible = false;
let loggedGithubId = null;
let walletState = null;
let walletBusy = false;
let positionSnapshot = null;
let snapshotLocalTime = 0;
let walletRequestSerial = 0;
let pendingTransaction = false;
const walletStatus = msg => { $('wallet-connect-status').textContent = msg; };
const walletResult = msg => { $('wallet-result').textContent = msg; };
const walletButton = $('wallet-connect');
const claimButton = $('claim');
const profileParts = ['.metric-grid','.qualification','#evidence-notice','.recheck-row','.note','#enrollment','#consent'];
const switchPresentation = registered => {
  show($('wallet-dashboard'), registered);
  for (const selector of profileParts) {
    const item = account.querySelector(selector);
    if (item) show(item, !registered);
  }
  $('enrollment-result').classList.toggle('hidden', registered);
  $('profile-heading').textContent = registered ? '我的 DC2 · 链上持仓' : '账户预分析';
  walletButton.textContent = registered ? '切换钱包' : '连接钱包 · 查看 DC2';
};
function drawWalletTicker() {
  if (!positionSnapshot?.registered || !walletState || walletState.wrongNetwork) return;
  const now = positionSnapshot.chainTime + Math.max(0, Math.floor((Date.now()-snapshotLocalTime)/1000));
  const pending = accrued(positionSnapshot,now);
  $('wallet-pending').textContent = formatDC2(pending);
  claimButton.disabled = walletBusy || pendingTransaction || pending === 0n;
}
async function inspectWallet(prompt = false) {
  const id = ++walletRequestSerial;
  const provider = window.ethereum;
  if (!provider?.request) { walletStatus('未检测到钱包，请先安装浏览器钱包。'); return; }
  const next = await connectWallet(provider,prompt);
  if (id !== walletRequestSerial) return;
  if (!next) { walletState=null;positionSnapshot=null;switchPresentation(false);walletStatus('请先连接钱包，查看链上登记状态。');return; }
  walletState=next;
  if (next.wrongNetwork) {
    positionSnapshot=null; switchPresentation(false);
    walletStatus('钱包当前不在 Arbitrum One。点击“连接钱包”切换网络后查看。');
    return;
  }
  walletStatus('正在读取 Arbitrum One 链上数据…');
  const position = await readPosition(provider,next.address);
  if (id !== walletRequestSerial) return;
  if (String(await provider.request({method:'eth_chainId'})).toLowerCase() !== '0xa4b1') {
    positionSnapshot=null;switchPresentation(false);walletStatus('钱包网络已切换，请重新连接 Arbitrum One。');return;
  }
  positionSnapshot=position;
  snapshotLocalTime=Date.now();
  if (!position.registered) {
    switchPresentation(false);
    walletStatus('当前钱包尚未登记 DC2。若符合资格，可以在下方申请登记。');
    return;
  }
  switchPresentation(true);
  $('wallet-identity').textContent = next.address+' · GitHub ID '+position.githubId;
  $('wallet-balance').textContent = formatDC2(position.balance);
  $('wallet-since').textContent = '登记时间：'+new Date(Number(position.since)*1000).toLocaleString('zh-CN')+' · 发行速率 1 DC2 / 24 小时';
  $('wallet-explorer').href = 'https://arbiscan.io/address/'+encodeURIComponent(next.address)+'#tokentxns';
  walletStatus(position.githubId === BigInt(loggedGithubId || 0) ? '已登记，正在累计 DC2。' : '此钱包已登记另一个 GitHub ID；Claim 属于当前钱包。');
  drawWalletTicker();
}
async function updateWallet(prompt = false) {
  try { await inspectWallet(prompt); }
  catch(e) {
    positionSnapshot=null; claimButton.disabled=true; switchPresentation(false);
    walletStatus('读取钱包失败：'+(e?.message||'未知错误'));
  }
}
walletButton.addEventListener('click', () => updateWallet(true));
claimButton.addEventListener('click', async () => {
  if (walletBusy || pendingTransaction || !positionSnapshot?.registered || !walletState || walletState.wrongNetwork) return;
  const accountAddress=walletState.address;
  const existing=positionSnapshot;
  if (accrued(existing,existing.chainTime+Math.floor((Date.now()-snapshotLocalTime)/1000))<=0n) return;
  if (!window.confirm('确认在 Arbitrum One 上领取当前钱包已累计的 DC2？本操作需要支付网络 Gas。')) return;
  walletBusy=true;pendingTransaction=true;drawWalletTicker();
  let hash=null;
  try {
    const connected=await connectWallet(window.ethereum,false);
    if (!connected || connected.wrongNetwork || connected.address.toLowerCase()!==accountAddress.toLowerCase())
      throw Error('钱包账户或网络已经改变，请重新读取状态');
    walletResult('请在钱包中确认 Claim 交易…');
    hash=await sendClaim(window.ethereum,accountAddress);
    walletResult('Claim 已提交，等待主网确认：'+hash);
    await waitForReceipt(window.ethereum,hash);
    walletResult('✓ Claim 已在 Arbitrum One 确认：'+hash);
    await updateWallet(false);
  } catch(e) {
    walletResult((hash?'交易状态需核对：':'未提交交易：')+(e?.message||'未知错误'));
  } finally {
    walletBusy=false; pendingTransaction=false; drawWalletTicker();
  }
});
setInterval(()=>drawWalletTicker(),1000);
setInterval(()=>{if(authenticated && walletState?.address && !walletBusy && !pendingTransaction) updateWallet(false);},30000);
if (window.ethereum?.on) {
  for (const event of ['accountsChanged','chainChanged']) window.ethereum.on(event,()=>{
    ++walletRequestSerial; positionSnapshot=null;switchPresentation(false);
    walletResult(''); updateWallet(false);
  });
}
const say = msg => { status.textContent = msg; show(status, Boolean(msg)); };
const show = (el, yes) => el.classList.toggle('hidden', !yes);
const format = value => typeof value === 'number' ? value.toLocaleString('zh-CN') : '暂无数据';

const errors = {
  github_authorization_failed: 'GitHub 授权没有完成，请重试。',
  invalid_oauth_state: '登录校验已过期或不匹配，请重试。',
  invalid_oauth_code: 'GitHub 授权码无效，请重试。',
  github_profile_unavailable: '无法验证 GitHub 个人资料，请重试。',
  github_temporarily_unavailable: 'GitHub 服务暂时不可用，请稍后重试。',
  refresh_too_soon: '刚检查过，请五分钟后再刷新。'
};
const params = new URLSearchParams(location.search);
const error = params.get('error');
if (error) {
  say(errors[error] || '登录暂时失败，请重试。');
  history.replaceState(null, '', location.pathname);
}
async function refresh() {
  try {
    const [configRes, meRes] = await Promise.all([
      fetch('/api/dc2/config', { cache: 'no-store' }),
      fetch('/api/dc2/me', { cache: 'no-store' })
    ]);
    if (!configRes.ok || !meRes.ok) throw new Error('Service unavailable');
    const config = await configRes.json();
    const me = await meRes.json();
    loginReady = config.loginReady;
    issuanceConfig = config.issuance || null;
    authenticated = Boolean(me.authenticated);
    loggedGithubId = me.authenticated ? me.user.id : null;
    eligible = false;
    login.setAttribute('aria-disabled', config.loginReady ? 'false' : 'true');
    if (config.loginReady) login.setAttribute('href', '/api/dc2/login');
    else login.removeAttribute('href');
    show(login, !me.authenticated);
    show(hero, !me.authenticated);
    show(account, Boolean(me.authenticated));
    if (me.authenticated) {
      const { user, evidence } = me;
      const checks = me.eligibility?.checks || {};
      const states = { age: 'check-age', stars: 'check-stars', prs: 'check-prs', followers: 'check-followers' };
      for (const [key, id] of Object.entries(states)) {
        const node = $(id);
        const result = checks[key];
        const state = result === true ? 'pass' : result === false ? 'fail' : 'unknown';
        node.dataset.state = state;
        node.textContent = state === 'pass' ? '✓ 已达标' : state === 'fail' ? '× 未达标' : '？数据不足';
      }
      eligible = me.eligibility?.eligible === true && Object.keys(states).every(key => checks[key] === true);
      $('qualification-summary').textContent = eligible ? '✓ 符合登记门槛' : '暂不符合登记条件';
      $('qualification-summary').dataset.eligible = String(eligible);
      $('qualification-explanation').textContent = eligible
        ? '四项观测数据均达到签发门槛。请确认永久公开绑定的风险，再连接专用钱包登记。'
        : '未达标或数据不足，暂不能登记，也不会发生链上 Gas 支出。若资料已更新，可使用上方刷新按钮重新检查（最短间隔 5 分钟）。';
      $('identity').textContent = `@${user.login} · GitHub ID ${user.id}`;
      $('age').textContent = Number.isFinite(evidence.daysOld) ? (evidence.daysOld / 365.25).toFixed(1) : '—';
      $('repos').textContent = format(evidence.publicNonForkReposObserved);
      $('stars').textContent = format(evidence.rawStarsObserved);
      $('prs').textContent = format(evidence.externalMergedPRsObserved);
      $('followers').textContent = format(evidence.followersObserved);
      const partial = [];
      if (!evidence.coverage.reposComplete) partial.push('仓库数据只获取到部分样本');
      if (!evidence.coverage.prsComplete) partial.push('PR 数据不是完整历史');
      partial.push('Star 独立性和长期贡献尚未验证');
      $('evidence-notice').textContent = partial.join('；') + '。';
      const checkedAt = Number.isSafeInteger(me.checkedAt) ? me.checkedAt : null;
      $('checked-at').textContent = checkedAt
        ? '上次检查：' + new Date(checkedAt * 1000).toLocaleString('zh-CN')
        : '上次检查：登录时';
      refreshAfter = Number.isSafeInteger(me.refreshAfter) ? me.refreshAfter : 0;
      $('enroll').disabled = !issuanceConfig?.enabled || !eligible || !$('consent').checked;
      $('enrollment-hint').textContent = !issuanceConfig?.enabled ? '资格签发服务暂未开启。' : !eligible ? '当前 GitHub 资料未满足全部资格门槛，无法申请登记。' : 'Arbitrum One 主网登记。GitHub ID 与钱包地址将永久公开绑定，不能撤销。请使用专用钱包。';
      if (!error) say('');
      await updateWallet(false);
    } else if (!error) {
      say(config.loginReady ? '登录 GitHub 后可查看账户公开贡献的初步分析。' : 'GitHub 登录尚未配置，公开预览已开放。');
    }
  } catch {
    login.setAttribute('aria-disabled', 'true');
    say('目前无法连接登录服务，请稍后再试。');
  }
}
$('consent').addEventListener('change', () => { $('enroll').disabled = !issuanceConfig?.enabled || !eligible || !$('consent').checked; });
$('enroll').addEventListener('click', async () => {
  const button = $('enroll');
  button.disabled = true;
  const result = $('enrollment-result');
  try {
    const hash = await beginMainnetRegistration(issuanceConfig, message => { result.textContent = message; });
    result.textContent = '登记已提交，等待 Arbitrum One 确认：'+hash;
    pendingTransaction=true;
    try {
      await waitForReceipt(window.ethereum,hash);
      result.textContent = '✓ 登记成功！正在读取 DC2 链上持仓…';
      await updateWallet(false);
    } catch(e) {
      result.textContent = '登记状态尚未确认，请先在 Arbiscan 核对，勿重复提交：'+hash+' · '+(e?.message||'');
    } finally { pendingTransaction=false; }
  } catch (error) {
    result.textContent = '登记未完成：' + (error?.message || '未知错误');
  } finally {
    button.disabled = pendingTransaction || !issuanceConfig?.enabled || !eligible || !$('consent').checked;
  }
});
recheck.addEventListener('click', () => {
  if (!authenticated || !loginReady) return;
  const seconds = Math.max(0, refreshAfter - Math.floor(Date.now() / 1000));
  if (seconds > 0) {
    const minutes = Math.ceil(seconds / 60);
    $('refresh-dialog-title').textContent = '请稍后再检查';
    $('refresh-dialog-text').textContent = '距离下次检查还需约 ' + minutes + ' 分钟。';
    refreshDialog.showModal();
    return;
  }
  recheck.disabled = true;
  recheck.classList.add('loading');
  recheck.setAttribute('aria-label', '正在重新检查 GitHub 数据');
  recheck.title = '正在检查…';
  window.location.assign('/api/dc2/login?refresh=1');
});
logout.addEventListener('click', async () => {
  logout.disabled = true;
  try {
    await fetch('/api/dc2/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    location.replace('/dc2/');
  } catch {
    say('退出失败，请刷新后重试。');
    logout.disabled = false;
  }
});
await refresh();
