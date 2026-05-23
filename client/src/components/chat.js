// Chat Panel Component
import { getSocket } from '../socket.js';
import { getState, setState } from '../state.js';

export function renderChat(container) {
  const state = getState();

  const panel = document.createElement('div');
  panel.className = 'chat-panel';
  panel.innerHTML = `
    <div class="chat-header" id="chat-toggle">
      <span class="chat-header-title">
        💬 SOHBET
        <span class="chat-unread ${state.unreadCount > 0 ? '' : 'hidden'}" id="chat-unread">${state.unreadCount}</span>
      </span>
      <span class="chat-toggle-icon ${state.chatCollapsed ? 'collapsed' : ''}" id="chat-arrow">▼</span>
    </div>
    <div class="chat-body ${state.chatCollapsed ? 'collapsed' : ''}" id="chat-body"></div>
    <div class="chat-input-area ${state.chatCollapsed ? 'hidden' : ''}" id="chat-input-area">
      <input type="text" class="chat-input" id="chat-input" placeholder="Mesaj yaz..." maxlength="300" />
      <button class="chat-send-btn" id="chat-send">▶</button>
    </div>
  `;

  container.appendChild(panel);

  // Render existing messages
  const body = panel.querySelector('#chat-body');
  state.chatMessages.forEach(msg => appendMessage(body, msg));
  body.scrollTop = body.scrollHeight;

  // Toggle
  panel.querySelector('#chat-toggle').addEventListener('click', () => {
    const collapsed = !state.chatCollapsed;
    setState({ chatCollapsed: collapsed, unreadCount: collapsed ? state.unreadCount : 0 });
    body.classList.toggle('collapsed', collapsed);
    panel.querySelector('#chat-input-area').classList.toggle('hidden', collapsed);
    panel.querySelector('#chat-arrow').classList.toggle('collapsed', collapsed);
    if (!collapsed) {
      panel.querySelector('#chat-unread').classList.add('hidden');
      body.scrollTop = body.scrollHeight;
    }
  });

  // Send message
  const input = panel.querySelector('#chat-input');
  const sendBtn = panel.querySelector('#chat-send');

  function sendMessage() {
    const message = input.value.trim();
    if (!message) return;
    getSocket().emit('chat:send', { message });
    input.value = '';
    input.focus();
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

function appendMessage(container, msg) {
  const state = getState();
  const time = new Date(msg.time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const isMe = msg.senderId === state.playerId;

  const div = document.createElement('div');
  div.className = 'chat-message';
  div.innerHTML = `
    <span class="chat-msg-sender" style="color: ${isMe ? 'var(--accent-cyan)' : 'var(--accent-purple-light)'}">${msg.senderName}:</span>
    <span class="chat-msg-text">${escapeHtml(msg.message)}</span>
    <span class="chat-msg-time">${time}</span>
  `;
  container.appendChild(div);
}

export function handleNewChatMessage(msg) {
  const state = getState();
  state.chatMessages.push(msg);

  // Update DOM if chat is visible
  const body = document.getElementById('chat-body');
  if (body) {
    appendMessage(body, msg);
    if (!state.chatCollapsed) {
      body.scrollTop = body.scrollHeight;
    } else {
      setState({ unreadCount: state.unreadCount + 1 });
      const badge = document.getElementById('chat-unread');
      if (badge) {
        badge.textContent = state.unreadCount;
        badge.classList.remove('hidden');
      }
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
