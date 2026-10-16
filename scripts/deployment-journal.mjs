import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { keccak256 } from 'ethers';

// This file is both the single-use deployment record and an exclusive lock.
// A stale or incomplete record is deliberately NOT deleted automatically.
export function reserveDeployment(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let fd;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Deployment record already exists; inspect it before any retry. Never delete it just to rerun.');
    throw error;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify({ ...record, status: 'reserved' }, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// Atomic replacement avoids a partially overwritten JSON record.
export function updateDeployment(file, record) {
  if (!fs.existsSync(file)) throw new Error('Deployment reservation missing; refusing to continue.');
  const tmp = file + '.' + process.pid + '.' + randomUUID() + '.tmp';
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(record, null, 2) + '\n');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

export async function broadcastRecordedTransaction({ file, prepared, signedTransaction, broadcast }) {
  const transactionHash = keccak256(signedTransaction);
  const signedRecord = { ...prepared, transactionHash, status: 'signed' };
  // Persist the EXACT transaction hash before the node sees the signed bytes.
  updateDeployment(file, signedRecord);
  const response = await broadcast(signedTransaction);
  if (response.hash.toLowerCase() !== transactionHash.toLowerCase())
    throw new Error('RPC returned an unexpected transaction hash. Inspect the saved signed transaction hash.');
  updateDeployment(file, { ...signedRecord, status: 'pending' });
  return { transactionHash, signedRecord };
}
