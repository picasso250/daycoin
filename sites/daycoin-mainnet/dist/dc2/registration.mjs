// Minimal wallet interaction, no framework or third-party browser SDK.
// Immutable DC2 contract on Arbitrum One.
const CHAIN_HEX = '0xa4b1'; // 42161
const REGISTER_SELECTOR = 'a050d719'; // keccak256("register(uint256,uint256,bytes)")[0:4]
const word = n => BigInt(n).toString(16).padStart(64, '0');

export function encodeRegistration(githubId, deadline, signature) {
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(signature)) throw new Error('Invalid EIP712 signature');
  const encoded = signature.slice(2);
  return '0x' + REGISTER_SELECTOR + word(githubId) + word(deadline) + word(96) +
    word(encoded.length / 2) + encoded.padEnd(Math.ceil(encoded.length / 64) * 64, '0');
}
async function requestJson(path, payload) {
  const response = await fetch('/api/dc2/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || 'Server request failed');
  return body;
}

export async function beginMainnetRegistration(config, setStatus) {
  if (!config?.enabled || !config.contract) throw new Error('Mainnet enrollment is not enabled');
  if (!window.ethereum?.request) throw new Error('No Ethereum wallet detected');
  const wallet = window.ethereum;
  setStatus('正在连接钱包…');
  const accounts = await wallet.request({ method: 'eth_requestAccounts' });
  const address = accounts?.[0];
  if (!/^0x[0-9a-f]{40}$/i.test(address || '')) throw new Error('Wallet not connected');
  let network = await wallet.request({ method: 'eth_chainId' });
  if (network?.toLowerCase() !== CHAIN_HEX) {
    await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
    network = await wallet.request({ method: 'eth_chainId' });
    if (network?.toLowerCase() !== CHAIN_HEX) throw new Error('Wrong chain');
  }
  setStatus('正在准备 GitHub 与钱包绑定证明…');
  const prepare = await requestJson('prepare', { wallet: address });
  setStatus('请在钱包里签署身份绑定消息（不会产生链上交易）…');
  const signature = await wallet.request({ method: 'personal_sign', params: [prepare.message, address] });
  setStatus('正在向 DC2 签发者申请资格…');
  const voucher = await requestJson('attest', { wallet: address, challengeToken: prepare.challengeToken, signature });
  if (String(voucher.values.recipient).toLowerCase() !== address.toLowerCase() ||
      voucher.domain.verifyingContract.toLowerCase() !== config.contract.toLowerCase() ||
      Number(voucher.domain.chainId) !== 42161) throw new Error('Voucher mismatch');
  const data = encodeRegistration(voucher.values.githubId, voucher.values.deadline, voucher.signature);
  setStatus('请在钱包中确认 Arbitrum One 主网登记交易…');
  const hash = await wallet.request({ method: 'eth_sendTransaction', params: [{
    from: address, to: config.contract, data, value: '0x0'
  }] });
  setStatus('Arbitrum One 登记交易已提交：' + hash);
  return hash;
}
