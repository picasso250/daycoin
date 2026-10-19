import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { messages } from '../dist/messages.mjs';
import { t, errorMessage } from '../dist/i18n.mjs';
const read = name => readFile(new URL(name, import.meta.url), 'utf8');
test('every guarded core error has an English translation; unknown provider errors stay localized', async () => {
  const source = await read('../dist/core.mjs');
  for (const [, text] of source.matchAll(/Error\('([^']+)'\)/g)) {
    assert.ok(messages[text], text);
    assert.doesNotMatch(t(text), /\p{Script=Han}/u);
  }
  assert.match(errorMessage({ message: '<script>任意错误</script>' }), /Wallet or network error/);
  assert.match(errorMessage({ code: 4001 }), /cancelled/);
  assert.equal(t`距离达标还差：${'0.000000000000000001'} ETH`, 'Additional deposit needed: 0.000000000000000001 ETH');
});
test('whitepapers preserve formulas, headings, numeric table values and deployment evidence', async () => {
  const config = JSON.parse(await read('../whitepaper.config.json'));
  const en = await read('../' + config.sources.en), zh = await read('../' + config.sources['zh-CN']);
  const math = source => [...source.matchAll(/\\\[([\s\S]*?)\\\]/g)].map(m => m[1].replace(/\\text\{[^}]*\}/g, 'TEXT').replace(/\s/g, ''));
  assert.deepEqual(math(en), math(zh));
  const inline = source => [...source.matchAll(/\\\(([\s\S]*?)\\\)/g)].map(m => m[1].replace(/\\text\{year\}|年/g, 'year').replace(/\s/g, '')).sort();
  assert.deepEqual(inline(en), inline(zh));
  const hashes = source => [...new Set(source.match(/0x[\da-fA-F]{40,64}/g))].sort();
  assert.deepEqual(hashes(en), hashes(zh));
  const headings = source => source.match(/^#{2,3} /gm);
  assert.deepEqual(headings(en), headings(zh));
  const tableNumbers = source => [...source.matchAll(/^\|.*$/gm)].map(m => (m[0].replace(/0x[\da-fA-F]+/g, '').match(/\d+(?:[.,:]\d+)*/g) || []).sort());
  assert.deepEqual(tableNumbers(en), tableNumbers(zh));
  assert.equal((en.match(/\\\(/g) || []).length, (zh.match(/\\\(/g) || []).length);
});
