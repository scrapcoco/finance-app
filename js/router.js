// Маршруты, нижнее меню и отрисовка текущего экрана
import { esc } from './core/util.js';
import { ICON } from './core/icons.js';
import { pb } from './core/pb.js';
import { $view, $tabbar, errText, closeSheet, placeGlow } from './ui.js';
import { viewLogin } from './screens/login.js';
import { homeScreen } from './screens/home.js';
import { addScreen, editScreen } from './screens/form.js';
import { calendarScreen } from './screens/calendar.js';
import { historyScreen } from './screens/history.js';
import { reportsScreen } from './screens/reports.js';
import { debtsScreen } from './screens/debts.js';
import { settingsScreen } from './screens/settings.js';

// desk: true — пункт только в боковой панели на ПК (на телефоне туда ведут ссылки с экранов)
export const TABS = [
  { r: '', label: 'Главная', icon: ICON.home },
  { r: 'calendar', label: 'Платежи', icon: ICON.cal },
  { r: 'add', label: 'Новая запись', icon: ICON.plus, add: true },
  { r: 'reports', label: 'Отчёты', icon: ICON.chart },
  { r: 'debts', label: 'Долги', icon: ICON.debt },
  { r: 'history', label: 'История', icon: ICON.list, desk: true },
  { r: 'settings', label: 'Настройки', icon: ICON.gear, desk: true }
];

// Где стояла подсветка активного раздела до перерисовки — от этого места она переплывает к новому
let glowFrom = null;

export function renderTabbar(active) {
  $tabbar.innerHTML = '<i class="tab-glow" aria-hidden="true"></i><div class="side-brand">Финансы</div>' + TABS.map((t) => t.add
    ? `<a class="tab-add" href="#/add" aria-label="${t.label}" title="${t.label} (N)">${t.icon}<span class="side-label">${t.label}</span></a>`
    : `<a class="tab ${t.desk ? 'desk-only' : ''}" href="#/${t.r}" ${t.r === active ? 'aria-current="page"' : ''}>${t.icon}<span>${t.label}</span></a>`
  ).join('');
  const glow = $tabbar.querySelector('.tab-glow');
  const cur = $tabbar.querySelector('.tab[aria-current="page"]');
  if (!cur) { glow.style.opacity = '0'; glowFrom = null; return; }
  if (!cur.offsetWidth) return; // меню скрыто (форма на телефоне) — прошлое место подсветки помним
  const to = { x: cur.offsetLeft, y: cur.offsetTop, w: cur.offsetWidth, h: cur.offsetHeight };
  placeGlow(glow, { w: $tabbar.clientWidth, h: $tabbar.clientHeight }, to, glowFrom);
  glowFrom = to;
}

// Телефон/ПК поменялись местами (повернули экран, растянули окно) — меню перестраивается, подсветку ставим заново
matchMedia('(min-width: 960px)').addEventListener('change', () => {
  if (!pb.authStore.isValid) return;
  glowFrom = null;
  renderTabbar(parseRoute().name);
});

export function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  const [name, id] = path.split('/');
  return { name: name || '', id, params: new URLSearchParams(q || '') };
}

const ROUTES = {
  '': homeScreen, add: addScreen, edit: editScreen, calendar: calendarScreen,
  history: historyScreen, reports: reportsScreen, debts: debtsScreen, settings: settingsScreen
};

// На главную: смена hash сама вызовет render (hashchange); если уже на главной — рисуем вручную. Без двойной отрисовки.
export function goHome() {
  if (location.hash === '#/') render();
  else location.hash = '#/';
}

let renderSeq = 0;

export async function render() {
  closeSheet();
  const seq = ++renderSeq;
  if (!pb.authStore.isValid) { $tabbar.hidden = true; $view.dataset.screen = 'login'; return viewLogin(); }
  const route = parseRoute();
  const fn = ROUTES[route.name] || ROUTES[''];
  // data-screen — по нему CSS раскладывает экран на ПК в колонки
  $view.dataset.screen = ROUTES[route.name] ? (route.name || 'home') : 'home';
  // На телефоне в форме и настройках нижнего меню нет; на ПК боковая панель видна всегда (см. app.css)
  const withTabs = !['add', 'edit', 'settings'].includes(route.name);
  $tabbar.hidden = false;
  $tabbar.dataset.mobileHidden = String(!withTabs);
  $view.classList.toggle('no-tabs', !withTabs);
  renderTabbar(route.name);
  if (!$view.innerHTML.trim()) $view.innerHTML = '<div class="loading">Загрузка…</div>';
  try {
    await fn(route, () => seq === renderSeq);
  } catch (e) {
    if (e?.status === 401) { pb.authStore.clear(); return render(); }
    if (seq !== renderSeq) return;
    $view.innerHTML = `<div class="empty"><p>${esc(errText(e))}</p><button class="btn small secondary" id="retry">Повторить</button></div>`;
    document.getElementById('retry').onclick = render;
  }
}
