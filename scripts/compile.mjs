import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

export function compile(extraSources = {}) {
  const input = {
    language: 'Solidity',
    sources: { 'contracts/UBIC.sol': { content: fs.readFileSync('contracts/UBIC.sol', 'utf8') }, ...extraSources },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'shanghai',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), {
    import: name => {
      try { return { contents: fs.readFileSync(path.join('node_modules', name), 'utf8') }; }
      catch { return { error: `Import not found: ${name}` }; }
    }
  }));
  for (const item of output.errors ?? []) {
    if (item.severity === 'error') throw new Error(item.formattedMessage);
    console.warn(item.formattedMessage);
  }
  return output.contracts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const contracts = compile();
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/UBIC.json', JSON.stringify(contracts['contracts/UBIC.sol'].UBIC, null, 2));
  console.log(`Compiled UBIC with ${solc.version()} (Shanghai).`);
}
