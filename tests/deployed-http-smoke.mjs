// Explicit public-network test; creates one disposable room, never joins existing rooms.
// Usage: node tests/deployed-http-smoke.mjs https://spyhaz.vercel.app
import assert from 'node:assert/strict';
import { loadPreset } from '../client/src/utils/presetManager.js';
const base=new URL(process.argv[2]||'http://127.0.0.1:8787');
const origin=process.argv[3]||base.origin;
const letters='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const raw=Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>letters[n%letters.length]).join('');
const code=raw.slice(0,3)+'-'+raw.slice(3),members=[];
const players=Array.from({length:15},(_,i)=>({name:'HTTP Test '+(i+1),playerId:crypto.randomUUID(),token:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')}));
async function post(path,body){
  for(let attempt=0;attempt<3;attempt++){
    let response;
    try{response=await fetch(new URL(path,base),{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}
    catch(error){if(attempt===2)throw error;continue;}
    const result=await response.json();assert.ok(response.ok,result.error);return result;
  }
}
async function connect(i){
  const identity=players[i];
  const client={identity,generation:null,view:null,
    async request(action,command){
      const result=await post('/api/rooms/'+code+'/session',{...identity,action,generation:this.generation,command});
      this.generation=result.generation;if(result.snapshot)this.view=result.snapshot;
      if(result.ack)assert.equal(result.ack.ok,true,result.ack.error);return result;
    },
    async send(type,payload={}){
      const s=this.view,command={v:2,id:crypto.randomUUID(),type,contextId:s.contextId,turnId:s.game?.question.turnId,ballotId:s.game?.ballot?.id,payload};
      const result=await this.request('command',command);return {result,command};
    },
  };
  await client.request('resume');return client;
}
let host;
try{
  await post('/api/rooms',{...players[0],code,settings:{spyCount:2}});
  members.push(host=await connect(0));
  for(let i=1;i<15;i++){await post('/api/rooms/'+code+'/players',players[i]);members.push(await connect(i));}
  await host.request('sync');assert.equal(host.view.players.filter(p=>p.connected).length,15);
  await host.send('room:settings',loadPreset('__default_mini'));
  for(const client of members){await client.request('sync');assert.equal(client.view.settings.enabledLocationIds.length,10);assert.equal(client.view.settings.duration,360);assert.equal(client.view.settings.spyCount,1);}
  await host.send('room:settings',{spyCount:2,duration:660});
  for(const client of members){await client.request('sync');assert.equal(client.view.settings.enabledLocationIds.length,10);assert.equal(client.view.settings.duration,660);assert.equal(client.view.settings.spyCount,2);}
  await host.send('game:start');
  for(const client of members){await client.request('sync');await client.send('game:ready');}
  for(const client of members){await client.request('sync');assert.equal(client.view.state,'PLAYING');assert.equal(client.view.game.locations.length,10);}
  const roundId=host.view.game.id;assert.equal(host.view.state,'PLAYING');
  const spies=members.filter(c=>c.view.game.isSpy);assert.equal(spies.length,2);
  for(const spy of spies)assert.equal(spy.view.game.location,null);
  const asker=members.find(c=>c.view.playerId===host.view.game.question.currentAskerId);
  await asker.send('question:select',{targetId:asker.view.game.question.availableTargets[0]});
  const spyIndex=members.findIndex(c=>c.view.game.isSpy);
  const restored=await connect(spyIndex);members[spyIndex]=restored;if(spyIndex===0)host=restored;
  assert.equal(restored.view.game.id,roundId);assert.equal(restored.view.game.question.targetId,asker.view.game.question.targetId);
  assert.equal(restored.view.game.location,null);
  await host.request('sync');const ended=await host.send('host:abort');
  await host.request('command',ended.command);assert.deepEqual(host.view.scores,{});
  host=members[0]=await connect(0);assert.equal(host.view.state,'RESULT');
  await host.send('game:lobby');
  for(let i=14;i>=1;i--){await members[i].request('sync');await members[i].send('room:leave');}
  await host.request('sync');await host.send('room:leave');
  console.log(JSON.stringify({ok:true,server:base.origin,transport:'authenticated HTTP only',players:15,spies:2,locations:10,checks:['same-origin entry','preset shared by all players','manual spy count and duration retained','all players reach playing','private cards','open question recovery','result recovery','duplicate command','test memberships removed']}));
}catch(error){
  try{if(host){await host.request('sync');if(host.view.game&&host.view.state!=='RESULT')await host.send('host:abort');}}catch{}
  throw error;
}
