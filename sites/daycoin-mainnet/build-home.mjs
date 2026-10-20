import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { messages } from './dist/messages.mjs';
const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const escape = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function languageLinks(path) {
  const base = 'https://daycoin.io99.xyz';
  return `<link rel="alternate" hreflang="en" href="${base}/${path}"><link rel="alternate" hreflang="zh-CN" href="${base}/zh/${path}"><link rel="alternate" hreflang="x-default" href="${base}/${path}">`;
}
export async function buildHome() {
  const template = await read('content/index.html');
  const en = JSON.parse(await read('content/home.en.json'));
  const zh = {
    'Manifesto': '宣言', 'Whitepaper': '白皮书', 'Protocol': '协议规则', 'Contract ↗': '合约 ↗',
    'Connect Wallet': '连接钱包', 'A FIRST ATTEMPT AT EVERYDAY ISSUANCE': '持续发行的第一次尝试',
    '01 / YOUR POSITION': '01 / 你的仓位', '02 / PROTOCOL': '02 / 协议规则',
    'DC1 Total Supply': 'DC1 总供应量', 'Current Epoch': '当前纪元',
    'Required Deposit': '存款门槛', 'Next Threshold Change': '下次门槛变化',
    'Contract & verification': '合约与验证', 'One address is not necessarily one person.': '一个地址不等于一个自然人。',
    'YOUR WALLET / ETHEREUM MAINNET': '你的钱包 / ETHEREUM MAINNET',
    'CONFIRM TRANSACTION / ETHEREUM MAINNET': '确认交易 / ETHEREUM MAINNET',
  };
  for (const lang of ['en', 'zh-CN']) {
    const home = lang === 'en' ? '/' : '/zh/';
    const translate = text => {
      const trimmed = text.trim();
      const value = (lang === 'en' ? en : zh)[trimmed];
      if (lang === 'en' && /\p{Script=Han}/u.test(trimmed) && value === undefined) throw Error('Missing homepage translation: ' + trimmed);
      return value === undefined ? text : text.replace(trimmed, escape(value));
    };
    let html = template.replace(/>([^<>]+)</g, (_, text) => '>' + translate(text) + '<')
      .replace(/(aria-label|content)="([^"]*)"/g, (_, attr, text) => `${attr}="${translate(text)}"`)
      .replace('lang="zh-CN"', `lang="${lang}"`);
    const vars = { home, other: lang === 'en' ? '/zh/' : '/', otherLang: lang === 'en' ? 'zh-CN' : 'en', otherLabel: lang === 'en' ? '中文' : 'English' };
    html = html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key]);
    html = html.replace('</head>', `${languageLinks('')}<link rel="canonical" href="https://daycoin.io99.xyz${home}"><script type="module" src="/language.mjs"></script></head>`);
    await mkdir(new URL('dist' + home, import.meta.url), { recursive: true });
    await writeFile(new URL('dist' + home + 'index.html', import.meta.url), html);
  }
  // Fail builds if a guarded transaction error has no English wording.
  const core = await read('dist/core.mjs');
  for (const [, message] of core.matchAll(/Error\('([^']+)'\)/g)) {
    if (!Object.hasOwn(messages, message)) throw Error('Missing error translation: ' + message);
  }
}
