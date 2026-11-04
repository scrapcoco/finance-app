// Маршруты, нижнее меню и отрисовка текущего экрана
import { esc } from './core/util.js';
import { ICON } from './core/icons.js';
import { pb } from './core/pb.js';
import { $view, $tabbar, errText, closeSheet, placeGlow, freezeGlows } from './ui.js';
import { viewLogin } from './screens/login.js';
import { homeScreen } from './screens/home.js';
import { addScreen, editScreen } from './screens/form.js';
import { calendarScreen } from './screens/calendar.js';
import { historyScreen } from './screens/history.js';
import { reportsScreen } from './screens/reports.js';
import { debtsScreen } from './screens/debts.js';
import { settingsScreen } from './screens/settings.js';
import { overviewScreen } from './screens/overview.js';

// desk: true — пункт только в боковой панели на ПК (на телефоне туда ведут ссылки с экранов)
export const TABS = [
  { r: '', label: 'Главная', icon: ICON.home },
  { r: 'overview', label: 'Обзор', icon: ICON.pie },
  { r: 'calendar', label: 'Платежи', icon: ICON.cal },
  { r: 'add', label: 'Новая запись', icon: ICON.plus, add: true },
  { r: 'reports', label: 'Отчёты', icon: ICON.chart },
  { r: 'debts', label: 'Долги', icon: ICON.debt },
  { r: 'history', label: 'История', icon: ICON.list, desk: true },
  { r: 'settings', label: 'Настройки', icon: ICON.gear, desk: true }
];

// Последнее место подсветки активного раздела (null — подсветка не показана, следующую ставим без анимации)
let glowFrom = null;

// Меню собирается один раз; при переходах меняется только aria-current — элементы остаются те же,
// поэтому и цвет иконок, и подсветка плывут плавно, даже если переключаться быстро посреди анимации.
export function renderTabbar(active) {
  if (!$tabbar.querySelector('.tab-glow')) {
    $tabbar.innerHTML = '<i class="tab-glow" aria-hidden="true"></i><div class="side-brand" title="Финансы"><img src="icons/icon.svg" alt="Финансы" width="40" height="40"></div>' + TABS.map((t) => t.add
      ? `<a class="tab-add" href="#/add" aria-label="${t.label}" data-label="${t.label} · N">${t.icon}<span class="side-label">${t.label}</span></a>`
      : `<a class="tab ${t.desk ? 'desk-only' : ''}" href="#/${t.r}" data-r="${t.r}" data-label="${t.label}" aria-label="${t.label}">${t.icon}<span>${t.label}</span></a>`
    ).join('');
    glowFrom = null;
  }
  $tabbar.querySelectorAll('.tab').forEach((a) => {
    if (a.dataset.r === active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const glow = $tabbar.querySelector('.tab-glow');
  const cur = $tabbar.querySelector('.tab[aria-current="page"]');
  if (!cur) { glow.style.opacity = '0'; glowFrom = null; return; }
  if (!cur.offsetWidth) return; // меню скрыто (форма на телефоне) — подсветка остаётся где была и потом поплывёт оттуда
  const to = { x: cur.offsetLeft, y: cur.offsetTop, w: cur.offsetWidth, h: cur.offsetHeight };
  // live: подсветка уже на экране — едет из того места, где она сейчас (без прыжка в «старую» точку)
  placeGlow(glow, $tabbar, to, glowFrom, glowFrom !== null);
  glowFrom = to;
}

// Телефон/ПК поменялись местами (повернули экран, растянули окно) — координаты другие, подсветку ставим заново
matchMedia('(min-width: 960px)').addEventListener('change', () => {
  if (!pb.authStore.isValid) return;
  glowFrom = null;
  renderTabbar(parseRoute().name);
});

// Окно поменяло размер — края подсветки считаются от размеров меню, ставим её заново (без анимации)
window.addEventListener('resize', () => {
  if (!pb.authStore.isValid || !$tabbar.querySelector('.tab-glow')) return;
  glowFrom = null;
  renderTabbar(parseRoute().name);
});

// Плавная смена экрана: новый экран проявляется (анимация — в app.css)
let shownScreen = null;

export function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  const [name, id] = path.split('/');
  return { name: name || '', id, params: new URLSearchParams(q || '') };
}

const ROUTES = {
  '': homeScreen, add: addScreen, edit: editScreen, calendar: calendarScreen,
  overview: overviewScreen, history: historyScreen, reports: reportsScreen, debts: debtsScreen, settings: settingsScreen
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
  if (!pb.authStore.isValid) {
    $tabbar.hidden = true; $tabbar.innerHTML = ''; glowFrom = null; shownScreen = null;
    $view.dataset.screen = 'login'; $view.classList.remove('view-enter');
    return viewLogin();
  }
  const route = parseRoute();
  const fn = ROUTES[route.name] || ROUTES[''];
  // data-screen — по нему CSS раскладывает экран на ПК в колонки. Ставим вместе с новым содержимым,
  // иначе старый экран на миг перестроится в чужие колонки — отсюда и «дёрганье»
  const screen = ROUTES[route.name] ? (route.name || 'home') : 'home';
  const changing = screen !== shownScreen;
  // На телефоне в форме и настройках нижнего меню нет; на ПК боковая панель видна всегда (см. app.css)
  const withTabs = !['add', 'edit', 'settings'].includes(route.name);
  $tabbar.hidden = false;
  $tabbar.dataset.mobileHidden = String(!withTabs);
  renderTabbar(route.name);
  freezeGlows();
  if (!$view.innerHTML.trim()) $view.innerHTML = '<div class="loading">Загрузка…</div>';
  // Старый экран не затемняем: прозрачность слоя со стеклянными карточками — дорогой кадр, из-за него дёргалась подсветка
  try {
    await fn(route, () => seq === renderSeq);
    if (seq !== renderSeq) return;
    $view.dataset.screen = screen;
    $view.classList.toggle('no-tabs', !withTabs);
    if (changing) {
      // Перезапуск анимации появления
      $view.classList.remove('view-enter'); void $view.offsetWidth; $view.classList.add('view-enter');
      window.scrollTo(0, 0);
    }
    shownScreen = screen;
  } catch (e) {
    shownScreen = null; // экран ошибки — следующий экран снова появится плавно
    if (e?.status === 401) { pb.authStore.clear(); return render(); }
    if (seq !== renderSeq) return;
    $view.innerHTML = `<div class="empty"><p>${esc(errText(e))}</p><button class="btn small secondary" id="retry">Повторить</button></div>`;
    document.getElementById('retry').onclick = render;
  }
}
