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

// «Резиновая» подсветка: края двигаются отдельно — передний уходит первым и быстрее, задний догоняет,
// поэтому капсула на миг вытягивается в сторону движения и снова сжимается.
// box = { w, h } — внутренние размеры контейнера (от них считаются right/bottom); p = { x, y, w, h } относительно контейнера.
// Тянется и по горизонтали (нижнее меню, переключатели), и по вертикали (боковая панель на ПК, строки календаря).
// Без from (первое появление) — просто встаёт на место. prefers-reduced-motion гасит переходы в app.css.
// Передний край стартует резко (ease-out), задний трогается плавно (ease-in-out) — так задний никогда не обгоняет передний
const LEAD = '.34s cubic-bezier(.22,.9,.3,1)';
const TRAIL = '.52s cubic-bezier(.6,0,.25,1)';
export function placeGlow(glow, box, to, from) {
  const set = (p) => {
    const s = glow.style;
    s.left = `${p.x}px`; s.right = `${box.w - p.x - p.w}px`;
    s.top = `${p.y}px`; s.bottom = `${box.h - p.y - p.h}px`; s.opacity = '1';
  };
  glow.style.transition = 'none';
  if (!from) { set(to); return; }
  set(from);
  void glow.offsetWidth; // зафиксировать старое место, чтобы переход сработал
  const right = to.x > from.x, down = to.y > from.y;
  glow.style.transition = [
    `left ${right ? TRAIL : LEAD}`, `right ${right ? LEAD : TRAIL}`,
    `top ${down ? TRAIL : LEAD}`, `bottom ${down ? LEAD : TRAIL}`, 'opacity .2s'
  ].join(', ');
  set(to);
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
      placeGlow(glow, { w: box.clientWidth, h: box.clientHeight }, to, from);
      glow.at = to;
      glowAt.set(key, to);
    }
  }
}

new MutationObserver(syncGlows).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed'] });
window.addEventListener('resize', syncGlows);
