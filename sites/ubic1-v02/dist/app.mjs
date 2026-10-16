import { BrowserProvider, Contract, Interface, JsonRpcProvider, parseEther, formatEther, keccak256 } from './ethers.min.js';
import { CONFIG } from './config.mjs';
import { STEP, DAY, EPOCH_SECONDS, positionState, truncateToken, depositWarning } from './model.mjs';
import { prepareTransaction, errorDetail } from './transaction.mjs';

const ABI = [
  'function currentEpoch() view returns(uint256)',
  'function requiredDeposit() view returns(uint256)',
  'function genesisTime() view returns(uint256)',
  'function totalSupply() view returns(uint256)',
  'function balanceOf(address) view returns(uint256)',
  'function pending(address) view returns(uint256)',
  'function positions(address) view returns(uint64 cursor,uint256 principal)',
  'function deposit() payable',
  'function claim() returns(uint256)',
  'function withdraw()',
  'error InvalidDeposit()',
  'error InactivePosition()',
  'error EtherTransferFailed()',
  'event Deposited(address indexed account,uint256 added,uint256 principal)',
  'event Claimed(address indexed account,uint256 reward)',
  'event Withdrawn(address indexed account,uint256 principal)'
];
const $ = name => document.getElementById(name);
const text = (name, content) => { $(name).textContent = String(content); };
const short = s => s ? `${s.slice(0,6)}…${s.slice(-4)}` : '—';
const date = ts => new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'}).format(new Date(Number(ts)*1000))+' UTC+8';
const configured = !!(CONFIG.address && CONFIG.runtimeHash && CONFIG.rpcUrl && Number.isSafeInteger(CONFIG.chainId) && CONFIG.chainId>0);
const address = configured ? CONFIG.address : null;
const rpc = configured ? new JsonRpcProvider(CONFIG.rpcUrl, undefined, { batchMaxCount:1, cacheTimeout:-1 }) : null;
const contract = configured ? new Contract(address, ABI, rpc) : null;
const iface = new Interface(ABI);
const CHAIN = configured ? BigInt(CONFIG.chainId) : null;
const explorer = CONFIG.explorerUrl ?? '';
let wallet = null, account = null, walletChain = null;
let verified = false, freshAt = 0, block = null, globalState = null, personal = null;
let action = 'deposit', busy = false, accountVersion = 0, refreshPromise = null;

function showEnvironment(ok, message) {
  $('environment').classList.toggle('safe',ok);
  text('environment-title', ok ? `已验证 · ${CONFIG.label}` : '交易不可用 · 未验证的实验环境');
  text('environment-desc', message);
}
function showWarning(msg) {
  $('warning').hidden = !msg;
  $('warning').textContent = msg ?? '';
}
function failClosed(message) {
  verified = false; freshAt = 0;
  showEnvironment(false, message);
  showWarning(message);
  render();
}
function isFresh() { return verified && freshAt>0 && Date.now()-freshAt<60000 && globalState; }
function snapshot() {
  return {version:accountVersion,owner:account,
    principal:personal?.position.principal??0n, pending:personal?.pending??0n,
    cursor:personal?.position.cursor??0n};
}
function requireSameWallet(s) {
  if (s.version!==accountVersion || !account || s.owner.toLowerCase()!==account.toLowerCase()) throw Error('钱包账户已改变，交易已停止，请重新确认。');
}
async function checkWallet(s) {
  requireSameWallet(s);
  if (!wallet) throw Error('未连接钱包');
  const [accounts,chain] = await Promise.all([
    wallet.request({method:'eth_accounts'}),
    wallet.request({method:'eth_chainId'})
  ]);
  if (BigInt(chain)!==CHAIN || !accounts[0] || accounts[0].toLowerCase()!==s.owner.toLowerCase()) throw Error('钱包网络或地址已改变，交易已停止。');
  requireSameWallet(s);
}

