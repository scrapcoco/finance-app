// «Дела»: неделя, быстрое добавление, дела дня, сделанные, «Когда-нибудь»; окно правки дела
import { esc, ymd, parseYmd, pbDate, today, addDays, MONTHS_GEN, MONTHS_SHORT, WEEKDAYS } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { state } from '../core/state.js';
import { pb } from '../core/pb.js';
import { $view, toast, errText, openSheet, closeSheet, celebrate } from '../ui.js';
import { TASK_REPEAT, TASK_REMIND, taskDay, byOrder, tasksBetween, overdueTasks, somedayTasks, newTask, completeTask, uncompleteTask, isMissingCollection } from '../core/tasks.js';
import { render } from '../router.js';

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};
const monday = (s) => { const d = parseYmd(s); return addDays(d, -((d.getDay() + 6) % 7)); };

function dayTitle(s) {
  const t = today();
  if (s === t) return 'Сегодня';
  if (s === ymd(addDays(new Date(), 1))) return 'Завтра';
  if (s === ymd(addDays(new Date(), -1))) return 'Вчера';
  const d = parseYmd(s);
  return `${WEEKDAYS[d.getDay()][0].toUpperCase()}${WEEKDAYS[d.getDay()].slice(1)}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

function taskRow(t) {
  const meta = [t.repeat && t.repeat !== 'none' ? TASK_REPEAT[t.repeat] : '', (t.note || '').split('\n')[0]].filter(Boolean).join(' · ');
  const check = t.done
    ? `<button type="button" class="tcheck on" data-undo="${t.id}" aria-label="Вернуть: ${esc(t.title)}">${ICON.check}</button>`
    : `<button type="button" class="tcheck" data-done="${t.id}" aria-label="Отметить сделанным: ${esc(t.title)}"></button>`;
  return `<div class="row task-row ${t.done ? 'is-done' : ''}" data-sw="${t.done ? 'del' : 'done'}" data-sw-col="tasks" data-sw-id="${t.id}" data-sw-label="Сделано" ${t.done ? '' : 'data-drag'}>${check}
    <button type="button" class="task-open" data-open="${t.id}">
      <span class="main"><span class="name">${esc(t.title)}</span>${meta && !t.done ? `<span class="meta">${esc(meta)}</span>` : ''}</span>
      ${t.time && !t.done ? `<span class="ttime">${esc(t.time)}</span>` : ''}
    </button></div>`;
}

const leftOpen = {}; // сколько несделанных дел было на дне при прошлом показе — чтобы заметить «всё сделано»

export async function tasksScreen(route, alive) {
  const sel = state.taskDay;
  const someday = state.taskSomeday;
  const mon = monday(sel);
  const week = Array.from({ length: 7 }, (_, i) => ymd(addDays(mon, i)));
  const isToday = sel === today();
  let weekTasks, overdue, later;
  try {
    [weekTasks, overdue, later] = await Promise.all([
      tasksBetween(week[0], week[6]),
      isToday && !someday ? overdueTasks() : [],
      somedayTasks()
    ]);
  } catch (e) {
    if (!isMissingCollection(e)) throw e;
    if (!alive()) return;
    $view.innerHTML = `<div class="head"><h1>Дела</h1></div>
      <div class="list"><div class="empty">Дела появятся, когда обновим сервер. Записи и платежи работают как обычно.</div></div>`;
    return;
  }
  if (!alive()) return;

  const mine = someday ? later : weekTasks.filter((t) => taskDay(t) === sel);
  const active = mine.filter((t) => !t.done).sort(byOrder);
  // Только что закрыто последнее дело дня — маленький праздник
  const key = someday ? 'someday' : sel;
  if (leftOpen[key] > 0 && !active.length && mine.length) celebrate();
  leftOpen[key] = active.length;
  const done = mine.filter((t) => t.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const all = [...weekTasks, ...overdue, ...later];
  const d0 = parseYmd(week[0]), d6 = parseYmd(week[6]);
  const range = d0.getMonth() === d6.getMonth()
    ? `${d0.getDate()}–${d6.getDate()} ${MONTHS_GEN[d6.getMonth()]}`
    : `${d0.getDate()} ${MONTHS_SHORT[d0.getMonth()]} – ${d6.getDate()} ${MONTHS_SHORT[d6.getMonth()]}`;

  const days = week.map((s, i) => {
    const d = parseYmd(s);
    const has = weekTasks.some((t) => taskDay(t) === s && !t.done);
    return `<button type="button" class="wday ${s === today() ? 'today' : ''}" data-day="${s}" aria-pressed="${!someday && s === sel}"
      aria-label="${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${has ? ', есть дела' : ''}">
      <span class="w">${WD[i]}</span><span class="n">${d.getDate()}</span><i class="${has ? 'dot' : ''}"></i></button>`;
  }).join('');

  const overdueCard = overdue.length ? `
    <section class="card nudge-ask">
      <div class="ask-top"><div class="nudge-ic exp">${ICON.clock}</div>
        <div class="main"><div class="name">${overdue.every((t) => taskDay(t) === ymd(addDays(new Date(), -1))) ? 'Вчера' : 'С прошлых дней'} ${overdue.length === 1 ? 'осталось' : 'остались'} ${overdue.length} ${plural(overdue.length, 'дело', 'дела', 'дел')}</div>
        <div class="meta">${esc(overdue.slice(0, 3).map((t) => t.title).join(', '))}${overdue.length > 3 ? '…' : ''}</div></div></div>
      <div class="ask-btns"><button type="button" class="btn small" id="ov-move">Перенести на сегодня</button>
        <button type="button" class="btn small secondary" id="ov-later">Отложить</button></div>
    </section>` : '';

  const title = someday ? 'Когда-нибудь' : dayTitle(sel);
  const progress = !someday && mine.length ? `${done.length} из ${mine.length}` : '';
  const emptyText = someday ? 'Здесь дела без даты: то, что хочется когда-нибудь сделать.'
    : mine.length ? 'Всё сделано. Можно отдыхать.' : isToday ? 'На сегодня дел нет.' : 'На этот день дел нет.';

  $view.innerHTML = `
    <div class="head"><h1>Дела</h1>
      <div class="week-nav">
        <button class="icon-btn ghost" data-shift="-1" aria-label="Предыдущая неделя">${ICON.left}</button>
        <button type="button" class="link-btn" id="to-today" ${isToday && !someday ? 'disabled' : ''} aria-label="${isToday && !someday ? range : 'Вернуться к сегодня'}">${isToday || someday ? range : 'Сегодня'}</button>
        <button class="icon-btn ghost" data-shift="1" aria-label="Следующая неделя">${ICON.right}</button>
      </div></div>
    <div class="week" role="group" aria-label="Дни недели">${days}</div>
    <form class="quick-add" id="qa-form" autocomplete="off">
      <label for="qa" class="sr-only">Новое дело</label>
      <input id="qa" maxlength="200" placeholder="${someday ? 'Новое дело без даты' : isToday ? 'Новое дело на сегодня' : `Новое дело на ${parseYmd(sel).getDate()} ${MONTHS_GEN[parseYmd(sel).getMonth()]}`}">
      <button type="submit" class="qa-btn" aria-label="Добавить дело">${ICON.plus}</button>
    </form>
    ${overdueCard}
    <section class="sec">
      <div class="sec-head"><h2>${esc(title)}</h2>${someday ? '<button type="button" class="link-btn" id="back-day">Назад к дням</button>' : `<span class="sec-note">${progress}</span>`}</div>
      <div class="list">${active.length ? active.map(taskRow).join('') : `<div class="empty">${emptyText}</div>`}</div>
    </section>
    ${done.length ? `<section class="sec">
      <button type="button" class="link-btn done-toggle" id="done-toggle" aria-expanded="${state.taskShowDone}">${state.taskShowDone ? 'Скрыть сделанные' : 'Сделано'} · ${done.length}</button>
      ${state.taskShowDone ? `<div class="list list-quiet">${done.map(taskRow).join('')}</div>` : ''}
    </section>` : ''}
    ${!someday ? `<button type="button" class="someday-link" id="someday">Когда-нибудь · ${later.length}${ICON.right}</button>` : ''}`;

  const go = (patch) => { Object.assign(state, patch); render(); };
  $view.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => go({ taskDay: b.dataset.day, taskSomeday: false, taskShowDone: false }));
  $view.querySelectorAll('[data-shift]').forEach((b) => b.onclick = () => go({ taskDay: ymd(addDays(parseYmd(sel), 7 * Number(b.dataset.shift))), taskSomeday: false }));
  $view.querySelector('#to-today').onclick = () => go({ taskDay: today(), taskSomeday: false });
  $view.querySelector('#someday')?.addEventListener('click', () => go({ taskSomeday: true, taskShowDone: false }));
  $view.querySelector('#back-day')?.addEventListener('click', () => go({ taskSomeday: false }));
  $view.querySelector('#done-toggle')?.addEventListener('click', () => go({ taskShowDone: !state.taskShowDone }));

  const form = $view.querySelector('#qa-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const inp = form.querySelector('#qa');
    const title = inp.value.trim();
    if (!title) { inp.focus(); return; }
    inp.disabled = true;
    try {
      await newTask({ title, day: someday ? '' : pbDate(sel) });
      await render();
      $view.querySelector('#qa')?.focus();
    } catch (err) { inp.disabled = false; toast(errText(err)); }
  };

  bindTaskRows(all);

  $view.querySelector('#ov-move')?.addEventListener('click', (e) => moveMany(e.currentTarget, overdue, pbDate(today()), 'Перенесено на сегодня'));
  $view.querySelector('#ov-later')?.addEventListener('click', (e) => moveMany(e.currentTarget, overdue, '', 'Убрано в «Когда-нибудь»'));
}

async function moveMany(btn, list, day, msg) {
  btn.disabled = true;
  const prev = list.map((t) => [t.id, t.day]);
  try {
    await Promise.all(list.map((t) => pb.collection('tasks').update(t.id, { day })));
    toast(msg, { label: 'Отменить', run: async () => { await Promise.all(prev.map(([id, d]) => pb.collection('tasks').update(id, { day: d }))); render(); } });
    render();
  } catch (e) { btn.disabled = false; toast(errText(e)); }
}

// Галочки и открытие дела — общее для «Дел» и главной
export function bindTaskRows(list) {
  const find = (id) => list.find((t) => t.id === id);
  $view.querySelectorAll('[data-done]').forEach((b) => b.onclick = async () => {
    const t = find(b.dataset.done); if (!t) return;
    b.disabled = true; b.classList.add('on'); b.innerHTML = ICON.check;
    try {
      const undo = await completeTask(t);
      toast(t.repeat && t.repeat !== 'none' ? 'Сделано. Следующее уже в списке' : 'Сделано', { label: 'Отменить', run: async () => { await undo(); render(); } });
      render();
    } catch (e) { b.disabled = false; b.classList.remove('on'); b.innerHTML = ''; toast(errText(e)); }
  });
  $view.querySelectorAll('[data-undo]').forEach((b) => b.onclick = async () => {
    const t = find(b.dataset.undo); if (!t) return;
    b.disabled = true;
    try { await uncompleteTask(t); render(); } catch (e) { b.disabled = false; toast(errText(e)); }
  });
  $view.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { const t = find(b.dataset.open); if (t) taskSheet(t); });
}

// Окно дела: название, когда, время, повтор, заметка
export function taskSheet(t, defaults = {}) {
  const tomorrow = ymd(addDays(new Date(), 1));
  let day = t ? taskDay(t) : (defaults.day ?? today());
  let showNote = !!t?.note;
  const modeOf = (s) => (!s ? 'someday' : s === today() ? 'today' : s === tomorrow ? 'tomorrow' : 'pick');
  let mode = modeOf(day);
  const draw = (s) => {
    const keep = (sel, fallback) => s.querySelector(sel)?.value ?? fallback;
    const vTitle = keep('#tt', t?.title || ''), vTime = keep('#ttime', t?.time || ''), vRep = keep('#trep', t?.repeat || 'none'), vNote = keep('#tnote', t?.note || ''), vRem = keep('#trem', t ? (t.remind || 'none') : 'at');
    const noPush = !('Notification' in window) || Notification.permission !== 'granted';
    const chip = (m, label, extra = '') => `<button type="button" class="chip ${extra}" data-when="${m}" aria-pressed="${mode === m}">${label}</button>`;
    s.innerHTML = `
      <label for="tt" class="sr-only">Что сделать</label>
      <input id="tt" class="task-title" maxlength="200" placeholder="Что сделать?" value="${esc(vTitle)}" autocomplete="off">
      <div class="field-label">Когда</div>
      <div class="chips" role="group" aria-label="Когда">
        ${chip('today', 'Сегодня')}${chip('tomorrow', 'Завтра')}${chip('pick', mode === 'pick' && day ? `${parseYmd(day).getDate()} ${MONTHS_SHORT[parseYmd(day).getMonth()]}` : 'Выбрать день')}${chip('someday', 'Когда-нибудь', 'dashed')}
      </div>
      <div class="form-list">
        ${mode === 'pick' ? `<div class="frow"><label for="tday">День</label><input id="tday" type="date" value="${esc(day)}"></div>` : ''}
        <div class="frow"><label for="ttime">Время</label><input id="ttime" type="time" value="${esc(vTime)}" ${mode === 'someday' ? 'disabled' : ''}></div>
        <div class="frow"><label for="trep">Повтор</label><select id="trep" ${mode === 'someday' ? 'disabled' : ''}>${Object.entries(TASK_REPEAT).map(([k, v]) => `<option value="${k}" ${vRep === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="frow"><label for="trem">Напомнить</label><select id="trem" ${mode === 'someday' || !vTime ? 'disabled' : ''}>${Object.entries(TASK_REMIND).map(([k, v]) => `<option value="${k}" ${vRem === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      ${mode !== 'someday' && noPush ? `<a class="task-push-hint" href="#/settings" ${vTime && vRem !== 'none' ? '' : 'hidden'}>Уведомления на этом устройстве выключены — включить в настройках</a>` : ''}
      ${showNote ? `<div class="form-list"><label for="tnote" class="sr-only">Заметка</label><textarea id="tnote" class="task-note" maxlength="1000" rows="3" placeholder="Заметка">${esc(vNote)}</textarea></div>`
        : '<button type="button" class="link-btn" id="add-note" style="align-self:flex-start">+ Заметка</button>'}
      <div class="error" id="terr" role="alert"></div>
      <div class="btns">
        ${t ? `<button type="button" class="btn secondary task-del" id="tdel" aria-label="Удалить дело">${ICON.trash}</button>` : ''}
        <button type="button" class="btn" id="tsave">${t ? 'Готово' : 'Добавить'}</button>
      </div>`;
    s.querySelectorAll('[data-when]').forEach((b) => b.onclick = () => {
      mode = b.dataset.when;
      day = mode === 'today' ? today() : mode === 'tomorrow' ? tomorrow : mode === 'someday' ? '' : (day && modeOf(day) === 'pick' ? day : ymd(addDays(new Date(), 2)));
      draw(s);
      if (mode === 'pick') s.querySelector('#tday')?.showPicker?.();
    });
    s.querySelector('#tday')?.addEventListener('change', (e) => { if (e.target.value) { day = e.target.value; mode = modeOf(day); draw(s); } });
    const syncRemind = () => {
      const time = s.querySelector('#ttime').value, rem = s.querySelector('#trem');
      rem.disabled = !time || mode === 'someday';
      const hint = s.querySelector('.task-push-hint');
      if (hint) hint.hidden = !time || rem.value === 'none';
    };
    s.querySelector('#ttime').addEventListener('input', syncRemind);
    s.querySelector('#trem').addEventListener('change', syncRemind);
    s.querySelector('.task-push-hint')?.addEventListener('click', () => closeSheet());
    s.querySelector('#add-note')?.addEventListener('click', () => { showNote = true; draw(s); s.querySelector('#tnote')?.focus(); });
    s.querySelector('#tt').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
    s.querySelector('#tsave').onclick = save;
    s.querySelector('#tdel')?.addEventListener('click', async () => {
      try {
        await pb.collection('tasks').delete(t.id);
        closeSheet();
        const copy = { title: t.title, day: t.day, time: t.time, note: t.note, done: t.done, done_at: t.done_at, repeat: t.repeat, remind: t.remind };
        toast('Дело удалено', { label: 'Отменить', run: async () => { await newTask(copy); render(); } });
        render();
      } catch (e) { s.querySelector('#terr').textContent = errText(e); }
    });
    async function save() {
      const title = s.querySelector('#tt').value.trim();
      const err = s.querySelector('#terr');
      if (!title) { err.textContent = 'Напиши, что нужно сделать.'; s.querySelector('#tt').focus(); return; }
      const data = {
        title, day: day ? pbDate(day) : '',
        time: day ? (s.querySelector('#ttime').value || '') : '',
        repeat: day ? s.querySelector('#trep').value : 'none',
        remind: day ? s.querySelector('#trem').value : 'none',
        note: s.querySelector('#tnote')?.value.trim() ?? (t?.note || '')
      };
      const btn = s.querySelector('#tsave'); btn.disabled = true;
      try {
        if (t) await pb.collection('tasks').update(t.id, data); else await newTask(data);
        closeSheet(); render();
      } catch (e) { btn.disabled = false; err.textContent = errText(e); }
    }
  };
  openSheet('', draw);
}
