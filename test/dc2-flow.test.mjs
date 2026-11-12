import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserProvider, ContractFactory, Wallet, verifyTypedData, parseEther } from 'ethers';
import { compile } from '../scripts/compile.mjs';
import { readFileSync } from 'node:fs';
import { handleIssuance } from '../sites/daycoin-mainnet/dc2-issuer.mjs';
import { encodeRegistration } from '../sites/daycoin-mainnet/dist/dc2/registration.mjs';

process.env.UWS_USE_FALLBACK = 'true';
const { default: ganache } = await import('ganache');
const artifact = compile({
  'contracts/DayCoinV2.sol': { content: readFileSync('contracts/DayCoinV2.sol', 'utf8') }
})['contracts/DayCoinV2.sol'].DayCoinV2;

test('OAuth-derived GitHub candidate -> wallet proof -> signed voucher -> on-chain unique permanent enrollment -> daily claim', async t => {
  const rpc = ganache.provider({
    logging: {quiet: true}, chain: {chainId:42161, hardfork:'shanghai',time:new Date('2026-11-12T00:00:00Z')},
    miner: {timestampIncrement:0},wallet:{totalAccounts:3}
  });
  const provider = new BrowserProvider(rpc,undefined,{cacheTimeout:-1});
  provider.pollingInterval = 10;
  t.after(async()=>{provider.destroy();await rpc.disconnect();});
  const signer = await provider.getSigner(0);
  const issuer = Wallet.createRandom();
  const token = await new ContractFactory(artifact.abi,artifact.evm.bytecode.object,signer).deploy(issuer.address);
  await token.waitForDeployment();
  const contractAddress=await token.getAddress();
  const env={
    DC2_MAINNET_ISSUANCE_ENABLED:'true',
    DC2_MAINNET_ISSUER_PRIVATE_KEY:issuer.privateKey,
    DC2_SESSION_SECRET:'abcd'.repeat(12)
  };
  const user={uid:1884104,exp:2100000000,
    evidence:{createdAt:'2012-01-01T00:00:00Z',rawStarsObserved:10,
      externalMergedPRsObserved:10,followersObserved:10}};
  const timestamp=Math.floor(Date.parse('2026-11-12T00:00:00Z')/1000);
  const call=async (endpoint,payload)=>handleIssuance(endpoint,new Request('https://daycoin.io99.xyz/api/dc2/'+endpoint,{
    method:'POST',headers:{Origin:'https://daycoin.io99.xyz','Content-Type':'application/json'},
    body:JSON.stringify(payload)
  }),env,user,timestamp,issuer.address,contractAddress);
  const wallet=await signer.getAddress();
  const prepare=await (await call('prepare',{wallet})).json();
  const privateKey = rpc.getInitialAccounts()[wallet.toLowerCase()].secretKey;
  const personalSig=await new Wallet(privateKey).signMessage(prepare.message);
  const final=await call('attest',{wallet,challengeToken:prepare.challengeToken,signature:personalSig});
  assert.equal(final.status,200);
  const voucher=await final.json();
  assert.equal(verifyTypedData(voucher.domain,voucher.types,voucher.values,voucher.signature),issuer.address);
  const calldata=encodeRegistration(voucher.values.githubId,voucher.values.deadline,voucher.signature);
  const decoded=token.interface.parseTransaction({data:calldata});
  assert.equal(decoded.name,'register');
  assert.equal(decoded.args[0],1884104n);
  await (await signer.sendTransaction({to:contractAddress,data:calldata})).wait();
  assert.equal(await token.githubIdOf(wallet),1884104n);
  const other=await provider.getSigner(1);
  await assert.rejects(token.connect(other).register(1884104n,voucher.values.deadline,voucher.signature));
  await rpc.request({method:'evm_increaseTime',params:[86400]});
  await rpc.request({method:'evm_mine',params:[]});
  assert.equal(await token.pending(wallet),parseEther('1'));
  await (await token.claim()).wait();
  assert.equal(await token.balanceOf(wallet),parseEther('1'));
});
