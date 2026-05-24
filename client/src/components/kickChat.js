// Kick Chat Integration Component - Fully collapsible
import { getState, setState } from '../state.js';

/**
 * Renders the Kick chat panel for the streamer.
 * Fully collapsible - when collapsed, nothing remains visible.
 * Can be collapsed without entering a username.
 */
export function renderKickChat(container) {
  const state = getState();

  // Only show to the designated viewer (streamer)
  if (state.kickChatViewerId && state.playerId !== state.kickChatViewerId) {
    container.style.display = 'none';
    return;
  }

  // If chat panel is collapsed, show nothing - the toggle button is in the topbar
  if (!state.kickChatVisible) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';

  const panel = document.createElement('div');
  panel.className = 'kick-chat-panel';
  panel.id = 'kick-chat-panel';

  if (state.kickUsername) {
    // Has a username - show the chat
    panel.innerHTML = `
      <div class="kick-chat-header" id="kick-chat-header">
        <div class="kick-chat-header-left">
          <span class="kick-chat-logo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M2 4.5A2.5 2.5 0 014.5 2h15A2.5 2.5 0 0122 4.5v15a2.5 2.5 0 01-2.5 2.5h-15A2.5 2.5 0 012 19.5v-15z" fill="#53fc18"/>
              <path d="M8 6v12h2.5v-4.5L13 16h3l-3.5-5L16 7h-3l-2.5 3.5V6H8z" fill="#000"/>
            </svg>
          </span>
          <span class="kick-chat-title">KICK CHAT</span>
          <span class="kick-chat-channel">@${escapeHtml(state.kickUsername)}</span>
        </div>
        <div class="kick-chat-header-right">
          <button class="kick-chat-close-btn" id="kick-chat-disconnect" title="Bağlantıyı Kes">🔌</button>
          <button class="kick-chat-close-btn" id="kick-chat-collapse" title="Paneli Kapat">▼</button>
        </div>
      </div>
      <div class="kick-chat-body" id="kick-chat-body">
        <iframe
          id="kick-chat-iframe"
          src="https://kick.com/popout/${encodeURIComponent(state.kickUsername)}/chat"
          class="kick-chat-iframe"
          allow="autoplay; encrypted-media"
          allowfullscreen
        ></iframe>
        <div class="kick-chat-iframe-fallback hidden" id="kick-chat-fallback">
          <div class="kick-chat-fallback-icon">📡</div>
          <div class="kick-chat-fallback-text">Chat yüklenemedi</div>
          <button class="btn btn-sm btn-ghost" id="kick-chat-try-alt">Alternatif Dene</button>
        </div>
      </div>
    `;
  } else {
    // No username yet - show input
    panel.innerHTML = `
      <div class="kick-chat-header">
        <div class="kick-chat-header-left">
          <span class="kick-chat-logo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M2 4.5A2.5 2.5 0 014.5 2h15A2.5 2.5 0 0122 4.5v15a2.5 2.5 0 01-2.5 2.5h-15A2.5 2.5 0 012 19.5v-15z" fill="#53fc18"/>
              <path d="M8 6v12h2.5v-4.5L13 16h3l-3.5-5L16 7h-3l-2.5 3.5V6H8z" fill="#000"/>
            </svg>
          </span>
          <span class="kick-chat-title">KICK CHAT</span>
        </div>
        <div class="kick-chat-header-right">
          <button class="kick-chat-close-btn" id="kick-chat-collapse" title="Paneli Kapat">▼</button>
        </div>
      </div>
      <div class="kick-chat-setup" id="kick-chat-setup">
        <div class="kick-chat-setup-icon">📺</div>
        <div class="kick-chat-setup-text">Kick kanal adını girerek canlı chat'i buraya bağla</div>
        <div class="kick-chat-setup-input-wrap">
          <span class="kick-chat-setup-prefix">kick.com/</span>
          <input 
            type="text" 
            class="kick-chat-setup-input" 
            id="kick-username-input" 
            placeholder="kullanıcıadı" 
            maxlength="50"
            autocomplete="off"
          />
        </div>
        <button class="btn btn-sm kick-chat-connect-btn" id="kick-chat-connect">
          ⚡ BAĞLAN
        </button>
      </div>
    `;
  }

  container.appendChild(panel);

  // Collapse button (always present) - fully hides the panel
  const collapseBtn = panel.querySelector('#kick-chat-collapse');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      setState({ kickChatVisible: false });
      // Update layout - remove streamer class and hide sidebar
      const gameContent = document.querySelector('.game-content');
      if (gameContent) gameContent.classList.remove('game-content-streamer');
      const sidebar = document.getElementById('kick-chat-area');
      if (sidebar) sidebar.style.display = 'none';
      // Show the topbar toggle button
      const topbarToggle = document.getElementById('btn-kick-toggle');
      if (topbarToggle) topbarToggle.style.display = '';
    });
  }

  // Event listeners for connected state
  if (state.kickUsername) {
    // Disconnect button - remove username but keep panel open
    const disconnectBtn = panel.querySelector('#kick-chat-disconnect');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => {
        setState({ kickUsername: '' });
        rerenderKickChat();
      });
    }

    // Iframe load error fallback
    const iframe = panel.querySelector('#kick-chat-iframe');
    if (iframe) {
      iframe.addEventListener('load', () => {
        try {
          const doc = iframe.contentDocument;
          if (doc && doc.body && doc.body.innerHTML === '') {
            showFallback();
          }
        } catch (e) {
          // Cross-origin - expected
        }
      });

      iframe.addEventListener('error', () => {
        showFallback();
      });
    }

    // Fallback alt source button
    const altBtn = panel.querySelector('#kick-chat-try-alt');
    if (altBtn) {
      altBtn.addEventListener('click', () => {
        const currentIframe = document.getElementById('kick-chat-iframe');
        if (currentIframe) {
          const username = getState().kickUsername;
          currentIframe.src = `https://chat.kick.cx/embed/${encodeURIComponent(username)}`;
          const fallback = document.getElementById('kick-chat-fallback');
          if (fallback) fallback.classList.add('hidden');
          currentIframe.classList.remove('hidden');
        }
      });
    }
  } else {
    // Connect button
    const connectBtn = panel.querySelector('#kick-chat-connect');
    const usernameInput = panel.querySelector('#kick-username-input');

    if (connectBtn && usernameInput) {
      const doConnect = () => {
        const username = usernameInput.value.trim();
        if (!username) return;
        setState({ kickUsername: username });
        rerenderKickChat();
      };

      connectBtn.addEventListener('click', doConnect);
      usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doConnect();
      });
    }
  }
}

function showFallback() {
  const iframe = document.getElementById('kick-chat-iframe');
  const fallback = document.getElementById('kick-chat-fallback');
  if (iframe) iframe.classList.add('hidden');
  if (fallback) fallback.classList.remove('hidden');
}

function rerenderKickChat() {
  const container = document.getElementById('kick-chat-area');
  if (container) {
    container.innerHTML = '';
    renderKickChat(container);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
