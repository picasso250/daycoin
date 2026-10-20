import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { startPreview } from "../preview.mjs";

for (const lang of ['en', 'zh-CN']) test(`${lang}: whitepaper source, navigation, math, local resources and responsive layout`, async () => {
  const server = await startPreview(0);
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const config = JSON.parse(
      await readFile(new URL("../whitepaper.config.json", import.meta.url)),
    );
    const source = await readFile(
      new URL("../" + config.sources[lang], import.meta.url),
      "utf8",
    );
    const prefix = lang === 'en' ? '' : '/zh';
    const page = await browser.newPage();
    const requests = [],
      errors = [];
    page.on("request", (req) => requests.push(req.url()));
    page.on("pageerror", (error) => errors.push(error.message));
    const headers = await readFile(
      new URL("../dist/_headers", import.meta.url),
      "utf8",
    );
    const csp = headers.match(/Content-Security-Policy: (.+)/)[1];
    await page.route("**/whitepaper", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), "content-security-policy": csp },
      });
    });
    await mkdir(new URL("../test-output/", import.meta.url), {
      recursive: true,
    });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + prefix + "/whitepaper", { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(
        await page
          .locator('meta[name="source-sha256"]')
          .getAttribute("content"),
        createHash("sha256").update(source).digest("hex"),
      );
      assert.equal(
        await page.locator("article h2, article h3").count(),
        (source.match(/^#{2,3} /gm) || []).length,
      );
      assert.equal(
        await page.locator(".math-display").count(),
        (source.match(/\\\[/g) || []).length,
      );
      assert.equal(
        await page.locator(".katex").count(),
        (source.match(/\\[([]/g) || []).length,
      );
      assert.equal(await page.locator(".katex-error,[style]").count(), 0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.equal(
        await page.locator('article a[href^="contracts/"]').count(),
        0,
      );
      assert.ok(
        (await page
          .locator('article a[href^="https://etherscan.io/tx/"]')
          .count()) >= 4,
      );
      assert.equal(
        await page.evaluate(() =>
          [...document.querySelectorAll("aside a")].every((a) =>
            document.getElementById(decodeURIComponent(a.hash.slice(1))),
          ),
        ),
        true,
      );
      await page.screenshot({
        path: new URL(
          `../test-output/whitepaper-${lang}-${width}.png`,
          import.meta.url,
        ).pathname.replace(/^\/(\w:)/, "$1"),
        fullPage: false,
      });
      if (width < 800) await page.locator("aside summary").click();
      await page.locator("aside a").last().click();
      assert.ok(
        decodeURIComponent(new URL(page.url()).hash).includes("section-32"),
      );
      assert.ok(await page.locator("article h2").last().isVisible());
    }
    assert.deepEqual(errors, []);
    assert.equal(
      requests.every((url) => url.startsWith(base)),
      true,
    );
    const pdf = await page.request.get(base + prefix + "/whitepaper.pdf");
    assert.equal(
      pdf.headers()["content-type"].split(";")[0],
      "application/pdf",
    );
    assert.equal((await pdf.body()).subarray(0, 5).toString(), "%PDF-");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

for (const lang of ['en', 'zh-CN']) test(`${lang}: manifesto is complete, local, responsive and linked`, async () => {
  const server = await startPreview(0);
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const prefix = lang === 'en' ? '' : '/zh';
    const config = JSON.parse(await readFile(new URL('../whitepaper.config.json', import.meta.url)));
    const source = await readFile(new URL('../' + config.manifestos[lang], import.meta.url), 'utf8');
    const page = await browser.newPage();
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + prefix + '/manifesto');
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('html').getAttribute('lang'), lang);
      assert.equal(await page.locator('article h2').count(), 9);
      assert.equal(await page.locator('meta[name="source-sha256"]').getAttribute('content'), createHash('sha256').update(source).digest('hex'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('header a[href="' + prefix + '/whitepaper"]').count(), 1);
      if (lang === 'en') assert.doesNotMatch(await page.locator('article').textContent(), /\p{Script=Han}/u);
      await page.screenshot({ path: new URL(`../test-output/manifesto-${lang}-${width}.png`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
    }
    assert.ok(requests.every(url => url.startsWith(base)));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});

test('both homepages and document navigation are readable without JavaScript', async () => {
  const server = await startPreview(0);
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await browser.newPage({ javaScriptEnabled: false });
    for (const prefix of ['', '/zh']) {
      await page.goto(base + prefix + '/');
      assert.equal(await page.locator('html').getAttribute('lang'), prefix ? 'zh-CN' : 'en');
      assert.equal(await page.locator('.mission').count(), 0);
      assert.equal(await page.locator('.intro h1').innerText(), 'One Person\nOne Coin\nOne Day');
      await page.locator('header a[href="' + prefix + '/whitepaper"]').click();
      assert.equal(await page.locator('article h2').count() > 0, true);
      await page.locator('.language-switch').click();
      assert.equal(page.url(), base + (prefix ? '' : '/zh') + '/whitepaper');
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
