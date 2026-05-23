// Home Screen
import { getSocket, emitWithCallback } from '../socket.js';
import { getState, setState } from '../state.js';
import { navigateTo } from '../router.js';
import { showModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { getHistory, getStats, clearHistory } from '../utils/history.js';

export function renderHome(container) {

  container.innerHTML = `
    <div class="home-screen">
      <!-- Background Particles -->
      <div class="home-particles"></div>

      <!-- Decorative floating icons -->
      <div class="home-decoration top-left animate-float" style="animation-delay: 0s;">🔍</div>
      <div class="home-decoration top-right animate-float" style="animation-delay: 1s; top: 40px; right: 40px; font-size: 4rem;">📡</div>
      <div class="home-decoration bottom-left animate-float" style="animation-delay: 2s; bottom: 40px; left: 40px; font-size: 5rem; transform: rotate(-15deg);">🗺️</div>
      <div class="home-decoration bottom-right animate-float" style="animation-delay: 1.5s;">🕶️</div>

      <div class="home-content-wrapper">
        <div class="home-logo">
          <span class="spy-emoji">🕵️</span>
          <h1 class="home-title">SPYHAZ</h1>
          <p class="home-subtitle">◆ CASUSU BUL ◆</p>
        </div>

        <div class="home-actions">
          <button class="btn btn-primary btn-pixel btn-block" id="btn-create">
            ODA OLUŞTUR
          </button>
          <button class="btn btn-secondary btn-pixel btn-block" id="btn-join">
            ODAYA KATIL
          </button>
        </div>

        <div class="home-footer">
          <span class="home-footer-link" id="btn-rules">📜 Nasıl Oynanır?</span>
          <span class="home-footer-link" id="btn-history">📊 Oyun Geçmişi</span>
        </div>
      </div>
    </div>
  `;

  // Create Room
  container.querySelector('#btn-create').addEventListener('click', showCreateModal);

  // Join Room
  container.querySelector('#btn-join').addEventListener('click', showJoinModal);

  // Rules
  container.querySelector('#btn-rules').addEventListener('click', showRulesModal);

  // History
  container.querySelector('#btn-history').addEventListener('click', showHistoryModal);
}

function showCreateModal() {
  showModal('ODA OLUŞTUR', `
    <div class="settings-form">
      <div class="input-group">
        <label class="input-label">İsmin</label>
        <input type="text" class="input" id="create-name" placeholder="İsmini gir..." maxlength="20" autocomplete="off" />
      </div>
    </div>
  `, {
    footer: `
      <button class="btn btn-ghost" onclick="document.getElementById('active-modal')?.remove()">İptal</button>
      <button class="btn btn-primary" id="confirm-create">Oluştur</button>
    `,
    onMount: (modal) => {
      modal.querySelector('#confirm-create').addEventListener('click', async () => {
        const name = modal.querySelector('#create-name').value.trim();
        if (!name) { showToast('Lütfen bir isim gir.', 'warning'); return; }
        if (name.length < 2) { showToast('İsim en az 2 karakter olmalı.', 'warning'); return; }

        const res = await emitWithCallback('room:create', { settings: {}, playerName: name });
        if (res.success) {
          setState({
            playerName: name,
            roomCode: res.code,
            isHost: true,
            settings: res.settings,
            players: res.players,
          });
          closeModal();
          navigateTo('lobby');
        } else {
          showToast(res.error || 'Oda oluşturulamadı.', 'error');
        }
      });

      // Focus name input
      modal.querySelector('#create-name').focus();
    }
  });
}

function showJoinModal() {
  showModal('ODAYA KATIL', `
    <div class="join-form">
      <div class="input-group">
        <label class="input-label">İsmin</label>
        <input type="text" class="input" id="join-name" placeholder="İsmini gir..." maxlength="20" autocomplete="off" />
      </div>
      <div class="input-group">
        <label class="input-label">Oda Kodu</label>
        <input type="text" class="input code-input" id="join-code" placeholder="XXX-XXX" maxlength="7" autocomplete="off" />
      </div>
    </div>
  `, {
    footer: `
      <button class="btn btn-ghost" onclick="document.getElementById('active-modal')?.remove()">İptal</button>
      <button class="btn btn-primary" id="confirm-join">Katıl</button>
    `,
    onMount: (modal) => {
      const codeInput = modal.querySelector('#join-code');
      // Auto-format code with dash
      codeInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (val.length > 3) val = val.slice(0, 3) + '-' + val.slice(3, 6);
        e.target.value = val;
      });

      modal.querySelector('#confirm-join').addEventListener('click', async () => {
        const name = modal.querySelector('#join-name').value.trim();
        const code = codeInput.value.trim();
        if (!name) { showToast('Lütfen bir isim gir.', 'warning'); return; }
        if (name.length < 2) { showToast('İsim en az 2 karakter olmalı.', 'warning'); return; }
        if (code.length < 7) { showToast('Geçerli bir oda kodu gir.', 'warning'); return; }

        const res = await emitWithCallback('room:join', { code, playerName: name });
        if (res.success) {
          setState({
            playerName: name,
            roomCode: res.code,
            isHost: res.hostId === res.playerId,
            settings: res.settings,
            players: res.players,
          });
          closeModal();
          navigateTo('lobby');
        } else {
          showToast(res.error || 'Odaya katılınamadı.', 'error');
        }
      });

      modal.querySelector('#join-name').focus();
    }
  });
}

