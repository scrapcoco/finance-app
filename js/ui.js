// Общие элементы интерфейса: тост, ошибки, нижние окна, строка записи, переключатель месяца
import { esc, signed, MONTHS, MONTHS_SHORT, REPEAT_SHORT, parseYmd, txDay, addMonths, shortDate, daysUntil, whenLabel } from './core/util.js';
import { ICON } from './core/icons.js';
import { state } from './core/state.js';
import { render } from './router.js';

export const $view = document.getElementById('view');

export const $tabbar = document.getElementById('tabbar');

export const $sheetRoot = document.getElementById('sheet-root');

export const $toast = document.getElementById('toast');

let toastTimer;

export function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, 2600);
}

export function errText(e) {
  if (!e) return 'Что-то пошло не так.';
  if (e.status === 0) return 'Сервер не отвечает. Проверь интернет.';
  if (e.status === 401 || e.status === 403) return 'Нет доступа. Войди заново.';
  if (e.status === 429) return 'Слишком много запросов. Подожди пару секунд.';
  const data = e.response?.data;
  if (data && typeof data === 'object') {
    const first = Object.entries(data)[0];
    if (first) return `Поле «${first[0]}»: ${first[1].message || 'ошибка'}`;
  }
  return e.response?.message || e.message || 'Что-то пошло не так.';
}

export function monthSwitch() {
  const m = state.month;
  return `<div class="month-switch">
    <button class="icon-btn ghost" data-m="-1" aria-label="Предыдущий месяц">${ICON.left}</button>
    <div class="title">${MONTHS[m.getMonth()]} ${m.getFullYear()}</div>
    <button class="icon-btn ghost" data-m="1" aria-label="Следующий месяц">${ICON.right}</button>
  </div>`;
}

export function bindMonthSwitch() {
  $view.querySelectorAll('[data-m]').forEach((b) => {
    b.onclick = () => { state.month = addMonths(state.month, Number(b.dataset.m)); render(); };
  });
}

export function txRow(t, opts = {}) {
  const cat = t.expand?.category?.name;
  const title = t.kind === 'adjust' ? (t.note || 'Остаток на руках') : (t.note || cat || (t.kind === 'income' ? 'Доход' : 'Расход'));
  const metaParts = [];
  if (opts.planned) {
    if (t.repeat && t.repeat !== 'none') metaParts.push(REPEAT_SHORT[t.repeat]);
    metaParts.push(whenLabel(txDay(t)));
  } else {
    metaParts.push(shortDate(txDay(t)));
    if (cat && t.note) metaParts.push(cat);
  }
  const d = parseYmd(txDay(t));
  const lead = opts.planned
    ? `<div class="datebox ${daysUntil(txDay(t)) < 0 ? 'overdue' : ''}"><b>${d.getDate()}</b><span>${MONTHS_SHORT[d.getMonth()]}</span></div>`
    : '';
  return `<a class="row" href="#/edit/${t.id}${opts.back ? `?back=${opts.back}` : ''}">
    ${lead}
    <div class="main"><div class="name">${esc(title)}</div><div class="meta">${esc(metaParts.join(', '))}</div></div>
    <div class="amt ${t.kind === 'income' ? 'inc' : t.kind === 'expense' ? 'exp' : ''}">${signed(t.amount, t.kind)}</div>
  </a>`;
}

export function openSheet(html, bind) {
  $sheetRoot.innerHTML = `<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const bd = $sheetRoot.firstElementChild;
  bd.addEventListener('click', (e) => { if (e.target === bd) closeSheet(); });
  bind(bd.querySelector('.sheet'));
  const first = bd.querySelector('input, select');
  if (first) setTimeout(() => first.focus(), 50);
}

export function closeSheet() { $sheetRoot.innerHTML = ''; }

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $sheetRoot.innerHTML) closeSheet(); });
