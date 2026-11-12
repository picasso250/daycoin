import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDc2 } from '../dc2-auth.mjs';

const base = 'https://daycoin.io99.xyz';
const now = () => 1794480000;
const env = {
  DC2_GITHUB_CLIENT_ID: 'example_client_id',
  DC2_GITHUB_CLIENT_SECRET: 'example_secret',
  DC2_SESSION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef'
};
const call = (url, opts = {}, e = env, deps = {}) =>
  handleDc2(new Request(base + url, opts), e, { now, ...deps });

function cookieValue(response, name) {
  const values = response.headers.getSetCookie();
  const found = values.find(v => v.startsWith(name + '='));
  return found ? found.split(';')[0] : '';
}
const fixture = (url) => {
  const endpoint = new URL(url);
  if (endpoint.host === 'github.com' && endpoint.pathname.endsWith('/access_token')) {
    return Response.json({ access_token: 'never-send-to-browser' });
  }
  if (endpoint.pathname === '/user') {
    return Response.json({ id: 4242, login: 'sample-dev', followers: 42, created_at: '2020-01-01T00:00:00Z' });
  }
  if (endpoint.pathname === '/users/sample-dev/repos') {
    return Response.json([
      { owner: { id: 4242 }, fork: false, stargazers_count: 12, pushed_at: '2026-10-03T02:00:00Z' },
      { owner: { id: 4242 }, fork: true, stargazers_count: 600, pushed_at: '2026-01-01T00:00:00Z' }
    ]);
  }
  if (endpoint.pathname === '/search/issues') {
    return Response.json({ total_count: 2, items: [
      { repository_url: 'https://api.github.com/repos/another/project', created_at: '2025-08-01T00:00:00Z' },
      { repository_url: 'https://api.github.com/repos/sample-dev/project', created_at: '2025-08-01T00:00:00Z' }
    ] });
  }
  throw Error('Unexpected GitHub URL: ' + url);
};

test('unconfigured service does not offer a broken login redirect', async () => {
  const a = await call('/api/dc2/config', {}, {});
  assert.deepEqual(await a.json(), { loginReady: false, network: 'Arbitrum One', preview: true });
  const b = await call('/api/dc2/login', {}, {});
  assert.equal(b.status, 503);
});

test('GitHub OAuth start binds a nonce to a secure httpOnly cookie', async () => {
  const res = await call('/api/dc2/login');
  assert.equal(res.status, 302);
  const uri = new URL(res.headers.get('Location'));
  assert.equal(uri.origin, 'https://github.com');
  assert.equal(uri.searchParams.get('redirect_uri'), base + '/api/dc2/callback');
  assert.ok(uri.searchParams.get('state'));
  assert.match(cookieValue(res, '__Host-dc2_oauth'), /__Host-dc2_oauth=/);
  assert.match(res.headers.getSetCookie().join(','), /HttpOnly; Secure; SameSite=Lax/);
});

test('callback without matching state never exchanges the OAuth code', async () => {
  const res = await call('/api/dc2/callback?code=x&state=bad');
  assert.equal(res.status, 303);
  assert.match(res.headers.get('Location'), /invalid_oauth_state/);
});

test('successful OAuth creates a signed public-only summary cookie', async () => {
  const start = await call('/api/dc2/login');
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const stateCookie = cookieValue(start, '__Host-dc2_oauth');
  let exchange = 0;
  const fetcher = async (url, opts) => {
    if (url.endsWith('/access_token')) {
      exchange++;
      assert.match(opts.body, /example_client_id/);
    }
    return fixture(url);
  };
  const cb = await call('/api/dc2/callback?code=verified&state=' + state,
    { headers: { Cookie: stateCookie } }, env, { fetcher });
  assert.equal(cb.status, 303);
  assert.equal(exchange, 1);
  const session = cookieValue(cb, '__Host-dc2_session');
  assert.ok(session);
  assert.ok(!session.includes('never-send-to-browser'));
  const result = await call('/api/dc2/me', { headers: { Cookie: session } });
  const body = await result.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.user.id, 4242);
  assert.equal(body.evidence.publicNonForkReposObserved, 1);
  assert.equal(body.evidence.rawStarsObserved, 12);
  assert.equal(body.evidence.followersObserved, 42);
  assert.equal(body.evidence.externalMergedPRsObserved, 1);
  assert.equal(body.evidence.coverage.starsIndependent, false);
  const forged = session.slice(0, -6) + 'aaaaaa';
  assert.equal((await (await call('/api/dc2/me', { headers: { Cookie: forged } })).json()).authenticated, false);
  const expired = await call('/api/dc2/me', { headers: { Cookie: session } }, env, { now: () => now() + 90000 });
  assert.equal((await expired.json()).authenticated, false);
});

