// Маршруты, нижнее меню и отрисовка текущего экрана
import { esc } from './core/util.js';
import { ICON } from './core/icons.js';
import { pb } from './core/pb.js';
import { state } from './core/state.js';
import { $view, $tabbar, $sheetRoot, errText, closeSheet, placeGlow, freezeGlows } from './ui.js';
import { viewLogin } from './screens/login.js';
import { homeScreen } from './screens/home.js';
import { addScreen, editScreen } from './screens/form.js';
import { calendarScreen } from './screens/calendar.js';
import { historyScreen } from './screens/history.js';
import { debtsScreen } from './screens/debts.js';
import { settingsScreen } from './screens/settings.js';
import { overviewScreen } from './screens/overview.js';
import { projectsScreen, projectScreen } from './screens/projects.js';
import { recordsScreen } from './screens/records.js';
import { tasksScreen } from './screens/tasks.js';
import { modeScreen, modeSkipped } from './screens/mode.js';
import { userMode } from './core/data.js';

// desk: true — пункт только в боковой панели на ПК (на телефоне туда ведут ссылки с экранов)
export const TABS = [
  { r: '', label: 'Главная', icon: ICON.home },
  { r: 'tasks', label: 'Дела', icon: ICON.tasks },
  { r: 'add', label: 'Новая запись', icon: ICON.plus, add: true },
  { r: 'overview', label: 'Обзор', icon: ICON.pie, desk: true }, // на телефоне — нажатие на баланс на главной
  { r: 'calendar', label: 'Платежи', icon: ICON.cal },
  { r: 'debts', label: 'Долги', icon: ICON.debt },
  { r: 'projects', label: 'Проекты', icon: ICON.case, desk: true, biz: true }, // biz — только в бизнес-виде (и пока вид не выбран)
  { r: 'records', label: 'Записи', icon: ICON.list, desk: true },
  { r: 'settings', label: 'Настройки', icon: ICON.gear, desk: true }
];

// Последнее место подсветки активного раздела (null — подсветка не показана, следующую ставим без анимации)
let glowFrom = null;

// Меню собирается один раз; при переходах меняется только aria-current — элементы остаются те же,
// поэтому и цвет иконок, и подсветка плывут плавно, даже если переключаться быстро посреди анимации.
export function renderTabbar(active) {
  // Вид аккаунта сменился (Настройки) — пункты меню другие, собираем заново
  if ($tabbar.dataset.book !== state.book) $tabbar.innerHTML = '';
  if (!$tabbar.querySelector('.tab-glow')) {
    $tabbar.dataset.book = state.book;
    // У бизнеса на телефоне вместо «Долгов» — «Проекты» (долги — в полоске на ПК и ссылкой с «Платежей»)
    const tabs = state.book === 'business'
      ? TABS.map((t) => (t.r === 'debts' ? { ...TABS.find((x) => x.r === 'projects'), desk: false } : t.r === 'projects' ? { ...TABS.find((x) => x.r === 'debts'), desk: true } : t))
      : TABS.filter((t) => !t.biz || state.book !== 'personal');
    $tabbar.innerHTML = '<i class="tab-glow" aria-hidden="true"></i><div class="side-brand" title="Финансы"><img src="icons/icon.svg" alt="Финансы" width="40" height="40"></div>' + tabs.map((t) => t.add
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
  // Пункт только для ПК (Проекты, История) на телефоне не виден — подсветку прячем, иначе она осталась бы на прошлом разделе
  if (!cur.offsetWidth && $tabbar.offsetWidth) { glow.style.opacity = '0'; glowFrom = null; return; }
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
  renderTabbar(tabOf(parseRoute().name));
  if (parseRoute().name === '' && !$sheetRoot.innerHTML.trim()) render(); // у главной на ПК и телефоне разная раскладка
});

// Окно поменяло размер — края подсветки считаются от размеров меню, ставим её заново (без анимации)
window.addEventListener('resize', () => {
  if (!pb.authStore.isValid || !$tabbar.querySelector('.tab-glow')) return;
  glowFrom = null;
  renderTabbar(tabOf(parseRoute().name));
});

// Плавная смена экрана: новый экран проявляется (анимация — в app.css)
let shownScreen = null;

// Карточка проекта подсвечивает пункт «Проекты»
// «Обзор» на телефоне открывается с главной (нажатие на баланс) — подсвечиваем «Главную»
const tabOf = (name) => (name === 'project' ? 'projects' : name === 'history' ? 'records' : name === 'overview' && !isDesk() ? '' : name);
const isDesk = () => matchMedia('(min-width: 960px)').matches;

export function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  const [name, id] = path.split('/');
  return { name: name || '', id, params: new URLSearchParams(q || '') };
}

const ROUTES = {
  '': homeScreen, add: addScreen, edit: editScreen, calendar: calendarScreen,
  overview: overviewScreen, history: historyScreen, debts: debtsScreen, settings: settingsScreen,
  projects: projectsScreen, project: projectScreen, records: recordsScreen, tasks: tasksScreen
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
  // Вид аккаунта («для себя / для бизнеса») = книга. Не выбран — сначала окно выбора (у старых аккаунтов — один раз)
  const mode = userMode();
  state.book = mode || 'all';
  if (!mode && !modeSkipped()) {
    $tabbar.hidden = true; $tabbar.innerHTML = ''; glowFrom = null; shownScreen = null;
    $view.dataset.screen = 'mode'; $view.classList.add('no-tabs');
    return modeScreen();
  }
  const route = parseRoute();
  // Проекты — только у бизнеса
  if (state.book === 'personal' && (route.name === 'projects' || route.name === 'project')) { location.replace('#/'); return; }
  // «Отчёты» теперь часть «Обзора»: старые ссылки и закладки ведут туда (replace — без лишнего шага «назад»)
  if (route.name === 'reports') { location.replace('#/overview'); return; }
  // На ПК вместо «Истории» — таблица «Записи», на телефоне наоборот (таблица на узком экране не помещается)
  if (route.name === 'history' && isDesk()) { location.replace('#/records'); return; }
  if (route.name === 'records' && !isDesk()) { location.replace('#/history'); return; }
  const fn = ROUTES[route.name] || ROUTES[''];
  // data-screen — по нему CSS раскладывает экран на ПК в колонки. Ставим вместе с новым содержимым,
  // иначе старый экран на миг перестроится в чужие колонки — отсюда и «дёрганье»
  const screen = ROUTES[route.name] ? (route.name || 'home') : 'home';
  const changing = screen !== shownScreen;
  // Анимация появления — только при переходе в другой раздел. Класс снимаем сразу: если он останется,
  // любая перерисовка того же экрана (переключатель, месяц) снова проиграет появление — экран «гаснет» и мигает
  if (!changing) $view.classList.remove('view-enter');
  // На телефоне в форме и настройках нижнего меню нет; на ПК боковая панель видна всегда (см. app.css)
  const withTabs = !['add', 'edit', 'settings'].includes(route.name);
  $tabbar.hidden = false;
  $tabbar.dataset.mobileHidden = String(!withTabs);
  renderTabbar(tabOf(route.name));
  freezeGlows();
  if (!$view.innerHTML.trim()) $view.innerHTML = '<div class="loading">Загрузка…</div>';
  // Старый экран не затемняем: прозрачность слоя со стеклянными карточками — дорогой кадр, из-за него дёргалась подсветка
  try {
    await fn(route, () => seq === renderSeq);
    if (seq !== renderSeq) return;
    $view.dataset.screen = screen;
    $view.dataset.book = state.book; // CSS: у главной на ПК своя раскладка для «Для себя» и «Для бизнеса»
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
