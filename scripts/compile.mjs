import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

export function compile(extraSources = {}) {
  const input = {
    language: 'Solidity',
    sources: { 'contracts/DayCoinV1.sol': { content: fs.readFileSync('contracts/DayCoinV1.sol', 'utf8') }, ...extraSources },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'shanghai',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.deployedBytecode.immutableReferences'] } }
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
  fs.writeFileSync('artifacts/DayCoinV1.json', JSON.stringify(contracts['contracts/DayCoinV1.sol'].DayCoinV1, null, 2));
  console.log(`Compiled DayCoin V1 with ${solc.version()} (Shanghai).`);
}
