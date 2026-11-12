// Жесты на телефоне (только касания, мышь не затрагивают). Один обработчик на весь документ:
//  • строка с data-sw: смахнуть влево — действие (кнопка «Оплачено»/«Сделано» в строке), дальше — удалить;
//    data-sw="del" — сразу удалить. Удалённое можно вернуть кнопкой «Отменить» в тосте;
//  • смахнуть экран вбок — соседний месяц (там, где есть переключатель месяца) или соседний день в «Делах»;
//  • потянуть экран вниз — обновить;
//  • долгое нажатие на день в календаре «Платежей» — новая запись на этот день, на день недели в «Делах» — новое дело;
//  • долгое нажатие на строку — быстрые действия; у дел (data-drag) после долгого нажатия строку можно перетащить.
// Строки размечают экраны: data-sw="pay|done|del", data-sw-col="transactions|tasks", data-sw-id, data-sw-label.
import { pb } from './core/pb.js';
import { state } from './core/state.js';
import { esc, ymd, parseYmd, pbDate, today, addDays, txDay } from './core/util.js';
import { taskDay } from './core/tasks.js';
import { $view, $tabbar, toast, errText, openSheet, closeSheet } from './ui.js';
import { render } from './router.js';
import { taskSheet } from './screens/tasks.js';

const HOLD_MS = 450, ACT = 70, PULL = 60;
let g = null;          // текущий жест
let ptr = null;        // кружок «обновить»
let noClickUntil = 0;  // после долгого нажатия палец отпускают — этот «клик» не должен открыть запись

const SYSTEM = ['id', 'created', 'updated', 'collectionId', 'collectionName', 'expand'];
const copyOf = (rec) => Object.fromEntries(Object.entries(rec).filter(([k]) => !SYSTEM.includes(k)));
const txTitle = (t) => t.note || t.expand?.category?.name || (t.kind === 'income' ? 'Доход' : t.kind === 'adjust' ? 'Остаток на руках' : 'Расход');

export function initGestures() {
  ptr = document.createElement('div');
  ptr.className = 'ptr'; ptr.setAttribute('aria-hidden', 'true');
  document.body.append(ptr);
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
  document.addEventListener('touchcancel', reset);
  document.addEventListener('click', (e) => {
    if (Date.now() < noClickUntil) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('[data-sw]')) e.preventDefault(); });
}

function onStart(e) {
  reset();
  if (e.touches.length !== 1 || $tabbar.hidden) return;
  const el = e.target;
  if (!$view.contains(el) || el.closest('input, textarea, select, .slide-submit')) return;
  const t = e.touches[0];
  g = { x0: t.clientX, y0: t.clientY, t0: Date.now(), row: el.closest('[data-sw]'), day: el.closest('.cal-grid .day[data-day], .wday[data-day]'), mode: null, top: window.scrollY <= 0, held: false };
  if (g.row || g.day) g.timer = setTimeout(onHold, HOLD_MS);
}

function onHold() {
  if (!g || g.mode) return;
  g.held = true;
  noClickUntil = Date.now() + 60000; // до отпускания пальца
  (g.row || g.day).classList.add('sw-lift');
  navigator.vibrate?.(10);
}

function onMove(e) {
  if (!g) return;
  const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
  if (!g.mode) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    clearTimeout(g.timer);
    if (g.held) g.mode = g.row && g.row.dataset.drag !== undefined ? 'drag' : 'none';
    else if (Math.abs(dx) > Math.abs(dy)) g.mode = g.row && dx < 0 ? 'row' : 'nav';
    else g.mode = dy > 0 && g.top && window.scrollY <= 0 ? 'pull' : 'scroll';
    if (g.mode === 'drag') { g.row.classList.add('sw-drag'); g.moved = false; }
    if (g.mode === 'none') (g.row || g.day).classList.remove('sw-lift');
  }
  if (g.mode === 'row') {
    e.preventDefault();
    const x = Math.min(0, dx), w = g.row.offsetWidth;
    g.x = -x;
    g.row.classList.add('sw-on');
    g.row.classList.toggle('sw-del', g.row.dataset.sw !== 'del' && g.x > Math.max(200, w * 0.6));
    g.row.style.transform = `translateX(${x}px)`;
  } else if (g.mode === 'pull') {
    e.preventDefault();
    g.p = Math.min(dy * 0.45, 90);
    ptr.classList.remove('back', 'spin');
    ptr.classList.toggle('ready', g.p >= PULL);
    ptr.style.opacity = String(Math.min(1, g.p / 40));
    ptr.style.transform = `translateY(${g.p}px)`;
    ptr.style.setProperty('--r', `${g.p * 4}deg`);
  } else if (g.mode === 'drag') {
    e.preventDefault();
    dragTo(dy);
  } else if (g.mode === 'nav') {
    g.dx = dx; g.dy = dy;
  }
}

