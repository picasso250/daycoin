import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.txt':'text/plain'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  let file;
  try {file=path.resolve(base,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));}
  catch {res.writeHead(400).end();return;}
  if(!file.startsWith(base+path.sep) || !fs.existsSync(file)||!fs.statSync(file).isFile()) {res.writeHead(404).end('Not found');return;}
  res.writeHead(200,{'Content-Type':(mime[path.extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  fs.createReadStream(file).pipe(res);
});
server.listen(5176,'127.0.0.1',()=>console.log('UBIC1-v0.2 (Sepolia testnet): http://127.0.0.1:5176'));
