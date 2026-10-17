import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { startPreview } from "../preview.mjs";

test("whitepaper: source, navigation, math, local resources and responsive layout", async () => {
  const server = await startPreview(0);
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const config = JSON.parse(
      await readFile(new URL("../whitepaper.config.json", import.meta.url)),
    );
    const source = await readFile(
      new URL("../" + config.source, import.meta.url),
      "utf8",
    );
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
      await page.goto(base + "/whitepaper", { waitUntil: "networkidle" });
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
          `../test-output/whitepaper-${width}.png`,
          import.meta.url,
        ).pathname.replace(/^\/(\w:)/, "$1"),
        fullPage: false,
      });
      if (width < 800) await page.locator("aside summary").click();
      await page.locator("aside a").last().click();
      assert.ok(
        decodeURIComponent(new URL(page.url()).hash).includes("附录-b"),
      );
      assert.ok(await page.locator("article h2").last().isVisible());
    }
    assert.deepEqual(errors, []);
    assert.equal(
      requests.every((url) => url.startsWith(base)),
      true,
    );
    const pdf = await page.request.get(base + "/whitepaper.pdf");
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
