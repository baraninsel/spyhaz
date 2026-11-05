// DOM execution of the real production bundle; this is not a visual browser test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { setup } from './helpers.js';
import { command, snapshot, connectPlayer, disconnectPlayer } from '../server/src/engine.js';
const built = await build({root:fileURLToPath(new URL('../client',import.meta.url)),logLevel:'silent',build:{write:false,minify:false}});
const code = built.output.find(file=>file.type==='chunk').code;
const base = 'https://test.spyhaz.invalid';
async function until(check) {
  for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.fail('Expected UI state was not reached');
}
function harness(t,{room=setup(4,{},Date.now()),url=base,stored=[],blockSocket=false,rejectCommand}={}) {
  const dom = new JSDOM('<div id="app"></div><button id="mute-toggle"></button><div id="modal-root"></div><div id="toast-container"></div>',{url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window, calls=[], sockets=[];
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
        if(rejectCommand===data.command.type)ack={ok:false,error:'Test: işlem kaydedilemedi.'};
        else {const r=command(room.room,p.id,data.command,Date.now());room.room=r.room;ack=r.ack;}
      }
      return result({generation:'http-test',ack,snapshot:snapshot(room.room,p.id)});
    }
    throw new Error('Unexpected entry request: '+path);
  };
  w.WebSocket=class {
    static CONNECTING=0;static OPEN=1;
    readyState=0;
    constructor(url){if(blockSocket)throw new Error('network blocks WebSocket');this.url=String(url);sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.();});}
    send(text){if(text==='ping')return;const m=JSON.parse(text);calls.push({websocket:m});if(m.type==='session:resume')queueMicrotask(()=>this.deliver(snapshot(room.room,m.playerId)));}
    deliver(view){this.onmessage?.({data:JSON.stringify(view)});}
    close(){this.readyState=3;queueMicrotask(()=>this.onclose?.());}
  };
  w.eval(code);
  return {w,doc:w.document,room,calls,sockets,deliver:view=>sockets.at(-1).deliver(view)};
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
