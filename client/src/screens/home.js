// Home Screen
import { getSocket, emitWithCallback } from '../socket.js';
import { getState, setState, saveSession } from '../state.js';
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
  container.querySelector('#btn-join').addEventListener('click', () => showJoinModal());

  // Rules
  container.querySelector('#btn-rules').addEventListener('click', showRulesModal);

  // History
  container.querySelector('#btn-history').addEventListener('click', showHistoryModal);

  // Auto-open join if code is in URL
  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('code');
  if (codeParam) {
    // Small delay to let the screen render properly
    setTimeout(() => showJoinModal(codeParam), 100);
    // Remove code from URL without reloading
    window.history.replaceState({}, document.title, window.location.pathname);
  }
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
            playerId: res.playerId,
            playerName: name,
            roomCode: res.code,
            isHost: true,
            settings: res.settings,
            players: res.players,
            reconnectToken: res.reconnectToken || null,
          });
          saveSession();
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

function showJoinModal(initialCode = '') {
  showModal('ODAYA KATIL', `
    <div class="join-form">
      <div class="input-group">
        <label class="input-label">İsmin</label>
        <input type="text" class="input" id="join-name" placeholder="İsmini gir..." maxlength="20" autocomplete="off" />
      </div>
      <div class="input-group">
        <label class="input-label">Oda Kodu</label>
        <input type="text" class="input code-input" id="join-code" value="${initialCode}" placeholder="XXX-XXX" maxlength="7" autocomplete="off" />
      </div>
    </div>
  `, {
    footer: `
      <button class="btn btn-ghost" onclick="document.getElementById('active-modal')?.remove()">İptal</button>
      <button class="btn btn-primary" id="confirm-join">Katıl</button>
    `,
    onMount: (modal) => {
      const codeInput = modal.querySelector('#join-code');
      // Format initial code if any
      if (codeInput.value) {
        let val = codeInput.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (val.length > 3) val = val.slice(0, 3) + '-' + val.slice(3, 6);
        codeInput.value = val;
      }

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
            playerId: res.playerId,
            playerName: name,
            roomCode: res.code,
            isHost: res.hostId === res.playerId,
            settings: res.settings,
            players: res.players,
            reconnectToken: res.reconnectToken || null,
          });
          saveSession();
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
  const steps = [
    {
      emoji: '🎯',
      title: 'Amaç',
      desc: 'Oyuncular aralarındaki casusu bulmaya çalışır. Casus ise gizlice konumun neresi olduğunu tahmin etmeye çalışır.',
      visual: `
        <div class="tut-visual tut-vs-aim">
          <div class="tut-vs-group">
            <span class="tut-vs-icon tut-bounce" style="animation-delay:0s">👤</span>
            <span class="tut-vs-icon tut-bounce" style="animation-delay:.15s">👤</span>
            <span class="tut-vs-icon tut-bounce" style="animation-delay:.3s">👤</span>
          </div>
          <span class="tut-vs-versus">VS</span>
          <div class="tut-vs-group">
            <span class="tut-vs-icon tut-bounce tut-spy-glow" style="animation-delay:.45s">🕵️</span>
          </div>
        </div>`
    },
    {
      emoji: '🃏',
      title: 'Roller',
      desc: 'Herkese aynı konum ve o konuma özel bir rol atanır. Ancak bir kişi gizlice casus seçilir — casus konumu göremez!',
      visual: `
        <div class="tut-visual tut-vs-roles">
          <div class="tut-card tut-card-flip" style="animation-delay:0s">
            <div class="tut-card-inner">
              <div class="tut-card-front">❓</div>
              <div class="tut-card-back">🏥<span>Doktor</span></div>
            </div>
          </div>
          <div class="tut-card tut-card-flip" style="animation-delay:.3s">
            <div class="tut-card-inner">
              <div class="tut-card-front">❓</div>
              <div class="tut-card-back">🏥<span>Hemşire</span></div>
            </div>
          </div>
          <div class="tut-card tut-card-flip" style="animation-delay:.6s">
            <div class="tut-card-inner">
              <div class="tut-card-front">❓</div>
              <div class="tut-card-back tut-card-spy">🕵️<span>Casus</span></div>
            </div>
          </div>
        </div>`
    },
    {
      emoji: '❓',
      title: 'Sorular',
      desc: 'Sırayla birbirinize sorular sorun ve cevaplara dikkat edin. Cevaplardan casusu veya konumu çıkarmaya çalışın!',
      visual: `
        <div class="tut-visual tut-vs-chat">
          <div class="tut-bubble tut-bubble-left tut-fade-in" style="animation-delay:.2s">
            <strong>Ali:</strong> Burada ne giyersin?
          </div>
          <div class="tut-bubble tut-bubble-right tut-fade-in" style="animation-delay:.8s">
            <strong>Ayşe:</strong> Rahat bir şey 😊
          </div>
          <div class="tut-bubble tut-bubble-left tut-fade-in" style="animation-delay:1.4s">
            <strong>Mehmet:</strong> Hmm... ilginç 🤔
          </div>
        </div>`
    },
    {
      emoji: '🗳️',
      title: 'Oylama',
      desc: 'Şüphelendiğin kişi için oylama başlat! Çoğunluk kabul ederse herkes oy verir. En çok oyu alan suçlanır.',
      visual: `
        <div class="tut-visual tut-vs-vote">
          <div class="tut-vote-bar tut-bar-fill" style="--bar-w:80%;animation-delay:.3s">
            <span>Mehmet</span><span>4 oy</span>
          </div>
          <div class="tut-vote-bar tut-bar-fill" style="--bar-w:40%;animation-delay:.6s">
            <span>Ali</span><span>2 oy</span>
          </div>
          <div class="tut-vote-bar tut-bar-fill" style="--bar-w:20%;animation-delay:.9s">
            <span>Ayşe</span><span>1 oy</span>
          </div>
        </div>`
    },
    {
      emoji: '🕵️',
      title: 'Casus Tahmini',
      desc: 'Casus istediği an konumu tahmin edebilir. Doğru tahmin = Casus kazanır! Tahmin hakkı sınırlıdır (varsayılan: 2).',
      visual: `
        <div class="tut-visual tut-vs-guess">
          <div class="tut-guess-grid">
            <span class="tut-guess-loc tut-fade-in" style="animation-delay:.1s">🏫 Okul</span>
            <span class="tut-guess-loc tut-fade-in" style="animation-delay:.2s">🏥 Hastane</span>
            <span class="tut-guess-loc tut-guess-pick tut-fade-in" style="animation-delay:.3s">✈️ Havalimanı</span>
            <span class="tut-guess-loc tut-fade-in" style="animation-delay:.4s">🏦 Banka</span>
            <span class="tut-guess-loc tut-fade-in" style="animation-delay:.5s">🚢 Gemi</span>
            <span class="tut-guess-loc tut-fade-in" style="animation-delay:.6s">🎪 Sirk</span>
          </div>
        </div>`
    },
    {
      emoji: '🏆',
      title: 'Puanlama',
      desc: 'Her tur sonunda kazananlara puan verilir. İstediğiniz kadar tur oynayın — en yüksek puanlı oyuncu genel kazanan!',
      visual: `
        <div class="tut-visual tut-vs-score">
          <div class="tut-score-section tut-fade-in" style="animation-delay:.1s">
            <div class="tut-score-header">🕵️ Casus Kazanırsa</div>
            <div class="tut-score-row">
              <span class="tut-score-label">Süre doldu (kimse suçlanmadı)</span>
              <span class="tut-score-pts tut-pts-cyan">+2 puan</span>
            </div>
            <div class="tut-score-row">
              <span class="tut-score-label">Yanlış kişi suçlandı</span>
              <span class="tut-score-pts tut-pts-cyan">+4 puan</span>
            </div>
            <div class="tut-score-row">
              <span class="tut-score-label">Konumu doğru tahmin etti</span>
              <span class="tut-score-pts tut-pts-cyan">+4 puan</span>
            </div>
          </div>
          <div class="tut-score-section tut-fade-in" style="animation-delay:.5s">
            <div class="tut-score-header">👥 Oyuncular Kazanırsa</div>
            <div class="tut-score-row">
              <span class="tut-score-label">Her oyuncu</span>
              <span class="tut-score-pts tut-pts-purple">+1 puan</span>
            </div>
            <div class="tut-score-row">
              <span class="tut-score-label">Oylamayı başlatan oyuncu</span>
              <span class="tut-score-pts tut-pts-purple">+2 puan</span>
            </div>
          </div>
        </div>`
    },
    {
      emoji: '⏱️',
      title: 'Süre',
      desc: 'Her tur için süre belirlenir. Süre dolduğunda kimse casusu bulamadıysa, casus otomatik olarak kazanır!',
      visual: `
        <div class="tut-visual tut-vs-timer">
          <div class="tut-timer-circle">
            <svg viewBox="0 0 100 100" class="tut-timer-svg">
              <circle cx="50" cy="50" r="42" class="tut-timer-track"/>
              <circle cx="50" cy="50" r="42" class="tut-timer-fill tut-timer-animate"/>
            </svg>
            <span class="tut-timer-text">0:00</span>
          </div>
          <div class="tut-timer-label tut-fade-in" style="animation-delay:1s">⚠️ Süre doldu — Casus kazanır!</div>
        </div>`
    }
  ];

  const totalSteps = steps.length;

  const slidesHTML = steps.map((s, i) => `
    <div class="tut-slide" data-step="${i}">
      <div class="tut-step-emoji">${s.emoji}</div>
      <h3 class="tut-step-title">${s.title}</h3>
      <p class="tut-step-desc">${s.desc}</p>
      ${s.visual}
    </div>
  `).join('');

  const dotsHTML = steps.map((_, i) => `<span class="tut-dot${i === 0 ? ' active' : ''}" data-dot="${i}"></span>`).join('');

  showModal('NASIL OYNANIR?', `
    <div class="tut-container">
      <div class="tut-track">${slidesHTML}</div>
      <div class="tut-dots">${dotsHTML}</div>
      <div class="tut-nav">
        <button class="btn btn-ghost tut-btn-prev" disabled>← Geri</button>
        <span class="tut-counter">1 / ${totalSteps}</span>
        <button class="btn btn-primary tut-btn-next">İleri →</button>
      </div>
    </div>
  `, {
    onMount: (modal) => {
      let current = 0;
      const track = modal.querySelector('.tut-track');
      const dots = modal.querySelectorAll('.tut-dot');
      const prevBtn = modal.querySelector('.tut-btn-prev');
      const nextBtn = modal.querySelector('.tut-btn-next');
      const counter = modal.querySelector('.tut-counter');

      function goTo(idx) {
        if (idx < 0 || idx >= totalSteps) return;
        current = idx;
        track.style.transform = `translateX(-${current * 100}%)`;
        dots.forEach((d, i) => d.classList.toggle('active', i === current));
        prevBtn.disabled = current === 0;
        nextBtn.textContent = current === totalSteps - 1 ? 'Kapat ✕' : 'İleri →';
        counter.textContent = `${current + 1} / ${totalSteps}`;
        // Restart animations for current slide
        const slide = track.children[current];
        slide.querySelectorAll('[class*="tut-"]').forEach(el => {
          el.style.animation = 'none';
          el.offsetHeight; // reflow
          el.style.animation = '';
        });
      }

      prevBtn.addEventListener('click', () => goTo(current - 1));
      nextBtn.addEventListener('click', () => {
        if (current === totalSteps - 1) { closeModal(); return; }
        goTo(current + 1);
      });
      dots.forEach(d => d.addEventListener('click', () => goTo(Number(d.dataset.dot))));

      // Keyboard nav
      const keyHandler = (e) => {
        if (e.key === 'ArrowRight') goTo(current + 1);
        else if (e.key === 'ArrowLeft') goTo(current - 1);
      };
      document.addEventListener('keydown', keyHandler);
      // Cleanup on modal close
      const observer = new MutationObserver(() => {
        if (!document.getElementById('active-modal')) {
          document.removeEventListener('keydown', keyHandler);
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });
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