test('logout requires same-site origin and clears session', async () => {
  const denied = await call('/api/dc2/logout', { method: 'POST', headers: { Origin: 'https://evil.example' } });
  assert.equal(denied.status, 403);
  const allowed = await call('/api/dc2/logout', { method: 'POST', headers: { Origin: base } });
  assert.equal(allowed.status, 200);
  assert.match(allowed.headers.getSetCookie()[0], /Max-Age=0/);
});

test('unknown origin and routes are rejected', async () => {
  const o = await handleDc2(new Request('https://evil.example/api/dc2/config'), env);
  assert.equal(o.status, 403);
  const n = await call('/api/dc2/unknown');
  assert.equal(n.status, 404);
});

test('old signed session automatically backfills followers from verified public GitHub profile', async () => {
  const start = await call('/api/dc2/login');
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const stateCookie = cookieValue(start, '__Host-dc2_oauth');
  // Simulate a historical OAuth callback with GitHub API returning an older
  // profile shape where followers was omitted.
  const oldFetch = async (url, opts) => {
    if (new URL(url).pathname === '/user') {
      return Response.json({ id: 4242, login: 'sample-dev', created_at: '2020-01-01T00:00:00Z' });
    }
    return fixture(url);
  };
  const cb = await call('/api/dc2/callback?code=verified&state=' + state,
    { headers: { Cookie: stateCookie } }, env, { fetcher: oldFetch });
  const oldSession = cookieValue(cb, '__Host-dc2_session');
  assert.ok(oldSession);
  const backfillFetch = async url => {
    assert.equal(url, 'https://api.github.com/users/sample-dev');
    return Response.json({ id: 4242, followers: 63 });
  };
  const me = await call('/api/dc2/me', { headers: { Cookie: oldSession } }, env, { fetcher: backfillFetch });
  assert.equal((await me.json()).evidence.followersObserved, 63);
  const refreshedSession = cookieValue(me, '__Host-dc2_session');
  assert.ok(refreshedSession);
  const repeat = await call('/api/dc2/me', { headers: { Cookie: refreshedSession } }, env, {
    fetcher: () => { throw new Error('No repeated requests expected'); }
  });
  assert.equal((await repeat.json()).evidence.followersObserved, 63);
  assert.equal(repeat.headers.getSetCookie().length, 0);
});

test('backfill rejects unrelated GitHub account IDs', async () => {
  const start = await call('/api/dc2/login');
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const cb = await call('/api/dc2/callback?code=verified&state=' + state,
    { headers: { Cookie: cookieValue(start, '__Host-dc2_oauth') } }, env, {
      fetcher: async url => new URL(url).pathname === '/user'
        ? Response.json({ id: 4242, login: 'sample-dev', created_at: '2020-01-01T00:00:00Z' })
        : fixture(url)
    });
  const oldSession = cookieValue(cb, '__Host-dc2_session');
  const me = await call('/api/dc2/me', { headers: { Cookie: oldSession } }, env, {
    fetcher: async () => Response.json({ id: 999999, followers: 100 })
  });
  assert.equal((await me.json()).evidence.followersObserved, null);
  assert.equal(me.headers.getSetCookie().length, 0);
});
