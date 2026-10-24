// Маршруты, нижнее меню и отрисовка текущего экрана
import { esc } from './core/util.js';
import { ICON } from './core/icons.js';
import { pb } from './core/pb.js';
import { $view, $tabbar, errText, closeSheet } from './ui.js';
import { viewLogin } from './screens/login.js';
import { homeScreen } from './screens/home.js';
import { addScreen, editScreen } from './screens/form.js';
import { calendarScreen } from './screens/calendar.js';
import { historyScreen } from './screens/history.js';
import { reportsScreen } from './screens/reports.js';
import { debtsScreen } from './screens/debts.js';
import { settingsScreen } from './screens/settings.js';

export const TABS = [
  { r: '', label: 'Главная', icon: ICON.home },
  { r: 'calendar', label: 'Платежи', icon: ICON.cal },
  { r: 'add', label: '', icon: ICON.plus, add: true },
  { r: 'reports', label: 'Отчёты', icon: ICON.chart },
  { r: 'debts', label: 'Долги', icon: ICON.debt }
];

export function renderTabbar(active) {
  $tabbar.innerHTML = TABS.map((t) => t.add
    ? `<a class="tab-add" href="#/add" aria-label="Добавить запись">${t.icon}</a>`
    : `<a class="tab" href="#/${t.r}" ${t.r === active ? 'aria-current="page"' : ''}>${t.icon}${t.label}</a>`
  ).join('');
}

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

let renderSeq = 0;

export async function render() {
  closeSheet();
  const seq = ++renderSeq;
  if (!pb.authStore.isValid) { $tabbar.hidden = true; return viewLogin(); }
  const route = parseRoute();
  const fn = ROUTES[route.name] || ROUTES[''];
  const withTabs = !['add', 'edit', 'settings'].includes(route.name);
  $tabbar.hidden = !withTabs;
  $view.classList.toggle('no-tabs', !withTabs);
  if (withTabs) renderTabbar(route.name);
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
