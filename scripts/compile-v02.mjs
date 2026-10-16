import fs from 'node:fs';
import { compile } from './compile.mjs';

// Local build ONLY. This script has no signer or deployment entrypoint.
const compiled = compile({
  'contracts/UBIC1V02.sol': {
    content: fs.readFileSync('contracts/UBIC1V02.sol', 'utf8')
  }
});
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/UBIC1V02.json',
  JSON.stringify(compiled['contracts/UBIC1V02.sol'].UBIC1V02, null, 2));
console.log('Compiled UBIC1-v0.2 (Shanghai, Solidity 0.8.37). No deployment.');
