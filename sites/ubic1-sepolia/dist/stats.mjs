import { JsonRpcProvider, FetchRequest, Interface, Contract, formatEther, formatUnits, keccak256 } from './ethers.min.js';
import {createLedger, applyLedgerEvent, monetarySnapshot, makeSamples, formatAnnualBps, DAY_SECONDS} from './stats-model.mjs';
import {scanLogs} from './stats-scan.mjs';

const ADDRESS='0x5473aac7ed5c5b14c4E7e2c8a8844f8e3FC92715';
const HASH='0x1c8b1489ffa0d74d93f90db305434f6b640edd579fa4af5d244eff987aeee6e6';
const START=11925819, CHAIN=11155111n;
const ABI=['function totalSupply() view returns(uint256)','function genesisTime() view returns(uint256)','event Deposited(address indexed account,uint256 amount)','event ToppedUp(address indexed account,uint256 amount)','event Withdrawn(address indexed account,uint256 amount)','event Claimed(address indexed account,uint256 reward)','event Transfer(address indexed from,address indexed to,uint256 value)'];
const request=new FetchRequest('https://ethereum-sepolia-rpc.publicnode.com'); request.timeout=15000;
const rpc=new JsonRpcProvider(request,undefined,{batchMaxCount:1,cacheTimeout:-1});
const contract=new Contract(ADDRESS,ABI,rpc), iface=new Interface(ABI), $=id=>document.getElementById(id);
const ZERO='0x0000000000000000000000000000000000000000';
let busy=false, saved=null, view='hour';
function show(id,value){$(id).textContent=value;}
function note(message,invalid=false){show('stats-sync',message);$('stats-error').hidden=!invalid;if(invalid)show('stats-error',message);}
function coin(value){return formatUnits(value,4);}
function fmt(value){return Number(value).toLocaleString('zh-CN');}
function draw(id,rows,key,label){
 const svg=$(id);svg.replaceChildren();
 const NS='http://www.w3.org/2000/svg';
 function el(name,attrs,text){const item=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))item.setAttribute(k,String(v));if(text!=null)item.textContent=text;svg.append(item);return item;}
 const filtered=rows.map((r,i)=>({i,v:key==='annual'?r.annualBps==null?null:Number(r.annualBps)/100:r.eligible})).filter(p=>p.v!==null&&Number.isFinite(p.v));
 if(!filtered.length){el('text',{x:310,y:110,'text-anchor':'middle',fill:'#737a72','font-size':14},'尚无可计算数据');show(id+'-note','数据缺失或供应为零，无法绘图');return;}
 const maximum=Math.max(1,...filtered.map(p=>p.v)), top=maximum*1.12, left=54,right=603,bottom=182,up=19;
 for(let j=0;j<4;j++){const y=up+(bottom-up)*j/3;el('line',{x1:left,y1:y,x2:right,y2:y,stroke:'#dcded5'});el('text',{x:left-7,y:y+4,'text-anchor':'end','font-size':11,fill:'#737a72'},(top*(1-j/3)).toLocaleString('zh-CN',{maximumFractionDigits:1}));}
 const x=i=>left+(right-left)*(rows.length===1?.5:i/(rows.length-1)), y=v=>bottom-(v/top)*(bottom-up);
 let path='',previous=-2;
 for(const p of filtered){path+=(p.i===previous+1?'L':'M')+x(p.i).toFixed(2)+' '+y(p.v).toFixed(2)+' ';previous=p.i;}
 el('path',{d:path,fill:'none',stroke:'#315b45','stroke-width':2.7,'stroke-linecap':'round','stroke-linejoin':'round'});
 const final=filtered[filtered.length-1];el('circle',{cx:x(final.i),cy:y(final.v),r:4,fill:'#315b45'});
 const time=n=>new Date(Number(n)*1000).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:view==='hour'?'2-digit':undefined});
 el('text',{x:left,y:208,'font-size':11,fill:'#737a72'},time(rows[0].timestamp));
 el('text',{x:right,y:208,'text-anchor':'end','font-size':11,fill:'#737a72'},time(rows[rows.length-1].timestamp));
 show(id+'-note',label+' · '+rows.length+' 个采样点 · 最后一个值 '+final.v.toLocaleString('zh-CN',{maximumFractionDigits:2})+(key==='annual'?'%':' 个'));
}
function render(){
 if(!saved)return;
 const {ledger,genesis,targetTime,targetBlock,events}=saved,now=monetarySnapshot(ledger,targetTime,genesis);
 show('stat-eligible',fmt(now.eligible));show('stat-production',fmt(now.dailyProduction));
 show('stat-annual',formatAnnualBps(now.annualBps));show('stat-active',fmt(now.active));
 show('stat-supply',coin(now.supply));show('stat-staked',formatEther(now.principal));
 show('stat-minted-burned',coin(now.minted)+' / '+coin(now.burned));
 // A 365-day comparison is impossible until a full historical year exists.
 const yearStart=targetTime-365n*DAY_SECONDS;
 if(yearStart>=genesis){
  const prev=makeSamples(events,genesis,yearStart,DAY_SECONDS,1).at(-1);
  if(prev&&prev.supply>0n){
   const change=(now.supply-prev.supply)*10000n/prev.supply;
   show('stat-year',formatAnnualBps(change));
   show('stat-year-desc','365 天净供应量变化');
  }else{show('stat-year','—');show('stat-year-desc','365 天前供应为零，无法计算');}
 }else{show('stat-year','—');show('stat-year-desc','未满 365 天');}
 const step=view==='hour'?3600n:DAY_SECONDS;
 const rows=makeSamples(events,genesis,targetTime,step,view==='hour'?48:365);
 draw('chart-eligible',rows,'eligible','合格发行仓位');
 draw('chart-annual',rows,'annual','瞬时年化潜在发行率');
 show('stats-index-note','已核对供应与事件账本；快照区块 #'+targetBlock.toLocaleString()+'（最新区块之前至少 2 块）。历史曲线按链上区块时间重建。');
 note('Sepolia · 区块 #'+targetBlock.toLocaleString());
}
async function load(){
 if(busy)return;busy=true;$('refresh-stats').disabled=true;
 note('正在验证合约与读取区块…');$('stats-error').hidden=true;
 try{
  if((await rpc.getNetwork()).chainId!==CHAIN)throw Error('RPC 网络不是 Sepolia');
  if(keccak256(await rpc.getCode(ADDRESS))!==HASH)throw Error('链上运行字节码哈希与部署记录不同');
  const latest=await rpc.getBlock('latest');
  if(!latest)throw Error('最新区块不可用');
  const targetBlock=Math.max(START,latest.number-2);
  const finalBlock=await rpc.getBlock(targetBlock);
  if(!finalBlock)throw Error('快照区块不可用');
  const [genesis,supply]=await Promise.all([contract.genesisTime({blockTag:targetBlock}),contract.totalSupply({blockTag:targetBlock})]);
  const names=['Deposited','ToppedUp','Withdrawn','Claimed','Transfer'], topics=names.map(n=>iface.getEvent(n).topicHash);
  const logs=await scanLogs(rpc,{address:ADDRESS,topics:[topics]},START,targetBlock,
   percent=>note('正在索引历史事件 '+percent+'%'));
  logs.sort((a,b)=>a.blockNumber-b.blockNumber||a.index-b.index);
  const ledger=createLedger(),events=[],timeCache=new Map();
  for(let i=0;i<logs.length;i++){
   const log=logs[i],parsed=iface.parseLog(log);
   let name=parsed.name,amount,account;
   if(name==='Transfer'){
    if(parsed.args.to.toLowerCase()!==ZERO)continue;
    name='Burned';amount=parsed.args.value;account=parsed.args.from;
   }else{account=parsed.args.account;amount=name==='Claimed'?parsed.args.reward:parsed.args.amount;}
   if(!timeCache.has(log.blockNumber)){const b=await rpc.getBlock(log.blockNumber);if(!b)throw Error('无法读取事件区块时间');timeCache.set(log.blockNumber,BigInt(b.timestamp));}
   const timestamp=timeCache.get(log.blockNumber);
   const event={name,amount,account,timestamp};
   applyLedgerEvent(ledger,event);
   events.push(event);
  }
  if(ledger.supply!==supply)throw Error('事件重建供应量与 totalSupply 不一致，统计已暂停');
  saved={ledger,genesis,targetTime:BigInt(finalBlock.timestamp),targetBlock,events};
  render();
 }catch(e){
  saved=null; note('链上数据暂不可核验：'+(e.message||String(e)),true);
  for(const id of ['stat-eligible','stat-production','stat-annual','stat-active','stat-supply','stat-staked','stat-year','stat-minted-burned'])show(id,'—');
  $('chart-eligible').replaceChildren();$('chart-annual').replaceChildren();
  for(const id of ['stats-index-note','chart-eligible-note','chart-annual-note'])show(id,'本次快照核验未完成，统计暂不可用。');
  show('stat-year-desc','数据暂不可用');
 }finally{busy=false;$('refresh-stats').disabled=false;}
}
$('refresh-stats').addEventListener('click',load);
for(const [id,next] of [['view-hour','hour'],['view-day','day']]) $(id).addEventListener('click',()=>{
 view=next;
 for(const [key,val] of [['view-hour','hour'],['view-day','day']]){const active=next===val;$(key).classList.toggle('selected',active);$(key).setAttribute('aria-pressed',String(active));}
 render();
});
void load();
