const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=process.cwd();
http.createServer((req,res)=>{
  let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name==='/')name='/index.html';
  let file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  if(!path.extname(file))file+='.html';
  fs.readFile(file,(error,body)=>{
    if(error){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.txt':'text/plain','.woff2':'font/woff2','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
    res.end(body);
  });
}).listen(3192,'0.0.0.0');
