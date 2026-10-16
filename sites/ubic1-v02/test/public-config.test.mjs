import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CONFIG} from '../dist/config.mjs';

const EXPECTED_ADDRESS='0x407892d5606b0FB91D77C62aC306566E01963674';
const EXPECTED_RUNTIME='0x2c4e7b4318fa60fc3bf7b1560997d350585a8d474c82aa8def4818e91effe6db';

test('published v0.2 site is Sepolia-only and pinned to the verified deployment',()=>{
  assert.equal(CONFIG.chainId,11155111);
  assert.equal(CONFIG.address,EXPECTED_ADDRESS);
  assert.equal(CONFIG.runtimeHash,EXPECTED_RUNTIME);
  assert.equal(CONFIG.rpcUrl,'https://ethereum-sepolia-rpc.publicnode.com');
  assert.equal(CONFIG.explorerUrl,'https://sepolia.etherscan.io');
  assert.match(CONFIG.label,/Sepolia/);
  const source=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.match(source,/SEPOLIA 测试网 · 仅测试 ETH · 非主网/);
  assert.match(source,/至少 0\.1 Sepolia ETH/);
  assert.doesNotMatch(source,/0x759723E3869181616D6567458b59bCbA365FEcEe/);
});

test('existing public Sepolia Worker publishes v0.2 dist and never old v0.1 dist',()=>{
  const wrangler=JSON.parse(fs.readFileSync(new URL('../../../wrangler.jsonc',import.meta.url),'utf8'));
  assert.equal(wrangler.name,'ubic1-sepolia');
  assert.equal(wrangler.assets.directory,'./sites/ubic1-v02/dist');
  assert.notEqual(wrangler.assets.directory,'./sites/ubic1-sepolia/dist');
});
