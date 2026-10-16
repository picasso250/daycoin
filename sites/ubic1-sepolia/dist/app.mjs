import { BrowserProvider, Contract, FetchRequest, Interface, JsonRpcProvider, formatEther, formatUnits, parseEther, keccak256 } from './ethers.min.js';
import { positionState, countdown, emptyIndex, applyEvent, compactEth, withdrawGuidance, withdrawalNeedsNewConsent } from './model.mjs';
import { prepareTransaction, rpcErrorDetail, isInsufficientFunds } from './transaction.mjs';

const ADDRESS = '0xef04ABbc1EEf957715895c234f5dEef7d2452AE1';
const HASH = '0x1eaa64a36b75ec045d2c1fc6375784aae427340bb6299dd5db34a87a39deb407';
const FIRST_BLOCK = 11920524, CHAIN = 11155111n, EXPLORER = 'https://sepolia.etherscan.io';
const ABI = [
 'function currentEpoch() view returns(uint256)', 'function requiredDeposit() view returns(uint256)',
 'function genesisTime() view returns(uint256)', 'function totalSupply() view returns(uint256)',
 'function balanceOf(address) view returns(uint256)', 'function pending(address) view returns(uint256)',
 'function positions(address) view returns(uint64 depositedAt,uint64 claimedPeriods,uint256 principal)',
 'function deposit() payable', 'function topUp() payable', 'function claim()', 'function withdraw()',
 'error InvalidDeposit()', 'error ActivePositionExists()', 'error InactivePosition()', 'error EtherTransferFailed()',
 'error InsufficientStake(uint256 actual,uint256 required)',
 'event Deposited(address indexed account,uint256 amount)', 'event ToppedUp(address indexed account,uint256 amount)',
 'event Withdrawn(address indexed account,uint256 amount)', 'event Claimed(address indexed account,uint256 reward)'
];
const $ = id => document.getElementById(id);
const request = new FetchRequest('https://ethereum-sepolia-rpc.publicnode.com'); request.timeout = 15000;
const rpc = new JsonRpcProvider(request, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
const token = new Contract(ADDRESS, ABI, rpc), iface = new Interface(ABI);
let wallet, account = null, walletChain = null, data = null, personal = null, action = 'deposit', busy = false;
let verified = false, lastGood = 0, refreshing = null, indexing = false, index = null, indexBlock = 0, lastIndexed = 0;
let accountVersion = 0, clockOffset = 0;
const eth = n => formatEther(n), coin = n => formatUnits(n, 4).replace(/\.0$/, '');
const date = n => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' }).format(new Date(Number(n) * 1000)) + ' UTC+8';
const text = (id, value) => { $(id).textContent = value; };
const short = a => `${a.slice(0,6)}…${a.slice(-4)}`;
const fresh = () => data && verified && Date.now() - lastGood < 90000;
const state = () => positionState(personal?.position, data?.required ?? 0n, personal?.pending ?? 0n);
for (const id of ['contract-link','footer-contract']) $(id).href = `${EXPLORER}/address/${ADDRESS}`;
const labels = { deposit: 'Deposit', topUp: 'Top Up', claim: 'Claim', withdraw: 'Withdraw' };

function errorMessage(error) {
 if (error.code === 4001 || error.code === 'ACTION_REJECTED') return '你已取消钱包操作。未确认的操作不会改变仓位。';
 if (isInsufficientFunds(error)) return '钱包余额不足，请确保能支付质押本金，并预留 Sepolia 测试 ETH 支付 gas。';
 let name = error.revert?.name;
 if (!name) { try { name = iface.parseError(error.data ?? error.info?.error?.data)?.name; } catch {} }
 if (name === 'InvalidDeposit') return '存入金额未达到当前门槛，或补仓金额为零。请刷新后重试。';
 if (name === 'InsufficientStake') return '当前本金未达领取门槛，请刷新后补仓。';
 if (name === 'ActivePositionExists') return '当前地址已有仓位，请使用 Top Up 补仓。';
 if (name === 'InactivePosition') return '当前地址没有活跃仓位，请先 Deposit。';
 if (error.code === 'CALL_EXCEPTION') return `RPC 模拟或执行失败：${rpcErrorDetail(error)}`;
 const detail = rpcErrorDetail(error);
 if (/failed to decode signed transaction/i.test(detail)) return `钱包/RPC 无法解析签名交易，尚不能归因于合约。请检查钱包的 Sepolia RPC 或更新钱包；勿反复点击钱包内重试。原始错误：${detail}`;
 return detail;
}

function setAction(next) {
 action = next;
 document.querySelectorAll('.action-tab').forEach(b => { b.classList.toggle('selected', b.dataset.action === next); b.setAttribute('aria-pressed', String(b.dataset.action === next)); });
 if (next === 'deposit') $('amount').value = data ? eth(data.required) : '';
 if (next === 'topUp') $('amount').value = personal && data ? eth(state().gap || 100000000000000000n) : '';
 render();
}

function render() {
 const s = state(), connected = !!account, wrong = connected && walletChain !== CHAIN;
 text('connect', connected ? short(account) : 'Connect Wallet ↗');
 $('connect').title = connected ? account : '连接浏览器钱包';
 $('network-warning').hidden = !wrong;
 if (data) {
  text('epoch', data.epoch.toString()); text('required', eth(data.required)); text('supply', coin(data.supply));
  text('genesis', date(data.genesis)); text('next-required', eth(data.required + 100000000000000000n));
 }
 const status = !connected ? '连接钱包以查看' : !personal ? '读取仓位中' : ({empty:'尚未质押',underfunded:'需要补仓',ready:'可以领取',accruing:'正在累计'})[s.status];
 text('position-status', status); $('position-status').className = `status-pill ${personal ? s.status : ''}`;
 text('pending', personal ? coin(personal.pending) : '—');
 text('principal', personal ? eth(personal.position.principal) : '—');
 text('gap', personal ? eth(s.gap) : '—'); $('gap-wrap').style.color = s.gap > 0n ? '#a3632c' : '';
 text('gap-note', !s.active ? '尚未开仓' : s.gap > 0n ? '补足后可追溯领取历史奖励' : '已满足当前领取门槛');
 text('eth-balance', personal ? compactEth(personal.ethBalance) : '—');
 $('eth-balance').title = personal ? `${eth(personal.ethBalance)} ETH（完整余额）` : '';
 $('eth-balance').setAttribute('aria-label', personal ? `完整钱包余额 ${eth(personal.ethBalance)} ETH` : '钱包余额未连接');
 text('token-balance', personal ? coin(personal.tokenBalance) : '—');
 text('deposited-at', personal && s.active ? date(personal.position.depositedAt) : '—');
 text('wallet-id', connected ? `${short(account)} · ${wrong ? '钱包网络不匹配' : 'Sepolia'}` : 'No wallet connected');
 const explanation = !connected ? '连接钱包，查看你的质押和发行资格。' : !personal ? '正在读取 Sepolia 上的仓位。' : !s.active ? '你还没有仓位。存入当前门槛金额，开始第一天。' : s.gap > 0n ? `待领取不等于可领取。还需补仓 ${eth(s.gap)} ETH，才能领取全部 ${coin(personal.pending)} UBIC1。` : s.claimable ? `现在可领取 ${coin(personal.pending)} UBIC1。领取后本金继续质押，不足一天的进度保留。` : '本金已达标。完整 24 小时后即可领取，当前不足一天的时间会继续累计。';
 text('eligibility', explanation);
 $('account-link').hidden = !connected;
 if (connected) $('account-link').href = `${EXPLORER}/address/${account}`;
 text('claimed-total', connected && index ? coin(index.claimed.get(account.toLowerCase()) || 0n) : '—');
 const copy = {
  deposit:['让第一天开始。',`新仓位按当前门槛存入${data ? ' ' + eth(data.required) + ' ETH' : '测试 ETH'}。一个地址同时最多一个仓位。`],
  topUp:['补足资格，保留时间。','补仓不重置计时，不增加每日发行速度。可以按缺口补足，也可以提前补足未来门槛。'],
  claim:['领取收入，继续参与。','领取所有未领取的整天奖励。本金保持质押，不足一天的进度保留。'],
  withdraw:['你的本金，随时取回。',`只退回全部 ${personal ? eth(personal.position.principal) : '—'} ETH 本金，并关闭仓位。将放弃全部 ${personal ? coin(personal.pending) : '—'} UBIC1 未领取资格（包括成熟奖励）。如需保留奖励，请先 Claim。`]
 };
 text('action-title',copy[action][0]); text('action-description',copy[action][1]);
 const amountAction = action === 'deposit' || action === 'topUp';
 $('amount-field').hidden = !amountAction; $('amount-label').hidden = !amountAction;
 $('amount').readOnly = action === 'deposit'; $('amount').disabled = busy;
 if (action === 'deposit' && data) $('amount').value = eth(data.required);
 text('amount-help', action === 'deposit' ? '门槛由链上读取；交易提交时再次核对。' : action === 'topUp' ? '仅使用 Sepolia 测试 ETH，需另留 gas。' : action === 'withdraw' ? '门槛不足不影响提款权。' : '只有本金达标且存在整天奖励时才能领取。');
 let reason = '', allowed = fresh() && !busy;
 if (!connected) { reason = 'Connect Wallet ↗'; allowed = !busy; }
 else if (wrong) { reason = 'Switch to Sepolia ↗'; allowed = !busy; }
 else if (!fresh() || !personal) { reason = '等待链上数据'; allowed = false; }
 else if (busy) { reason = '处理中…'; allowed = false; }
 else if (action === 'deposit' && s.active) { reason = '已有仓位 · 使用 Top Up'; allowed = false; }
 else if (action !== 'deposit' && !s.active) { reason = '请先 Deposit'; allowed = false; }
 else if (action === 'claim' && !s.claimable) { reason = s.gap ? '请先补足质押' : '尚无完整周期奖励'; allowed = false; }
 else if (action === 'topUp') { try { if (parseEther($('amount').value) <= 0n) throw Error(); } catch { reason = '输入有效的 ETH 金额'; allowed = false; } }
 $('submit').disabled = !allowed;
 text('submit', reason || `${labels[action]} ${action === 'claim' && personal ? coin(personal.pending) + ' UBIC1' : action === 'withdraw' && personal ? eth(personal.position.principal) + ' ETH' : ''} ↗`);
 document.querySelectorAll('.action-tab').forEach(b => b.disabled = busy);
 updateClock();
}

function updateClock() {
 if (!data) return;
 const now = BigInt(Math.floor(Date.now()/1000 + clockOffset));
 const epochEnd = data.genesis + (data.epoch + 1n) * 86400000n;
 text('next-epoch', countdown(epochEnd-now));
 const s = state();
 text('reward-heading', personal?.pending > 0n ? '距离再累计一枚' : '距离下一枚奖励');
 if (personal && s.active) {
  const elapsed = (now > personal.position.depositedAt ? now-personal.position.depositedAt : 0n) / 86400n;
  const next = personal.position.depositedAt + (elapsed + 1n)*86400n;
  text('next-reward', countdown(next-now)); text('next-reward-date', `${date(next)} · 倒计时为估算`);
 } else { text('next-reward','—'); text('next-reward-date','每完整 24 小时累计 1 UBIC1'); }
}

async function refresh() {
 if (refreshing) { await refreshing; return; }
 refreshing = (async () => {
  try {
   if (!verified) {
    if ((await rpc.getNetwork()).chainId !== CHAIN) throw Error('RPC 网络异常，已禁用交易。');
    if (keccak256(await rpc.getCode(ADDRESS)) !== HASH) throw Error('链上代码与部署记录不符，已禁用交易。');
    verified = true;
   }
   const block = await rpc.getBlock('latest'); if (!block) throw Error('无法读取最新区块');
   const options = { blockTag: block.number }, owner = account, version = accountVersion;
   const [epoch, required, genesis, supply] = await Promise.all([token.currentEpoch(options),token.requiredDeposit(options),token.genesisTime(options),token.totalSupply(options)]);
   let p = null;
   if (owner) {
    const [position,pending,ethBalance,tokenBalance] = await Promise.all([token.positions(owner,options),token.pending(owner,options),rpc.getBalance(owner,block.number),token.balanceOf(owner,options)]);
    p = { position,pending,ethBalance,tokenBalance };
   }
   data = {epoch,required,genesis,supply,block:block.number};
   if (version === accountVersion) personal = p;
   clockOffset = block.timestamp-Date.now()/1000; lastGood = Date.now();
   $('data-warning').hidden = true; text('sync-status',`● Sepolia · 区块 ${block.number.toLocaleString()}`);
   render();
   if (Date.now()-lastIndexed > 60000) void indexEvents(block.number);
  } catch (e) {
   lastGood = 0; $('data-warning').hidden = false; text('data-warning',`链上数据暂不可用，操作已暂停。${errorMessage(e)} 页面将自动重试。`); render();
  }
 })();
 try { await refreshing; } finally { refreshing = null; }
}

async function indexEvents(latest) {
 if (indexing) return;
 indexing = true; lastIndexed = Date.now();
 const target = Math.max(FIRST_BLOCK-1,latest-2), result = emptyIndex();
 let start=FIRST_BLOCK, chunk=2000, rounds=0;
 text('index-status',index ? `更新事件统计中 · 旧快照 #${indexBlock}` : '正在索引存款、补仓和退出事件…');
 try {
  const topics = ['Deposited','ToppedUp','Withdrawn','Claimed'].map(n=>iface.getEvent(n).topicHash);
  while(start<=target) {
   if (++rounds>1000) throw Error('历史过长，当前未完成完整索引');
   const end=Math.min(target,start+chunk-1);
   let logs;
   try { logs=await rpc.getLogs({address:ADDRESS,fromBlock:start,toBlock:end,topics:[topics]}); }
   catch(e){ if(chunk>20){chunk=Math.max(20,Math.floor(chunk/5));continue;} throw e; }
   logs.sort((a,b)=>a.blockNumber-b.blockNumber || a.index-b.index);
   for(const log of logs){const event=iface.parseLog(log);applyEvent(result,event.name,event.args.account,event.name==='Claimed'?event.args.reward:event.args.amount);}
   start=end+1;
   text('index-status',`事件索引 ${Math.min(100,Math.round((start-FIRST_BLOCK)/Math.max(1,target-FIRST_BLOCK+1)*100))}% · 未完成前不展示新统计`);
   await new Promise(r=>setTimeout(r,60));
  }
  index=result;indexBlock=target;
  text('total-staked',eth(index.principal));text('active-count',index.active.size.toLocaleString());
  text('index-status',`事件统计截至 #${target.toLocaleString()} · 索引时保留最近 2 块`);render();
 }catch(e){text('index-status',index?`索引更新失败 · 显示旧快照 #${indexBlock}`:'事件索引未完成 · 统计暂不可用（不代表 0）');}
 finally{indexing=false;}
}

function bindWallet(provider) {
 if(wallet===provider)return;
 if(wallet?.removeListener){wallet.removeListener('accountsChanged',accountsChanged);wallet.removeListener('chainChanged',chainChanged);}
 wallet=provider;wallet.on?.('accountsChanged',accountsChanged);wallet.on?.('chainChanged',chainChanged);
}
function accountsChanged(accounts){account=accounts[0]||null;accountVersion++;personal=null;render();void refresh().then(()=>refresh());}
function chainChanged(chain){walletChain=BigInt(chain);accountVersion++;personal=null;render();void refresh().then(()=>refresh());}
async function connectWallet(){
 try{
  if(!window.ethereum)throw Error('未检测到浏览器钱包。请在安装 MetaMask 等钱包的浏览器，或钱包内置浏览器打开此页面。');
  bindWallet(window.ethereum);
  const accounts=await wallet.request({method:'eth_requestAccounts'});account=accounts[0]||null;
  walletChain=BigInt(await wallet.request({method:'eth_chainId'}));accountVersion++;personal=null;
  await refresh();await refresh();render();
 }catch(e){showTransaction('Failed','钱包连接未完成',errorMessage(e));}
}
async function switchNetwork(){try{await wallet.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]});walletChain=BigInt(await wallet.request({method:'eth_chainId'}));await refresh();render();}catch(e){showTransaction('Failed','网络切换未完成',errorMessage(e));}}

