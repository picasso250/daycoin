import test from 'node:test';
import assert from 'node:assert/strict';
import {requireMainnet,requireFreshDeployer,deploymentFeeCap,parseDeployMode} from '../scripts/mainnet-guards.mjs';

test('mainnet chain guard refuses Sepolia and other chains',()=>{
 assert.doesNotThrow(()=>requireMainnet(1n));
 for (const chain of [11155111n,5n,10n,137n,0n]) assert.throws(()=>requireMainnet(chain),/Mainnet/);
});
test('public Sepolia deployer cannot be reused',()=>{
 const deployed='0x806918b917a89956B8AF1a2897940c475973E2d3';
 assert.throws(()=>requireFreshDeployer(deployed,[deployed]),/Sepolia/);
 assert.doesNotThrow(()=>requireFreshDeployer('0x0000000000000000000000000000000000000001',[deployed]));
});
test('reuse requires an explicit exact-address opt-in, and is limited to recorded Sepolia deployers',()=>{
 const deployed='0x806918b917a89956B8AF1a2897940c475973E2d3';
 const unrelated='0x0000000000000000000000000000000000000001';
 assert.equal(requireFreshDeployer(deployed,[deployed],deployed),true);
 assert.equal(requireFreshDeployer(unrelated,[deployed]),false);
 assert.throws(()=>requireFreshDeployer(deployed,[deployed],unrelated),/must match/);
 assert.throws(()=>requireFreshDeployer(unrelated,[deployed],unrelated),/not a recorded/);
 assert.throws(()=>requireFreshDeployer(deployed,[deployed]),/reuse blocked/);
});
test('maximum fee includes entire gas limit and respects strict ETH budget',()=>{
 const gas=7367309n, price=1_000_000_000n;
 assert.equal(deploymentFeeCap(gas,price,'0.01').cap,7367309000000000n);
 assert.throws(()=>deploymentFeeCap(gas,price,'0.005'),/exceeds/);
 assert.throws(()=>deploymentFeeCap(gas,price,'0'),/exceed zero/);
 assert.throws(()=>deploymentFeeCap(gas,price,'bad'),/positive decimal/);
});
test('dry-run by default and deliberate two-flag broadcast consent',()=>{
 assert.deepEqual(parseDeployMode([]),{broadcast:false});
 const addr='0x806918b917a89956B8AF1a2897940c475973E2d3';
 assert.equal(parseDeployMode(['--broadcast','--confirm-deployer='+addr]).expectedDeployer,addr);
 assert.deepEqual(parseDeployMode(['--allow-reused-deployer='+addr]),{broadcast:false,approvedReuseAddress:addr});
 assert.deepEqual(parseDeployMode(['--broadcast','--confirm-deployer='+addr,'--allow-reused-deployer='+addr]),
   {broadcast:true,expectedDeployer:addr,approvedReuseAddress:addr});
 for (const args of [
  ['--broadcast'],['--confirm-deployer='+addr],['--broadcast','--yes'],
  ['--broadcast','--confirm-deployer=abc'],
  ['--allow-reused-deployer=abc'],
  ['--broadcast','--allow-reused-deployer='+addr],
  ['--broadcast','--confirm-deployer='+addr,'--allow-reused-deployer=abc'],
  ['--broadcast','--confirm-deployer='+addr,'--allow-reused-deployer='+addr,'--allow-reused-deployer='+addr],
  ['--allow-reused-deployer='+addr,'--broadcast','--confirm-deployer='+addr]
 ]) assert.throws(()=>parseDeployMode(args),/Usage/);
});
