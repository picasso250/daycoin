import { getAddress } from 'ethers';
import { parseEther } from 'ethers';

const hashPattern=/^--confirm-creation-hash=(0x[0-9a-fA-F]{64})$/;
const addressPattern=/^--confirm-deployer=(0x[0-9a-fA-F]{40})$/;

export function parseV02DeployMode(args) {
  if(args.length===0)return {broadcast:false};
  const matchAddress=args[1]?.match(addressPattern);
  const matchHash=args[2]?.match(hashPattern);
  if(args.length===3 && args[0]==='--broadcast' && matchAddress && matchHash)
    return {broadcast:true,expectedDeployer:getAddress(matchAddress[1]),expectedCreationHash:matchHash[1].toLowerCase()};
  throw Error('Usage: deploy:v02:sepolia [--broadcast --confirm-deployer=0xADDRESS --confirm-creation-hash=0x64HEX]');
}
export function assertV02FeeBudget(gasLimit, feePerGas, limitEth='0.02') {
  if(typeof limitEth!=='string'|| !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(limitEth))
    throw Error('UBIC1_V02_SEPOLIA_MAX_FEE_ETH must be a decimal ETH amount.');
  const limit=parseEther(limitEth);
  const required=BigInt(gasLimit)*BigInt(feePerGas);
  if(limit<=0n || required>limit)throw Error('Deployment EIP-1559 maximum fee exceeds the configured v0.2 Sepolia fee cap.');
  return required;
}
export function assertV02RpcUrl(url) {
  if(typeof url!=='string'||(!/^https:\/\//.test(url) && !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(url)))
    throw Error('Set a trusted HTTPS UBIC1_V02_SEPOLIA_RPC_URL (or loopback RPC for local tests).');
}
