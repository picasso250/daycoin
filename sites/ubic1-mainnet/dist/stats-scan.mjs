// Bound the complete scan, including successful chunks and range-limit retries.
export async function scanLogs(provider, filter, start, target, progress, maxRequests = 1000) {
 const logs = [];
 let from = start, chunk = 2000, requests = 0;
 while (from <= target) {
  if (requests++ >= maxRequests) throw Error('索引请求达到上限，需要持久化索引服务');
  const end = Math.min(from + chunk - 1, target);
  try {
   logs.push(...await provider.getLogs({...filter, fromBlock:from, toBlock:end}));
   from = end + 1;
  } catch (e) {
   if (chunk > 20) { chunk = Math.max(20, Math.floor(chunk / 5)); continue; }
   throw e;
  }
  progress?.(Math.round(100 * (from - start) / (target - start + 1)));
 }
 return logs;
}
