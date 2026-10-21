// Cloudflare builds static HTML/CSS only; GitHub Actions generates the two PDFs.
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