function render() {
  text('connect', account ? short(account) : 'Connect Wallet ↗');
  text('wallet-id', account ? `${account} · ${walletChain===CHAIN?'网络匹配':'网络不匹配'}` : '尚未连接钱包');
  text('chain-label', configured ? `${CONFIG.label} · Chain ID ${CONFIG.chainId}` : '未配置');
  text('contract-address', address ?? '未部署');
  text('code-status', verified ? '运行时代码 Hash 已核对' : '未验证 · 禁止交易');
  const g=globalState, p=personal, pos=p?.position, status=positionState(pos,g?.required??STEP,p?.pending??0n);
  text('required',g?formatEther(g.required)+' ETH':'—');
  text('supply',g?truncateToken(g.supply,6)+' UBIC1':'—');
  text('principal',p?formatEther(pos.principal)+' ETH':'—');
  text('pending',p?truncateToken(p.pending,12):'—');
  text('token-balance',p?truncateToken(p.tokenBalance,8)+' UBIC1':'—');
  text('eth-balance',p?formatEther(p.ethBalance)+' ETH':'—');
  text('cursor',pos?.principal>0n?date(pos.cursor):'—');
  text('position-status',!p?'—':!status.active?'尚未存款':status.qualified?'达标 · 正在累计':'未达当前门槛 · 暂停累计');
  text('eligibility',!p?'连接钱包后显示资格':!status.active?'尚未存款':status.qualified?'当前满足发行门槛':`还需 ${formatEther(status.gap)} ETH 达标`);
  if(g){
    const epochEnd=g.genesis+(g.epoch+1n)*EPOCH_SECONDS;
    const remaining=epochEnd>g.time?epochEnd-g.time:0n;
    text('next-epoch',`${(remaining/DAY).toString()} 天后`);
    text('expires',pos?.principal>0n&&pos.principal>=STEP?
      date(g.genesis+(pos.principal/STEP)*EPOCH_SECONDS):
      '未达标，无奖励');
    text('sync-status',`区块 #${block} · ${date(g.time)} · 快照值 ${isFresh()?'已更新':'已失效'}`);
  } else text('sync-status','未连接已验证链上数据');
  $('submit').disabled = busy || !configured || !isFresh() || !p || !account || walletChain!==CHAIN ||
    (action==='claim'&&!status.claimable) || (action==='withdraw'&&!status.active) ||
    (action==='deposit'&&!validDeposit());
  $('refresh').disabled=busy||!configured;
  const copy={
    deposit:['Deposit · 存入与追加','每次存入任意正数额 ETH，都会重置奖励时钟，并永久放弃未领取奖励。无论是首次存款还是追加存款。'],
    claim:['Claim · 领取发行额','领取当前已赚取的全部合格时间奖励（18 位精度），不影响 ETH 本金。失格后仍能领取失格前累计的奖励。'],
    withdraw:['Withdraw · 取回本金','无需满足最低门槛，无需先 Claim；将全部本金退回同一钱包，关闭仓位并放弃未领取奖励。']
  };
  text('action-title',copy[action][0]);text('action-description',copy[action][1]);
  $('amount-field').hidden=action!=='deposit';
  text('submit',busy?'等待交易处理…':
    !configured?'尚未部署 v0.2 · 禁止交易':
    !verified?'等待主网代码核验':
    !account?'请先连接钱包':
    walletChain!==CHAIN?'请切换钱包网络':
    action==='claim'&&!status.claimable?'暂无可领的合格时间奖励':
    action==='withdraw'&&!status.active?'没有可取回的本金':
    action==='deposit'&&!validDeposit()?'请输入大于 0 的 ETH 金额':
    action==='deposit'?'确认 Deposit ↗':action==='claim'?'领取 Claim ↗':'退出 Withdraw ↗');
  document.querySelectorAll('[data-action]').forEach(b=>{
    b.classList.toggle('selected',b.dataset.action===action);
    b.setAttribute('aria-pressed', String(b.dataset.action===action));
    b.disabled=busy;
  });
}
function validDeposit() {try {return parseEther($('amount').value)>0n;}catch{return false;}}
function setAction(next) {if (busy)return;action=next;render();}

