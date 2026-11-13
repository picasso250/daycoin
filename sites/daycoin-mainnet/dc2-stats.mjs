// Public DC2 statistics, calculated from immutable on-chain events at one block.
// No wallet, GitHub identity, or private keys are required.
import { id } from 'ethers';
const ADDRESS = '0xD891dc80535e885E5893B8139902F90F6aBA086b';
const START_BLOCK = 523527970; // deployment block
const RATE = 10n ** 18n;
const PERIOD = 86400n;
const REGISTERED = id('Registered(uint256,address,uint256)');
const MAX_REGISTRATIONS = 2000; // explicit fail rather than silently truncate
const RPC = 'https://arb1.arbitrum.io/rpc';
function hexNum(value) {
  if(typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) throw Error('Invalid RPC quantity');
  return BigInt(value);
}
function amount(wei) {
  const whole = wei / RATE;
  const tail = (wei % RATE).toString().padStart(18,'0').replace(/0+$/,'');
  return whole.toString() + (tail ? '.'+tail : '');
}
export function summarizeDc2(logs, supplyWei, blockTimestamp, blockNumber) {
  if (!Array.isArray(logs) || logs.length > MAX_REGISTRATIONS) throw Error('Registration log limit exceeded; indexed scan required');
  const identities = new Set();
  let earned = 0n;
  for(const log of logs) {
    if(log?.address?.toLowerCase() !== ADDRESS.toLowerCase() || log.topics?.length !== 3 || log.topics[0] !== REGISTERED) throw Error('Unexpected registration log');
    const githubId = hexNum(log.topics[1]);
    const since = hexNum(log.data);
    if(githubId <= 0n || identities.has(githubId.toString()) || since > blockTimestamp) throw Error('Inconsistent registration event');
    identities.add(githubId.toString());
    earned += (blockTimestamp - since) * RATE / PERIOD;
  }
  if (supplyWei < 0n || earned < supplyWei) throw Error('Total supply exceeds accrued entitlement');
  return {
    chainId:42161,contract:ADDRESS,blockNumber:Number(blockNumber),timestamp:Number(blockTimestamp),
    registered:identities.size,dailyRate:identities.size,
    totalSupply:amount(supplyWei),totalAccrued:amount(earned),unclaimed:amount(earned-supplyWei)
  };
}
export async function readDc2Stats(fetcher=fetch) {
  let sequence=0;
  const request=async(method,params=[])=>{
    const result=await fetcher(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params})});
    if(!result.ok) throw Error('Arbitrum RPC unavailable');
    const json=await result.json();
    if(json.error || !Object.hasOwn(json,'result')) throw Error('Arbitrum RPC rejected '+method);
    return json.result;
  };
  const latest=await request('eth_getBlockByNumber',['latest',false]);
  if(!latest?.number || !latest.timestamp)throw Error('Missing chain block');
  const block=hexNum(latest.number),timestamp=hexNum(latest.timestamp);
  if(block < BigInt(START_BLOCK))throw Error('Chain tip precedes DC2 deployment');
  const atBlock='0x'+block.toString(16);
  const [logs,supplyRaw]=await Promise.all([
    request('eth_getLogs',[{address:ADDRESS,fromBlock:'0x'+START_BLOCK.toString(16),toBlock:atBlock,topics:[REGISTERED]}]),
    request('eth_call',[{to:ADDRESS,data:'0x18160ddd'},atBlock]) // ERC20 totalSupply()
  ]);
  if(!Array.isArray(logs) || logs.length > MAX_REGISTRATIONS)throw Error('Too many logs to return completely');
  if(typeof supplyRaw!=='string')throw Error('No totalSupply RPC result');
  return summarizeDc2(logs,hexNum(supplyRaw),timestamp,block);
}
const apiJson=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':status===200?'public, max-age=60':'no-store','X-Content-Type-Options':'nosniff'}});
export async function handleDc2Stats(request,{fetcher=fetch, cache=null}={}) {
  if(request.method!=='GET')return apiJson({error:'method_not_allowed'},405);
  const key=new Request('https://daycoin.io99.xyz/api/dc2/stats');
  if(cache) {
    const cached=await cache.match(key);
    if(cached)return cached;
  }
  try {
    const data=await readDc2Stats(fetcher);
    const response=apiJson(data);
    if(cache)await cache.put(key,response.clone());
    return response;
  } catch {
    return apiJson({error:'statistics_unavailable',message:'链上统计暂不可用，请稍后重试。'},503);
  }
}
