import {open} from 'node:fs/promises';

// Windows cannot fsync directory handles. Callers still flush each file before
// its atomic rename; supported systems also flush the directory entry here.
export async function syncDirectory(directory){
 if(process.platform==='win32')return;
 const handle=await open(directory,'r');
 try{await handle.sync();}finally{await handle.close();}
}
