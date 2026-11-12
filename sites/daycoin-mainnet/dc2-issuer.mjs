import { Wallet, verifyMessage, getAddress } from 'ethers';

// Arbitrum Sepolia only. Do not enable for Arbitrum One without independent review.
export const TESTNET_CHAIN_ID = 421614;
const DOMAIN = { name: 'DayCoin V2', version: '1' };
const TYPES = {
  Enroll: [
    { name: 'githubId', type: 'uint256' },
    { name: 'recipient', type: 'address' },
    { name: 'deadline', type: 'uint256' }
  ]
};

function validWallet(address) {
  try { return getAddress(address); } catch { return null; }
}

export function candidateEligibility(session, epochSeconds) {
  const evidence = session?.evidence;
  const githubId = session?.uid;
  if (!Number.isSafeInteger(githubId) || githubId <= 0 || !evidence) return { eligible: false, reason: 'missing_identity' };
  const createdAt = evidence.createdAt;
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) {
    return { eligible: false, reason: 'requires_fresh_login' };
  }
  const cutoff = new Date(epochSeconds * 1000);
  const birth = new Date(createdAt);
  const anniversary = new Date(birth);
  anniversary.setUTCFullYear(birth.getUTCFullYear() + 7);
  const age = cutoff >= anniversary;
  // These represent documented observed counts, NOT an audit of every star/PR.
  const stars = evidence.rawStarsObserved;
  const prs = evidence.externalMergedPRsObserved;
  const followers = evidence.followersObserved;
  const checks = {
    age,
    stars: Number.isSafeInteger(stars) && stars >= 10,
    prs: Number.isSafeInteger(prs) && prs >= 10,
    followers: Number.isSafeInteger(followers) && followers >= 10,
  };
  return { eligible: Object.values(checks).every(Boolean), checks, policy: 'candidate-v0.2', githubId };
}

function configuration(env) {
  const address = validWallet(env.DC2_SEPOLIA_CONTRACT || '');
  const active = env.DC2_TESTNET_ISSUANCE_ENABLED === 'true' &&
    Boolean(address && env.DC2_TESTNET_ISSUER_PRIVATE_KEY);
  return { active, address };
}

async function getKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function base64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decode(s) {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new TypeError('invalid token');
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), x => x.charCodeAt(0));
}
async function seal(data, secret) {
  const message = base64(new TextEncoder().encode(JSON.stringify(data)));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await getKey(secret), new TextEncoder().encode(message)));
  return message + '.' + base64(mac);
}
async function open(raw, secret) {
  try {
    if (typeof raw !== 'string' || raw.length > 2500) return null;
    const [message, tag, extra] = raw.split('.');
    if (!message || !tag || extra) return null;
    const valid = await crypto.subtle.verify('HMAC', await getKey(secret), decode(tag), new TextEncoder().encode(message));
    return valid ? JSON.parse(new TextDecoder().decode(decode(message))) : null;
  } catch { return null; }
}

export function issuerStatus(env) {
  const cfg = configuration(env);
  return { enabled: cfg.active, chainId: TESTNET_CHAIN_ID, contract: cfg.address };
}

/**
 * Generate proof-of-wallet-possession challenge, then verify personal_sign and
 * create an EIP-712 issuer voucher. The challenge is tied to a signed OAuth
 * session, wallet, expiry, and target contract, and is valid for 5 minutes.
 * No permanent identity is granted by this handler: only register() on chain.
 */
export async function handleIssuance(path, request, env, session, now) {
  const cfg = configuration(env);
  const output = (value, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
  if (path === 'issuer-status' && request.method === 'GET') return output(issuerStatus(env));
  if (!['prepare', 'attest'].includes(path)) return null;
  if (request.method !== 'POST') return output({ error: 'method_not_allowed' }, 405);
  const origin = env.DC2_PUBLIC_ORIGIN || 'https://daycoin.io99.xyz';
  if (request.headers.get('Origin') !== origin ||
      request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    return output({ error: 'invalid_origin_or_content_type' }, 403);
  }
  if (!cfg.active) return output({ error: 'testnet_issuance_disabled' }, 503);
  if (!session) return output({ error: 'login_required' }, 401);
  const eligibility = candidateEligibility(session, now);
  if (!eligibility.eligible) return output({ error: 'not_eligible', eligibility }, 403);
  let payload;
  try {
    const body = await request.text();
    if (body.length > 5000) return output({ error: 'too_large' }, 413);
    payload = JSON.parse(body);
  } catch { return output({ error: 'invalid_json' }, 400); }
  const wallet = validWallet(payload?.wallet);
  if (!wallet) return output({ error: 'invalid_wallet' }, 400);
  if (path === 'prepare') {
    const expires = now + 300;
    const challenge = {
      githubId: session.uid, wallet, exp: expires,
      chainId: TESTNET_CHAIN_ID, contract: cfg.address,
      sid: session.exp // binds to currently authenticated OAuth session
    };
    const challengeToken = await seal(challenge, env.DC2_SESSION_SECRET);
    const message = `DayCoin 2 testnet wallet binding\nGitHub ID: ${session.uid}\nWallet: ${wallet}\nNetwork: Arbitrum Sepolia (${TESTNET_CHAIN_ID})\nContract: ${cfg.address}\nChallenge: ${challengeToken}\nExpires: ${expires}`;
    return output({ message, challengeToken, expires });
  }
  const challenge = await open(payload?.challengeToken, env.DC2_SESSION_SECRET);
  if (!challenge || challenge.githubId !== session.uid || challenge.wallet !== wallet ||
      challenge.chainId !== TESTNET_CHAIN_ID || challenge.contract !== cfg.address ||
      challenge.sid !== session.exp || !Number.isSafeInteger(challenge.exp) ||
      challenge.exp < now || challenge.exp > now + 300) {
    return output({ error: 'invalid_or_expired_challenge' }, 403);
  }
  const expectedMessage = `DayCoin 2 testnet wallet binding\nGitHub ID: ${session.uid}\nWallet: ${wallet}\nNetwork: Arbitrum Sepolia (${TESTNET_CHAIN_ID})\nContract: ${cfg.address}\nChallenge: ${payload.challengeToken}\nExpires: ${challenge.exp}`;
  try {
    if (verifyMessage(expectedMessage, payload.signature) !== wallet)
      return output({ error: 'invalid_wallet_signature' }, 403);
  } catch { return output({ error: 'invalid_wallet_signature' }, 403); }
  try {
    const signer = new Wallet(env.DC2_TESTNET_ISSUER_PRIVATE_KEY);
    const deadline = now + 600;
    const domain = { ...DOMAIN, chainId: TESTNET_CHAIN_ID, verifyingContract: cfg.address };
    const values = { githubId: BigInt(session.uid), recipient: wallet, deadline };
    const signature = await signer.signTypedData(domain, TYPES, values);
    return output({ domain, types: TYPES, values: { githubId: String(session.uid), recipient: wallet, deadline }, signature, issuer: signer.address });
  } catch { return output({ error: 'issuer_configuration_error' }, 503); }
}
