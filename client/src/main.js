import './styles/index.css';
import './styles/home.css';
import './styles/lobby.css';
import './styles/game.css';
import './styles/vote.css';
import './styles/result.css';
import './styles/components.css';
import './styles/notebook.css';
import './styles/v2.css';
import { getState, setState, loadSession, applySnapshot, readStorage, writeStorage } from './state.js';
import { backend, enterRoom, restoreSession, retryConnection, connectionStatus, sendCommand, endSession } from './socket.js';
import { escapeHtml as e } from './utils/dom.js';
import { showToast } from './components/toast.js';
import { showModal, closeModal } from './components/modal.js';
import { showTutorial } from './components/tutorial.js';
import { openLocationManager } from './components/locationManager.js';
import { renderPlayerList } from './components/playerList.js';
import { renderChat } from './components/chat.js';
import { initNotebookToggle, clearNotebookState } from './components/notebook.js';
import { renderKickChat } from './components/kickChat.js';
import { saveGameToHistory, getHistory, getStats } from './utils/history.js';
import { getPresets, savePreset, loadPreset, importPresetFromText, exportPresetText } from './utils/presetManager.js';
import { playSFX, toggleMute, getMuteState } from './utils/audio.js';
import { recommendedDuration, normalizeCode, MAX_PLAYERS } from '../../shared/rules.js';

