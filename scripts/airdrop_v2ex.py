#!/usr/bin/env python3
"""V2EX DC1 airdrop: snapshot/dry-run by default; explicit opt-in to sign and send.

Usage: python scripts/airdrop_v2ex.py --refresh
       python scripts/airdrop_v2ex.py --execute --approve <plan_sha256>
Never put a private key in command arguments. Execution reads .env only after approval.
"""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from eth_account import Account
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / '.airdrop-v2ex-plan.json'
JOURNAL = ROOT / '.airdrop-v2ex-journal.json'
TOPIC = 'https://www.v2ex.com/t/1250229'
CHAIN_ID = 42161
RPC = 'https://arb1.arbitrum.io/rpc'
TOKEN = '0xDa7f5A3e68145Ad5125216d40D58729bEF5275f7'
SENDER = '0x806918b917a89956B8AF1a2897940c475973E2d3'
COUNT = 10
UNIT = 10**17  # 0.1 DC1 (18 decimals)
MIN_GAS_PRICE_WEI = 20_000_000  # 0.02 Gwei safety floor; not a fixed price
ADDRESS = re.compile(r'(?<![A-Za-z0-9])0x[a-fA-F0-9]{40}(?![A-Za-z0-9])')


def scrape(html):
    soup = BeautifulSoup(html, 'html.parser')
    found, seen_users, seen_addrs = [], set(), set()
    # Thread order is retained by the DOM; one recipient per V2EX username.
    for cell in soup.select('.cell[id^="r_"]'):
        user = cell.select_one('a.dark')
        content = cell.select_one('.reply_content')
        if not user or not content:
            continue
        username = user.get_text(' ', strip=True)
        if not username or username.lower() == 'freekindom' or username.lower() in seen_users:
            continue
        match = ADDRESS.search(content.get_text(' ', strip=True))
        if not match:
            continue
        address = match.group(0)
        if address.lower() in seen_addrs or address.lower() in {SENDER.lower(), TOKEN.lower(), '0x' + '0'*40}:
            continue
        seen_users.add(username.lower())
        seen_addrs.add(address.lower())
        found.append({'reply_id': cell['id'], 'user': username, 'address': address})
        if len(found) == COUNT:
            break
    return found


