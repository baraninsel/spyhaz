// DOM execution of the real production bundle; this is not a visual browser test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { setup } from './helpers.js';
import { command, snapshot, connectPlayer, disconnectPlayer, joinRoom } from '../server/src/engine.js';
const built = await build({root:fileURLToPath(new URL('../client',import.meta.url)),logLevel:'silent',build:{write:false,minify:false}});
const code = built.output.find(file=>file.type==='chunk').code;
const base = 'https://test.spyhaz.invalid';
async function until(check) {
  for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.fail('Expected UI state was not reached');
}
function harness(t,{room=setup(4,{},Date.now()),url=base,stored=[],blockSocket=false,rejectCommand,delaySnapshots=false,dropWSReply=false,compact=false,loseHTTPReply=false,bus=[]}={}) {
  const dom = new JSDOM('<div id="app"></div><button id="mute-toggle"></button><div id="modal-root"></div><div id="toast-container"></div>',{url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window, calls=[], sockets=[], held=[]; let lostHTTP=false;
  w.scrollTo = (...args)=>calls.push({scroll:args});
  w.matchMedia = ()=>({matches:compact,addEventListener(){}});
  if(dropWSReply){const original=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>original(fn,ms===6000?20:ms,...args);}
  t.after(()=>w.close());
  w.localStorage.setItem('spyhaz_sessions_v2',JSON.stringify(stored));
  const result=body=>({ok:true,status:200,json:async()=>body});
  w.fetch=async(url,options)=>{
    const data=JSON.parse(options.body),path=new URL(url).pathname; calls.push({path,data});
    if(path.endsWith('/session')) {
      const p=room.room.players.find(p=>p.id===data.playerId);
      if(data.action==='resume')connectPlayer(room.room,p.id,'http-test',Date.now());
      let ack;
      if(data.action==='command') {
        if(rejectCommand===data.command.type)ack={id:data.command.id,ok:false,error:'Test: işlem kaydedilemedi.'};
        else {const r=command(room.room,p.id,data.command,Date.now());room.room=r.room;ack=r.ack;for(const peer of bus)if(peer.playerId&&peer.readyState===1)peer.deliver(snapshot(room.room,peer.playerId));}
        if(loseHTTPReply&&!lostHTTP){lostHTTP=true;throw new Error('Response lost after durable commit');}
      }
      return result({generation:'http-test',ack,snapshot:snapshot(room.room,p.id)});
    }
    throw new Error('Unexpected entry request: '+path);
  };
  w.WebSocket=class {
    static CONNECTING=0;static OPEN=1;
    readyState=0;
    constructor(url){if(blockSocket)throw new Error('network blocks WebSocket');this.url=String(url);sockets.push(this);bus.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.();});}
    send(text){
      if(text==='ping')return;
      const m=JSON.parse(text);calls.push({websocket:m});
      if(m.type==='session:resume'){this.playerId=m.playerId;queueMicrotask(()=>this.deliver(snapshot(room.room,m.playerId)));return;}
      const result=command(room.room,this.playerId,m,Date.now());room.room=result.room;
      if(dropWSReply)return;
      queueMicrotask(()=>this.onmessage?.({data:JSON.stringify(result.ack)}));
      const deliver=()=>{for(const peer of bus)if(peer.playerId&&peer.readyState===1)peer.deliver(snapshot(room.room,peer.playerId));};
      if(delaySnapshots)held.push(deliver);else queueMicrotask(deliver);
    }
    deliver(view){this.onmessage?.({data:JSON.stringify(view)});}
    close(){this.readyState=3;queueMicrotask(()=>this.onclose?.());}
  };
  w.eval(code);
  return {w,doc:w.document,room,calls,sockets,release:()=>held.splice(0).forEach(fn=>fn()),deliver:view=>sockets.at(-1).deliver(view)};
}
function saved(room,index=0){return {backend:base,code:room.room.code,playerId:room.players[index].id,token:'saved-token',savedAt:Date.now()};}