function showTransaction(status,title,detail,hash){
 $('transaction').hidden=false;$('transaction').classList.toggle('failed',status==='Failed');
 text('tx-title',`${status} · ${title}`);text('tx-detail',detail);text('tx-icon',status==='Confirmed'?'✓':status==='Failed'?'!':'◌');
 $('tx-link').hidden=!hash;if(hash)$('tx-link').href=`${EXPLORER}/tx/${hash}`;
 if(status==='Confirmed'&&hash){
  let history=$('tx-history');if(!history){history=document.createElement('div');history.id='tx-history';$('transaction').lastElementChild.append(history);}
  if(!history.querySelector(`[data-hash="${hash}"]`)){const a=document.createElement('a');a.dataset.hash=hash;a.href=`${EXPLORER}/tx/${hash}`;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`✓ ${title} · ${short(hash)} ↗`;a.style.display='block';a.style.marginTop='8px';history.append(a);}
 }
}
function withdrawalConsentSnapshot(p,s){
 return {pending:p.pending,principal:p.position.principal,claimable:s.claimable};
}
async function confirmWithdrawal(p,s){
 const guidance=withdrawGuidance(p.position,data.required,p.pending);
 const balance=coin(p.pending);
 const heading=guidance.recommendClaim ? `你还有 ${balance} UBIC1 可以领取` : '退出仓位，取回本金';
 text('withdraw-dialog-title',heading);
 const detail=`将退回本金 ${eth(p.position.principal)} ETH（gas 另付）。\n`+
  (guidance.recommendClaim
   ? `你有 ${balance} UBIC1 已成熟且符合领取门槛。建议先 Claim，然后再 Withdraw。也可以主动放弃全部未领取奖励，直接退回本金。`
   : guidance.forfeitsMature
    ? `你有 ${balance} UBIC1 尚未领取，但当前本金不足领取门槛（还需补仓 ${eth(guidance.gap)} ETH）。你仍可直接退回全部本金，代价是放弃奖励。`
    : '目前没有已成熟的待领取奖励。退出会放弃未满一天的计时进度。');
 text('withdraw-detail',detail);
 $('withdraw-claim').hidden=!guidance.recommendClaim;
 text('withdraw-direct',guidance.forfeitsMature ? '放弃奖励，直接退本' : '确认退出并退款');
 const dialog=$('withdraw-dialog');dialog.returnValue='cancel';
 const result=new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true}));
 dialog.showModal();
 (guidance.recommendClaim ? $('withdraw-claim') : $('withdraw-cancel')).focus();
 return result;
}

