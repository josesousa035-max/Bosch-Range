// Preview the included bundle using only Node.js; no npm installation is needed.
import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
const root=await realpath(fileURLToPath(new URL('../dist/',import.meta.url)));
const port=Number(process.env.BOSCH_PREVIEW_PORT??4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('BOSCH_PREVIEW_PORT deve estar entre 1024 e 65535.');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=createServer({maxHeaderSize:8192},async(req,res)=>{
    const fail=(status,message)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end(message);};
    if(!['GET','HEAD'].includes(req.method??''))return fail(405,'Método não suportado');
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host??''))return fail(403,'Host inválido');
    try{
        const decoded=decodeURIComponent(new URL(req.url??'/','http://127.0.0.1').pathname);
        if(decoded.includes('\0')||decoded.includes('\\'))return fail(400,'Caminho inválido');
        const candidate=await realpath(resolve(root,decoded==='/'?'index.html':`.${decoded}`));
        if(!candidate.startsWith(root+sep))return fail(403,'Caminho fora dos recursos');
        if(!(await stat(candidate)).isFile())return fail(404,'Recurso não encontrado');
        const body=await readFile(candidate),extension=candidate.slice(candidate.lastIndexOf('.'));
        res.writeHead(200,{'Content-Type':types[extension]??'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        res.end(req.method==='HEAD'?undefined:body);
    }catch(error){if(error instanceof URIError)return fail(400,'Caminho inválido');fail(404,'Recurso não encontrado');}
});
server.requestTimeout=5000;
server.on('error',error=>{console.error(`Não foi possível iniciar o preview: ${error.message}`);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Bosch Range Lab — preview local na porta ${port}. Termine com Ctrl+C.`));
