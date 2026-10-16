import { BrowserProvider, Contract, Interface, JsonRpcProvider, parseEther, formatEther, keccak256 } from './ethers.min.js';
import { CONFIG } from './config.mjs';
import { STEP, DAY, EPOCH_SECONDS, positionState, truncateToken, depositWarning } from './model.mjs';
import { prepareTransaction, errorDetail } from './transaction.mjs';
import { assertFreshBlock, isRejected, isIdenticalTransaction } from './security.mjs';

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
let lastBlock = null, outcomeUnknown = false, operationId = 0;

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
function isFresh() { return !!(verified && freshAt>0 && Date.now()-freshAt<60000 && globalState && lastBlock && Number(Date.now()/1000)-lastBlock.timestamp<=600); }

function checkOperation(version) {if(version!==operationId)throw Error('操作已失效：钱包网络或账户发生变化。');}
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
  $('unknown').hidden = !outcomeUnknown;
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
  $('submit').disabled = busy || outcomeUnknown || !configured || !isFresh() || !p || !account || walletChain!==CHAIN ||
    (action==='claim'&&!status.claimable) || (action==='withdraw'&&!status.active) ||
    (action==='deposit'&&!validDeposit());
  $('refresh').disabled=busy||!configured;
  $('connect').disabled=busy;
  const copy={
    deposit:['Deposit · 存入与追加','每次存入任意正数额 ETH，都会重置奖励时钟，并永久放弃未领取奖励。无论是首次存款还是追加存款。'],
    claim:['Claim · 领取发行额','领取当前已赚取的全部合格时间奖励（18 位精度），不影响 ETH 本金。失格后仍能领取失格前累计的奖励。'],
    withdraw:['Withdraw · 取回本金','无需满足最低门槛，无需先 Claim；将全部本金退回同一钱包，关闭仓位并放弃未领取奖励。']
  };
  text('action-title',copy[action][0]);text('action-description',copy[action][1]);
  $('amount-field').hidden=action!=='deposit';
  text('submit',outcomeUnknown?'本页结果未知 · 请核对钱包':busy?'等待交易处理…':
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
      assertFreshBlock(latest,Date.now()/1000,lastBlock);
      // Compare the independently selected data RPC with the connected wallet's
      // view of the head. A stale-but-recent data RPC must not silently sign.
      if(wallet && account && walletChain===CHAIN) {
        const walletHead=Number(BigInt(await wallet.request({method:'eth_blockNumber'})));
        if(!Number.isSafeInteger(walletHead)||walletHead-latest.number>12||latest.number-walletHead>12)
          throw Error('钱包与只读 RPC 区块高度偏差过大，停止交易');
      }
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
      personal=p;block=latest.number;lastBlock={number:latest.number,hash:latest.hash,timestamp:Number(latest.timestamp)};verified=true;freshAt=Date.now();
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
    account=accounts[0]??null;walletChain=BigInt(chain);accountVersion++;operationId++;
    wallet.on?.('accountsChanged', accountsChanged);
    wallet.on?.('chainChanged',chainChanged);
    render();await refresh();
  }catch(e){showTx('Failed',errorDetail(e));}
}
function accountsChanged(accounts){account=accounts[0]??null;accountVersion++;operationId++;personal=null;render();void refresh();}
function chainChanged(chain){walletChain=BigInt(chain);accountVersion++;operationId++;personal=null;render();void refresh();}
// A small, single-operation UI. Transaction recovery belongs to the wallet.
// Losing the broadcast response is irreducibly uncertain; stop THIS PAGE
// from retrying and let the user examine the wallet / explorer.
async function runTransaction(op, requestedAction) {
  let hash = null, stage = '准备交易', browser = null, submissionStarted = false;
  try {
    if(!account)throw Error('请先连接钱包');
    if(walletChain!==CHAIN)throw Error('钱包链 ID 不匹配，禁止交易');
    if(!await refresh())throw Error('读取最新链上数据失败');
    checkOperation(op);
    const before=snapshot();await checkWallet(before);checkOperation(op);
    let value=0n;
    if(requestedAction==='deposit') {
      value=parseEther($('amount').value);
      if(value<=0n)throw Error('仅允许正数额 ETH');
      const warning=depositWarning(before.pending,before.principal,value);
      text('deposit-dialog-title',warning.title);
      text('deposit-detail',`本次存入 ${formatEther(value)} ETH；当前本金 ${formatEther(before.principal)} ETH；截至最新区块未领取 ${truncateToken(before.pending,12)} UBIC1。\n${warning.detail}\n确认后才会请求钱包签名。实际执行时可能又多累计奖励，所有未领取的都会被放弃。`);
      if(await choose('deposit-dialog',[['deposit-cancel','cancel'],['deposit-confirm','confirm']])!=='confirm')return;
    } else if(requestedAction==='withdraw') {
      if(before.principal===0n)throw Error('没有仓位');
      text('withdraw-detail',`将退回 ${formatEther(before.principal)} ETH 本金（Gas 另付），丢弃 ${truncateToken(before.pending,12)} UBIC1 尚未领取奖励。即使失格也可直接 Withdraw。`);
      $('withdraw-claim').hidden=before.pending===0n;
      const decision=await choose('withdraw-dialog',[
        ['withdraw-cancel','cancel'],['withdraw-claim','claim'],['withdraw-confirm','confirm']
      ]);
      if(decision==='claim'){action='claim';return;}
      if(decision!=='confirm')return;
    } else if(requestedAction==='claim' && before.pending===0n)throw Error('暂无可领取奖励');
    checkOperation(op);
    await checkWallet(before);checkOperation(op);
    if(!await refresh())throw Error('无法重新确认链上状态');
    checkOperation(op);await checkWallet(before);checkOperation(op);
    if(!personal||before.principal!==personal.position.principal||before.cursor!==personal.position.cursor)
      throw Error('仓位在确认期间改变：请重新操作并阅读新的奖励损失提示。');

    const tx={from:before.owner,to:address,data:iface.encodeFunctionData(requestedAction),value,chainId:CHAIN};
    stage='只读 RPC 模拟与 Gas 检查';
    showTx('Pending','正在模拟交易，尚未请求钱包签名');
    const gas=await prepareTransaction(rpc,tx);
    checkOperation(op);await checkWallet(before);checkOperation(op);
    stage='建立固定网络的签名上下文';
    showTx('Pending',`请核对链 ID ${CHAIN}、目标地址 ${address} 和 ${formatEther(value)} ETH 金额。`);
    browser=new BrowserProvider(wallet,{name:CONFIG.label,chainId:Number(CHAIN)});
    const signer=await browser.getSigner(before.owner);
    checkOperation(op);await checkWallet(before);checkOperation(op);
    stage='等待钱包签名/广播';
    submissionStarted=true;
    const outgoing=await signer.sendTransaction({
      to:address,data:tx.data,value,gasLimit:gas.gasLimit,chainId:CHAIN
    });
    hash=outgoing.hash;
    checkOperation(op);
    stage='独立 RPC 等待回执';
    showTx('Pending','已获取交易 Hash，等待预期链确认。',hash);
    const receipt=await rpc.waitForTransaction(hash,1,120000);
    if(!receipt)throw Error('等待回执超时，交易可能仍在处理');
    const actual=await rpc.getTransaction(hash);
    if(!isIdenticalTransaction(actual,tx) ||
       receipt.to?.toLowerCase()!==address.toLowerCase() ||
       receipt.from?.toLowerCase()!==before.owner.toLowerCase())
      throw Error('预期链交易字段无法验证');
    checkOperation(op);
    if(receipt.status===0) {
      showTx('Failed','已在预期链上确认交易回滚。',hash);
      return;
    }
    if(receipt.status!==1)throw Error('链上执行结果不明确');
    showTx('Confirmed',`${requestedAction} 已在预期链区块 ${receipt.blockNumber} 确认。`,hash);
    if(requestedAction==='deposit')action='claim';
    if(requestedAction==='withdraw')action='deposit';
    await refresh();
  }catch(e) {
    if(submissionStarted && !hash && isRejected(e)) {
      showTx('Failed','钱包明确拒绝交易，未发送。');
    } else if(submissionStarted) {
      outcomeUnknown=true;
      showTx('Pending',`结果未知（${stage}）：${errorDetail(e)}。交易可能已经执行；请先在钱包或可信区块浏览器核对，勿立即重试。`,hash);
    } else {
      showTx('Failed',`${stage}：${errorDetail(e)}`);
    }
  }finally{browser?.destroy();render();}
}

async function transaction() {
  // Synchronous in-tab guard before any await. Web Locks are optional:
  // supported browser => avoid concurrent signing within the same origin;
  // unsupported browser => proceed normally without bespoke lock storage.
  if(!configured||busy||outcomeUnknown)return;
  busy=true;
  const op=++operationId, requestedAction=action, owner=account;
  render();
  try{
    if(navigator.locks?.request && owner) {
      const lockName=`ubic1-v02:${CHAIN}:${address.toLowerCase()}:${owner.toLowerCase()}`;
      await navigator.locks.request(lockName,{ifAvailable:true},async lock=>{
        if(!lock) {
          showTx('Notice','另一个标签页正在进行钱包操作，请稍后重新点击。本页未发送交易。');
          return;
        }
        await runTransaction(op,requestedAction);
      });
    }else{
      await runTransaction(op,requestedAction);
    }
  }catch(e){
    showTx('Failed',`浏览器操作协调失败：${errorDetail(e)}。没有发送新交易。`);
  }finally{busy=false;render();}
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