test('invite reload reuses the original identity and restores the original lobby',async t=>{
  const room=setup(4,{},Date.now()),identity=saved(room);
  const h=harness(t,{room,url:base+'/?code=ABC-DEF',stored:[{...identity,code:'UVW-XYZ',playerId:room.players[1].id},identity]});
  await until(()=>h.doc.querySelector('.lobby-screen'));
  assert.equal(h.calls.filter(c=>c.websocket?.type==='session:resume')[0].websocket.playerId,identity.playerId);
  assert.equal(h.calls.some(c=>c.path),false);
  assert.equal(h.w.location.search,'');
  assert.equal(h.doc.querySelectorAll('.lobby-content>.lobby-col').length,3);
});

test('blocked WebSocket falls back to HTTP and still starts a round with the same player',async t=>{
  const room=setup(4,{},Date.now());
  const h=harness(t,{room,stored:[saved(room)],blockSocket:true});
  await until(()=>h.doc.querySelector('.lobby-screen'));
  assert.equal(h.calls[0].data.action,'resume');
  h.doc.querySelector('[data-action=start]').click();
  await until(()=>h.doc.querySelector('.game-screen'));
  assert.equal(room.room.game.state,'ROLE_REVEAL');
  assert.equal(room.room.game.participantIds.includes(room.players[0].id),true);
  assert.ok(h.calls.some(c=>c.data?.command?.type==='game:start'));
  h.doc.querySelector('[data-action=kickChat]').click();
  assert.ok(h.doc.querySelector('.game-content-streamer #kick-chat-area'));
});

test('location filtering preserves ten global choices and a failed save leaves the modal open',async t=>{
  const room=setup(4,{},Date.now());
  const h=harness(t,{room,stored:[saved(room)],blockSocket:true,rejectCommand:'room:settings'});
  await until(()=>h.doc.querySelector('.lobby-screen'));
  h.doc.querySelector('[data-action=locations]').click();
  await until(()=>h.doc.querySelector('.loc-toggle-card[aria-pressed]'));
  const search=h.doc.querySelector('#loc-search');search.value='Hastane';search.dispatchEvent(new h.w.Event('input'));
  h.doc.querySelector('#loc-deselect-all').click();
  assert.equal(h.doc.querySelectorAll('.loc-toggle-card.active').length,10);
  assert.equal(h.doc.querySelector('#loc-counter-num').textContent,'10');
  h.doc.querySelector('#loc-save').click();
  await until(()=>h.doc.querySelector('#toast-container').textContent.includes('kaydedilemedi'));
  assert.ok(h.doc.querySelector('#loc-save'));
  assert.equal(room.room.settings.enabledLocationIds.length,30);
});

test('a rejected chat send keeps the draft intact',async t=>{
  const room=setup(4,{},Date.now());
  const h=harness(t,{room,stored:[saved(room)],blockSocket:true,rejectCommand:'chat:send'});
  await until(()=>h.doc.querySelector('#chat-input'));
  h.doc.querySelector('#chat-input').value='Kaybolmaması gereken soru';
  h.doc.querySelector('#chat-send').click();
  await until(()=>h.doc.querySelector('#toast-container').textContent.includes('kaydedilemedi'));
  assert.equal(h.doc.querySelector('#chat-input').value,'Kaybolmaması gereken soru');
});

test('a spectator host can render the result without a private card',async t=>{
  const room=setup(4,{},Date.now()),watcher=room.players[3].id;
  disconnectPlayer(room.room,watcher,'generation-'+watcher,Date.now());
  room.send(room.room.hostId,'game:start');
  connectPlayer(room.room,watcher,'returned',Date.now());
  room.send(room.room.hostId,'host:transfer',{playerId:watcher});
  room.send(watcher,'host:abort');
  const h=harness(t,{room,stored:[saved(room,3)]});
  await until(()=>h.doc.querySelector('.result-screen'));
  assert.equal(h.doc.querySelector('[data-action=lobby]').textContent,'LOBİYE DÖN · YENİ TUR');
});

