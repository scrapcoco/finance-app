// Точка входа: запуск роутера, обновление сессии, service worker
import { state } from './core/state.js';
import { pb } from './core/pb.js';
import { render } from './router.js';

window.addEventListener('hashchange', render);

pb.authStore.onChange(() => { if (!pb.authStore.isValid) state.cache = { cats: null, fields: null, debts: null }; });

if (pb.authStore.isValid) {
  pb.collection('users').authRefresh().catch((e) => { if (e.status === 401 || e.status === 403) { pb.authStore.clear(); render(); } });
}

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
