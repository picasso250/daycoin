"""Collect up to 10 V2EX recipients into a persistent CSV. No wallet access."""
import csv
import time
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from airdrop_v2ex import ROOT, TOPIC, COUNT, scrape

LEDGER = ROOT / '.airdrop-v2ex.csv'
FIELDS = ['reply_id', 'user', 'address', 'done', 'txhash']

def read_rows():
    if not LEDGER.exists():
        return []
    with LEDGER.open(encoding='utf-8-sig', newline='') as f:
        reader=csv.DictReader(f)
        if reader.fieldnames != FIELDS:
            raise ValueError('Unexpected CSV columns, refusing overwrite')
        return list(reader)

def write_rows(rows):
    temp=LEDGER.with_suffix('.csv.tmp')
    with temp.open('w', encoding='utf-8', newline='') as f:
        writer=csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader();writer.writerows(rows)
    temp.replace(LEDGER)

def main():
    rows=read_rows()
    if len(rows)>COUNT: raise SystemExit('CSV already exceeds 10 rows')
    existing_ids={r['reply_id'] for r in rows}
    users={r['user'].lower() for r in rows}
    addrs={r['address'].lower() for r in rows}
    # Ask V2EX for a fresh copy; don't silently treat an old cached page as no new users.
    response=requests.get(
        TOPIC,
        params={'_fresh': str(time.time_ns())},
        headers={'User-Agent':'Mozilla/5.0', 'Cache-Control':'no-cache', 'Pragma':'no-cache'},
        timeout=20,
    )
    response.raise_for_status()
    visible_count=len(BeautifulSoup(response.text,'html.parser').select('.cell[id^="r_"]'))
    candidates=scrape(response.text)
    print(f'Fetched {visible_count} visible V2EX replies; {len(candidates)} eligible addresses.')
    if visible_count == 0:
        raise SystemExit('No visible replies returned; refusing to update CSV. Check V2EX login/rate limits.')
    newly=0
    for item in candidates:
        if len(rows)>=COUNT: break
        if item['reply_id'] in existing_ids or item['user'].lower() in users or item['address'].lower() in addrs: continue
        rows.append({**item,'done':'','txhash':''})
        existing_ids.add(item['reply_id']);users.add(item['user'].lower());addrs.add(item['address'].lower());newly+=1
    write_rows(rows)
    print(f'CSV: {LEDGER} | total {len(rows)}/{COUNT}, new {newly}, done {sum(r["done"]=="yes" for r in rows)}')
    for r in rows:print(r['user'],r['address'],'done='+r['done'],'txhash='+r['txhash'])

if __name__=='__main__':main()
