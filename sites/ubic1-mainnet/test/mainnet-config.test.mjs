
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = relative => fs.readFileSync(new URL(relative,import.meta.url),'utf8');
const deployment = JSON.parse(read('../deployment.json'));
test('mainnet frontend binds exclusively to the independently verified UBIC1 L1 deployment',()=>{
 assert.equal(deployment.chainId,1);
 assert.equal(deployment.blockNumber,26203926);
 assert.equal(deployment.transactionHash,'0xe5bd9164af0fea025064f5d1e977a596ac297dd2258d5bf0bb5b3c4679185173');
 for(const f of ['app.mjs','stats.mjs']){
  const s=read('../dist/'+f);
  assert.ok(s.toLowerCase().includes(deployment.address.toLowerCase()),f+' address');
  assert.ok(s.includes(deployment.runtimeHash),f+' runtime hash');
  assert.ok(s.includes(String(deployment.blockNumber)),f+' first block');
  assert.ok(s.includes('CHAIN = 1n')||s.includes('CHAIN=1n'),f+' chain');
  assert.ok(s.includes('https://ethereum-rpc.publicnode.com'),f+' mainnet RPC');
  assert.ok(s.includes('https://etherscan.io')||f==='stats.mjs',f+' Etherscan');
  assert.doesNotMatch(s,/Sepolia|sepolia|11155111|11925819|0xaa36a7|0x5473aac7|ethereum-sepolia-rpc|sepolia\.etherscan/i);
 }
 assert.match(read('../dist/app.mjs'),/wallet_switchEthereumChain',params:\[\{chainId:'0x1'\}\]/);
});
test('every mainnet page visibly distinguishes real ETH and blocks search indexing',()=>{
 for(const f of ['index.html','app.html','stats.html']){
  const s=read('../dist/'+f);
  assert.match(s,/noindex,nofollow,noarchive/);
  assert.match(s,/ETHEREUM MAINNET/);
  assert.match(s,/pilot-banner/);
  assert.doesNotMatch(s,/sepolia|测试 ETH|无真实主网资产|0x5473aac7/i);
  assert.ok(s.toLowerCase().includes(deployment.address.toLowerCase())||f==='app.html');
 }
 assert.match(read('../dist/robots.txt'),/Disallow: \//);
 assert.match(read('../dist/_headers'),/X-Robots-Tag: noindex/);
});
test('mainnet requires real-wallet confirmation; withdrawal stays refund-only',()=>{
 const app=read('../dist/app.mjs');
 assert.match(app,/const CHAIN|CHAIN = 1n/);
 assert.match(app,/withdrawalNeedsNewConsent/);
 assert.match(app,/prepareTransaction\(rpc,transaction\)/);
 assert.match(app,/请在钱包中核对 Ethereum Mainnet、合约地址和金额/);
 assert.match(read('../dist/app.html'),/Withdraw 始终只退本金，不自动领取奖励/);
 assert.match(read('../dist/app.html'),/真实 ETH/);
});
test('Cloudflare mainnet worker remains separate from Sepolia worker',()=>{
 const mainnet=JSON.parse(read('../../../wrangler.mainnet.jsonc'));
 const sepolia=JSON.parse(read('../../../wrangler.jsonc'));
 assert.notEqual(mainnet.name,sepolia.name);
 assert.equal(mainnet.name,'ubic1-mainnet');
 assert.equal(mainnet.assets.directory,'./sites/ubic1-mainnet/dist');
 assert.notEqual(mainnet.assets.directory,sepolia.assets.directory);
});