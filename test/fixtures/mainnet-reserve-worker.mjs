import { reserveDeployment } from '../../scripts/mainnet-journal.mjs';
try {
  reserveDeployment(process.argv[2], { chainId: 1, deployer: '0x0000000000000000000000000000000000000001' });
  process.stdout.write('reserved\n');
} catch (error) {
  if (/already exists/.test(error.message)) process.exitCode = 2;
  else throw error;
}
