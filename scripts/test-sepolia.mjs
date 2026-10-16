import assert from 'node:assert/strict';
import { formatEther } from 'ethers';
import { artifact, connect, checkedContract, mined, safeError } from './sepolia-common.mjs';
let provider;
try {
  const mode = process.argv[2] || 'inspect';
  if (process.argv.length > 3 || !['inspect', 'smoke', 'stake', 'harvest', 'withdraw'].includes(mode)) throw new Error('Modes: inspect | smoke | stake | harvest | withdraw');
  const connection = await connect(mode !== 'inspect');
  provider = connection.provider;
  const signer = connection.signer;
  const token = await checkedContract(provider, signer || provider, artifact());
  const minimum = await token.requiredDeposit();
  console.log(`UBIC1: ${await token.getAddress()}\nEpoch: ${await token.currentEpoch()}\nMinimum: ${formatEther(minimum)} ETH`);
  assert.equal(await token.REWARD(), 10000n);
  assert.equal(await token.PERIOD(), 86400n);
  assert.equal(await token.EPOCH_DURATION(), 86400000n);
  assert.equal(await token.DEPOSIT_STEP(), 100000000000000000n);
  const wait = async (promise, label) => mined(await promise, label);
  const events = (receipt, name) => receipt.logs.map(log => {
    try { return token.interface.parseLog(log); } catch { return null; }
  }).filter(log => log?.name === name && log.args.account === signer.address);
  if (mode === 'inspect') {
    console.log('Read-only runtime, metadata and constant checks passed. No transaction sent.');
  } else {
    console.log(`Test wallet: ${signer.address}`);
    const original = await token.positions(signer.address);
    if (mode === 'stake' || mode === 'smoke') {
      if (original.depositedAt !== 0n) throw new Error('Existing position: use harvest/withdraw; this mode will not replace it.');
      if (await provider.getBalance(signer.address) <= minimum + 1n) throw new Error('Need minimum stake plus Sepolia ETH for gas.');
      await wait(token.deposit({ value: minimum }), 'Deposit');
      const opened = await token.positions(signer.address);
      assert.equal(opened.principal, minimum);
      assert.equal(opened.claimedPeriods, 0n);
      console.log(`First reward at ${new Date(Number(opened.depositedAt + 86400n) * 1000).toISOString()}`);
      if (mode === 'smoke') {
        await assert.rejects(token.deposit.staticCall({ value: minimum }));
        await wait(token.topUp({ value: 1n }), 'Top up 1 wei');
        const topped = await token.positions(signer.address);
        assert.equal(topped.depositedAt, opened.depositedAt);
        assert.equal(topped.principal, minimum + 1n);
        await wait(token.claim(), 'Claim (usually zero before 24h)');
        assert.equal((await token.positions(signer.address)).principal, minimum + 1n);
        const receipt = await wait(token.withdraw(), 'Withdraw');
        assert.equal(events(receipt, 'Withdrawn')[0].args.amount, minimum + 1n);
        assert.equal((await token.positions(signer.address)).depositedAt, 0n);
        console.log('Smoke passed: deposit, duplicate rejection, top-up, claim preservation and full withdrawal.');
      } else console.log('Stake remains active. After a real 24h: npm run test:sepolia -- harvest');
    } else if (mode === 'harvest') {
      if (original.depositedAt === 0n) throw new Error('No position. Run stake first.');
      if (original.principal < minimum) throw new Error('Below current minimum; top up before harvesting.');
      if (await token.pending(signer.address) === 0n) throw new Error(`No mature reward. Next cycle: ${new Date(Number(original.depositedAt + (original.claimedPeriods + 1n) * 86400n) * 1000).toISOString()}. No transaction sent.`);
      const before = await token.balanceOf(signer.address);
      const receipt = await wait(token.claim(), 'Claim mature rewards');
      const minted = events(receipt, 'Claimed').reduce((sum, log) => sum + log.args.reward, 0n);
      assert.ok(minted >= 10000n);
      const after = await token.positions(signer.address);
      assert.equal(after.depositedAt, original.depositedAt);
      assert.equal(after.principal, original.principal);
      assert.equal(after.claimedPeriods - original.claimedPeriods, minted / 10000n);
      assert.equal(await token.balanceOf(signer.address), before + minted);
      await wait(token.transfer(signer.address, 1n), 'Transfer 1 xiao to self');
      await wait(token.burn(1n), 'Burn 1 xiao');
      assert.equal(await token.balanceOf(signer.address), before + minted - 1n);
      assert.equal((await token.positions(signer.address)).principal, original.principal);
      console.log(`Harvest passed: minted ${minted} xiao, transferred 1, burned 1; position remains active.`);
    } else {
      if (original.depositedAt === 0n) throw new Error('No active position.');
      if (original.principal < minimum) console.log('Underfunded: pending rewards will be forfeited; principal is refunded.');
      const beforeSupply = await token.totalSupply();
      const receipt = await wait(token.withdraw(), 'Withdraw all principal');
      assert.equal(events(receipt, 'Withdrawn')[0].args.amount, original.principal);
      assert.equal(events(receipt, 'Claimed').length, 0);
      assert.equal(await token.totalSupply(), beforeSupply);
      assert.equal((await token.positions(signer.address)).depositedAt, 0n);
      console.log('Withdrawal passed. Position closed; no minting occurred.');
    }
  }
} catch (error) { console.error(safeError(error)); process.exitCode = 1; }
finally { provider?.destroy(); }
