import unittest
from unittest.mock import patch
from scripts.airdrop_v2ex import scrape, snapshot_digest, calldata, UNIT, gas_price_wei, MIN_GAS_PRICE_WEI

class TestAirdrop(unittest.TestCase):
    def test_first_per_user_and_address(self):
        html = '<div class="cell" id="r_1"><a class="dark">alice</a><div class="reply_content">0x' + '1'*40 + '</div></div>'
        html += '<div class="cell" id="r_2"><a class="dark">alice</a><div class="reply_content">0x' + '2'*40 + '</div></div>'
        html += '<div class="cell" id="r_3"><a class="dark">bob</a><div class="reply_content">0x' + '1'*40 + '</div></div>'
        html += '<div class="cell" id="r_4"><a class="dark">cara</a><div class="reply_content">0x' + '3'*40 + '</div></div>'
        self.assertEqual([r['user'] for r in scrape(html)], ['alice','cara'])
    def test_calldata(self):
        to='0x' + '1'*40
        self.assertEqual(calldata(to, UNIT), '0xa9059cbb' + '0'*24 + '1'*40 + format(10**17,'064x'))
    def test_gas_price_tracks_rpc_with_minimum(self):
        self.assertEqual(MIN_GAS_PRICE_WEI, 20_000_000)
        with patch('scripts.airdrop_v2ex.rpc', return_value=hex(20_070_000)):
            self.assertEqual(gas_price_wei(), 20_070_000)
        with patch('scripts.airdrop_v2ex.rpc', return_value=hex(1_000_000)):
            self.assertEqual(gas_price_wei(), MIN_GAS_PRICE_WEI)
        with patch('scripts.airdrop_v2ex.rpc', return_value=hex(130_000_000)):
            self.assertEqual(gas_price_wei(), 130_000_000)

    def test_hash_stable(self):
        a=[{'reply_id':'r_1','user':'alice','address':'0x'+'1'*40}]
        self.assertEqual(snapshot_digest(a),snapshot_digest(a.copy()))

if __name__=='__main__': unittest.main()
