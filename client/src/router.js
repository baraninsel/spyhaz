// Simple Hash-Based Router — with room code persistence in URL
const routes = {};
let currentScreen = null;

export function registerRoute(hash, renderFn) {
  routes[hash] = renderFn;
}

// navigateTo supports room code in URL: navigateTo('lobby') → #lobby/ABC-DEF
let _stateModule = null;
async function getStateModule() {
  if (!_stateModule) _stateModule = await import('./state.js');
  return _stateModule;
}

export function navigateTo(hash) {
  getStateModule().then(({ getState }) => {
    const state = getState();
    // Append room code to lobby/game hashes for URL sharing & bookmark
    if ((hash === 'lobby' || hash === 'game') && state.roomCode) {
      window.location.hash = `${hash}/${state.roomCode}`;
    } else {
      window.location.hash = hash;
    }
  });
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function handleRoute() {
  const rawHash = window.location.hash.slice(1) || 'home';
  // Parse: "lobby/ABC-DEF" → baseHash="lobby", roomCode="ABC-DEF"
  const parts = rawHash.split('/');
  const baseHash = parts[0];
  // roomCode from URL if present (for deep-linking / share URL)
  const urlRoomCode = parts[1] || null;

  const app = document.getElementById('app');

  if (routes[baseHash]) {
    // Fade out current content
    app.style.opacity = '0';
    app.style.transform = 'translateY(10px)';

    setTimeout(() => {
      app.innerHTML = '';
      currentScreen = baseHash;
      routes[baseHash](app, { urlRoomCode });
      // Fade in new content
      requestAnimationFrame(() => {
        app.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        app.style.opacity = '1';
        app.style.transform = 'translateY(0)';
      });
    }, 150);
  }
}

export function getCurrentScreen() {
  return currentScreen;
}

// Get room code from current URL hash (utility for external use)
export function getRoomCodeFromURL() {
  const rawHash = window.location.hash.slice(1) || '';
  const parts = rawHash.split('/');
  return parts[1] || null;
}