// Перетаскивание дела: строка едет за пальцем; когда её середина проходит середину соседней — меняются местами
function dragTo(dy) {
  const row = g.row;
  row.style.transform = `translateY(${dy}px)`; // сначала сдвиг, потом замер — иначе середина отстаёт на один шаг
  const sibs = [...row.parentElement.children].filter((x) => x.dataset.drag !== undefined);
  const i = sibs.indexOf(row), r = row.getBoundingClientRect(), mid = r.top + r.height / 2;
  const prev = sibs[i - 1], next = sibs[i + 1];
  if (prev && mid < prev.getBoundingClientRect().top + prev.offsetHeight / 2) {
    prev.before(row); g.y0 -= prev.offsetHeight; dy += prev.offsetHeight; g.moved = true;
  } else if (next && mid > next.getBoundingClientRect().top + next.offsetHeight / 2) {
    next.after(row); g.y0 += next.offsetHeight; dy -= next.offsetHeight; g.moved = true;
  }
  row.style.transform = `translateY(${dy}px)`;
}

function onEnd() {
  if (!g) return;
  clearTimeout(g.timer);
  const s = g; g = null;
  if (s.held) noClickUntil = Date.now() + 450;
  if (s.mode === 'row') endRow(s);
  else if (s.mode === 'pull') endPull(s);
  else if (s.mode === 'drag') endDrag(s);
  else if (s.mode === 'nav') endNav(s);
  else if (s.held && !s.mode && s.row) { s.row.classList.remove('sw-lift'); quickActions(s.row.dataset.swCol, s.row.dataset.swId); }
  else if (s.held && !s.mode && s.day) { s.day.classList.remove('sw-lift'); newOnDay(s.day.dataset.day); }
}

function reset() {
  if (!g) return;
  clearTimeout(g.timer);
  if (g.held) noClickUntil = Date.now() + 450;
  if (g.row) { g.row.classList.remove('sw-on', 'sw-del', 'sw-lift', 'sw-drag'); g.row.style.transform = ''; }
  g.day?.classList.remove('sw-lift');
  if (g.mode === 'pull') hidePtr();
  g = null;
}

// Долгое нажатие на день: в «Платежах» — новая запись на этот день, в «Делах» — новое дело на этот день
function newOnDay(day) {
  if ($view.dataset.screen === 'tasks') taskSheet(null, { day });
  else location.hash = `#/add?date=${day}&back=calendar`;
}

function endRow(s) {
  const row = s.row, kind = row.dataset.sw, w = row.offsetWidth, x = s.x || 0;
  const del = kind === 'del' ? x > 90 : x > Math.max(200, w * 0.6);
  const act = !del && kind !== 'del' && x > ACT;
  row.classList.remove('sw-on');
  if (!del && !act) { row.classList.remove('sw-del'); row.style.transform = ''; return; }
  row.style.transform = 'translateX(-105%)';
  const back = () => { row.classList.remove('sw-del'); row.style.transform = ''; };
  if (del) { removeRecord(row.dataset.swCol, row.dataset.swId).then((ok) => { if (!ok) back(); }); return; }
  const btn = row.querySelector('[data-pay], [data-done]');
  if (!btn) { back(); return; }
  btn.click();
  // Если сервер ответил ошибкой, экран не перерисуется, а кнопка снова станет активной — возвращаем строку на место
  const mo = new MutationObserver(() => { if (!btn.disabled) { mo.disconnect(); back(); } });
  mo.observe(btn, { attributes: true, attributeFilter: ['disabled'] });
}

function hidePtr() {
  ptr.classList.add('back'); ptr.classList.remove('spin', 'ready');
  ptr.style.opacity = '0'; ptr.style.transform = '';
}

async function endPull(s) {
  if ((s.p || 0) < PULL) { hidePtr(); return; }
  ptr.classList.add('back', 'spin');
  ptr.style.transform = 'translateY(56px)';
  try { await render(); } catch (e) { toast(errText(e)); }
  setTimeout(hidePtr, 250);
}

async function endDrag(s) {
  const row = s.row;
  row.classList.remove('sw-lift', 'sw-drag'); row.style.transform = '';
  if (!s.moved) return;
  const ids = [...row.parentElement.children].filter((x) => x.dataset.drag !== undefined).map((x) => x.dataset.swId);
  try { await Promise.all(ids.map((id, i) => pb.collection('tasks').update(id, { sort: i + 1 }))); }
  catch (e) { toast(errText(e)); render(); }
}

