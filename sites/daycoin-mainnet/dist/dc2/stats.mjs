// Read-only protocol-wide stats. No wallet interaction or GitHub login.
const $=id=>document.getElementById(id);
const presentAmount=value=>{
  if(typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))throw Error('统计数值格式无效');
  const [whole,decimal='']=value.split('.');
  const base=BigInt(whole).toLocaleString('en-US');
  const fractional=decimal.padEnd(5,'0').slice(0,5).replace(/0+$/,'');
  return base+(fractional?'.'+fractional:'');
};
export function applyStats(body) {
  if(body?.chainId!==42161 || body.contract?.toLowerCase()!=='0xd891dc80535e885e5893b8139902f90f6aba086b' ||
     !Number.isSafeInteger(body.registered) || body.registered<0 || body.dailyRate!==body.registered ||
     !Number.isSafeInteger(body.blockNumber) || !Number.isSafeInteger(body.timestamp))
    throw Error('统计数据来源不匹配');
  $('stats-registered').textContent=body.registered.toLocaleString('en-US');
  $('stats-daily').textContent=body.dailyRate.toLocaleString('en-US');
  $('stats-supply').textContent=presentAmount(body.totalSupply);
  $('stats-unclaimed').textContent=presentAmount(body.unclaimed);
  $('stats-updated').textContent='区块 '+body.blockNumber.toLocaleString('en-US')+' · '+new Date(body.timestamp*1000).toLocaleString('zh-CN');
}
export async function refreshStats(fetcher=fetch) {
  try {
    const response=await fetcher('/api/dc2/stats',{cache:'no-store'});
    if(!response.ok)throw Error('统计接口暂不可用');
    applyStats(await response.json());
  }catch{
    $('stats-updated').textContent='统计暂不可用 · 稍后自动重试';
  }
}
await refreshStats();
setInterval(()=>{if(!document.hidden) refreshStats();},60000);
