import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('dist');
http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('Not found');return;}
 const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
}).listen(5174,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5173'));
