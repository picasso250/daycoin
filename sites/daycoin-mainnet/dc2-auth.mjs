// DC2 preview authentication. No token persistence and no issuance authority.
// GitHub OAuth app credentials and the HMAC session key are Worker secrets.
const PREFIX = '/api/dc2/';
const STATE = '__Host-dc2_oauth';
const SESSION = '__Host-dc2_session';
const DAY = 86400;
const REFRESH_COOLDOWN = 300;
const encoder = new TextEncoder();

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
const cookie = (name, value, age) => `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
function readCookie(req, name) {
  const item = (req.headers.get('Cookie') || '').split(';').map(x => x.trim())
    .find(x => x.startsWith(name + '='));
  return item ? item.slice(name.length + 1) : null;
}
function b64(bytes) {
  let binary = '';
  for (const c of bytes) binary += String.fromCharCode(c);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromB64(s) {
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) throw new Error('Bad base64');
  const binary = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
const random = () => b64(crypto.getRandomValues(new Uint8Array(24)));

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function encodeSession(data, secret) {
  const value = b64(encoder.encode(JSON.stringify(data)));
  const signature = b64(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(value))));
  return value + '.' + signature;
}
async function decodeSession(raw, secret, now) {
  try {
    if (!raw || raw.length > 3500 || !secret) return null;
    const pieces = raw.split('.');
    if (pieces.length !== 2) return null;
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64(pieces[1]), encoder.encode(pieces[0]));
    if (!valid) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64(pieces[0])));
    if (!Number.isSafeInteger(data.uid) || data.uid <= 0 ||
        typeof data.login !== 'string' || !/^[a-z\d-]{1,39}$/i.test(data.login) ||
        !Number.isSafeInteger(data.exp) || data.exp < now) return null;
    return data;
  } catch { return null; }
}
async function githubGet(fetcher, url, token) {
  const response = await fetcher(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'DayCoin-DC2-Preview',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!response.ok) throw new Error('GitHub API unavailable');
  return response.json();
}
async function publicEvidence(fetcher, user, token, now) {
  const login = user.login;
  const repos = [];
  let reposComplete = true;
  try {
    for (let page = 1; page <= 3; page++) {
      const part = await githubGet(fetcher,
        `https://api.github.com/users/${encodeURIComponent(login)}/repos?per_page=100&page=${page}&sort=created&direction=desc`, token);
      if (!Array.isArray(part)) throw new Error('Bad repos response');
      repos.push(...part);
      if (part.length < 100) break;
      if (page === 3) reposComplete = false;
    }
  } catch { reposComplete = false; }
  const own = repos.filter(r => r && !r.fork && r.owner?.id === user.id);
  const months = new Set(own.map(r => String(r.pushed_at || '').slice(0, 7)).filter(x => /^\d{4}-\d{2}$/.test(x)));
  const stars = own.reduce((total, r) => total + (Number.isInteger(r.stargazers_count) ? r.stargazers_count : 0), 0);
  let externalMergedPRs = null;
  let prsComplete = false;
  try {
    const q = encodeURIComponent(`is:pr is:merged author:${login}`);
    const result = await githubGet(fetcher, `https://api.github.com/search/issues?q=${q}&per_page=100`, token);
    if (!Array.isArray(result.items)) throw new Error('Bad PR response');
    externalMergedPRs = result.items.filter(item => {
      const owner = item.repository_url?.match(/\/repos\/([^/]+)\//)?.[1];
      if (item.created_at) months.add(item.created_at.slice(0, 7));
      return owner && owner.toLowerCase() !== login.toLowerCase();
    }).length;
    prsComplete = result.total_count <= result.items.length;
  } catch { /* Login remains available if GitHub search rate-limits. */ }
  const daysOld = Math.max(0, Math.floor((now * 1000 - Date.parse(user.created_at)) / 86400000));
  return {
    daysOld,
    followersObserved: Number.isSafeInteger(user.followers) && user.followers >= 0 ? user.followers : null,
    publicNonForkReposObserved: reposComplete ? own.length : own.length,
    rawStarsObserved: reposComplete ? stars : stars,
    externalMergedPRsObserved: externalMergedPRs,
    observedActivityMonths: months.size,
    coverage: { reposComplete, prsComplete, starsIndependent: false, activityMonthsComplete: false },
    note: 'These are observations, not a validated DC2 eligibility judgment.'
  };
}