function endNav(s) {
  const dx = s.dx || 0, dy = s.dy || 0;
  if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || Date.now() - s.t0 > 700) return;
  const dir = dx < 0 ? 1 : -1;
  if ($view.dataset.screen === 'tasks') {
    if (state.taskSomeday) return;
    state.taskDay = ymd(addDays(parseYmd(state.taskDay), dir)); state.taskShowDone = false;
    render();
    return;
  }
  $view.querySelector(`.month-switch [data-m="${dir}"]`)?.click();
}

// Удаление с «Отменить»: запись создаётся заново с теми же полями
async function removeRecord(col, id) {
  try {
    const rec = await pb.collection(col).getOne(id);
    await pb.collection(col).delete(id);
    const copy = copyOf(rec);
    toast(col === 'tasks' ? 'Дело удалено' : 'Запись удалена', { label: 'Отменить', run: async () => { await pb.collection(col).create(copy); render(); } });
    render();
    return true;
  } catch (e) { toast(errText(e)); return false; }
}

// Долгое нажатие: окно с быстрыми действиями
async function quickActions(col, id) {
  let rec;
  try { rec = await pb.collection(col).getOne(id, col === 'transactions' ? { expand: 'category' } : {}); }
  catch (e) { toast(errText(e)); return; }
  const isTask = col === 'tasks';
  const tomorrow = ymd(addDays(new Date(), 1));
  const acts = [];
  if (isTask) {
    const day = taskDay(rec);
    if (!rec.done) {
      if (day !== today()) acts.push(['today', 'Перенести на сегодня']);
      if (day !== tomorrow) acts.push(['tomorrow', 'Перенести на завтра']);
      if (day) acts.push(['someday', 'Убрать в «Когда-нибудь»']);
    }
    acts.push(['copy', 'Повторить завтра'], ['edit', 'Изменить']);
  } else {
    if (rec.status === 'planned') acts.push(['tomorrow', 'Перенести на завтра'], ['week', 'Перенести на неделю вперёд']);
    if (rec.kind !== 'adjust') acts.push(['copy', 'Повторить сегодня']);
    acts.push(['edit', 'Изменить']);
  }
  openSheet('', (s) => {
    s.innerHTML = `<h2>${esc(isTask ? rec.title : txTitle(rec))}</h2>
      <div class="list">${acts.map(([a, label]) => `<button type="button" class="row" data-a="${a}"><span class="main"><span class="name">${label}</span></span></button>`).join('')}
        <button type="button" class="row" data-a="del"><span class="main"><span class="name" style="color:var(--danger)">Удалить</span></span></button></div>
      <button type="button" class="btn secondary" data-a="close">Отмена</button>`;
    s.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => run(b.dataset.a));
  });
  const move = async (field, value, msg) => {
    const prev = rec[field];
    await pb.collection(col).update(id, { [field]: value });
    toast(msg, { label: 'Отменить', run: async () => { await pb.collection(col).update(id, { [field]: prev }); render(); } });
    render();
  };
  async function run(a) {
    closeSheet();
    try {
      if (a === 'del') await removeRecord(col, id);
      else if (a === 'edit') { if (isTask) taskSheet(rec); else location.hash = `#/edit/${id}`; }
      else if (isTask && a === 'today') await move('day', pbDate(today()), 'Перенесено на сегодня');
      else if (isTask && a === 'tomorrow') await move('day', pbDate(tomorrow), 'Перенесено на завтра');
      else if (isTask && a === 'someday') await move('day', '', 'Убрано в «Когда-нибудь»');
      else if (isTask && a === 'copy') {
        const made = await pb.collection(col).create({ ...copyOf(rec), day: pbDate(tomorrow), done: false, done_at: '', sort: 0 });
        toast('Добавлено на завтра', { label: 'Отменить', run: async () => { await pb.collection(col).delete(made.id); render(); } });
        render();
      }
      else if (a === 'tomorrow') await move('date', pbDate(tomorrow), 'Перенесено на завтра');
      else if (a === 'week') await move('date', pbDate(ymd(addDays(parseYmd(txDay(rec)), 7))), 'Перенесено на неделю вперёд');
      else if (a === 'copy') {
        const made = await pb.collection(col).create({ ...copyOf(rec), date: pbDate(today()), status: 'paid', repeat: 'none', repeat_day: 0 });
        toast('Такая же запись добавлена на сегодня', { label: 'Отменить', run: async () => { await pb.collection(col).delete(made.id); render(); } });
        render();
      }
    } catch (e) { toast(errText(e)); }
  }
}
