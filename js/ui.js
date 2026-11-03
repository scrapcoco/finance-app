// Общие элементы интерфейса: тост, ошибки, нижние окна, строка записи, переключатель месяца
import { esc, signed, MONTHS, MONTHS_SHORT, REPEAT_SHORT, parseYmd, txDay, addMonths, shortDate, daysUntil, whenLabel } from './core/util.js';
import { ICON } from './core/icons.js';
import { state } from './core/state.js';
import { render } from './router.js';
import { markPaid } from './core/data.js';

export const $view = document.getElementById('view');

export const $tabbar = document.getElementById('tabbar');

export const $sheetRoot = document.getElementById('sheet-root');

export const $toast = document.getElementById('toast');

let toastTimer;

// action — необязательная кнопка в тосте: { label, run } (например, «Отменить»); такой тост висит дольше
export function toast(msg, action) {
  $toast.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label;
    b.onclick = async () => {
      clearTimeout(toastTimer); $toast.hidden = true;
      try { await action.run(); } catch (e) { toast(errText(e)); }
    };
    $toast.append(b);
  }
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, action ? 6000 : 2600);
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
    // Сначала срок, потом повтор: если строка не влезет, обрежется менее важное
    const when = whenLabel(txDay(t));
    metaParts.push(when[0].toUpperCase() + when.slice(1));
    if (t.repeat && t.repeat !== 'none') metaParts.push(REPEAT_SHORT[t.repeat].toLowerCase());
  } else {
    metaParts.push(shortDate(txDay(t)));
    if (cat && t.note) metaParts.push(cat);
  }
  const d = parseYmd(txDay(t));
  const lead = opts.planned
    ? `<div class="datebox ${daysUntil(txDay(t)) < 0 ? 'overdue' : ''}"><b>${d.getDate()}</b><span>${MONTHS_SHORT[d.getMonth()]}</span></div>`
    : '';
  const href = `#/edit/${t.id}${opts.back ? `?back=${opts.back}` : ''}`;
  const inner = `${lead}
    <div class="main"><div class="name">${esc(title)}</div><div class="meta">${esc(metaParts.join(', '))}</div></div>
    <div class="amt ${t.kind === 'income' ? 'inc' : t.kind === 'expense' ? 'exp' : ''}">${signed(t.amount, t.kind)}</div>`;
  // С кнопкой «Оплачено» строка — не ссылка целиком (кнопку нельзя вкладывать в <a>)
  if (opts.pay && t.status === 'planned') {
    return `<div class="row pay-row"><a class="row-link" href="${href}">${inner}</a>
      <button type="button" class="pay-btn" data-pay="${t.id}" aria-label="Отметить оплаченным: ${esc(title)}">${ICON.check}</button></div>`;
  }
  return `<a class="row" href="${href}">${inner}</a>`;
}

// Кнопки «Оплачено» (data-pay) в строках txRow; items — записи, которые сейчас на экране
export function bindPay(items) {
  $view.querySelectorAll('[data-pay]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await markPaid(items.find((t) => t.id === b.dataset.pay)); render(); }
    catch (e) { toast(errText(e)); b.disabled = false; }
  });
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

// Клавиатура: Esc — закрыть окно; N — новая запись; ← / → — месяц (или день/неделя в отчётах).
// Не мешаем вводу текста и сочетаниям с Ctrl/Cmd/Alt.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $sheetRoot.innerHTML) { closeSheet(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || $sheetRoot.innerHTML || !$tabbar.querySelector('.tab')) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (e.code === 'KeyN') { e.preventDefault(); location.hash = '#/add'; return; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const d = e.key === 'ArrowLeft' ? '-1' : '1';
    const b = $view.querySelector(`.head [data-m="${d}"], .head [data-shift="${d}"]`);
    if (b && !b.disabled) { e.preventDefault(); b.click(); }
  }
});

// Плавающая подсветка: выбранная кнопка в любом .segment и выбранный день календаря.
// Экраны перерисовываются целиком, поэтому прошлое место подсветки помним по aria-label переключателя
// и при появлении нового переключателя ведём её оттуда к нажатой кнопке.
const GLOW_BOXES = [['.segment', 'button[aria-pressed="true"]'], ['.cal-grid', '.day[aria-pressed="true"] .n']];
const glowAt = new Map();

