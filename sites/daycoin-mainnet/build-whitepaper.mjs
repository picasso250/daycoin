import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import MarkdownIt from "markdown-it";
import texmath from "markdown-it-texmath";
import katex from "katex";
import { chromium } from "playwright";
import { startPreview } from "./preview.mjs";

import { buildHome, languageLinks } from './build-home.mjs';
import { analyticsBeacon } from './analytics.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(
  await readFile(resolve(here, "whitepaper.config.json"), "utf8"),
);
await buildHome();
for (const lang of ['en', 'zh-CN']) {
  await buildDocument(lang, 'whitepaper', config.sources[lang]);
  await buildDocument(lang, 'manifesto', config.manifestos[lang]);
}
async function buildDocument(lang, slug, sourcePath) {
  const zh = lang === 'zh-CN';
  const home = zh ? '/zh/' : '/';
  const other = zh ? '/' : '/zh/';
  const paper = slug === 'whitepaper';
  const title = paper ? (zh ? 'DayCoin 白皮书' : 'DayCoin Whitepaper') : (zh ? 'DayCoin 宣言' : 'The DayCoin Manifesto');
  const source = await readFile(resolve(here, sourcePath), "utf8");
  const hash = createHash("sha256").update(source).digest("hex");
  const version = paper ? source.match(/^# DayCoin (?:白皮书|Whitepaper) (.+)$/m)?.[1] : source.match(/v\d+\.\d+/)?.[0];
  const date = paper ? source.match(/^\*\*(\d.+?)\*\*$/m)?.[1] : source.match(/^\*DayCoin · One Coin One Day · (.+)\*$/m)?.[1];
  const contract = source.match(
    /https:\/\/etherscan.io\/address\/0x[\da-fA-F]{40}/,
  )?.[0] || (source.match(/0x[\da-fA-F]{40}/)?.[0] && `https://etherscan.io/address/${source.match(/0x[\da-fA-F]{40}/)[0]}`);
  const motto = source.match(/^> ((?:自由是原则|Freedom is the principle).+)$/m)?.[1];
  if (!version || !date || !contract || !motto)
    throw Error("Missing whitepaper cover metadata in Markdown");
  const md = new MarkdownIt({ html: false, linkify: true }).use(texmath, {
    engine: katex,
    delimiters: "brackets",
    katexOptions: { strict: "ignore", throwOnError: true },
  });
  const escape = md.utils.escapeHtml;
  // Render ourselves so unsupported formulae stop the build instead of becoming error text.
  md.renderer.rules.math_inline = (tokens, i) =>
    katex.renderToString(tokens[i].content, {
      throwOnError: true,
      strict: "ignore",
    });
  md.renderer.rules.math_block = (tokens, i) =>
    `<div class="math-display">${katex.renderToString(tokens[i].content, { displayMode: true, throwOnError: true, strict: "ignore" })}</div>`;
  const tokens = md.parse(source, {});
  const toc = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "heading_open") {
      const title = tokens[i + 1].content;
      if (token.tag === "h1") token.attrSet("class", "document-title");
      else {
        // Corresponding headings retain the same anchors across languages.
        const id = `section-${toc.length + 1}`;
        if (toc.some((item) => item.id === id))
          throw Error(`Duplicate heading: ${title}`);
        token.attrSet("id", id);
        toc.push({ id, title, sub: token.tag !== "h2" });
      }
    }
    for (const child of token.children || []) {
      if (child.type !== "link_open") continue;
      const href = child.attrGet("href");
      if (['Manifesto.en.md', '%E5%AE%A3%E8%A8%80.md'].includes(href)) child.attrSet('href', home + 'manifesto');
      else if (!/^(https?:|mailto:|#)/.test(href))
        child.attrSet("href", new URL(href, config.repository).href);
    }
  }
  let body = md.renderer.render(tokens, md.options, {});
  // Keep the site's strict CSP: move KaTeX's inline styles to a local stylesheet.
  const styles = new Map();
  body = body.replace(
    /<([\w-]+)([^>]*?) style="([^"]*)"([^>]*)>/g,
    (_, tag, before, style, after) => {
      if (!styles.has(style)) styles.set(style, `math-style-${styles.size}`);
      let attrs = before + after;
      const name = styles.get(style);
      attrs = /class="/.test(attrs)
        ? attrs.replace(/class="([^"]*)"/, `class="$1 ${name}"`)
        : `${attrs} class="${name}"`;
      return `<${tag}${attrs}>`;
    },
  );
  const out = resolve(here, "dist/whitepaper-assets");
  await mkdir(resolve(out, "fonts"), { recursive: true });
  await copyFile(
    resolve(here, "node_modules/@fontsource/noto-sans-sc/LICENSE"),
    resolve(out, "NOTO-LICENSE.txt"),
  );
  await copyFile(
    resolve(here, "node_modules/katex/LICENSE"),
    resolve(out, "KATEX-LICENSE.txt"),
  );
  let fontCSS = "";
  for (const weight of [400, 700]) {
    const css = await readFile(
      resolve(here, `node_modules/@fontsource/noto-sans-sc/${weight}.css`),
      "utf8",
    );
    fontCSS += css.replace(/url\(\.\/files\/([^)]*)\)/g, "url(./fonts/$1)");
    for (const [, name] of css.matchAll(/url\(\.\/files\/([^)]*)\)/g))
      await copyFile(
        resolve(here, "node_modules/@fontsource/noto-sans-sc/files", name),
        resolve(out, "fonts", name),
      );
  }
  await writeFile(resolve(out, "chinese.css"), fontCSS);
  const katexCSS = await readFile(
    resolve(here, "node_modules/katex/dist/katex.min.css"),
    "utf8",
  );
  await writeFile(resolve(out, "katex.css"), katexCSS);
  for (const [, name] of katexCSS.matchAll(/url\(fonts\/([^)]*)\)/g))
    await copyFile(
      resolve(here, "node_modules/katex/dist/fonts", name),
      resolve(out, "fonts", name),
    );
  await writeFile(
    resolve(out, "paper.css"),
    await readFile(resolve(here, "whitepaper.css")),
  );
  await writeFile(
    resolve(out, `math-${slug}-${lang}.css`),
    [...styles].map(([style, name]) => `.${name}{${style}}`).join("\n"),
  );
  const edition = paper ? `${version} · ${date}` : date;
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escape(title + ': ' + motto)}"><meta name="source-sha256" content="${hash}"><title>${escape(title)} ${escape(version)}</title>${languageLinks(slug)}<link rel="canonical" href="https://daycoin.io99.xyz${home}${slug}">${["chinese", "katex", "paper", `math-${slug}-${lang}`].map((name) => `<link rel="stylesheet" href="/whitepaper-assets/${name}.css">`).join("")}<script defer src="/whitepaper-assets/toc.js"></script><script type="module" src="/language.mjs"></script>${analyticsBeacon}</head><body><a class="skip" href="#document">${zh ? '跳至正文' : 'Skip to content'}</a><header><a class="brand" href="${home}">DAYCOIN</a><nav aria-label="${zh ? '文档导航' : 'Document navigation'}"><a href="${home}">${zh ? '首页' : 'Home'}</a><a href="${home}${paper ? 'manifesto' : 'whitepaper'}">${paper ? (zh ? '宣言' : 'Manifesto') : (zh ? '白皮书' : 'Whitepaper')}</a>${paper ? `<a href="${home}whitepaper.pdf" download>${zh ? '下载 PDF ↓' : 'Download PDF ↓'}</a>` : ''}<a class="language-switch" href="${other}${slug}" lang="${zh ? 'en' : 'zh-CN'}" hreflang="${zh ? 'en' : 'zh-CN'}">${zh ? 'English' : '中文'}</a></nav></header><div class="layout"><aside><details open><summary>${zh ? '目录' : 'Contents'}</summary><nav aria-label="${zh ? '章节目录' : 'Table of contents'}"><ol>${toc.map((item) => `<li${item.sub ? ' class="sub"' : ""}><a href="#${item.id}">${escape(item.title)}</a></li>`).join("")}</ol></nav></details></aside><main><section class="cover" aria-label="${zh ? '文档封面' : 'Document cover'}"><div class="brand">DAYCOIN</div><h1>One Coin<br>One Day</h1><p class="subtitle">${escape(title)}</p><p class="motto">${escape(motto)}</p><div class="metadata">${escape(edition)}<p>Ethereum Mainnet · DC1<a href="${contract}">${contract.split("/").pop()} ↗</a></p></div></section><article id="document">${body}</article><footer class="endnote">DAYCOIN · One Coin One Day<br>${escape(edition)}</footer></main></div></body></html>`;
  await writeFile(
    resolve(out, "toc.js"),
    `const menu = document.querySelector('aside details'); const mobile = matchMedia('(max-width:800px)'); const update = () => { menu.open = !mobile.matches; }; update(); mobile.addEventListener('change', update); menu.addEventListener('click', event => { if (mobile.matches && event.target.closest('a')) menu.open = false; });\n`,
  );
  await writeFile(resolve(here, `dist${home}${slug}.html`), html);
  // Cloudflare publishes PDFs generated and committed by GitHub Actions.
  if (!paper || process.env.DAYCOIN_SKIP_PDF === '1') return;
  const server = await startPreview(0);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 657, height: 1000 },
    });
    // Do not emit production analytics from local PDF generation.
    await page.route("https://static.cloudflareinsights.com/**", route => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await page.goto(`http://127.0.0.1:${server.address().port}${home}whitepaper`, {
      waitUntil: "networkidle",
    });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    // Fit only oversized display equations to the printed content width; preserve all terms.
    await page.evaluate(() => {
      for (const block of document.querySelectorAll(".math-display")) {
        const equation = block.querySelector(".katex");
        if (
          equation &&
          equation.getBoundingClientRect().width > block.clientWidth
        )
          block.style.fontSize = `${(parseFloat(getComputedStyle(block).fontSize) * block.clientWidth) / equation.getBoundingClientRect().width}px`;
      }
    });
    await page.pdf({
      path: resolve(here, `dist${home}whitepaper.pdf`),
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
      outline: true,
    });
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(`Built ${version}: ${toc.length} headings; source SHA-256 ${hash}`);

}