async function refresh() {
  if (!configured) {failClosed('v0.2 尚无已授权部署地址。本独立前端默认关闭签名和交易；本地端到端测试可注入独立的模拟链部署配置。');return false;}
  if (refreshPromise) return refreshPromise;
  refreshPromise=(async()=>{
    try {
      const chain = await rpc.getNetwork();
      if(chain.chainId!==CHAIN)throw Error('只读 RPC Chain ID 不匹配');
      const chainCode=await rpc.getCode(address);
      if(chainCode==='0x'||keccak256(chainCode).toLowerCase()!==CONFIG.runtimeHash.toLowerCase())throw Error('部署合约的运行时代码 Hash 不匹配');
      const latest=await rpc.getBlock('latest');
      if(!latest)throw Error('RPC 无法获取最新区块');
      const opts={blockTag:latest.number};
      const owner=account, version=accountVersion;
      const [genesis,required,epoch,supply]=await Promise.all([
        contract.genesisTime(opts), contract.requiredDeposit(opts),
        contract.currentEpoch(opts), contract.totalSupply(opts)
      ]);
      let p=null;
      if(owner) {
        const [position,pending,ethBalance,tokenBalance]=await Promise.all([
          contract.positions(owner,opts),contract.pending(owner,opts),
          rpc.getBalance(owner,latest.number),contract.balanceOf(owner,opts)
        ]);
        p={position:{cursor:position.cursor,principal:position.principal},pending,ethBalance,tokenBalance};
      }
      if(version!==accountVersion) return false;
      globalState={genesis,required,epoch,supply,time:BigInt(latest.timestamp)};
      personal=p;block=latest.number;verified=true;freshAt=Date.now();
      showWarning('');
      showEnvironment(true,`已检查 Chain ID ${CONFIG.chainId} 和完整运行时代码 Hash。仅在此配置指向的链上执行交易；请自行核对真实钱包签名详情。`);
      render();
      return true;
    }catch(e) {
      failClosed(`链上校验失败；交易已禁用：${errorDetail(e)}`);
      return false;
    }
  })();
  try {return await refreshPromise;}finally{refreshPromise=null;}
}
function showTx(status, detail, hash=null) {
  $('transaction').hidden=false;
  $('transaction').classList.toggle('error',status==='Failed');
  text('tx-title',status);text('tx-detail',detail);
  $('tx-link').hidden=!hash||!explorer;
  if(hash && explorer)$('tx-link').href=`${explorer.replace(/\/$/,'')}/tx/${hash}`;
}
function choose(dialogId, choices) {
  const el=$(dialogId);
  return new Promise(resolve=>{
    let completed=false;
    const clean=()=>{
      for(const [id,cb] of callbacks)$(id).removeEventListener('click',cb);
      el.removeEventListener('close',onClose);
    };
    const finish=(value)=>{if(completed)return;completed=true;clean();if(el.open)el.close();resolve(value);};
    const callbacks=choices.map(([id,value])=>[id,()=>finish(value)]);
    const onClose=()=>finish('cancel');
    for(const [id,cb] of callbacks)$(id).addEventListener('click',cb);
    el.addEventListener('close',onClose,{once:true});
    el.showModal();
    $(choices[0][0]).focus();
  });
}
async function connect() {
  if(busy)return;
  if(!configured){failClosed('尚未部署 v0.2，禁止连接后执行交易。');return;}
  if(!window.ethereum){showTx('Failed','未发现浏览器钱包。请安装并启用可信钱包。');return;}
  try{
    wallet=window.ethereum;
    const accounts=await wallet.request({method:'eth_requestAccounts'});
    const chain=await wallet.request({method:'eth_chainId'});
    account=accounts[0]??null;walletChain=BigInt(chain);accountVersion++;
    wallet.on?.('accountsChanged', accountsChanged);
    wallet.on?.('chainChanged',chainChanged);
    render();await refresh();
  }catch(e){showTx('Failed',errorDetail(e));}
}
function accountsChanged(accounts){account=accounts[0]??null;accountVersion++;personal=null;render();void refresh();}
function chainChanged(chain){walletChain=BigInt(chain);accountVersion++;personal=null;render();void refresh();}
async function transaction() {
  if(!configured||busy)return;
  if(!account){await connect();return;}
  if(walletChain!==CHAIN){showTx('Failed',`钱包网络不匹配。需要 Chain ID ${CONFIG.chainId}，不会自动切换。`);return;}
  if(!isFresh()){await refresh();if(!isFresh())return;}
  busy=true;render();
  let hash=null,stage='准备交易',browser=null;
  const requestedAction=action;
  try{
    if(!await refresh())throw Error('读取最新链上数据失败');
    const before=snapshot();await checkWallet(before);
    let value=0n;
    if(requestedAction==='deposit') {
      value=parseEther($('amount').value);
      if(value<=0n)throw Error('仅允许正数额 ETH');
      const warning=depositWarning(before.pending,before.principal,value);
      text('deposit-dialog-title',warning.title);
      text('deposit-detail',`本次存入 ${formatEther(value)} ETH；当前本金 ${formatEther(before.principal)} ETH；截至最新区块未领取 ${truncateToken(before.pending,12)} UBIC1。\n${warning.detail}\n确认后才会请求钱包签名。`);
      if(await choose('deposit-dialog',[['deposit-cancel','cancel'],['deposit-confirm','confirm']])!=='confirm')return;
    } else if(requestedAction==='withdraw') {
      if(before.principal===0n)throw Error('没有仓位');
      text('withdraw-detail',`将退回 ${formatEther(before.principal)} ETH 本金（Gas 另付），丢弃 ${truncateToken(before.pending,12)} UBIC1 尚未领取奖励。即使当前失格也可以直接 Withdraw。`);
      $('withdraw-claim').hidden=before.pending===0n;
      const decision=await choose('withdraw-dialog',[
        ['withdraw-cancel','cancel'],['withdraw-claim','claim'],['withdraw-confirm','confirm']
      ]);
      if(decision==='claim') {action='claim';return;}
      if(decision!=='confirm')return;
    }else if(requestedAction==='claim' && before.pending===0n)throw Error('暂无可领取奖励');
    await checkWallet(before);
    if(!await refresh())throw Error('无法重新确认链上状态');
    await checkWallet(before);
    // Detect concurrent position changes. Accrued seconds may change pending;
    // no approval is inferred for an external change of the stored principal/cursor.
    if(!personal||before.principal!==personal.position.principal || before.cursor!==personal.position.cursor)
      throw Error('仓位在确认期间改变：请重新操作并阅读新的奖励损失提示。');
    const tx={from:account,to:address,data:iface.encodeFunctionData(requestedAction),value};
    stage='只读 RPC 交易模拟与 Gas 检查';
    showTx('Pending','正在模拟 ETH 交易，还没有请求签名');
    const gas=await prepareTransaction(rpc,tx);
    await checkWallet(before);
    stage='等待钱包签名';
    showTx('Pending',`请核对钱包内的网络、目标合约和 ${formatEther(value)} ETH 金额。`);
    browser=new BrowserProvider(wallet,'any');
    const signer=await browser.getSigner(account);
    const signerContract=new Contract(address,ABI,signer);
    const outgoing=await signerContract[requestedAction]({ ...gas, ...(value ? {value}:{} )});
    hash=outgoing.hash;
    stage='等待链上回执';
    showTx('Pending','交易已经广播，请勿重复提交。',hash);
    let receipt;
    try {receipt=await outgoing.wait(1,120000);}catch(e){
      if(e.code==='TRANSACTION_REPLACED'&&!e.cancelled) {receipt=e.receipt;hash=e.replacement.hash;}
      else throw e;
    }
    if(!receipt||receipt.status!==1)throw Error('链上执行失败');
    showTx('Confirmed',`${requestedAction} 已在区块 ${receipt.blockNumber} 确认。再次刷新钱包状态。`,hash);
    if(requestedAction==='deposit')action='claim';
    if(requestedAction==='withdraw')action='deposit';
    await refresh();
  }catch(e) {
    const uncertain=!!hash && !(e.receipt?.status===0);
    showTx(uncertain?'Pending':'Failed',`${stage}: ${errorDetail(e)}${uncertain?' 请到浏览器核查交易，勿重复提交。':''}`,hash);
  }finally{busy=false;browser?.destroy();render();}
}

$('connect').addEventListener('click',connect);
$('refresh').addEventListener('click',()=>void refresh());
$('submit').addEventListener('click',()=>void transaction());
$('amount').addEventListener('input',render);
document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>setAction(el.dataset.action)));
if(configured) {
  // The displayed config is never a fallback to v0.1. Stale/failing RPC disables signing.
  showEnvironment(false,'正在独立检查网络与运行时代码；完成前禁止钱包交易。');
  void refresh();
  setInterval(()=>{if(!busy)void refresh();},15000);
} else {failClosed('v0.2 尚未部署。没有合约地址与 runtime hash，因此页面默认只读且禁止所有交易。');}
render();