// «Резиновая» подсветка: передний край уходит первым и быстрее, задний догоняет —
// капсула на миг вытягивается в сторону движения и снова сжимается. Тянется по обеим осям
// (нижнее меню и переключатели — вбок, боковая панель на ПК и строки календаря — вверх-вниз).
//
// Как устроено: подсветка сразу встаёт на итоговое место (left/top/width/height), а движение рисуется
// через transform (сдвиг + растяжение) анимацией Web Animations. Такая анимация идёт на видеокарте и не
// дёргается, даже когда браузер в этот момент рисует новый экран (раньше двигались left/right — и дёргались).
//
// container — элемент, внутри которого подсветка (position: relative/fixed); p = { x, y, w, h } — от его внутреннего края.
// from — откуда ехать (null — просто встать на место). live — тот же элемент уже на экране и, возможно, ещё едет:
// тогда едем из того места, где его сейчас видно, — быстрые переключения без прыжков.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
export function placeGlow(glow, container, to, from, live = false) {
  if (live && glow.isConnected && glow.style.opacity === '1') {
    const r = glow.getBoundingClientRect(), c = container.getBoundingClientRect();
    if (r.width && r.height) from = { x: r.left - c.left - container.clientLeft, y: r.top - c.top - container.clientTop, w: r.width, h: r.height };
  }
  glow._anim?.cancel();
  const s = glow.style;
  s.transition = 'opacity .2s'; s.transformOrigin = '0 0'; s.transform = ''; s.right = 'auto'; s.bottom = 'auto';
  s.left = `${to.x}px`; s.top = `${to.y}px`; s.width = `${to.w}px`; s.height = `${to.h}px`; s.opacity = '1';
  if (!from || reduceMotion.matches || !to.w || !to.h) return;
  if (Math.abs(from.x - to.x) < 0.5 && Math.abs(from.y - to.y) < 0.5 && Math.abs(from.w - to.w) < 0.5 && Math.abs(from.h - to.h) < 0.5) return;

  const tf = (p) => `translate(${p.x - to.x}px, ${p.y - to.y}px) scale(${p.w / to.w}, ${p.h / to.h})`;
  // Середина пути: передний край прошёл 80%, задний — только 20% → капсула растянута
  const lerp = (a, b, t) => a + (b - a) * t;
  const LEAD = 0.8, TRAIL = 0.2;
  const right = to.x > from.x, down = to.y > from.y;
  const x1 = lerp(from.x, to.x, right ? TRAIL : LEAD), x2 = lerp(from.x + from.w, to.x + to.w, right ? LEAD : TRAIL);
  const y1 = lerp(from.y, to.y, down ? TRAIL : LEAD), y2 = lerp(from.y + from.h, to.y + to.h, down ? LEAD : TRAIL);
  const mid = { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
  glow._anim = glow.animate([
    { transform: tf(from), easing: 'cubic-bezier(.3,.6,.45,1)' },       // резкий старт: вытягивается
    { transform: tf(mid), offset: 0.42, easing: 'cubic-bezier(.35,0,.15,1)' }, // задний край догоняет, капсула сжимается
    { transform: 'none' }
  ], { duration: 560 });
}

// Перед перерисовкой экрана (render): подсветки в переключателях замирают там, где их сейчас видно,
// и это место запоминается — подсветка в новой разметке поедет именно оттуда, без прыжка назад.
export function freezeGlows() {
  for (const [sel] of GLOW_BOXES) {
    for (const box of document.querySelectorAll(sel)) {
      const glow = box.querySelector(':scope > .seg-glow');
      if (!glow || glow.style.opacity !== '1') continue;
      const r = glow.getBoundingClientRect(), c = box.getBoundingClientRect();
      if (!r.width || !c.width) continue;
      if (glow._anim) { try { glow._anim.commitStyles(); } catch (e) { /* уже закончилась */ } glow._anim.cancel(); glow._anim = null; }
      glowAt.set(box.getAttribute('aria-label') || sel, { x: r.left - c.left - box.clientLeft, y: r.top - c.top - box.clientTop, w: r.width, h: r.height });
    }
  }
}

function syncGlows() {
  for (const [sel, pick] of GLOW_BOXES) {
    for (const box of document.querySelectorAll(sel)) {
      const key = box.getAttribute('aria-label') || sel;
      let glow = box.querySelector(':scope > .seg-glow');
      if (!glow) {
        glow = document.createElement('i');
        glow.className = 'seg-glow';
        glow.setAttribute('aria-hidden', 'true');
        box.prepend(glow);
      }
      const target = box.querySelector(pick);
      if (!target) { glow.style.opacity = '0'; glow.at = null; continue; }
      const b = box.getBoundingClientRect(), t = target.getBoundingClientRect();
      if (!b.width) continue; // переключатель ещё скрыт
      const to = { x: t.left - b.left - box.clientLeft, y: t.top - b.top - box.clientTop, w: t.width, h: t.height };
      const now = glow.at;
      if (now && Math.abs(now.x - to.x) < 0.5 && Math.abs(now.y - to.y) < 0.5 && Math.abs(now.w - to.w) < 0.5) continue;
      const from = now || glowAt.get(key);
      placeGlow(glow, box, to, from, !!now);
      glow.at = to;
      glowAt.set(key, to);
    }
  }
}

new MutationObserver(syncGlows).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed'] });
window.addEventListener('resize', syncGlows);
