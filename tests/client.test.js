import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../client/src/utils/dom.js';
import { renderPlayerList } from '../client/src/components/playerList.js';
import { saveSession, loadSession, clearSession, readStorage, writeStorage } from '../client/src/state.js';
import { newId } from '../client/src/utils/platform.js';
import { importPresetFromText, exportPresetText } from '../client/src/utils/presetManager.js';
import { saveGameToHistory, getHistory } from '../client/src/utils/history.js';
const values = new Map();
globalThis.localStorage = { getItem:key => values.get(key) ?? null, setItem:(key,value) => values.set(key,value), removeItem:key => values.delete(key) };
globalThis.sessionStorage = { getItem:() => null, setItem:() => {} };

test('untrusted names and attributes are encoded as text', () => {
  const name = '<img src=x>';
  const html = renderPlayerList([{id:'p',name,connected:true,isHost:false}]);
  assert.equal(html.includes(name),false);
  assert.equal(html.includes('&lt;img src=x&gt;'),true);
  assert.equal(escapeHtml('" onfocus="x'), '&quot; onfocus=&quot;x');
});
test('sessions are retained per backend and room, and removing one does not erase another', () => {
  const one = {backend:'https://one',code:'ABC-DEF',playerId:'p1',token:'one'};
  const two = {backend:'https://two',code:'ABC-DEF',playerId:'p2',token:'two'};
  saveSession(one); saveSession(two);
  assert.equal(loadSession(one.backend).playerId,'p1');
  assert.equal(loadSession(two.backend).playerId,'p2');
  clearSession(one);
  assert.equal(loadSession(one.backend),null);
  assert.equal(loadSession(two.backend).playerId,'p2');
});
test('private-storage failures do not throw or stop the UI', () => {
  const old = globalThis.localStorage;
  globalThis.localStorage = {getItem() {throw new Error('denied');},setItem() {throw new Error('denied');}};
  assert.doesNotThrow(() => saveSession({backend:'x',code:'ABC-DEF',playerId:'p',token:'t'}));
  assert.equal(readStorage('missing'),null);
  globalThis.localStorage = old;
});
test('legacy presets migrate to one spy and reject invalid location counts', () => {
  const old = {duration:480,spyGuessCount:5,enabledLocationIds:[1,2,3,4,5,6,7,8,9,10]};
  const migrated = importPresetFromText(JSON.stringify(old));
  assert.equal(migrated.spyCount,1); assert.equal(migrated.professions,false);
  assert.equal('spyGuessCount' in migrated,false);
  assert.match(importPresetFromText(JSON.stringify({...old,enabledLocationIds:[1,2,3,4,5]})).error,/10/);
  assert.equal(JSON.parse(exportPresetText(migrated)).v,2);
});
test('result reload or reconnect records a round in history only once', () => {
  values.delete('spyhaz_history');
  const result = {id:'one-round',winner:'SPY',isSpy:true,location:{name:'Test'}};
  saveGameToHistory(result); saveGameToHistory(result);
  assert.equal(getHistory().length,1);
});
test('corrupt local records cannot break the home screen or session recovery', () => {
  values.set('spyhaz_sessions_v2', '[null,3,{},{"backend":"x"}]');
  values.set('spyhaz_history', '[null,3,{},{"winner":"invalid"}]');
  assert.equal(loadSession('x'), null);
  assert.deepEqual(getHistory(), []);
});

test('an invite restores the matching room even if another room was saved more recently', () => {
  saveSession({backend:'invite-server',code:'ABC-DEF',playerId:'original',token:'a'});
  saveSession({backend:'invite-server',code:'UVW-XYZ',playerId:'newer',token:'b'});
  assert.equal(loadSession('invite-server','ABC-DEF').playerId,'original');
});

test('a quota failure reads the newer fallback value instead of the stale local value', () => {
  const previousLocal = globalThis.localStorage, previousSession = globalThis.sessionStorage;
  const fallback = new Map();
  globalThis.localStorage = {getItem:()=>'old',setItem(){throw new Error('QuotaExceededError');}};
  globalThis.sessionStorage = {getItem:key=>fallback.get(key)??null,setItem:(key,value)=>fallback.set(key,value),removeItem:key=>fallback.delete(key)};
  try { assert.equal(writeStorage('setting','new'),true); assert.equal(readStorage('setting'),'new'); }
  finally { globalThis.localStorage=previousLocal; globalThis.sessionStorage=previousSession; }
});

test('older Safari without randomUUID can still create secure player and command IDs', t => {
  const descriptor=Object.getOwnPropertyDescriptor(crypto,'randomUUID');
  Object.defineProperty(crypto,'randomUUID',{configurable:true,writable:true,value:undefined});
  t.after(()=>{if(descriptor)Object.defineProperty(crypto,'randomUUID',descriptor);else delete crypto.randomUUID;});
  const ids = new Set(Array.from({length:100},newId));
  assert.equal(ids.size,100);
  for (const id of ids) assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
