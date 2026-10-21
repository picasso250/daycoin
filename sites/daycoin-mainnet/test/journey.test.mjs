import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';

function create() {
  const points = [];
  const stored = [];
  const env = {
    JOURNEY_DB: { prepare(sql) { return { bind(...args) { return { async run() { stored.push({ sql, args }); } }; } }; } },
    JOURNEY: { writeDataPoint(point) { points.push(point); } },
    ASSETS: { fetch: async () => new Response('static-ok') }
  };
  const send = (data, init = {}) => worker.fetch(new Request('https://daycoin.io99.xyz/api/journey', {
    method: 'POST',
    headers: { Origin: 'https://daycoin.io99.xyz', 'Content-Type': 'application/json', ...init.headers },
    body: JSON.stringify(data)
  }), env);
  return { points, stored, env, send };
}
const session = '12345678-1234-4123-8123-123456789012';
const safe = { session, event: 'connect_click', page: 'home_zh', step: 3 };

test('anonymous event produces precisely one analytics row', async () => {
  const { points, stored, send } = create();
  const res = await send(safe);
  assert.equal(res.status, 204);
  assert.deepEqual(stored[0].args, [session, 3, 'connect_click', 'home_zh']);
  assert.deepEqual(points, [{
    blobs: [session, 'connect_click', 'home_zh'],
    doubles: [3], indexes: [session]
  }]);
});
test('rejects additional personal fields, unknown actions and malformed sessions', async () => {
  const { points, send } = create();
  for (const event of [
    { ...safe, wallet: '0x' + '0'.repeat(40) },
    { ...safe, event: 'keystroke' },
    { ...safe, session: 'foo' },
    { ...safe, step: 0 },
    { ...safe, page: 'https://example.com/?wallet=secret' },
  ]) assert.equal((await send(event)).status, 400);
  assert.equal(points.length, 0);
});
test('rejects cross-origin writes and invalid content types', async () => {
  const { send, points } = create();
  assert.equal((await send(safe, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await send(safe, { headers: { 'Content-Type': 'text/plain' } })).status, 403);
  assert.equal(points.length, 0);
});
test('D1 failure prevents false success and Analytics Engine write', async () => {
  const { env, send, points } = create();
  env.JOURNEY_DB = { prepare() { return { bind() { return { async run() { throw new Error('D1 down'); } }; } }; } };
  assert.equal((await send(safe)).status, 503);
  assert.equal(points.length, 0);
});
test('static assets are forwarded to the assets binding', async () => {
  const { env } = create();
  assert.equal(await (await worker.fetch(new Request('https://daycoin.io99.xyz/'), env)).text(), 'static-ok');
});