test('small-group preset commits ten locations and the manual spy selection survives later joins',async t=>{
  const room=setup(8,{},Date.now()),h=harness(t,{room,stored:[saved(room)]});
  await until(()=>h.doc.querySelector('[data-action=presets]'));
  h.doc.querySelector('[data-action=presets]').click();
  await until(()=>h.doc.querySelector('#preset-list')?.onchange);
  const select=h.doc.querySelector('#preset-list');select.value='__default_mini';select.dispatchEvent(new h.w.Event('change'));
  assert.match(h.doc.querySelector('#preset-preview').textContent,/10 konum/);
  h.doc.querySelector('#preset-apply').click();
  await until(()=>!h.doc.querySelector('#active-modal'));
  assert.equal(room.room.settings.enabledLocationIds.length,10);
  assert.equal(h.doc.querySelector('.loc-badge').textContent,'10/30');
  assert.match(h.doc.querySelector('.active-preset-label').textContent,/Küçük grup/);
  const spy=h.doc.querySelector('#lobby-spy-count');spy.value='2';spy.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  await until(()=>room.room.settings.spyCount===2&&h.doc.querySelector('#lobby-spy-count').value==='2');
  const newcomer={id:crypto.randomUUID(),name:'Yeni kişi',tokenHash:'test'};joinRoom(room.room,newcomer,Date.now());connectPlayer(room.room,newcomer.id,'new',Date.now());
  h.deliver(snapshot(room.room,room.players[0].id));
  assert.equal(h.doc.querySelector('#lobby-spy-count').value,'2');
  assert.equal(h.doc.querySelector('.loc-badge').textContent,'10/30');
});

test('applying a preset waits for the committed snapshot, rather than only the acknowledgement',async t=>{
  const room=setup(4,{},Date.now()),h=harness(t,{room,stored:[saved(room)],delaySnapshots:true});
  await until(()=>h.doc.querySelector('[data-action=presets]'));
  h.doc.querySelector('[data-action=presets]').click();await until(()=>h.doc.querySelector('#preset-list')?.onchange);
  const select=h.doc.querySelector('#preset-list');select.value='__default_mini';select.dispatchEvent(new h.w.Event('change'));
  h.doc.querySelector('#preset-apply').click();
  await until(()=>room.room.settings.enabledLocationIds.length===10);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(h.doc.querySelector('#active-modal'),'must remain open before updated state arrives');
  assert.equal(h.doc.querySelector('#preset-apply').disabled,true);
  h.release();await until(()=>!h.doc.querySelector('#active-modal'));
  assert.equal(h.doc.querySelector('.loc-badge').textContent,'10/30');
});

test('a player joining does not replace a settings input being edited',async t=>{
  const room=setup(4,{},Date.now()),h=harness(t,{room,stored:[saved(room)]});
  await until(()=>h.doc.querySelector('#lobby-duration'));
  const slider=h.doc.querySelector('#lobby-duration');slider.focus();slider.value='11';
  const newcomer={id:crypto.randomUUID(),name:'Yeni oyuncu',tokenHash:'test'};joinRoom(room.room,newcomer);connectPlayer(room.room,newcomer.id,'new');
  h.deliver(snapshot(room.room,room.players[0].id));
  assert.equal(h.doc.querySelector('#lobby-duration'),slider);
  assert.equal(slider.value,'11');assert.equal(h.doc.activeElement,slider);
});

test('lost WebSocket acknowledgement retries the same command through HTTP without applying it twice',async t=>{
  const room=setup(4,{},Date.now()),h=harness(t,{room,stored:[saved(room)],dropWSReply:true});
  await until(()=>h.doc.querySelector('[data-action=start]'));
  h.doc.querySelector('[data-action=start]').click();
  await until(()=>h.doc.querySelector('.game-screen'));
  const wsCommand=h.calls.find(c=>c.websocket?.type==='game:start').websocket;
  const retry=h.calls.find(c=>c.data?.command?.type==='game:start').data.command;
  assert.equal(retry.id,wsCommand.id);
  assert.equal(room.room.receipts.filter(r=>r.id===retry.id).length,1);
});

