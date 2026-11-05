import './styles/index.css';
import './styles/home.css';
import './styles/lobby.css';
import './styles/game.css';
import './styles/vote.css';
import './styles/result.css';
import './styles/components.css';
import './styles/notebook.css';
import './styles/recovery.css';
import { homeView, lobbyView, gameView, resultView, watcherView, action, reasons as reasonText } from './views.js';
import { getState, setState, loadSession, readStorage, writeStorage } from './state.js';
import { backend, enterRoom, restoreSession, retryConnection, connectionStatus, sendCommand, endSession } from './socket.js';
import { escapeHtml as e } from './utils/dom.js';
import { showToast } from './components/toast.js';
import { showModal, closeModal } from './components/modal.js';
import { showTutorial } from './components/tutorial.js';
import { openLocationManager } from './components/locationManager.js';
import { renderChat, renderChatMessages } from './components/chat.js';
import { initNotebookToggle, clearNotebookState } from './components/notebook.js';
import { renderKickChat } from './components/kickChat.js';
import { saveGameToHistory, getHistory, getStats } from './utils/history.js';
import { getPresets, savePreset, loadPreset, importPresetFromText, exportPresetText } from './utils/presetManager.js';
import { playSFX, toggleMute, getMuteState } from './utils/audio.js';
import { recommendedDuration, normalizeCode } from '../../shared/rules.js';

const app = document.getElementById('app');
const ui = { roleVisible: false, showCode: false, roundId: null };
let lastSignature = '', modalContext = '', clockOffset = 0, tickSecond = null;
const timeText = seconds => Math.floor(Math.max(0, seconds) / 60) + ':' + String(Math.max(0, seconds) % 60).padStart(2, '0');

