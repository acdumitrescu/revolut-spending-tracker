import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { readDatabaseKey } from '../backend/keychain.js';
import { stageMigration } from '../backend/stageMigration.js';
import { openEncryptedStore } from '../backend/encryptedStore.js';
import { createEncryptedBackup } from '../backend/encryptedBackups.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'private-data','dev-sync');
const helper=path.join(root,'private-data','runtime','ssb-keychain');
const destination=path.join(dir,'workspace.ssbdb');
if (!process.argv.includes('--activate')) throw new Error('Use --activate after stopping the local server. Original JSON is preserved.');
// Refuse migration while the known private API is listening.
try { const response=await fetch('http://127.0.0.1:3177/healthz',{signal:AbortSignal.timeout(1000)}); if(response.ok) throw new Error('Stop the local server before migration'); }
catch(error) { if(error.message==='Stop the local server before migration') throw error; }
try { await fs.access(destination); throw new Error('Candidate database already exists; inspect it before retrying. No file was replaced.'); }
catch(error) { if(error.code!=='ENOENT') throw error; }
if(process.argv.includes('--create-key')) {
  const result=spawnSync(helper,['create'],{stdio:['ignore','ignore','pipe']});
  if(result.status!==0) throw new Error('Keychain key creation failed or key already exists. Existing keys were not changed.');
}
const key=await readDatabaseKey(helper);
try {
  const source=path.join(dir,'app-state.json');
  const result=await stageMigration({sourceFile:source,destinationFile:destination,key});
  const db=await openEncryptedStore({filename:destination,key});
  try {
    let observations=null;
    try { observations=JSON.parse(await fs.readFile(path.join(dir,'vendor-observations.json'),'utf8')); } catch(error) { if(error.code!=='ENOENT') throw error; }
    if(observations) await db.putDocument('vendor-observations',observations);
    const state=(await db.read()).data;
    const receipt=await createEncryptedBackup({backupDir:path.join(root,'backups','automatic'),key,data:state,reason:'recovery',observations});
    const recovered=await openEncryptedStore({filename:path.join(root,'backups','automatic',receipt.filename),key});
    try { if(!isDeepStrictEqual((await recovered.read()).data,state)) throw new Error('Recovery verification failed'); } finally { await recovered.close(); }
    await fs.writeFile(path.join(dir,'encrypted-migration.json'),JSON.stringify({...result,backup:receipt.filename,legacyRetained:true},null,2),{flag:'wx',mode:0o600});
    await fs.writeFile(path.join(dir,'encrypted-storage.enabled'),'sqlcipher-v1\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({...result,status:'encrypted-storage-enabled',recoveryBackupVerified:true,legacyRetained:true}));
  } finally { await db.close(); }
} finally { key.fill(0); }