function showRulesModal() {
  showModal('NASIL OYNANIR?', `
    <div class="rules-content">
      <p>Spyhaz, 3-8 kişiyle oynanan bir sosyal dedüksiyon oyunudur.</p>

      <h3>🎯 Amaç</h3>
      <p><strong>Oyuncular:</strong> Aralarındaki casusu bulmaya çalışır.</p>
      <p><strong>Casus:</strong> Konumun neresi olduğunu bulmaya çalışır.</p>

      <h3>🎮 Oyun Akışı</h3>
      <ul>
        <li>Herkese aynı konum ve o konuma özel bir rol atanır</li>
        <li>Bir kişi gizlice <strong>casus</strong> seçilir — casus konumu göremez</li>
        <li>Sırayla birbirinize sorular sorarsınız</li>
        <li>Cevaplardan casusu veya konumu çıkarmaya çalışın</li>
      </ul>

      <h3>🗳️ Oylama</h3>
      <ul>
        <li>Herhangi biri oylama başlatabilir</li>
        <li>Çoğunluk kabul ederse herkes oy verir</li>
        <li>En çok oy alan suçlanır</li>
        <li><strong>Doğru suçlama:</strong> Oyuncular kazanır!</li>
        <li><strong>Yanlış suçlama:</strong> Casus kazanır!</li>
      </ul>

      <h3>🕵️ Casus Tahmini</h3>
      <ul>
        <li>Casus istediği zaman konumu tahmin edebilir</li>
        <li>Doğru tahmin = Casus kazanır</li>
        <li>Tahmin hakkı ayarlanabilir (varsayılan: 2)</li>
      </ul>

      <h3>⏱️ Süre</h3>
      <p>Süre dolduğunda casus kazanır!</p>
    </div>
  `);
}

function showHistoryModal() {
  const history = getHistory();
  const stats = getStats();

  let statsHTML = '';
  if (stats) {
    statsHTML = `
      <div style="display: flex; gap: var(--sp-4); margin-bottom: var(--sp-4); flex-wrap: wrap;">
        <div class="card" style="flex: 1; text-align: center; padding: var(--sp-3); min-width: 80px;">
          <div style="font-family: var(--font-pixel); font-size: var(--fs-lg); color: var(--accent-cyan);">${stats.totalGames}</div>
          <div style="font-size: var(--fs-xs); color: var(--text-secondary);">Toplam</div>
        </div>
        <div class="card" style="flex: 1; text-align: center; padding: var(--sp-3); min-width: 80px;">
          <div style="font-family: var(--font-pixel); font-size: var(--fs-lg); color: var(--success);">${stats.winRate}%</div>
          <div style="font-size: var(--fs-xs); color: var(--text-secondary);">Kazanma</div>
        </div>
        <div class="card" style="flex: 1; text-align: center; padding: var(--sp-3); min-width: 80px;">
          <div style="font-family: var(--font-pixel); font-size: var(--fs-lg); color: var(--danger);">${stats.spyGames}</div>
          <div style="font-size: var(--fs-xs); color: var(--text-secondary);">Casus</div>
        </div>
      </div>
    `;
  }

  const historyHTML = history.length === 0
    ? '<div class="history-empty">Henüz oyun geçmişi yok.</div>'
    : `<div class="history-list">${history.map(g => {
        const date = new Date(g.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const won = (g.isSpy && g.winner === 'SPY') || (!g.isSpy && g.winner === 'PLAYERS');
        return `
          <div class="history-item">
            <span>${g.location?.emoji || '📍'}</span>
            <span class="history-item-location">${g.location?.name || '?'}</span>
            <span class="history-item-role">${g.isSpy ? '🕵️ Casus' : g.role}</span>
            <span class="history-item-result ${won ? 'text-success' : 'text-danger'}">${won ? 'KAZANDI' : 'KAYBETTİ'}</span>
            <span class="history-item-date">${date}</span>
          </div>
        `;
      }).join('')}</div>`;

  showModal('OYUN GEÇMİŞİ', statsHTML + historyHTML);
}
