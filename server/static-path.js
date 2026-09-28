import path from 'node:path';
// Use path.relative rather than a slash suffix so the same boundary works on Windows.
export function resolveStaticPath(root,pathname,paths=path){
 if(typeof pathname!=='string'||!pathname.startsWith('/')||pathname.includes('\0'))throw Error('Invalid path');
 const directory=paths.resolve(root,'dist');
 const file=paths.resolve(directory,'.'+(pathname==='/'?'/index.html':pathname));
 const relative=paths.relative(directory,file);
 if(!relative||relative==='..'||relative.startsWith('..'+paths.sep)||paths.isAbsolute(relative))throw Error('Outside the page directory');
 return file;
}
