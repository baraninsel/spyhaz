// Simple Hash-Based Router
const routes = {};
let currentScreen = null;

export function registerRoute(hash, renderFn) {
  routes[hash] = renderFn;
}

export function navigateTo(hash) {
  window.location.hash = hash;
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || 'home';
  const app = document.getElementById('app');

  if (routes[hash]) {
    // Fade out current content
    app.style.opacity = '0';
    app.style.transform = 'translateY(10px)';

    setTimeout(() => {
      app.innerHTML = '';
      currentScreen = hash;
      routes[hash](app);
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
