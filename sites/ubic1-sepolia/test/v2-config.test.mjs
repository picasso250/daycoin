import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const deployment = JSON.parse(read('../../../deployments/sepolia.json'));
const previous = JSON.parse(read('../../../deployments/sepolia-v1.json'));

test('Sepolia V2 frontend configuration matches the recorded verified deployment', () => {
  assert.equal(deployment.chainId, 11155111);
  assert.equal(deployment.status, 'confirmed');
  assert.notEqual(deployment.address.toLowerCase(), previous.address.toLowerCase());

  const address = deployment.address.toLowerCase();
  const app = read('../dist/app.mjs');
  const stats = read('../dist/stats.mjs');
  for (const source of [app, stats]) {
    assert.ok(source.toLowerCase().includes(address), 'contract address mismatch');
    assert.ok(source.includes(deployment.runtimeHash), 'runtime hash mismatch');
    assert.ok(source.includes(String(deployment.blockNumber)), 'deployment block mismatch');
    assert.ok(!source.toLowerCase().includes(previous.address.toLowerCase()), 'legacy contract reference');
  }
  for (const page of ['../dist/index.html','../dist/app.html','../dist/stats.html']) {
    const source = read(page).toLowerCase();
    assert.ok(!source.includes(previous.address.toLowerCase()), 'old contract link in '+page);
  }
  for (const page of ['../dist/index.html','../dist/stats.html']) {
    assert.ok(read(page).toLowerCase().includes(address), 'missing V2 verification link in '+page);
  }
});
