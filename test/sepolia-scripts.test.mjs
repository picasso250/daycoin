import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requireSepolia, matchesRuntime } from '../scripts/sepolia-common.mjs';
process.env.UWS_USE_FALLBACK = 'true';
const { default: ganache } = await import('ganache');

test('network guard rejects mainnet and other chains; empty bytecode fails matching', () => {
  assert.throws(() => requireSepolia(1n));
  assert.throws(() => requireSepolia(31337n));
  requireSepolia(11155111n);
  assert.equal(matchesRuntime('0x', { evm: { deployedBytecode: { object: '1234' } } }), false);
});

test('deployment and all test-script modes run end-to-end on isolated simulated Sepolia', { timeout: 180000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubic1-script-test-'));
  const server = ganache.server({ logging: { quiet: true },
    chain: { chainId: 11155111, hardfork: 'shanghai' }, wallet: { totalAccounts: 2 } });
  t.after(async () => { await server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  await server.listen(0, '127.0.0.1');
  for (const folder of ['contracts', 'scripts']) fs.cpSync(folder, path.join(dir, folder), { recursive: true });
  fs.symlinkSync(path.resolve('node_modules'), path.join(dir, 'node_modules'), 'junction');
  const key = Object.values(server.provider.getInitialAccounts())[0].secretKey;
  const env = { ...process.env, PRIVATE_KEY: key, SEPOLIA_RPC_URL: `http://127.0.0.1:${server.address().port}` };
  delete env.UBIC1_ADDRESS;
  const run = async (script, args = [], expected = 0) => {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(dir, 'scripts', script), ...args], { cwd: dir, env, windowsHide: true });
      let output = '';
      child.stdout.on('data', data => { output += data; });
      child.stderr.on('data', data => { output += data; });
      child.on('error', reject);
      child.on('close', code => resolve({ code, output }));
    });
    assert.equal(result.code, expected, result.output);
    assert.ok(!result.output.includes(key), 'private key must not appear in output');
    return result.output;
  };
  await run('deploy-sepolia.mjs');
  assert.equal(fs.existsSync(path.join(dir, 'deployments/sepolia.json')), false);
  await run('deploy-sepolia.mjs', ['--broadcast']);
  const record = JSON.parse(fs.readFileSync(path.join(dir, 'deployments/sepolia.json')));
  assert.equal(record.status, 'confirmed');
  await run('deploy-sepolia.mjs', ['--broadcast'], 1);
  await run('test-sepolia.mjs', ['inspect']);
  await run('test-sepolia.mjs', ['smoke']);
  await run('test-sepolia.mjs', ['stake']);
  await run('test-sepolia.mjs', ['stake'], 1);
  await run('test-sepolia.mjs', ['harvest'], 1);
  await server.provider.request({ method: 'evm_increaseTime', params: [86400] });
  await server.provider.request({ method: 'evm_mine', params: [] });
  await run('test-sepolia.mjs', ['harvest']);
  await run('test-sepolia.mjs', ['withdraw']);
  await run('test-sepolia.mjs', ['withdraw'], 1);
});