test('lost HTTP response after commit retains the same command identity and reports the updated settings',async t=>{
  const room=setup(4,{},Date.now()),h=harness(t,{room,stored:[saved(room)],blockSocket:true,loseHTTPReply:true});
  await until(()=>h.doc.querySelector('#lobby-duration'));
  const slider=h.doc.querySelector('#lobby-duration');slider.value='11';slider.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  await until(()=>h.calls.filter(c=>c.data?.command?.type==='room:settings').length===2);
  const ids=h.calls.filter(c=>c.data?.command?.type==='room:settings').map(c=>c.data.command.id);
  assert.equal(new Set(ids).size,1);assert.equal(room.room.settings.duration,660);
});

test('a fifteen-player mobile round returns to the top and begins with a collapsed roster',async t=>{
  const room=setup(15,{},Date.now()),h=harness(t,{room,stored:[saved(room)],blockSocket:true,compact:true});
  await until(()=>h.doc.querySelector('[data-action=start]'));
  assert.equal(h.doc.querySelector('#room-roster').open,false);
  const previousScrolls=h.calls.filter(c=>c.scroll).length;
  h.doc.querySelector('[data-action=start]').click();await until(()=>h.doc.querySelector('[data-action=ready]'));
  assert.equal(h.doc.querySelector('#room-roster').open,false);
  assert.ok(h.calls.filter(c=>c.scroll).length>previousScrolls);
  assert.equal(h.doc.querySelector('#main-clock').getAttribute('role'),'timer');
});

test('fifteen real frontend instances keep a small-group preset and all reach the playing phase',async t=>{
  const room=setup(15,{},Date.now()),bus=[],clients=[];
  for(let i=0;i<15;i++)clients.push(harness(t,{room,stored:[saved(room,i)],compact:i%2===0,bus}));
  await until(()=>clients.every(h=>h.doc.querySelector('.lobby-screen')));
  const host=clients[0];host.doc.querySelector('[data-action=presets]').click();await until(()=>host.doc.querySelector('#preset-list')?.onchange);
  const select=host.doc.querySelector('#preset-list');select.value='__default_mini';select.dispatchEvent(new host.w.Event('change'));host.doc.querySelector('#preset-apply').click();
  await until(()=>clients.every(h=>{
    const badge=h.doc.querySelector('.loc-badge') || [...h.doc.querySelectorAll('.setting-display')].find(el=>el.textContent.includes('Konumlar'))?.querySelector('.setting-display-value');
    return badge?.textContent==='10/30';
  }));
  host.doc.querySelector('[data-action=start]').click();await until(()=>clients.every(h=>h.doc.querySelector('[data-action=ready]')));
  for(const client of clients)client.doc.querySelector('[data-action=ready]').click();
  await until(()=>clients.every(h=>h.doc.querySelector('#app').dataset.phase==='PLAYING'));
  for(const client of clients){assert.equal(client.doc.querySelectorAll('[data-action=eliminate]').length,10);assert.equal(client.doc.querySelector('[data-action=ready]'),null);}
  assert.equal(room.room.game.participantIds.length,15);
});

test('settings edits serialize and cannot start the round while a settings snapshot is outstanding',async t=>{
  const room=setup(8,{},Date.now()),h=harness(t,{room,stored:[saved(room)],delaySnapshots:true});
  await until(()=>h.doc.querySelector('#lobby-duration'));
  const slider=h.doc.querySelector('#lobby-duration');slider.value='11';slider.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  const spies=h.doc.querySelector('#lobby-spy-count');spies.value='2';spies.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  await until(()=>room.room.settings.duration===660);
  assert.equal(h.doc.querySelector('[data-action=start]').disabled,true);
  assert.equal(room.room.settings.spyCount,1);
  h.release();await until(()=>room.room.settings.spyCount===2);h.release();
  await until(()=>h.doc.querySelector('[data-action=start]').disabled===false);
  assert.equal(h.doc.querySelector('#lobby-duration').value,'11');assert.equal(h.doc.querySelector('#lobby-spy-count').value,'2');
});

