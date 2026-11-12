#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { evaluateEligibility } from './eligibility.mjs';

if (process.argv.length !== 4) {
  console.error('Usage: node dc2/evaluate.mjs <normalized-evidence.json> <as-of-ISO8601>');
  process.exitCode = 2;
} else {
  try {
    const account = JSON.parse(await readFile(process.argv[2], 'utf8'));
    console.log(JSON.stringify(evaluateEligibility(account, { asOf: process.argv[3] }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
