// @vitest-environment node
import { it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import { openEncryptedStore } from './encryptedStore.js';
import { PersistedAppStateSchema } from './appStateSchema.js';

it('uses encrypted API, backups and restore without live data or Keychain access', async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ssb-encrypted-api-'));
  const key=randomBytes(32), filename=path.join(root,'test.ssbdb'), helper=path.join(root,'synthetic-helper');
  const backups=path.join(root,'backups');
  await fs.mkdir(backups,{mode:0o700});
  await fs.writeFile(helper,`#!${process.execPath}\nprocess.stdout.write(Buffer.from('${key.toString('hex')}','hex'));\n`,{mode:0o700});
  const state=PersistedAppStateSchema.parse({schemaVersion:1,data:{transactions:[],accounts:[],customVendors:{},lastUpdated:1}});
  const moneyFlow={incomes:[{id:'income',date:'2026-10-01',source:'Synthetic cash',kind:'other',amountMinor:10000,currency:'RON',receivedIn:{kind:'cash',label:'Cash',accountId:null,currency:'RON'},notes:''}],transfers:[{id:'allocation',incomeId:'income',date:'2026-10-02',amountMinor:1000,receivedMinor:1000,status:'planned',destination:{kind:'other',label:'Savings envelope',accountId:null,currency:'RON'},notes:''}]};
  const db=await openEncryptedStore({filename,key,create:true}); await db.write(state,0); await db.close();
  const token='synthetic-only-encrypted-api-test-token-123456789';
  vi.stubEnv('SSB_STORAGE','sqlcipher');vi.stubEnv('SSB_DATABASE_FILE',filename);vi.stubEnv('SSB_KEYCHAIN_HELPER',helper);vi.stubEnv('SSB_BACKUP_DIR',backups);vi.stubEnv('SSB_SYNC_TOKEN',token);vi.stubEnv('ALLOWED_ORIGINS','http://127.0.0.1:5189');
  vi.resetModules();
  const {app,closePrivateStorage}=await import('./server.js');
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const send=(url,body,headers={})=>fetch(base+url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,Origin:'http://127.0.0.1:5189','Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
  try {
    expect((await fetch(base+'/api/data')).status).toBe(401);
    const hostileHost = await new Promise((resolve,reject)=>{
      const request=http.get(base+'/api/data',{headers:{Host:'evil.invalid',Authorization:`Bearer ${token}`}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);
    });
    expect(hostileHost).toBe(403);
    expect((await send('/api/data',undefined,{Origin:'null'})).status).toBe(403);
    expect((await send('/api/data',{data:state,version:1})).status).toBe(405);
    expect((await send('/api/changes',{version:1,changes:[{field:'accounts',value:'bad'}]})).status).toBe(400);
    const changed=await send('/api/changes',{version:1,changes:[{field:'moneyFlow',value:moneyFlow},{field:'accounts',value:[{id:'a',name:"x'); DROP TABLE accounts; --",currency:'RON',balances:{'2026-10':100},notes:{}}]}]});
    expect(changed.status).toBe(200);const saved=await changed.json();
    expect(saved.version).toBe(2);expect(saved.data.data.moneyFlow).toEqual(moneyFlow);
    expect((await send('/api/changes',{version:1,changes:[]})).status).toBe(409);
    const created=await send('/api/backups',{data:saved.data,reason:'import',importBatchId:'synthetic-batch'});
    expect(created.status).toBe(200);const receipt=await created.json();expect(receipt.encrypted).toBe(true);
    expect((await send('/api/backups',{data:saved.data,reason:'import',importBatchId:'synthetic-batch'})).status).toBe(200);
    expect((await send('/api/backups',{data:state,reason:'import',importBatchId:'synthetic-batch'})).status).toBe(409);
    expect((await send('/api/backups',{data:state,reason:'import',importBatchId:'../../escape'})).status).toBe(400);
    const list=await (await send('/api/encrypted-backups')).json();expect(list.filenames).toEqual([receipt.filename]);
    const restored=await (await send('/api/encrypted-backups/'+receipt.filename)).json();expect(restored.data).toEqual(saved.data);
    expect((await fs.readdir(backups)).filter(name=>name.endsWith('.json'))).toEqual([]);
    expect(await (await send('/api/data')).json()).toMatchObject({version:2});
  } finally {
    server.close();await once(server,'close');await closePrivateStorage();vi.unstubAllEnvs();key.fill(0);
    for(const name of await fs.readdir(backups)) await fs.unlink(path.join(backups,name));await fs.rmdir(backups);
    for(const name of await fs.readdir(root)) await fs.unlink(path.join(root,name));await fs.rmdir(root);
  }
});