const app = document.getElementById('app');
const ui = { roleVisible: false, showCode: false, roundId: null };
let lastSignature = '', modalContext = '', clockOffset = 0, tickSecond = null;
const title = text => '<h2 class="v2-section-title">' + text + '</h2>';
const action = (label, name, attrs = '') => '<button class="btn btn-primary" data-action="' + name + '" ' + attrs + '>' + label + '</button>';
const serverAction = (label, name, attrs = '') => action(label, name, 'data-server-action ' + attrs);
const nameOf = (s, id) => e(s.players.find(p => p.id === id)?.name || '?');
const isHost = s => s.hostId === s.playerId;
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
function shell(s, body) {
  return '<main class="v2-screen"><header class="v2-header"><a href="#" class="v2-brand" aria-label="Spyhaz">SPYHAZ</a><div class="v2-header-actions">' +
    action('Nasıl oynanır?', 'tutorial') + action('Odadan ayrıl', 'leave') +
    '</div></header><div class="v2-room-meta"><span>Oda: <strong>' + (ui.showCode ? e(s.code) : '•••-•••') +
    '</strong></span>' + action(ui.showCode ? 'Gizle' : 'Göster', 'code') + action('Davet bağlantısını kopyala', 'copy') +
    '<span class="v2-muted">' + (s.game ? 'Tur ' + (s.state === 'RESULT' ? s.roundNumber : s.roundNumber + 1) : 'Lobi') +
    ' · ' + (s.players.length > 12 ? '13–15 kişi: deneysel' : s.players.length + ' / ' + MAX_PLAYERS + ' kişi') + '</span></div>' +
    (s.notice ? '<p class="v2-notice" role="status">' + e(s.notice) + '</p>' : '') + body + '</main>';
}
function renderHome() {
  const session = loadSession(backend), stats = getStats();
  app.innerHTML = '<main class="v2-home"><div class="v2-hero-symbol" aria-hidden="true">🕵️</div><p class="v2-kicker">AYNI ODA. BİR GİZLİ CASUS.</p><h1 class="v2-logo">SPYHAZ</h1><p class="v2-home-copy">Herkes nerede olduğunu biliyor.<br>Casus, belli etmeden öğrenmeye çalışıyor.</p><div class="v2-home-actions">' +
    action('Oda oluştur', 'create') + action('Odaya katıl', 'join') +
    (session ? action('↩ Oyuna devam et', 'resume') : '') +
    '</div><p class="v2-muted">3–15 kişi · Çevrim içi odalar · Telefon, tablet veya bilgisayar</p><div class="v2-home-links">' +
    action('▶ Nasıl oynanır?', 'tutorial') + action('Oyun geçmişim' + (stats ? ' · ' + stats.totalGames + ' tur' : ''), 'history') +
    '</div><div class="v2-home-preview"><span>🃏 Gizli kartını gör</span><b>→</b><span>💬 Sorularla çöz</span><b>→</b><span>🗳️ Birlikte karar ver</span></div></main>';
}
function roster(s) {
  return '<section class="card v2-roster">' + title('Oyuncular · ' + s.players.filter(p => p.connected).length + ' bağlı') + renderPlayerList(s.players) + '</section>';
}
function scoreboard(s) {
  if (!Object.keys(s.scores).length) return '';
  return '<section class="card">' + title('Toplam puanlar') + '<ol class="v2-score-list">' + [...s.players].sort((a,b) => (s.scores[b.id] || 0) - (s.scores[a.id] || 0)).map(p => '<li><span>' + e(p.name) + '</span><strong>' + (s.scores[p.id] || 0) + '</strong></li>').join('') + '</ol></section>';
}
function hostPanel(s) {
  if (!isHost(s)) return '';
  const others = s.players.filter(p => p.id !== s.playerId);
  const readyAt = s.game?.forceReadyAt || s.hostControls?.forceReadyAt;
  const timerPaused = s.game?.timer.paused ?? s.hostControls?.timerPaused;
  return '<details class="card v2-host"><summary>Kurucu araçları</summary><p class="v2-muted">İşlemler herkese duyurulur; gizli kartlar açılmaz.</p>' +
    (s.state === 'PLAYING' ? serverAction('Soru sırasını atlat', 'skip') + serverAction(timerPaused ? 'Süreyi sürdür' : 'Süreyi durdur', 'pause') : '') +
    (s.state === 'ROLE_REVEAL' ? serverAction('Hazır beklemesini aş', 'forceReady', 'data-unlock-at="' + readyAt + '" data-blocked="' + (Date.now() + clockOffset < readyAt) + '"') + '<p class="v2-muted">Tur başladıktan 30 saniye sonra kullanılabilir. En az 3 bağlı oyuncu gerekir.</p>' : '') +
    (s.state !== 'LOBBY' && s.state !== 'RESULT' ? serverAction('Turu puansız iptal et', 'abort') : '') +
    (others.length ? '<label class="v2-label" for="host-player">Oyuncu</label><select class="input" id="host-player">' + others.map(p => '<option value="' + e(p.id) + '">' + e(p.name) + (p.connected ? '' : ' · bağlı değil') + '</option>').join('') + '</select>' + serverAction('Yönetimi devret', 'transfer') + (!s.game ? serverAction('Lobiden çıkar', 'kick') : '') : '') + '</details>';
}
function renderLobby(s) {
  const online = s.players.filter(p => p.connected).length;
  const settings = s.settings;
  const config = '<section class="card">' + title('Bir sonraki tur') +
    '<div class="v2-setting-grid"><div><span>Süre</span><strong>' + settings.duration / 60 + ' dakika</strong></div><div><span>Casus</span><strong>' + settings.spyCount + '</strong></div><div><span>Meslekler</span><strong>' + (settings.professions ? 'Açık' : 'Kapalı') + '</strong></div><div><span>Konum</span><strong>' + settings.enabledLocationIds.length + ' / 30</strong></div></div>' +
    (online >= 9 && settings.spyCount === 1 ? '<p class="v2-notice">Kalabalıkta 2 casusu deneyebilirsiniz. Birini yakalamak yeterli.</p>' : '') +
    '<p class="v2-muted">Herkese bir soru · Üçte iki onay · Casus başına tek tahmin</p>' +
    (isHost(s) ? '<div class="v2-actions">' + action('Ayarları değiştir', 'settings') + action('Konumları seç', 'locations') + action('Hazır ayarlar', 'presets') + '</div><hr>' +
      serverAction('Oyunu başlat', 'start', 'data-blocked="' + (online < 3 || (settings.spyCount === 2 && online < 7)) + '"') +
      '<p class="v2-muted">' + (online < 3 ? 'Başlamak için en az 3 bağlı oyuncu gerekiyor.' : 'Herkes kartını gördükten sonra sorular başlayacak.') + '</p>' :
      '<p>Kurucu oyunu başlattığında gizli kartın açılacak.</p>') + '</section>';
  app.innerHTML = shell(s, '<div class="v2-layout"><aside>' + roster(s) + scoreboard(s) + '</aside><div>' + config + hostPanel(s) + '<section class="card"><div id="room-chat"></div></section></div></div>');
  renderChat(document.getElementById('room-chat'));
}
function roleCard(s) {
  const g = s.game;
  const reveal = s.state === 'ROLE_REVEAL' || ui.roleVisible;
  return '<section class="card v2-role ' + (g.isSpy ? 'v2-spy' : '') + '">' + title('Gizli kartın') +
    (reveal ? '<div class="v2-role-emoji">' + (g.isSpy ? '🕵️' : e(g.location?.emoji)) + '</div><h2>' + (g.isSpy ? 'Sen casussun' : e(g.location?.name)) + '</h2>' +
      '<p>' + (g.isSpy ? 'Konumu bilmiyorsun. Sorulardan anlamaya çalış.' : g.profession ? 'Mesleğin: ' + e(g.profession) : 'Konumu söylemeden casusu bul.') + '</p>' :
      '<div class="v2-role-emoji">🃏</div><p>Kartın gizli. İstersen tekrar bakabilirsin.</p>') +
    (s.state !== 'ROLE_REVEAL' ? action(reveal ? 'Kartımı gizle' : 'Kartımı göster', 'role') : '') +
    (g.isSpy && ['PLAYING', 'SPY_GUESS'].includes(s.state) && !g.myGuessSubmitted ? serverAction('Konumu tahmin et', 'guess') + '<p class="v2-muted">Tek tahmin; onayladığında kimliğini açıklarsın.</p>' : '') + '</section>';
}
function questionSection(s) {
  const g = s.game, q = g.question;
  if (s.state === 'ROLE_REVEAL') {
    const ready = g.readyIds.includes(s.playerId);
    return '<section class="card">' + title('Kartını gördün mü?') + '<p>' + g.readyIds.length + ' / ' + g.participantIds.length + ' oyuncu hazır.</p>' +
      serverAction(ready ? 'Hazırsın · Diğerleri bekleniyor' : 'Anladım, hazırım', 'ready', 'data-blocked="' + ready + '"') +
      '<p class="v2-muted">Bağlantısı kopan biri hazır aşamasını süresiz kilitlemez; kurucunun müdahale aracı vardır.</p></section>';
  }
  if (['ACCUSATION', 'FINAL_NOMINATION', 'FINAL_ACCUSATION'].includes(s.state)) return ballotSection(s);
  if (s.state === 'SPY_GUESS') return '<section class="card">' + title('Casus konumu tahmin ediyor') +
    '<p>' + g.revealedSpies.map(p => e(p.name)).join(', ') + ' kimliğini açıkladı.</p><p>' +
    (g.isSpy && !g.myGuessSubmitted ? 'Şimdi tek konum tahminini gönder.' : 'Tahminler tamamlanınca sonuç birlikte açıklanacak.') + '</p><strong class="v2-phase-clock"></strong></section>';
  const asker = nameOf(s, q.currentAskerId), mine = q.currentAskerId === s.playerId;
  const askerConnected = s.players.find(p => p.id === q.currentAskerId)?.connected;
  return '<section class="card">' + title('Soru döngüsü ' + q.cycle) +
    '<p class="v2-muted">' + q.answeredIds.length + ' kişi cevap verdi' + (q.skippedIds.length ? ' · ' + q.skippedIds.length + ' sıra atlandı' : '') + '</p>' +
    (q.targetId ? '<h3 class="v2-question">' + asker + ' <span aria-label="soruyor">→</span> ' + nameOf(s, q.targetId) + '</h3><p>Soruyu ve cevabı konuşarak veya oda sohbetinden paylaşın.</p>' +
      (mine ? serverAction('Soru-cevap tamamlandı', 'questionDone') : '<p class="v2-muted">Soruyu soran kişi tamamlandığında sırayı ilerletecek.</p>') :
      '<h3>' + (mine ? 'Sıra sende. Kime soracaksın?' : asker + ' soru soracak kişiyi seçiyor.') + '</h3>' +
      (mine ? '<div class="v2-targets">' + q.availableTargets.map(id => serverAction(nameOf(s,id), 'target', 'data-player="' + e(id) + '"')).join('') + '</div>' +
        (!q.availableTargets.length ? '<p>Uygun bağlı oyuncu bekleniyor. Kurucu sırayı atlatabilir.</p>' : '') : '')) +
    (!askerConnected ? '<p class="v2-notice">Soruyu soracak kişi bağlı değil. Kurucu sırayı atlatabilir; süre devam eder.</p>' : '') +
    '<hr>' + (g.canAccuse ? serverAction('Birini suçla', 'accuse') :
      '<p class="v2-muted">' + (q.cycle === 1 ? 'İlk soru döngüsü tamamlandığında suçlama açılacak.' : 'Bu tur suçlama hakkını kullandın.') + '</p>') + '</section>';
}
function ballotSection(s) {
  const b = s.game.ballot;
  const submitted = b.myVote !== null;
  let body;
  if (b.kind === 'nomination') {
    body = '<p>Son onay oylamasına aday olacak şüpheliyi seç.</p>' + (submitted ? '<p class="v2-notice">Aday oyun kaydedildi.</p>' :
      '<div class="v2-targets">' + s.players.filter(p => s.game.participantIds.includes(p.id) && p.id !== s.playerId).map(p => serverAction(e(p.name), 'nominate', 'data-player="' + e(p.id) + '"')).join('') + '</div>');
  } else {
    body = '<h3>' + nameOf(s, b.suspectId) + ' casus mu?</h3><p><strong>' + b.threshold + ' evet gerekiyor.</strong> Şüpheli bu oylamaya katılmaz.</p>' +
      (!b.eligible ? '<p class="v2-notice">Bu oylamanın şüphelisi sensin. Sonucu bekle.</p>' : submitted ?
        '<p class="v2-notice">Oyun kaydedildi: ' + (b.myVote ? 'Evet' : 'Hayır') + '</p>' :
        '<div class="v2-actions">' + serverAction('✓ Evet', 'voteYes') + serverAction('✕ Hayır', 'voteNo') + '</div>');
  }
  return '<section class="card v2-ballot">' + title(b.isFinal ? 'Son oylama' : 'Suçlama oylaması') + '<strong class="v2-phase-clock"></strong>' + body +
    '<p class="v2-muted">' + b.votedIds.length + ' oy verildi. Seçimler oylama sürerken gizli; yanıt gelmezse 30 saniyede kapanır.</p></section>';
}
function eliminationSet(s) {
  try { return new Set(JSON.parse(readStorage('spyhaz_eliminations_' + s.game.id, '[]'))); } catch { return new Set(); }
}
function locationGrid(s) {
  const eliminated = eliminationSet(s);
  return '<section class="card">' + title('Konumlar') + '<p class="v2-muted">Düşünceni not etmek için dokun. İşaretler yalnızca sende görünür; tekrar dokunarak kaldırabilirsin.</p><div class="location-grid v2-location-grid">' +
    s.game.locations.map(loc => '<button class="location-card ' + (eliminated.has(loc.id) ? 'eliminated' : '') + '" data-action="eliminate" data-location="' + loc.id + '" aria-pressed="' + eliminated.has(loc.id) + '"><span class="location-card-emoji">' + e(loc.emoji) + '</span><span class="location-card-name">' + e(loc.name) + '</span></button>').join('') + '</div></section>';
}
function renderGame(s) {
  app.innerHTML = shell(s, '<div class="v2-game-top"><span>Kalan süre</span><strong id="main-clock" aria-label="Kalan oyun süresi"></strong>' +
    (s.game.timer.paused && s.state === 'PLAYING' ? '<span>Kurucu süreyi durdurdu</span>' : '') + '</div><div class="v2-layout"><aside>' + roleCard(s) + roster(s) +
    '<section class="card"><div id="room-chat"></div></section>' + action('Yayın sohbeti', 'kickChat') + '</aside><div>' + questionSection(s) + hostPanel(s) + locationGrid(s) + '</div></div>' +
    '<details class="card v2-notebook"><summary>📓 Dedektif not defterim</summary><div id="notebook-drawer"><button id="notebook-tab" class="btn btn-ghost">Oyuncular ve notlar</button><div class="notebook-body" id="notebook-body"></div></div></details>');
  renderChat(document.getElementById('room-chat'));
  initNotebookToggle(document.getElementById('notebook-drawer'));
}
const reasonText = { CORRECT_ACCUSATION: 'Casus doğru suçlandı.', WRONG_ACCUSATION: 'Yanlış kişi suçlandı.', CORRECT_GUESS: 'Casus konumu doğru tahmin etti.', WRONG_GUESS: 'Hiçbir casus konumu doğru tahmin edemedi.', TIME_EXPIRED: 'Son oylamada geçerli suçlama çıkmadı.', HOST_ABORT: 'Kurucu turu puansız iptal etti.' };
function renderResult(s) {
  const r = s.game.result;
  app.innerHTML = shell(s, '<section class="card v2-result"><div class="v2-role-emoji">' + (r.winner === 'CANCELLED' ? '↩' : r.winner === 'SPY' ? '🕵️' : '🎉') +
    '</div><h1>' + (r.winner === 'CANCELLED' ? 'Tur iptal edildi' : r.winner === 'SPY' ? 'Casus' + (r.spies.length > 1 ? 'lar' : '') + ' kazandı' : 'Oyuncular kazandı') +
    '</h1><p>' + e(reasonText[r.reason] || r.reason) + '</p><h2>' + e(r.location.emoji) + ' ' + e(r.location.name) + '</h2><p>Casus' + (r.spies.length > 1 ? 'lar' : '') + ': <strong>' + r.spies.map(p => e(p.name)).join(', ') + '</strong></p>' +
    '<div class="v2-result-scores">' + Object.entries(r.roles).sort(([a],[b]) => (r.totalScores[b] || 0) - (r.totalScores[a] || 0)).map(([id,p]) =>
      '<div><span>' + e(p.name) + (p.isSpy ? ' 🕵️' : p.role ? ' · ' + e(p.role) : '') + '</span><span>+' + r.roundScores[id] + ' <strong>Toplam ' + (r.totalScores[id] || 0) + '</strong></span></div>').join('') + '</div>' +
    (isHost(s) ? serverAction('Lobiye dön · Yeni tur', 'lobby') : '<p>Kurucu yeni tur için lobiye dönebilir.</p>') + '</section>' + hostPanel(s));
}
function structuralSignature(s) {
  return JSON.stringify({ ...s, serverNow: undefined, revision: undefined, chat: undefined, summaries: undefined,
    game: s.game ? { ...s.game, timer: { ...s.game.timer, remainingMs: undefined } } : null });
}
function refreshChat(s) {
  const body = document.getElementById('chat-body');
  if (!body) return;
  const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
  body.innerHTML = s.chat.map(m => '<div class="chat-message"><strong>' + e(m.senderName) + ':</strong> <span>' + e(m.message) + '</span></div>').join('');
  if (nearBottom) body.scrollTop = body.scrollHeight;
}
function renderSnapshot(s) {
  const signature = structuralSignature(s);
  const nextModalContext = s.contextId + ':' + s.state + ':' + s.game?.question.turnId;
  if (modalContext && modalContext !== nextModalContext) closeModal();
  modalContext = nextModalContext;
  if (signature !== lastSignature) {
    const chatDraft = document.getElementById('chat-input')?.value || '';
    const notebookOpen = document.querySelector('.v2-notebook')?.open || false;
    const notebookExpanded = document.getElementById('notebook-drawer')?.classList.contains('notebook-open');
    const focused = document.activeElement?.id;
    const selection = document.activeElement?.selectionStart;
    if (ui.roundId !== s.game?.id) { ui.roundId = s.game?.id || null; ui.roleVisible = false; clearNotebookState(); }
    if (!s.game && s.state !== 'LOBBY') {
      app.innerHTML = shell(s, '<section class="card"><h2>Bu turu izliyorsun</h2><p>Tur başladığında bağlı olmadığın için gizli kart dağıtılmadı. Yeni turda oyuna katılabilirsin.</p><div id="room-chat"></div></section>' + roster(s) + hostPanel(s));
      renderChat(document.getElementById('room-chat'));
    }
    else if (s.state === 'LOBBY') renderLobby(s);
    else if (s.state === 'RESULT') renderResult(s);
    else renderGame(s);
    const input = document.getElementById('chat-input');
    if (input) input.value = chatDraft;
    const notebook = document.querySelector('.v2-notebook');
    if (notebook) notebook.open = notebookOpen;
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
  document.querySelectorAll('.v2-phase-clock').forEach(el => { el.textContent = 'Kalan: ' + Math.ceil(Math.max(0, (g.phaseDeadline || now) - now) / 1000) + ' sn'; });
  if (g.state === 'PLAYING' && g.timer.deadline && remaining > 0 && remaining <= 10 && tickSecond !== remaining) playSFX.tick();
  tickSecond = remaining;
}
function entryDialog(mode, initialCode = '') {
  const name = readStorage('spyhaz_name', '');
  showModal(mode === 'create' ? 'ODA OLUŞTUR' : 'ODAYA KATIL',
    '<form id="entry-form"><label class="v2-label" for="player-name">Adın</label><input class="input" id="player-name" name="name" required minlength="2" maxlength="20" autocomplete="nickname" value="' + e(name) + '">' +
    (mode === 'join' ? '<label class="v2-label" for="room-code">Oda kodu</label><input class="input" id="room-code" name="code" required maxlength="9" autocomplete="off" placeholder="ABC-DEF" value="' + e(initialCode) + '">' : '') +
    '<p id="entry-error" class="v2-error" role="alert"></p><button class="btn btn-primary btn-block" type="submit">' + (mode === 'create' ? 'Oluştur' : 'Katıl') + '</button></form>', { onMount(overlay) {
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
  showModal('TUR AYARLARI', '<form id="settings-form"><label class="v2-label" for="duration">Süre (dakika)</label><input class="input" id="duration" type="number" min="1" max="30" step="1" value="' + s.settings.duration / 60 + '">' +
    action('Önerilen süreyi kullan · ' + recommendedDuration(s.players.filter(p => p.connected).length) / 60 + ' dk', 'recommended') +
    '<label class="v2-label" for="spy-count">Casus sayısı</label><select class="input" id="spy-count"><option value="1">1 casus</option><option value="2"' + (s.settings.spyCount === 2 ? ' selected' : '') + '>2 casus · en az 7 bağlı oyuncu</option></select>' +
    '<p class="v2-muted">İki casus birbirini tanımaz. Birini yakalamak yeterli.</p><label class="v2-check"><input type="checkbox" id="professions"' + (s.settings.professions ? ' checked' : '') + '> Mesleklerle oyna</label><p class="v2-muted">Kapalıyken yalnızca konumu görürsünüz. Meslekler açılırsa kalabalıkta aynı meslek tekrar edebilir.</p><button class="btn btn-primary" type="submit">Ayarları kaydet</button></form>', { onMount(overlay) {
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
  showModal('KİMİ SUÇLUYORSUN?', '<p>Şüpheli dışındaki oyuncular evet/hayır oyu verecek. Bu tur yalnızca bir suçlama başlatabilirsin.</p><div class="v2-targets">' +
    candidates.map(p => '<button class="btn btn-primary" data-suspect="' + e(p.id) + '">' + e(p.name) + '</button>').join('') + '</div>', { onMount(overlay) {
      overlay.querySelectorAll('[data-suspect]').forEach(button => button.onclick = async () => { if (await perform('vote:accuse', { suspectId: button.dataset.suspect }, button)) closeModal(); });
    } });
}
function guessDialog(s) {
  showModal('TEK KONUM TAHMİNİN', '<p>Onayladığında casus olduğunu açıklarsın. Yanlış tahmin geri alınamaz.</p><form id="guess-form"><label class="v2-label" for="guess-location">Konum</label><select class="input" id="guess-location" required><option value="">Bir konum seç</option>' +
    s.game.locations.map(loc => '<option value="' + loc.id + '">' + e(loc.emoji + ' ' + loc.name) + '</option>').join('') +
    '</select><button class="btn btn-danger btn-block" type="submit">Kimliğimi açıkla ve tahmin et</button></form>', { onMount(overlay) {
      overlay.querySelector('#guess-form').onsubmit = async event => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
        if (await perform('spy:guess', { locationId: Number(overlay.querySelector('#guess-location').value) }, event.currentTarget.querySelector('button'))) closeModal();
      };
    } });
}
function presetsDialog(s) {
  const presets = getPresets();
  showModal('HAZIR AYARLAR', '<label class="v2-label" for="preset-list">Kayıtlı ayar seç</label><select class="input" id="preset-list">' + presets.map(p => '<option value="' + e(p.id) + '">' + e(p.name) + '</option>').join('') +
    '<button class="btn btn-primary" id="preset-apply">Seçili ayarı uygula</button><hr><label class="v2-label" for="preset-name">Bu ayarları kaydet</label><input class="input" id="preset-name" maxlength="20" placeholder="Örn. Sınıf oyunu"><button class="btn btn-ghost" id="preset-save">Kaydet</button><hr><label class="v2-label" for="preset-text">Ayarı dışa aktar / içe aktar</label><textarea class="input" id="preset-text" rows="5">' + e(exportPresetText(s.settings)) + '</textarea><button class="btn btn-primary" id="preset-import">Metindeki ayarı uygula</button><p class="v2-muted">Eski ayarlardaki çoklu tahmin hakkı kaldırıldı. En az 10 farklı geçerli konum gerekir.</p>', { onMount(overlay) {
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
  showModal('OYUN GEÇMİŞİM', getHistory().map(g => '<div class="v2-history"><strong>' + e(g.location?.emoji || '📍') + ' ' + e(g.location?.name || '?') + '</strong><span>' + e(g.isSpy ? 'Casus' : 'Oyuncu') + ' · ' + e(reasonText[g.reason] || g.reason || '') + '</span></div>').join('') || '<p>Oynadığın turlar bu tarayıcıda görünecek.</p>');
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
  if (a === 'locations') return openLocationManager(s.settings.enabledLocationIds, ids => perform('room:settings', { enabledLocationIds: ids }));
  if (a === 'presets') return presetsDialog(s);
  if (a === 'role') { ui.roleVisible = !ui.roleVisible; lastSignature = ''; return renderSnapshot(s); }
  if (a === 'accuse') return selectPlayer(s);
  if (a === 'guess') return guessDialog(s);
  if (a === 'kickChat') {
    setState({ kickChatVisible: true, kickChatViewerId: s.playerId });
    return showModal('YAYIN SOHBETİ', '<div id="kick-chat-area"></div>', { onMount() { renderKickChat(document.getElementById('kick-chat-area')); } });
  }
  if (a === 'eliminate') {
    const set = eliminationSet(s), id = Number(button.dataset.location);
    if (set.has(id)) set.delete(id); else set.add(id);
    writeStorage('spyhaz_eliminations_' + s.game.id, JSON.stringify([...set]));
    button.classList.toggle('eliminated', set.has(id)); button.setAttribute('aria-pressed', String(set.has(id))); return;
  }
  if (a === 'abort') return showModal('TURU İPTAL ET', '<p>Bu tur sonuçlandırılmadan kapanır. Kimseye puan yazılmaz.</p><button class="btn btn-danger" id="confirm-abort">Turu puansız iptal et</button>', { onMount(overlay) { overlay.querySelector('#confirm-abort').onclick = async event => { if (await perform('host:abort', {}, event.target)) closeModal(); }; } });
  const target = document.getElementById('host-player')?.value;
  const commands = {
    start: ['game:start'], ready: ['game:ready'], forceReady: ['host:forceReady'],
    target: ['question:select', { targetId: button.dataset.player }], questionDone: ['question:done'], skip: ['host:skip'],
    pause: ['timer:toggle'], transfer: ['host:transfer', { playerId: target }], kick: ['host:kick', { playerId: target }],
    voteYes: ['vote:cast', { accept: true }], voteNo: ['vote:cast', { accept: false }],
    nominate: ['vote:cast', { suspectId: button.dataset.player }], lobby: ['game:lobby'],
  };
  if (commands[a]) await perform(commands[a][0], commands[a][1] || {}, button);
});
window.addEventListener('spyhaz:connection', event => paintConnection(event.detail.error));
window.addEventListener('spyhaz:sessionEnded', event => {
  setState({ snapshot: null, players: [], roomCode: null }); lastSignature = ''; closeModal(); renderHome(); showToast(event.detail, 'warning');
});
window.addEventListener('spyhaz:snapshot', event => {
  const s = event.detail; clockOffset = s.serverNow - Date.now();
  const previousId = ui.roundId;
  if (s.state === 'RESULT' && s.game.result.winner !== 'CANCELLED') saveGameToHistory({
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
if (invite) entryDialog('join', invite);
else restoreSession();
