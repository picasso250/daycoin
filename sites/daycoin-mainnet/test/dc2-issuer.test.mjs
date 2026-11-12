import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, verifyTypedData } from 'ethers';
import { candidateEligibility, handleIssuance, issuerStatus } from '../dc2-issuer.mjs';

const now = 1794480000;
const issuer = Wallet.createRandom();
const claimant = Wallet.createRandom();
const env = {
  DC2_MAINNET_ISSUANCE_ENABLED: 'true',
  DC2_MAINNET_ISSUER_PRIVATE_KEY: issuer.privateKey,
  DC2_SESSION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef',
};
const session = {
  uid: 1884104, exp: now + 86400,
  evidence: {
    createdAt: '2012-01-01T00:00:00Z',
    rawStarsObserved: 20, externalMergedPRsObserved: 11, followersObserved: 12
  }
};
const post = async (endpoint, payload, settings = env, user = session, timestamp = now) => handleIssuance(endpoint,
  new Request('https://daycoin.io99.xyz/api/dc2/' + endpoint, {
    method: 'POST', headers: { Origin: 'https://daycoin.io99.xyz', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }), settings, user, timestamp, issuer.address);

test('seven-year and 10/10/10 gate fails closed on missing or inadequate server evidence', () => {
  assert.equal(candidateEligibility(session, now).eligible, true);
  for (const change of [{ rawStarsObserved: 9 }, { externalMergedPRsObserved: null }, { followersObserved: 9 }, { createdAt: null }]) {
    assert.equal(candidateEligibility({ ...session, evidence: { ...session.evidence, ...change } }, now).eligible, false);
  }
});

test('testnet attestation is disabled without all explicit configuration', async () => {
  assert.equal(issuerStatus({}).enabled, false);
  const result = await post('prepare', { wallet: claimant.address }, {});
  assert.equal(result.status, 503);
});

test('signed OAuth identity + wallet proof yields correct EIP-712 registration voucher', async () => {
  const response = await post('prepare', { wallet: claimant.address });
  assert.equal(response.status, 200);
  const prepare = await response.json();
  assert.match(prepare.message, /GitHub ID: 1884104/);
  const personalSignature = await claimant.signMessage(prepare.message);
  const approval = await post('attest', {
    wallet: claimant.address, challengeToken: prepare.challengeToken,
    signature: personalSignature
  });
  assert.equal(approval.status, 200);
  const voucher = await approval.json();
  assert.equal(voucher.domain.chainId, 42161);
  assert.equal(voucher.values.githubId, '1884104');
  assert.equal(voucher.values.recipient, claimant.address);
  const signer = verifyTypedData(voucher.domain, voucher.types, voucher.values, voucher.signature);
  assert.equal(signer, issuer.address);
});

test('attackers cannot reuse proof with changed wallet, wrong signature, expired or altered token', async () => {
  const prepare = await (await post('prepare', { wallet: claimant.address })).json();
  const sig = await claimant.signMessage(prepare.message);
  const other = Wallet.createRandom();
  assert.equal((await post('attest', { wallet: other.address, challengeToken: prepare.challengeToken, signature: sig })).status, 403);
  assert.equal((await post('attest', { wallet: claimant.address, challengeToken: prepare.challengeToken, signature: await other.signMessage(prepare.message) })).status, 403);
  assert.equal((await post('attest', { wallet: claimant.address, challengeToken: prepare.challengeToken + 'a', signature: sig })).status, 403);
  assert.equal((await post('attest', { wallet: claimant.address, challengeToken: prepare.challengeToken, signature: sig }, env, session, now + 301)).status, 403);
  assert.equal((await post('attest', { wallet: claimant.address, challengeToken: prepare.challengeToken, signature: sig }, env, { ...session, uid: 987654 }, now)).status, 403);
});

test('unknown qualification or unlogged user never receives voucher', async () => {
  const rejected = await post('prepare', { wallet: claimant.address }, env, { ...session, evidence: { ...session.evidence, followersObserved: 1 } });
  assert.equal(rejected.status, 403);
  assert.equal((await post('prepare', { wallet: claimant.address }, env, null)).status, 401);
});

test('cross-origin requests are forbidden even with a valid session', async () => {
  const res = await handleIssuance('prepare', new Request('https://daycoin.io99.xyz/api/dc2/prepare', {
    method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet: claimant.address })
  }), env, session, now, issuer.address);
  assert.equal(res.status, 403);
});


test('production cannot enable issuance with a different key', async () => {
  const prod = {
    DC2_MAINNET_ISSUANCE_ENABLED: 'true',
    DC2_MAINNET_ISSUER_PRIVATE_KEY: issuer.privateKey
  };
  assert.equal(issuerStatus(prod).enabled, false);
  assert.equal(issuerStatus(prod).chainId, 42161);
  assert.equal(issuerStatus(prod).contract, '0xD891dc80535e885E5893B8139902F90F6aBA086b');
});