const statusBar = document.createElement('div');
statusBar.id = 'connection-banner'; statusBar.setAttribute('role', 'status'); statusBar.setAttribute('aria-live', 'polite');
document.body.prepend(statusBar);
statusBar.onclick = event => { if (event.target.closest('[data-retry]')) retryConnection(); };
function paintConnection(error = '') {
  const status = connectionStatus();
  statusBar.hidden = ['ready', 'idle'].includes(status);
  if (!statusBar.hidden) {
    const labels = { connecting: 'Odaya bağlanılıyor…', reconnecting: 'Bağlantı yenileniyor. Odan korunuyor.', offline: 'İnternet bekleniyor. Geri geldiğinde aynı oyuncuyla devam edeceksin.', replaced: 'Oyun başka sekmede açık.', ended: 'Oturum sona erdi.' };
    statusBar.innerHTML = '<span>' + e(error || labels[status] || 'Bağlantı bekleniyor…') + '</span>' + (status !== 'ended' ? '<button class="btn btn-ghost" data-retry>' + (status === 'replaced' ? 'Bu sekmede devam et' : 'Tekrar dene') + '</button>' : '');
  }
  app.querySelectorAll('[data-server-action]').forEach(button => {
    button.disabled = status !== 'ready' || button.dataset.blocked === 'true';
  });
}
async function perform(type, payload = {}, element) {
  if (element) element.disabled = true;
  try { return await sendCommand(type, payload); }
  catch (error) { showToast(error.message, 'error'); return null; }
  finally { paintConnection(); }
}
function renderHome() { app.innerHTML = homeView(loadSession(backend), getStats()); }
function renderLobby(s) {
  app.innerHTML = lobbyView(s, ui);
  renderChat(document.getElementById('room-chat'));
}
function renderGame(s) {
  app.innerHTML = gameView(s, ui, eliminationSet(s), getState().kickChatVisible);
  renderChat(document.getElementById('room-chat'));
  initNotebookToggle(document.getElementById('notebook-drawer'));
  const kickArea = document.getElementById('kick-chat-area');
  if (kickArea) renderKickChat(kickArea);
}
function renderResult(s) { app.innerHTML = resultView(s); }
function renderWatcher(s) {
  app.innerHTML = watcherView(s, ui);
  renderChat(document.getElementById('room-chat'));
}
function eliminationSet(s) {
  try {
    const ids = JSON.parse(readStorage('spyhaz_eliminations_' + s.game.id, '[]'));
    return new Set(Array.isArray(ids) ? ids : []);
  } catch { return new Set(); }
}
function structuralSignature(s) {
  return JSON.stringify({ ...s, serverNow: undefined, revision: undefined, chat: undefined, summaries: undefined,
    game: s.game ? { ...s.game, timer: { ...s.game.timer, remainingMs: undefined } } : null });
}
function refreshChat(s) {
  const body = document.getElementById('chat-body');
  if (!body) return;
  const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
  renderChatMessages(body, s.chat);
  if (nearBottom) body.scrollTop = body.scrollHeight;
}
function renderSnapshot(s) {
  const signature = structuralSignature(s);
  const nextModalContext = s.contextId + ':' + s.state + ':' + s.game?.question.turnId;
  if (modalContext && modalContext !== nextModalContext) closeModal();
  modalContext = nextModalContext;
  if (signature !== lastSignature) {
    const chatDraft = document.getElementById('chat-input')?.value || '';
    const notebookExpanded = document.getElementById('notebook-drawer')?.classList.contains('notebook-open');
    const focused = document.activeElement?.id;
    const selection = document.activeElement?.selectionStart;
    if (ui.roundId !== s.game?.id) {
      ui.roundId = s.game?.id || null;
      ui.roleVisible = s.state === 'ROLE_REVEAL' && !s.game?.readyIds.includes(s.playerId);
      clearNotebookState();
    }
    if (s.state === 'RESULT') renderResult(s);
    else if (s.state === 'LOBBY') renderLobby(s);
    else if (!s.game) renderWatcher(s);
    else renderGame(s);
    const input = document.getElementById('chat-input');
    if (input) input.value = chatDraft;
    if (notebookExpanded) document.getElementById('notebook-tab')?.click();
    if (focused) {
      const element = document.getElementById(focused);
      element?.focus();
      if (typeof selection === 'number') element?.setSelectionRange?.(selection, selection);
    }
    lastSignature = signature;
  }
  refreshChat(s); updateClocks(); paintConnection();
}
function updateClocks() {
  const s = getState().snapshot;
  const now = Date.now() + clockOffset;
  document.querySelectorAll('[data-unlock-at]').forEach(button => { button.dataset.blocked = String(now < Number(button.dataset.unlockAt)); button.disabled = connectionStatus() !== 'ready' || button.dataset.blocked === 'true'; });
  if (!s?.game) return;
  const g = s.game;
  const remaining = Math.ceil((g.timer.deadline === null ? g.timer.remainingMs : Math.max(0, g.timer.deadline - now)) / 1000);
  const main = document.getElementById('main-clock');
  if (main) main.textContent = timeText(remaining);
  document.querySelectorAll('.phase-clock').forEach(el => { el.textContent = 'Kalan: ' + Math.ceil(Math.max(0, (g.phaseDeadline || now) - now) / 1000) + ' sn'; });
  if (g.state === 'PLAYING' && g.timer.deadline && remaining > 0 && remaining <= 10 && tickSecond !== remaining) playSFX.tick();
  tickSecond = remaining;
}
function entryDialog(mode, initialCode = '') {
  const name = readStorage('spyhaz_name', '');
  showModal(mode === 'create' ? 'ODA OLUŞTUR' : 'ODAYA KATIL',
    '<form id="entry-form"><label class="input-label" for="player-name">Adın</label><input class="input" id="player-name" name="name" required minlength="2" maxlength="20" autocomplete="nickname" value="' + e(name) + '">' +
    (mode === 'join' ? '<label class="input-label" for="room-code">Oda kodu</label><input class="input" id="room-code" name="code" required maxlength="9" autocomplete="off" placeholder="ABC-DEF" value="' + e(initialCode) + '">' : '') +
    '<p id="entry-error" class="form-error" role="alert"></p><button class="btn btn-primary btn-block" type="submit">' + (mode === 'create' ? 'Oluştur' : 'Katıl') + '</button></form>', { onMount(overlay) {
      overlay.querySelector('#entry-form').onsubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget, button = form.querySelector('button[type=submit]');
        if (!form.reportValidity()) return;
        const name = form.elements.name.value.trim();
        button.disabled = true; overlay.querySelector('#entry-error').textContent = '';
        try {
          const code = mode === 'join' ? normalizeCode(form.elements.code.value) : '';
          writeStorage('spyhaz_name', name);
          await enterRoom(mode, name, code);
          closeModal();
        } catch (error) { overlay.querySelector('#entry-error').textContent = error.name === 'TimeoutError' ? 'Yanıt gecikti. Aynı düğmeyle güvenle tekrar deneyebilirsin.' : error.message; }
        finally { button.disabled = false; }
      };
    } });
}
function settingsDialog(s) {
  showModal('TUR AYARLARI', '<form id="settings-form"><label class="input-label" for="duration">Süre (dakika)</label><input class="input" id="duration" type="number" min="1" max="30" step="1" value="' + s.settings.duration / 60 + '">' +
    action('Önerilen süreyi kullan · ' + recommendedDuration(s.players.filter(p => p.connected).length) / 60 + ' dk', 'recommended') +
    '<label class="input-label" for="spy-count">Casus sayısı</label><select class="input" id="spy-count"><option value="1">1 casus</option><option value="2"' + (s.settings.spyCount === 2 ? ' selected' : '') + '>2 casus · en az 7 bağlı oyuncu</option></select>' +
    '<p class="recovery-hint">İki casus birbirini tanımaz. Birini yakalamak yeterli.</p><label class="setting-check"><input type="checkbox" id="professions"' + (s.settings.professions ? ' checked' : '') + '> Mesleklerle oyna</label><p class="recovery-hint">Kapalıyken yalnızca konumu görürsünüz. Meslekler açılırsa kalabalıkta aynı meslek tekrar edebilir.</p><button class="btn btn-primary" type="submit">Ayarları kaydet</button></form>', { onMount(overlay) {
    overlay.querySelector('[data-action=recommended]').onclick = event => { event.preventDefault(); overlay.querySelector('#duration').value = recommendedDuration(s.players.filter(p => p.connected).length) / 60; };
    overlay.querySelector('#settings-form').onsubmit = async event => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      const result = await perform('room:settings', { duration: Number(overlay.querySelector('#duration').value) * 60, spyCount: Number(overlay.querySelector('#spy-count').value), professions: overlay.querySelector('#professions').checked });
      if (result) closeModal();
    };
  } });
}
function selectPlayer(s, mode) {
  const candidates = s.players.filter(p => s.game.participantIds.includes(p.id) && p.id !== s.playerId);
  showModal('KİMİ SUÇLUYORSUN?', '<p>Şüpheli dışındaki oyuncular evet/hayır oyu verecek. Bu tur yalnızca bir suçlama başlatabilirsin.</p><div class="question-targets">' +
    candidates.map(p => '<button class="btn btn-primary" data-suspect="' + e(p.id) + '">' + e(p.name) + '</button>').join('') + '</div>', { onMount(overlay) {
      overlay.querySelectorAll('[data-suspect]').forEach(button => button.onclick = async () => { if (await perform('vote:accuse', { suspectId: button.dataset.suspect }, button)) closeModal(); });
    } });
}
function guessDialog(s) {
  showModal('TEK KONUM TAHMİNİN', '<p>Onayladığında casus olduğunu açıklarsın. Yanlış tahmin geri alınamaz.</p><form id="guess-form"><label class="input-label" for="guess-location">Konum</label><select class="input" id="guess-location" required><option value="">Bir konum seç</option>' +
    s.game.locations.map(loc => '<option value="' + loc.id + '">' + e(loc.emoji + ' ' + loc.name) + '</option>').join('') +
    '</select><button class="btn btn-danger btn-block" type="submit">Kimliğimi açıkla ve tahmin et</button></form>', { onMount(overlay) {
      overlay.querySelector('#guess-form').onsubmit = async event => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
        if (await perform('spy:guess', { locationId: Number(overlay.querySelector('#guess-location').value) }, event.currentTarget.querySelector('button'))) closeModal();
      };
    } });
}
function presetsDialog(s) {
  const presets = getPresets();
  showModal('HAZIR AYARLAR', '<label class="input-label" for="preset-list">Kayıtlı ayar seç</label><select class="input" id="preset-list">' + presets.map(p => '<option value="' + e(p.id) + '">' + e(p.name) + '</option>').join('') +
    '<button class="btn btn-primary" id="preset-apply">Seçili ayarı uygula</button><hr><label class="input-label" for="preset-name">Bu ayarları kaydet</label><input class="input" id="preset-name" maxlength="20" placeholder="Örn. Sınıf oyunu"><button class="btn btn-ghost" id="preset-save">Kaydet</button><hr><label class="input-label" for="preset-text">Ayarı dışa aktar / içe aktar</label><textarea class="input" id="preset-text" rows="5">' + e(exportPresetText(s.settings)) + '</textarea><button class="btn btn-primary" id="preset-import">Metindeki ayarı uygula</button><p class="recovery-hint">Eski ayarlardaki çoklu tahmin hakkı kaldırıldı. En az 10 farklı geçerli konum gerekir.</p>', { onMount(overlay) {
      overlay.querySelector('#preset-apply').onclick = async () => { const setting = loadPreset(overlay.querySelector('#preset-list').value); if (setting && await perform('room:settings', setting)) closeModal(); };
      overlay.querySelector('#preset-save').onclick = () => { try { savePreset(overlay.querySelector('#preset-name').value, s.settings); showToast('Ayar kaydedildi.'); closeModal(); } catch (error) { showToast(error.message, 'error'); } };
      overlay.querySelector('#preset-import').onclick = async () => {
        const value = importPresetFromText(overlay.querySelector('#preset-text').value);
        if (value.error) return showToast(value.error, 'error');
        if (await perform('room:settings', value)) closeModal();
      };
    } });
}
function historyDialog() {
  showModal('OYUN GEÇMİŞİM', getHistory().map(g => '<div class="history-item"><strong>' + e(g.location?.emoji || '📍') + ' ' + e(g.location?.name || '?') + '</strong><span>' + e(g.isSpy ? 'Casus' : 'Oyuncu') + ' · ' + e(reasonText[g.reason] || g.reason || '') + '</span></div>').join('') || '<p>Oynadığın turlar bu tarayıcıda görünecek.</p>');
}
app.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const s = getState().snapshot, a = button.dataset.action;
  if (a === 'tutorial') return showTutorial();
  if (a === 'create' || a === 'join') return entryDialog(a);
  if (a === 'history') return historyDialog();
  if (a === 'resume') return restoreSession();
  if (!s) return;
  if (a === 'leave') {
    if (connectionStatus() === 'ready' && !await perform('room:leave', {}, button)) return;
    endSession(); setState({ snapshot: null, players: [], roomCode: null }); lastSignature = ''; closeModal(); renderHome(); return;
  }
  if (a === 'code') { ui.showCode = !ui.showCode; lastSignature = ''; return renderSnapshot(s); }
  if (a === 'copy') {
    const link = new URL(window.location.pathname, window.location.origin); link.searchParams.set('code', s.code);
    try { await navigator.clipboard.writeText(link.href); showToast('Davet bağlantısı kopyalandı.'); }
    catch { showModal('DAVET BAĞLANTISI', '<input class="input" readonly aria-label="Davet bağlantısı" value="' + e(link.href) + '">'); }
    return;
  }
  if (a === 'settings') return settingsDialog(s);
  if (a === 'locations') return openLocationManager(s.settings.enabledLocationIds, ids => sendCommand('room:settings', { enabledLocationIds: ids }));
  if (a === 'presets') return presetsDialog(s);
  if (a === 'role') { ui.roleVisible = !ui.roleVisible; lastSignature = ''; return renderSnapshot(s); }
  if (a === 'accuse') return selectPlayer(s);
  if (a === 'guess') return guessDialog(s);
  if (a === 'kickChat') {
    setState({ kickChatVisible: !getState().kickChatVisible, kickChatViewerId: s.playerId });
    lastSignature = ''; return renderSnapshot(s);
  }
  if (a === 'eliminate') {
    const set = eliminationSet(s), id = Number(button.dataset.location);
    if (set.has(id)) set.delete(id); else set.add(id);
    writeStorage('spyhaz_eliminations_' + s.game.id, JSON.stringify([...set]));
    button.classList.toggle('eliminated', set.has(id)); button.setAttribute('aria-pressed', String(set.has(id))); return;
  }
  if (a === 'abort') return showModal('TURU İPTAL ET', '<p>Bu tur sonuçlandırılmadan kapanır. Kimseye puan yazılmaz.</p><button class="btn btn-danger" id="confirm-abort">Turu puansız iptal et</button>', { onMount(overlay) { overlay.querySelector('#confirm-abort').onclick = async event => { if (await perform('host:abort', {}, event.target)) closeModal(); }; } });
  if (a === 'ready') ui.roleVisible = false;
  const target = document.getElementById('host-player')?.value;
  const commands = {
    start: ['game:start'], ready: ['game:ready'], forceReady: ['host:forceReady'],
    target: ['question:select', { targetId: button.dataset.player }], questionDone: ['question:done'], skip: ['host:skip'], skipPlayer: ['host:skip', { playerId: document.getElementById('skip-player')?.value }],
    pause: ['timer:toggle'], transfer: ['host:transfer', { playerId: target }], kick: ['host:kick', { playerId: target }],
    voteYes: ['vote:cast', { accept: true }], voteNo: ['vote:cast', { accept: false }],
    nominate: ['vote:cast', { suspectId: button.dataset.player }], lobby: ['game:lobby'],
  };
  if (commands[a]) await perform(commands[a][0], commands[a][1] || {}, button);
});
app.addEventListener('input', event => {
  if (event.target.id === 'lobby-duration') {
    const label = document.getElementById('lobby-duration-label');
    if (label) label.textContent = event.target.value + ' dakika';
  }
});
app.addEventListener('change', async event => {
  const input = event.target;
  const changes = {
    'lobby-duration': { duration: Number(input.value) * 60 },
    'lobby-spy-count': { spyCount: Number(input.value) },
    'lobby-professions': { professions: input.checked },
  };
  if (!changes[input.id]) return;
  input.disabled = true;
  await perform('room:settings', changes[input.id]);
  lastSignature = '';
  const snapshot = getState().snapshot;
  if (snapshot) renderSnapshot(snapshot);
});
window.addEventListener('spyhaz:connection', event => paintConnection(event.detail.error));
window.addEventListener('spyhaz:sessionEnded', event => {
  setState({ snapshot: null, players: [], roomCode: null }); lastSignature = ''; closeModal(); renderHome(); showToast(event.detail, 'warning');
});
window.addEventListener('spyhaz:snapshot', event => {
  const s = event.detail; clockOffset = s.serverNow - Date.now();
  const previousId = ui.roundId;
  if (s.state === 'RESULT' && s.game?.result && s.game.result.winner !== 'CANCELLED') saveGameToHistory({
    id: s.game.id, location: s.game.result.location, role: s.game.profession, isSpy: s.game.isSpy,
    winner: s.game.result.winner, reason: s.game.result.reason, playerCount: s.game.participantIds.length,
  });
  if (previousId !== s.game?.id && s.state === 'ROLE_REVEAL') playSFX.start();
  renderSnapshot(s);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ui.roleVisible) { ui.roleVisible = false; lastSignature = ''; const s = getState().snapshot; if (s) renderSnapshot(s); }
});
const mute = document.getElementById('mute-toggle');
mute.setAttribute('aria-label', 'Ses efektlerini aç veya kapat'); mute.textContent = getMuteState() ? '🔇' : '🔊';
mute.onclick = () => { const muted = toggleMute(); mute.textContent = muted ? '🔇' : '🔊'; mute.setAttribute('aria-pressed', String(muted)); };
renderHome();
setInterval(updateClocks, 250);
const invite = new URLSearchParams(window.location.search).get('code');
if (invite) {
  let code;
  try { code = normalizeCode(invite); } catch { /* show the entered code for correction */ }
  if (!code || !restoreSession(code)) entryDialog('join', invite);
} else restoreSession();
