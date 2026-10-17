import fs from 'node:fs';
import { compile } from './compile.mjs';

// Local build ONLY. This script has no signer or deployment entrypoint.
const compiled = compile({
  'contracts/DayCoinV1.sol': {
    content: fs.readFileSync('contracts/DayCoinV1.sol', 'utf8')
  }
});
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/DayCoinV1.json',
  JSON.stringify(compiled['contracts/DayCoinV1.sol'].DayCoinV1, null, 2));
console.log('Compiled DayCoin V1 / DC1 (Shanghai, Solidity 0.8.37). No deployment.');
