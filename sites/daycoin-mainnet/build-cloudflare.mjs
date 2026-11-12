// Cloudflare builds static HTML/CSS only; the two PDFs are generated locally and committed to Git.
import { readFile } from 'node:fs/promises';

for (const path of ['./dist/whitepaper.pdf', './dist/zh/whitepaper.pdf']) {
  const pdf = await readFile(new URL(path, import.meta.url));
  if (pdf.length < 1000 || pdf.toString('ascii', 0, 5) !== '%PDF-') {
    throw Error('Missing or invalid GitHub Actions PDF artifact: ' + path);
  }
}
process.env.DAYCOIN_SKIP_PDF = '1';
await import('./build-whitepaper.mjs');
console.log('Cloudflare static site generated; existing GitHub Actions PDFs preserved.');

// Preserve the first-generation wallet UI under a stable versioned URL.
const { mkdir, writeFile } = await import('node:fs/promises');
const archive = (await readFile(new URL('./dist/index.html', import.meta.url), 'utf8'))
  .replaceAll('href="https://daycoin.io99.xyz/"', 'href="https://daycoin.io99.xyz/dc1/"')
  .replaceAll('href="/" aria-label="DC1 home"', 'href="/dc1/" aria-label="DC1 home"')
  .replaceAll('class="footer-brand" href="/"', 'class="footer-brand" href="/dc1/"');
await mkdir(new URL('./dist/dc1/', import.meta.url), { recursive: true });
await writeFile(new URL('./dist/dc1/index.html', import.meta.url), archive);
