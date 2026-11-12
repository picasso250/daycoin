// Minimal Arbitrum One DC2 position reader. No third-party browser SDK.
export const CHAIN_ID = '0xa4b1';
export const DC2_CONTRACT = '0xD891dc80535e885E5893B8139902F90F6aBA086b';
const RATE = 10n ** 18n;
const DAY = 86400n;
const isAddress = s => /^0x[0-9a-fA-F]{40}$/.test(s || '');
const encodeAddress = address => {
  if (!isAddress(address)) throw Error('钱包地址无效');
  return address.slice(2).toLowerCase().padStart(64, '0');
};
const encodeUint = number => BigInt(number).toString(16).padStart(64, '0');
const unpack = raw => {
  if (!/^0x(?:[0-9a-fA-F]{64})+$/.test(raw || '')) throw Error('链上返回数据格式无效');
  return raw.slice(2).match(/.{64}/g).map(word => BigInt('0x' + word));
};
const contractCall = async (provider, signature, parameter) => {
  const args = parameter === undefined ? '' : parameter;
  return unpack(await provider.request({method:'eth_call',params:[{to:DC2_CONTRACT,data:signature + args},'latest']}));
};
export function formatDC2(wei, digits = 6) {
  const value = BigInt(wei);
  const whole = value / RATE;
  const decimal = (value % RATE).toString().padStart(18,'0').slice(0,digits).replace(/0+$/,'');
  return whole.toLocaleString('en-US') + (decimal ? '.' + decimal : '');
}
export function accrued(position, timestampSeconds) {
  if (!position?.since) return 0n;
  const elapsed = BigInt(Math.max(0, Math.floor(timestampSeconds))) - position.since;
  const earned = (elapsed > 0n ? elapsed : 0n) * RATE / DAY;
  return earned > position.minted ? earned - position.minted : 0n;
}
export async function connectWallet(provider, prompt = false) {
  if (!provider?.request) throw Error('未检测到以太坊钱包，请安装支持 Arbitrum One 的钱包');
  const accounts = await provider.request({method:prompt ? 'eth_requestAccounts' : 'eth_accounts'});
  const address = accounts?.[0];
  if (!isAddress(address)) return null;
  const network = String(await provider.request({method:'eth_chainId'})).toLowerCase();
  if (network !== CHAIN_ID) {
    if (!prompt) return {address,wrongNetwork:true};
    await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN_ID}]});
    if (String(await provider.request({method:'eth_chainId'})).toLowerCase() !== CHAIN_ID)
      throw Error('请切换到 Arbitrum One');
  }
  return {address,wrongNetwork:false};
}
export async function readPosition(provider, address) {
  const [id] = await contractCall(provider,'0x61b5cb4b',encodeAddress(address)); // githubIdOf
  if (id === 0n) return {address,registered:false};
  const words = await contractCall(provider,'0x99fbab88',encodeUint(id)); // positions
  if (words.length !== 3) throw Error('链上登记状态返回不完整');
  const recipient = '0x' + words[0].toString(16).padStart(40,'0').slice(-40);
  if (recipient.toLowerCase() !== address.toLowerCase()) throw Error('链上 GitHub 身份反向绑定不一致');
  const since = words[1];
  const minted = words[2];
  const [balance] = await contractCall(provider,'0x70a08231',encodeAddress(address));
  const rawBlock = await provider.request({method:'eth_getBlockByNumber',params:['latest',false]});
  const chainTime = Number(BigInt(rawBlock?.timestamp || '0x0'));
  if (!Number.isSafeInteger(chainTime) || chainTime <= 0) throw Error('无法取得 Arbitrum One 区块时间');
  return {address,registered:true,githubId:id,since,minted,balance,chainTime};
}
export async function sendClaim(provider, address) {
  if (!isAddress(address)) throw Error('钱包地址无效');
  return provider.request({method:'eth_sendTransaction',params:[{
    from:address,to:DC2_CONTRACT,data:'0x4e71d92d',value:'0x0'
  }]});
}
export async function waitForReceipt(provider, hash, maxChecks = 45) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash || '')) throw Error('交易哈希无效');
  for (let i=0; i<maxChecks; i++) {
    const result = await provider.request({method:'eth_getTransactionReceipt',params:[hash]});
    if (result) {
      if (result.status !== '0x1') throw Error('交易在链上执行失败：'+hash);
      return result;
    }
    await new Promise(resolve => setTimeout(resolve,2000));
  }
  throw Error('交易尚未确认或查询超时，请在 Arbiscan 检查交易。不要重复提交。哈希：'+hash);
}