async function transact(){
 if(!account)return connectWallet();if(walletChain!==CHAIN)return switchNetwork();if(busy)return;
 const owner=account, version=accountVersion, selected=action;let hash=null,browser,stage='读取链上状态';
 busy=true;render();
 try{
  await refresh();
  if(!fresh()||!personal)throw Error('缺少新鲜链上数据，请稍后重试。');
  if(version!==accountVersion||owner!==account)throw Error('钱包账户或网络已变化，请重新操作。');
  let s=state(), acceptedWithdrawal=null;
  if(selected==='claim'&&!s.claimable)throw Error(s.gap?'请先补足当前门槛。':'暂无完整周期奖励。');
  if(selected==='withdraw'){
   const choice=await confirmWithdrawal(personal,s);
   if(choice==='claim'){
    if(version!==accountVersion||owner!==account)throw Error('钱包账户已变化，请重新选择操作。');
    setAction('claim');return; // No transaction or wallet signature is triggered by this choice.
   }
   if(choice!=='confirm')return;
   acceptedWithdrawal=withdrawalConsentSnapshot(personal,s);
  }
  // The dialog may stay open across an epoch boundary. Refresh before signing.
  await refresh();
  const accounts=await wallet.request({method:'eth_accounts'});
  if(BigInt(await wallet.request({method:'eth_chainId'}))!==CHAIN||accounts[0]?.toLowerCase()!==owner.toLowerCase()||version!==accountVersion)throw Error('钱包账户或网络已变化，交易未发送。');
  if(!fresh())throw Error('链上数据已失效，请重试。');
  if(selected==='withdraw'&&withdrawalNeedsNewConsent(acceptedWithdrawal,withdrawalConsentSnapshot(personal,state()))){
   // A new reward, claim eligibility or principal has changed while the dialog was open.
   const choice=await confirmWithdrawal(personal,state());
   if(choice==='claim'){
    if(version!==accountVersion||owner!==account)throw Error('钱包账户已变化，请重新选择操作。');
    setAction('claim');return;
   }
   if(choice!=='confirm')return;
   const secondConsent=withdrawalConsentSnapshot(personal,state());
   await refresh();
   const latestAccounts=await wallet.request({method:'eth_accounts'});
   if(!fresh()||version!==accountVersion||owner!==account||
      BigInt(await wallet.request({method:'eth_chainId'}))!==CHAIN||
      latestAccounts[0]?.toLowerCase()!==owner.toLowerCase())throw Error('钱包状态或链上数据已变化，请重试。');
   if(withdrawalNeedsNewConsent(secondConsent,withdrawalConsentSnapshot(personal,state())))
    throw Error('待领取奖励或本金再次变化，请重新点击 Withdraw 以确认。');
  }
  browser=new BrowserProvider(wallet,'any');const signer=await browser.getSigner(owner), contract=new Contract(ADDRESS,ABI,signer);
  let value=0n;if(selected==='deposit')value=data.required;
  if(selected==='topUp'){value=parseEther($('amount').value);if(value<=0n)throw Error('补仓金额必须大于零。');}
  const overrides=value?{value}:{};
  stage='Sepolia RPC 余额与交易模拟';
  showTransaction('Pending',labels[selected],'正在检查余额并模拟交易，尚未请求钱包签名。');
  const transaction={from:owner,to:ADDRESS,data:iface.encodeFunctionData(selected),value};
  const gasOverrides=await prepareTransaction(rpc,transaction);
  if(BigInt(await wallet.request({method:'eth_chainId'}))!==CHAIN||version!==accountVersion)throw Error('钱包状态已变化，请重新操作。');
  stage='钱包确认与发送';
  showTransaction('Pending',labels[selected],'请在钱包中核对 Sepolia、合约地址和金额。');
  const tx=await contract[selected]({...overrides,...gasOverrides});hash=tx.hash;stage='等待链上确认';showTransaction('Pending',labels[selected],'交易已广播，等待链上确认。请勿重复提交。',hash);
  let receipt;
  try{receipt=await tx.wait(1,180000);}catch(e){if(e.code==='TRANSACTION_REPLACED'&&!e.cancelled){receipt=e.receipt;hash=e.replacement.hash;}else throw e;}
  if(!receipt||receipt.status!==1)throw Error('交易执行失败。');
  showTransaction('Confirmed',labels[selected],`已确认于区块 ${receipt.blockNumber}。仓位数据正在刷新；一次确认不代表最终性。`,hash);
  await refresh();lastIndexed=0;if(data)void indexEvents(data.block);
  if(selected==='deposit')setAction('claim');if(selected==='withdraw')setAction('deposit');
 }catch(e){
  const uncertain=hash&&!(e.receipt?.status===0)&&e.code!=='TRANSACTION_REPLACED';
  showTransaction(uncertain?'Pending':'Failed',labels[selected],uncertain?'暂时无法确认最终状态，请通过 Etherscan 核查，勿直接重复提交。':`${stage}：${errorMessage(e)}${!hash&&stage==='Sepolia RPC 余额与交易模拟'?' 尚未请求签名或广播交易，不产生链上手续费。':''}`,hash);
 }finally{busy=false;browser?.destroy();render();}
}

$('connect').addEventListener('click',connectWallet);$('switch-network').addEventListener('click',switchNetwork);$('submit').addEventListener('click',transact);
$('amount').addEventListener('input',render);document.querySelectorAll('.action-tab').forEach(b=>b.addEventListener('click',()=>setAction(b.dataset.action)));
setAction('deposit');void refresh();
setInterval(()=>{updateClock();if(data&&!fresh())render();},1000);
setInterval(()=>{if(!document.hidden)void refresh();},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
if(window.ethereum){bindWallet(window.ethereum);Promise.all([wallet.request({method:'eth_accounts'}),wallet.request({method:'eth_chainId'})]).then(([accounts,chain])=>{walletChain=BigInt(chain);accountsChanged(accounts);}).catch(()=>{});}
