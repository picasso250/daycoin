const $ = id => document.getElementById(id);
const status = $('status');
const login = $('login');
const logout = $('logout');
const account = $('account');
const say = msg => { status.textContent = msg; };
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
    login.setAttribute('aria-disabled', config.loginReady ? 'false' : 'true');
    if (config.loginReady) login.setAttribute('href', '/api/dc2/login');
    else login.removeAttribute('href');
    show(login, !me.authenticated);
    show(logout, Boolean(me.authenticated));
    show(account, Boolean(me.authenticated));
    if (me.authenticated) {
      const { user, evidence } = me;
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
      const recheck = $('recheck');
      const refreshAfter = Number.isSafeInteger(me.refreshAfter) ? me.refreshAfter : 0;
      const updateRecheck = () => {
        const remaining = Math.max(0, refreshAfter * 1000 - Date.now());
        recheck.setAttribute('aria-disabled', config.loginReady && remaining === 0 ? 'false' : 'true');
        recheck.title = remaining ? '请等待约 ' + Math.ceil(remaining / 60000) + ' 分钟再检查' : '';
        recheck.textContent = remaining ? '约 ' + Math.ceil(remaining / 60000) + ' 分钟后可重新检查' : '重新检查 GitHub 数据 ↻';
        if (remaining || !config.loginReady) recheck.removeAttribute('href');
        else recheck.setAttribute('href', '/api/dc2/login?refresh=1');
      };
      updateRecheck();
      if (refreshAfter * 1000 > Date.now()) {
        window.setTimeout(updateRecheck, Math.max(1, refreshAfter * 1000 - Date.now()) + 100);
      }
      if (!error) say('GitHub 数据已更新。这是初步观察，不代表 DC2 永久资格。');
    } else if (!error) {
      say(config.loginReady ? '登录 GitHub 后可查看账户公开贡献的初步分析。' : 'GitHub 登录尚未配置，公开预览已开放。');
    }
  } catch {
    login.setAttribute('aria-disabled', 'true');
    say('目前无法连接登录服务，请稍后再试。');
  }
}
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