test('another player becoming ready keeps the private card and location buttons mounted',async t=>{
  const room=setup(4,{},Date.now()),h=harness(t,{room,stored:[saved(room)]});
  await until(()=>h.doc.querySelector('[data-action=start]'));h.doc.querySelector('[data-action=start]').click();
  await until(()=>h.doc.querySelector('[data-action=ready]'));
  const card=h.doc.querySelector('.role-card'),location=h.doc.querySelector('[data-action=eliminate]');
  room.send(room.players[1].id,'game:ready');h.deliver(snapshot(room.room,room.players[0].id));
  assert.equal(h.doc.querySelector('.role-card'),card);assert.equal(h.doc.querySelector('[data-action=eliminate]'),location);
  h.doc.querySelector('[data-action=ready]').click();
  assert.ok(h.doc.querySelector('.role-card-hidden'));
});

test('a rejected preset retains the chosen profile, displays the error, and never claims success',async t=>{
  const room=setup(4,{},Date.now()),h=harness(t,{room,stored:[saved(room)],blockSocket:true,rejectCommand:'room:settings'});
  await until(()=>h.doc.querySelector('[data-action=presets]'));h.doc.querySelector('[data-action=presets]').click();
  await until(()=>h.doc.querySelector('#preset-list')?.onchange);
  const select=h.doc.querySelector('#preset-list');select.value='__default_mini';select.dispatchEvent(new h.w.Event('change'));h.doc.querySelector('#preset-apply').click();
  await until(()=>h.doc.querySelector('#preset-error')?.textContent.includes('kaydedilemedi'));
  assert.equal(select.value,'__default_mini');assert.equal(h.doc.querySelector('.loc-badge').textContent,'30/30');
  assert.equal(room.room.settings.enabledLocationIds.length,30);assert.equal(h.doc.querySelector('#preset-apply').disabled,false);
});

test('two spies remain a manual choice with a clear seven-player requirement',async t=>{
  const room=setup(4,{},Date.now()),h=harness(t,{room,stored:[saved(room)],blockSocket:true});
  await until(()=>h.doc.querySelector('#lobby-spy-count'));
  const select=h.doc.querySelector('#lobby-spy-count');select.value='2';select.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  await until(()=>h.doc.querySelector('#start-hint')?.textContent.includes('7 bağlı oyuncu'));
  assert.equal(h.doc.querySelector('[data-action=start]').disabled,true);assert.equal(h.doc.querySelector('#lobby-spy-count').value,'2');
});

test('an unconnected newcomer cannot silently miss the role distribution',async t=>{
  const room=setup(3,{},Date.now()),h=harness(t,{room,stored:[saved(room)]});
  await until(()=>h.doc.querySelector('[data-action=start]'));
  const guest={id:crypto.randomUUID(),name:'Henüz bağlanıyor',tokenHash:'test'};joinRoom(room.room,guest,Date.now());
  h.deliver(snapshot(room.room,room.players[0].id));
  assert.equal(h.doc.querySelector('[data-action=start]').disabled,true);
  assert.match(h.doc.querySelector('#start-hint').textContent,/bağlantısı hazırlanıyor/);
  connectPlayer(room.room,guest.id,'connected',Date.now());h.deliver(snapshot(room.room,room.players[0].id));
  assert.equal(h.doc.querySelector('[data-action=start]').disabled,false);
  h.doc.querySelector('[data-action=start]').click();await until(()=>h.doc.querySelector('.game-screen'));
  assert.equal(room.room.game.participantIds.includes(guest.id),true);
});
