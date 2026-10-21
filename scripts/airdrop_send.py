"""Send from CSV on Arbitrum; default dry-run. --execute requires explicit approval.

The CSV is the human-readable ledger. A txhash without a successful receipt
is NOT done and MUST NOT be sent again until resolved manually.
"""
import argparse
import re
from decimal import Decimal
from dotenv import dotenv_values
from eth_account import Account
from airdrop_collect import LEDGER, read_rows, write_rows
from airdrop_v2ex import ROOT, CHAIN_ID, TOKEN, SENDER, COUNT, UNIT, ADDRESS, rpc, balance_of, calldata, gas_price_wei


def receipt_status(txhash):
    return rpc('eth_getTransactionReceipt',[txhash])

def reconcile(rows):
    changed=False
    for row in rows:
        h=row['txhash'].strip()
        if not h: continue
        receipt=receipt_status(h)
        if receipt is None:
            print('UNCONFIRMED (skip):',row['user'],h)
            continue
        if int(receipt['status'],16)!=1:
            print('REVERTED (manual review):',row['user'],h)
            continue
        # Confirm the successful receipt is for the expected transaction and sender.
        tx=rpc('eth_getTransactionByHash',[h])
        if not tx or tx['from'].lower()!=SENDER.lower() or tx['to'].lower()!=TOKEN.lower() or tx['input'].lower()!=calldata(row['address'], UNIT).lower():
            raise SystemExit('Receipt exists but transfer does not match ledger: '+h)
        if row['done']!='yes':
            row['done']='yes'; changed=True;print('CONFIRMED:',row['user'],h)
    if changed:write_rows(rows)


def main():
    ap=argparse.ArgumentParser(description='Send 0.1 DC1 to not-done CSV rows, max 10 total')
    ap.add_argument('--execute',action='store_true',help='Sign and broadcast: needs --yes')
    ap.add_argument('--yes',action='store_true',help='Approve spending up to 0.1 DC1 per pending row')
    args=ap.parse_args()
    if args.execute and not args.yes:ap.error('Use --execute --yes after reviewing the displayed CSV plan')
    rows=read_rows()
    if not rows:raise SystemExit('CSV is empty. First run: python scripts/airdrop_collect.py')
    if len(rows)>COUNT:raise SystemExit('More than 10 recipients. Refusing.')
    if any(r['done']=='yes' and not r['txhash'] for r in rows):
        raise SystemExit('CSV has done=yes but no txhash; refusing until reconciled.')
    if len({r['address'].lower() for r in rows})!=len(rows) or len({r['user'].lower() for r in rows})!=len(rows) or len({r['reply_id'] for r in rows})!=len(rows):
        raise SystemExit('Duplicate CSV entries. Refusing.')
    if any(not ADDRESS.fullmatch(r['address']) or not re.fullmatch('r_[0-9]+',r['reply_id']) or r['done'] not in ('','yes') or (r['txhash'] and not re.fullmatch('(?:0x)?[a-fA-F0-9]{64}',r['txhash'])) for r in rows):
        raise SystemExit('Invalid CSV contents. Refusing.')
    if int(rpc('eth_chainId',[]),16)!=CHAIN_ID:raise SystemExit('Wrong chain.')
    reconcile(rows)
    done=sum(r['done']=='yes' for r in rows)
    pending=[r for r in rows if r['done']!='yes' and not r['txhash']]
    unresolved=[r for r in rows if r['done']!='yes' and r['txhash']]
    if done+len(pending)+len(unresolved)>COUNT:raise SystemExit('Exceeds 10 total.')
    if done + len(pending) + len(unresolved) != len(rows):
        raise SystemExit('Ledger accounting mismatch.')
    print(f'DONE {done}/{COUNT}; UNSENT {len(pending)}; UNRESOLVED {len(unresolved)}; TOKEN BALANCE {Decimal(balance_of(SENDER))/10**18} DC1')
    for r in pending:print('SEND 0.1 DC1 ->',r['user'],r['address'])
    if unresolved:
        print('STOP: unresolved transaction(s); do not risk duplicate payment.')
        return
    if not args.execute:
        print('DRY RUN; use --execute --yes after reviewing.')
        return
    config=dotenv_values(ROOT/'.env');key=config.get('PRIVATE_KEY')
    if not key:raise SystemExit('Missing PRIVATE_KEY in local .env')
    signer=Account.from_key(key)
    if signer.address.lower()!=SENDER.lower():raise SystemExit('Local key is not the expected sender')
    if balance_of(SENDER)<len(pending)*UNIT:raise SystemExit('Insufficient DC1')
    for row in pending:
        tx={'chainId':CHAIN_ID,'to':TOKEN,'value':0,'nonce':int(rpc('eth_getTransactionCount',[SENDER,'pending']),16),'data':calldata(row['address'],UNIT)}
        estimate=int(rpc('eth_estimateGas',[{'from':SENDER,'to':TOKEN,'value':'0x0','data':tx['data']}]),16)
        tx['gas']=(estimate*120+99)//100
        tx['gasPrice']=gas_price_wei()  # RPC quote, minimum 0.02 Gwei
        if int(rpc('eth_getBalance',[SENDER,'latest']),16)<tx['gas']*tx['gasPrice']:raise SystemExit('Insufficient ETH for gas')
        signed=signer.sign_transaction(tx)
        h='0x'+signed.hash.hex().removeprefix('0x')
        row['txhash']=h
        write_rows(rows) # persist hash BEFORE RPC call to prevent double spend after timeout
        try:
            broadcast=rpc('eth_sendRawTransaction',['0x'+signed.raw_transaction.hex().removeprefix('0x')])
            print('BROADCAST',row['user'],broadcast)
        except Exception as ex:
            raise SystemExit(f'Broadcast uncertain for {row["user"]}, hash {h}. Investigate before retry. {ex}')
        receipt=receipt_status(h)
        if receipt is None:
            print('PENDING; stop here until next read-only reconciliation:',h)
            return
        if int(receipt['status'],16)!=1:raise SystemExit('REVERTED; review '+h)
        reconcile(rows)
    print('All submitted rows processed.')

if __name__=='__main__':main()