def snapshot_digest(recipients):
    canonical = json.dumps(recipients, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


def rpc(method, params):
    response = requests.post(RPC, json={'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}, timeout=20)
    response.raise_for_status()
    obj = response.json()
    if 'error' in obj:
        raise RuntimeError(f'RPC {method}: {obj["error"]}')
    return obj['result']


def gas_price_wei():
    # Use the chain's current quoted price when it exceeds our minimum.
    # Arbitrum can reject an underpriced legacy transaction; do not hardcode a low price.
    return max(int(rpc('eth_gasPrice', []), 16), MIN_GAS_PRICE_WEI)


def balance_of(address):
    payload = '0x70a08231' + address[2:].lower().zfill(64)
    return int(rpc('eth_call', [{'to': TOKEN, 'data': payload}, 'latest']), 16)


def calldata(to, amount):
    return '0xa9059cbb' + to[2:].lower().zfill(64) + format(amount, '064x')


def main():
    parser = argparse.ArgumentParser(description='DC1 V2EX airdrop — dry-run unless --execute is given')
    parser.add_argument('--refresh', action='store_true', help='Fetch replies and replace the local snapshot (no sending)')
    parser.add_argument('--execute', action='store_true', help='Sign and broadcast transactions from saved snapshot')
    parser.add_argument('--approve', help='Full SHA256 digest printed in the reviewed dry-run')
    parser.add_argument('--check', action='store_true', help='Read-only check of outstanding transaction hashes')
    parser.add_argument('--retry-missing', action='store_true', help='After checks, unblock a missing tx with explicit plan approval; NO BROADCAST')
    args = parser.parse_args()
    if args.retry_missing and (args.refresh or args.execute or args.check):
        parser.error('--retry-missing must run alone (apart from --approve)')
    if args.check and args.execute:
        parser.error('--check cannot be combined with --execute')
    if args.refresh and args.execute:
        parser.error('--refresh and --execute must not be combined')
    if args.refresh:
        if JOURNAL.exists():
            raise SystemExit('A transaction journal already exists. Do not replace the approved snapshot mid-airdrop.')
        page = requests.get(TOPIC, headers={'User-Agent': 'Mozilla/5.0'}, timeout=20)
        page.raise_for_status()
        recipients = scrape(page.text)
        snap = {'topic': TOPIC, 'network': CHAIN_ID, 'token': TOKEN,
                'created_at': datetime.now(timezone.utc).isoformat(), 'recipients': recipients}
        SNAPSHOT.write_text(json.dumps(snap, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    elif SNAPSHOT.exists():
        snap = json.loads(SNAPSHOT.read_text('utf-8'))
        recipients = snap['recipients']
    else:
        parser.error('No snapshot. First run: python scripts/airdrop_v2ex.py --refresh')
    if snap.get('topic') != TOPIC or snap.get('network') != CHAIN_ID or snap.get('token', '').lower() != TOKEN.lower():
        raise SystemExit('Snapshot target does not match fixed topic/chain/token')
    if len(recipients) > COUNT or len({r['address'].lower() for r in recipients}) != len(recipients) or len({r['user'].lower() for r in recipients}) != len(recipients):
        raise SystemExit('Invalid snapshot: duplicated addresses/users or too many recipients')
    for r in recipients:
        if not ADDRESS.fullmatch(r['address']) or not re.fullmatch(r'r_\d+', r['reply_id']):
            raise SystemExit('Invalid snapshot: malformed address or reply id')
    digest = snapshot_digest(recipients)
    print('V2EX topic:', TOPIC)
    print('Arbitrum token:', TOKEN)
    print('Sender:', SENDER)
    print('Snapshot time:', snap['created_at'])
    for i, r in enumerate(recipients, 1):
        print(f'{i:>2}. {r["user"]} ({r["reply_id"]}): {r["address"]}  => 0.1 DC1')
    print(f'Slots: {len(recipients)}/{COUNT}; plan amount: {len(recipients)/10:.1f} DC1')
    print('PLAN_SHA256:', digest)
    if args.retry_missing:
        if args.approve != digest:
            raise SystemExit('Plan approval digest required for journal recovery')
        if not JOURNAL.exists():
            raise SystemExit('No journal to recover')
        journal = json.loads(JOURNAL.read_text('utf-8'))
        if journal['plan_sha256'] != digest:
            raise SystemExit('Journal belongs to different plan')
        unknown = [(a, e) for a, e in journal['sent'].items() if e['status'] == 'broadcast_unknown']
        if len(unknown) != 1:
            raise SystemExit('Expected exactly one unknown transaction; check manually')
        a, entry = unknown[0]
        hash_ = '0x' + entry['txhash'].removeprefix('0x')
        if rpc('eth_getTransactionByHash', [hash_]) is not None or rpc('eth_getTransactionReceipt', [hash_]) is not None:
            raise SystemExit('Transaction exists on chain or pending; cannot unblock')
        latest = rpc('eth_getTransactionCount', [SENDER, 'latest'])
        pending = rpc('eth_getTransactionCount', [SENDER, 'pending'])
        if latest != pending:
            raise SystemExit('Pending transactions exist; cannot unblock')
        # This is an explicit operator decision, not a guarantee of global mempool absence.
        del journal['sent'][a]
        JOURNAL.write_text(json.dumps(journal, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('UNBLOCKED', a, 'previous hash', hash_, 'nonce', latest)
        print('NO TRANSACTION SIGNED OR BROADCAST. Review plan before executing again.')
        return
    if args.check:
        if not JOURNAL.exists():
            print('No transaction journal.')
            return
        journal = json.loads(JOURNAL.read_text('utf-8'))
        print('Chain sender nonce (latest/pending):', rpc('eth_getTransactionCount', [SENDER, 'latest']), rpc('eth_getTransactionCount', [SENDER, 'pending']))
        print('Current DC1 balance (token wei):', balance_of(SENDER))
        for addr, entry in journal['sent'].items():
            txhash = '0x' + entry['txhash'].removeprefix('0x')
            tx = rpc('eth_getTransactionByHash', [txhash])
            receipt = rpc('eth_getTransactionReceipt', [txhash])
            print('RECONCILE', addr, txhash, 'tx_known', tx is not None, 'receipt_status', receipt.get('status') if receipt else None)
        print('No funds moved by this check. An unknown transaction is NOT automatically safe to resend.')
        return
    if not args.execute:
        print('DRY RUN ONLY. No private key loaded and no transaction signed.')
        return
    if not recipients:
        raise SystemExit('No recipients. Nothing to execute.')
    if args.approve != digest:
        raise SystemExit('Approval digest does not match saved snapshot; review the recipients above and pass --approve PLAN_SHA256.')
    config = dotenv_values(ROOT / '.env')
    key = config.get('PRIVATE_KEY')
    if not key:
        raise SystemExit('PRIVATE_KEY is missing in root .env')
    signer = Account.from_key(key)
    if signer.address.lower() != SENDER.lower():
        raise SystemExit('PRIVATE_KEY does not derive the expected Arbitrum sender; no transactions sent.')
    if int(rpc('eth_chainId', []), 16) != CHAIN_ID:
        raise SystemExit('Wrong network, no transactions sent.')
    journal = json.loads(JOURNAL.read_text('utf-8')) if JOURNAL.exists() else {'plan_sha256': digest, 'sent': {}}
    if journal['plan_sha256'] != digest:
        raise SystemExit('Existing journal refers to another snapshot; refusing to broadcast.')
    remaining = [r for r in recipients if r['address'].lower() not in journal['sent']]
    balance = balance_of(SENDER)
    if balance < len(remaining) * UNIT:
        raise SystemExit(f'Insufficient DC1: have {balance/1e18:g}, need {len(remaining)/10:g}')
    for r in remaining:
        to = r['address']
        tx = {'chainId': CHAIN_ID, 'nonce': int(rpc('eth_getTransactionCount', [SENDER, 'pending']), 16),
              'to': TOKEN, 'value': 0, 'data': calldata(to, UNIT)}
        gas = int(rpc('eth_estimateGas', [{'from': SENDER, 'to': TOKEN, 'value': '0x0', 'data': tx['data']}]), 16)
        tx['gas'] = (gas * 120 + 99) // 100
        # Quote the actual network price; 0.02 Gwei is only a minimum.
        tx['gasPrice'] = gas_price_wei()
        eth_balance = int(rpc('eth_getBalance', [SENDER, 'latest']), 16)
        if eth_balance < tx['gas'] * tx['gasPrice']:
            raise SystemExit('Insufficient Arbitrum ETH to pay next transfer gas.')
        signed = signer.sign_transaction(tx)
        raw = '0x' + signed.raw_transaction.hex()
        # Persist expected transaction hash BEFORE broadcasting to avoid accidental resends after uncertain RPC results.
        journal['sent'][to.lower()] = {'txhash': signed.hash.hex(), 'status': 'broadcast_unknown'}
        JOURNAL.write_text(json.dumps(journal, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        try:
            txhash = rpc('eth_sendRawTransaction', [raw])
        except Exception as ex:
            raise SystemExit(f'Broadcast uncertain for {to}; verify {signed.hash.hex()} before retrying. {type(ex).__name__}: {str(ex)[:350]}')
        journal['sent'][to.lower()]['status'] = 'broadcast'
        JOURNAL.write_text(json.dumps(journal, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('BROADCAST:', r['user'], to, txhash)
    print('Broadcasts submitted; confirm receipts on Arbiscan before marking paid.')


if __name__ == '__main__':
    main()
