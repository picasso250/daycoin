import { beginMainnetRegistration } from './registration.mjs';
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
    await beginMainnetRegistration(issuanceConfig, message => { result.textContent = message; });
  } catch (error) {
    result.textContent = '登记未完成：' + (error?.message || '未知错误');
  } finally {
    button.disabled = !issuanceConfig?.enabled || !eligible || !$('consent').checked;
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