/** Worker handler for /api/dc2/*; pass a fetch implementation for deterministic tests. */
export async function handleDc2(request, env, { fetcher = fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  const path = url.pathname.slice(PREFIX.length);
  const publicOrigin = env.DC2_PUBLIC_ORIGIN || 'https://daycoin.io99.xyz';
  if (url.origin !== publicOrigin) return json({ error: 'Unrecognized origin' }, 403);
  const ready = Boolean(env.DC2_GITHUB_CLIENT_ID && env.DC2_GITHUB_CLIENT_SECRET &&
    env.DC2_SESSION_SECRET && env.DC2_SESSION_SECRET.length >= 32);
  if (path === 'config' && request.method === 'GET') return json({ loginReady: ready, network: 'Arbitrum One', preview: true });
  if (path === 'me' && request.method === 'GET') {
    const session = await decodeSession(readCookie(request, SESSION), env.DC2_SESSION_SECRET, now());
    return json(session ? {
      authenticated: true, user: { id: session.uid, login: session.login },
      evidence: session.evidence, checkedAt: session.checkedAt ?? null,
      refreshAfter: session.checkedAt ? session.checkedAt + REFRESH_COOLDOWN : now()
    } : { authenticated: false });
  }
  if (path === 'logout' && request.method === 'POST') {
    if (request.headers.get('Origin') !== publicOrigin) return json({ error: 'Forbidden' }, 403);
    const res = json({ authenticated: false });
    res.headers.append('Set-Cookie', cookie(SESSION, '', 0));
    return res;
  }
  if (path === 'login' && request.method === 'GET') {
    if (!ready) return json({ error: 'GitHub OAuth is not configured yet' }, 503);
    if (url.searchParams.get('refresh') === '1') {
      const session = await decodeSession(readCookie(request, SESSION), env.DC2_SESSION_SECRET, now());
      if (session && Number.isSafeInteger(session.checkedAt) &&
          now() < session.checkedAt + REFRESH_COOLDOWN) {
        return new Response(null, {
          status: 303, headers: { Location: '/dc2/?error=refresh_too_soon', 'Cache-Control': 'no-store' }
        });
      }
    }
    const state = random();
    const callback = publicOrigin + '/api/dc2/callback';
    const target = new URL('https://github.com/login/oauth/authorize');
    target.searchParams.set('client_id', env.DC2_GITHUB_CLIENT_ID);
    target.searchParams.set('redirect_uri', callback);
    target.searchParams.set('scope', '');
    target.searchParams.set('state', state);
    const res = new Response(null, { status: 302, headers: { Location: target.toString() } });
    res.headers.append('Set-Cookie', cookie(STATE, state, 600));
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  if (path === 'callback' && request.method === 'GET') {
    const state = url.searchParams.get('state');
    const expected = readCookie(request, STATE);
    const finish = (reason) => {
      const to = new URL('/dc2/', publicOrigin);
      if (reason) to.searchParams.set('error', reason);
      const res = new Response(null, { status: 303, headers: { Location: to.toString() } });
      res.headers.append('Set-Cookie', cookie(STATE, '', 0));
      res.headers.set('Cache-Control', 'no-store');
      return res;
    };
    if (!ready || url.searchParams.has('error')) return finish('github_authorization_failed');
    if (!state || !expected || state !== expected || !/^[a-zA-Z0-9_-]{32}$/.test(state)) {
      return finish('invalid_oauth_state');
    }
    const code = url.searchParams.get('code');
    if (!code || code.length > 200) return finish('invalid_oauth_code');
    try {
      const tokenRes = await fetcher('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'DayCoin-DC2-Preview' },
        body: JSON.stringify({
          client_id: env.DC2_GITHUB_CLIENT_ID,
          client_secret: env.DC2_GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: publicOrigin + '/api/dc2/callback'
        })
      });
      if (!tokenRes.ok) return finish('github_authorization_failed');
      const tokenBody = await tokenRes.json();
      if (!tokenBody.access_token || typeof tokenBody.access_token !== 'string') {
        return finish('github_authorization_failed');
      }
      const user = await githubGet(fetcher, 'https://api.github.com/user', tokenBody.access_token);
      if (!Number.isSafeInteger(user.id) || user.id <= 0 ||
          typeof user.login !== 'string' || !/^[a-z\d-]{1,39}$/i.test(user.login) ||
          !Number.isFinite(Date.parse(user.created_at))) return finish('github_profile_unavailable');
      const evidence = await publicEvidence(fetcher, user, tokenBody.access_token, now());
      // Only public profile data is serialized, GitHub access token is discarded.
      const session = await encodeSession({
        uid: user.id, login: user.login, exp: now() + DAY, checkedAt: now(), evidence
      }, env.DC2_SESSION_SECRET);
      const res = finish(null);
      res.headers.append('Set-Cookie', cookie(SESSION, session, DAY));
      return res;
    } catch { return finish('github_temporarily_unavailable'); }
  }
  return json({ error: 'Not found' }, 404);
}
