// Главная «Лента»: вместо вкладок — одна линия времени. Сверху яркая карточка (сколько сегодня свободно / на счёте),
// кнопки-фильтры (не уводят с экрана), ниже по порядку: просроченное → сегодня уже было → черта «сейчас» → сегодня впереди → следующие дни.
// У каждого дня — «останется N»: деньги на руках с учётом всех платежей по этот день. Нажатие на строку раскрывает её на месте
// (чёрная карточка с действиями), кружок справа — «оплачено / сделано» одним касанием. Данные грузит lentaScreen, рисует paint (без запросов).
import { esc, money, moneySigned, net, signed, ymd, parseYmd, pbDate, today, addDays, daysIn, txDay, daysUntil, MONTHS_GEN, MONTHS_SHORT, WEEKDAYS, REPEAT_SHORT } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { state } from '../core/state.js';
import { CFG, pb, ownerFilter } from '../core/pb.js';
import { $view, toast, errText, openSheet, closeSheet, sumsHidden, setSumsHidden, celebrate } from '../ui.js';
import { txBetween, getBalance, withBook, markPaid } from '../core/data.js';
import { TASK_REPEAT, taskDay, byTime, byOrder, tasksBetween, overdueTasks, completeTask, isMissingCollection } from '../core/tasks.js';
import { taskSheet } from './tasks.js';
import { cashSheet } from './home.js';
import { render } from '../router.js';
import { maybeNews } from './news.js';
import { maybeGift } from './gift.js';
import { maybeTour, quest, questDone, questHide } from './tour.js';
import { openAssistant } from './assistant.js';

const STEP = 14, MAX_DAYS = 56;
const ui = { filter: 'all', open: null, days: STEP };
let last = null; // данные последней отрисовки — чтобы перерисовать без запросов
// Шаг знакомства выполнен где-то ещё (например, открыли помощника) — обновить карточку «Первые шаги», не трогая открытые окна
document.addEventListener('quest', () => { if (last && $view.dataset.screen === 'home' && $view.querySelector('.l-line')) paint(last); }); // что выбрано на ленте — живёт, пока открыто приложение
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
const hm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const txName = (t) => t.note || t.expand?.category?.name || (t.kind === 'income' ? 'Доход' : 'Расход');
const big = (v) => `${moneySigned(v).replace(/\s*\S+$/, '')}<small>${esc(CFG.CURRENCY)}</small>`;

export async function lentaScreen(route, alive) {
  const t0 = today(), end = ymd(addDays(new Date(), MAX_DAYS));
  const noTasks = (e) => { if (isMissingCollection(e)) return []; throw e; };
  const [balance, planned, paidToday, tasks, late] = await Promise.all([
    getBalance(),
    // Все неоплаченные платежи: просроченные и на 8 недель вперёд (по ним же считается «свободно» и «останется»)
    pb.collection('transactions').getFullList({
      filter: withBook(`${ownerFilter()} && status = 'planned' && ` + pb.filter('date < {:t}', { t: `${end} 00:00:00` })),
      sort: 'date,created', expand: 'category'
    }),
    txBetween(t0, ymd(addDays(new Date(), 1)), "status = 'paid'"),
    tasksBetween(t0, end).catch(noTasks),
    overdueTasks().catch(noTasks)
  ]);
  if (!alive()) return;
  paint({ balance, planned, paidToday, tasks, late });
  maybeTour(balance === 0 && !planned.length && !paidToday.length); // первый вход на этом устройстве — знакомство (у пустого аккаунта — с вопросами)
  maybeGift(); // тем, кто был с нами до этого обновления, — подарок (один раз)
  maybeNews(); // после обновления — «Что нового»
}

// Сколько можно тратить сегодня: деньги на руках минус платежи до ближайшего дохода, поровну на оставшиеся дни
function freeToday(d) {
  const t0 = today();
  const income = d.planned.find((t) => t.kind === 'income' && txDay(t) > t0);
  const now = new Date();
  const monthEnd = ymd(new Date(now.getFullYear(), now.getMonth(), daysIn(now.getFullYear(), now.getMonth())));
  const horizon = income ? txDay(income) : (monthEnd > t0 ? monthEnd : ymd(addDays(now, 1)));
  const daysLeft = Math.max(1, daysUntil(horizon));
  let due = 0;
  for (const t of d.planned) if (txDay(t) < horizon) due += net(t); // расходы — минус, просроченные поступления — плюс
  const spent = d.paidToday.reduce((s, t) => s + (t.kind === 'expense' ? t.amount : 0), 0);
  const avail = d.balance + due;
  const free = Math.floor((avail + spent) / daysLeft - spent);
  return { free, avail, daysLeft, income, horizon };
}

function paint(d) {
  last = d;
  const t0 = today(), biz = state.book === 'business', now = hm();
  const f = ui.filter;
  const showTx = (t) => f === 'all' || f === 'money' || (f === 'debts' && t.debt);
  const showTask = f === 'all' || f === 'tasks';

  // ----- Карточка сверху -----
  const fr = freeToday(d);
  const twoWeeks = ymd(addDays(new Date(), 14));
  let hero;
  if (biz) {
    let inn = 0, out = 0;
    for (const t of d.planned) if (txDay(t) < twoWeeks) { if (t.kind === 'income') inn += t.amount; else if (t.kind === 'expense') out += t.amount; }
    hero = { k: 'На счёте', v: d.balance, pills: [`Придёт за 2 недели +${money(inn)}`, `Уйдёт −${money(out)}`], note: '' };
  } else {
    const till = fr.income ? `Доход через ${fr.daysLeft} ${plural(fr.daysLeft, 'день', 'дня', 'дней')}` : `До конца месяца ${fr.daysLeft} ${plural(fr.daysLeft, 'день', 'дня', 'дней')}`;
    hero = { k: 'Сегодня свободно', v: Math.max(0, fr.free), pills: [`На руках ${moneySigned(d.balance)}`, till],
      note: fr.avail < 0 ? `На платежи до ${fr.income ? 'дохода' : 'конца месяца'} не хватает ${money(-fr.avail)}` : '' };
  }
  const mini = f !== 'all';
  const heroLen = moneySigned(hero.v).replace(/\s*\S+$/, '').length; // длина числа без валюты — от неё размер шрифта
  const heroHtml = `<a class="l-hero ${mini ? 'mini' : ''}" href="#/overview" aria-label="${hero.k}: ${moneySigned(hero.v)}. Открыть обзор">
      <span class="l-hero-k">${hero.k}</span>
      <span class="l-hero-big ${heroLen > 9 ? 'xlong' : heroLen > 5 ? 'long' : ''}">${big(hero.v)}</span>
      ${hero.note ? `<span class="l-hero-note">${esc(hero.note)}</span>` : ''}
      <span class="l-pills">${hero.pills.map((p) => `<span class="l-pill">${esc(p)}</span>`).join('')}</span>
      <span class="l-hero-go" aria-hidden="true">${ICON.right}</span></a>`;

  // ----- Строки -----
  const acts = (main, id, kind, extra) => `<div class="l-acts"><button type="button" class="l-act main" data-${kind === 'task' ? 'done' : 'pay'}="${id}">${main}</button>${extra}</div>`;
  const txRow = (t, o = {}) => {
    const paid = t.status === 'paid', inc = t.kind === 'income', late = !paid && txDay(t) < t0, open = ui.open === t.id && !paid;
    const tone = paid ? 'past' : late ? 'late' : inc ? 'inc' : '';
    const cat = t.expand?.category?.name;
    const kindTxt = paid ? [t.kind === 'adjust' ? 'Остаток' : inc ? 'Доход' : 'Трата', t.note && cat ? cat : ''].filter(Boolean).join(' · ')
      : [late ? 'Просрочено' : inc ? 'Придёт' : 'Платёж', t.repeat && t.repeat !== 'none' ? REPEAT_SHORT[t.repeat].toLowerCase() : (t.note && cat ? cat : '')].filter(Boolean).join(' · ');
    const amt = paid || inc ? signed(t.amount, t.kind) : money(t.amount);
    const label = inc ? 'Получено' : 'Оплачено';
    const time = o.date ? `${parseYmd(txDay(t)).getDate()} ${MONTHS_SHORT[parseYmd(txDay(t)).getMonth()]}` : '';
    if (paid) return `<div class="l-row past" data-sw="del" data-sw-col="transactions" data-sw-id="${t.id}"><span class="l-time">${time}</span><i class="l-dot past"></i>
      <div class="l-card"><a class="l-main" href="#/edit/${t.id}"><span class="l-name">${esc(txName(t))}</span><span class="l-kind past">${esc(kindTxt)}</span></a><span class="l-amt">${amt}</span></div></div>`;
    const head = `<span class="l-name">${esc(txName(t))}</span><span class="l-kind ${tone}">${esc(kindTxt)}</span>`;
    return `<div class="l-row ${late ? 'late' : ''} ${open ? 'open' : ''}" data-sw="pay" data-sw-col="transactions" data-sw-id="${t.id}" data-sw-label="${label}"><span class="l-time">${time}</span><i class="l-dot ${tone}"></i>
      <div class="l-card">${open
    ? `<div class="l-open-top"><button type="button" class="l-main" data-toggle="${t.id}" aria-expanded="true">${head}</button><span class="l-amt">${amt}</span></div>
          ${acts(label, t.id, 'tx', `${txDay(t) <= t0 ? `<button type="button" class="l-act" data-tomorrow="${t.id}">Завтра</button>` : ''}<a class="l-act more" href="#/edit/${t.id}" aria-label="Изменить, повторять, удалить">···</a>`)}`
    : `<button type="button" class="l-main" data-toggle="${t.id}" aria-expanded="false">${head}</button><span class="l-amt">${amt}</span>
          <button type="button" class="l-check" data-pay="${t.id}" aria-label="${label}: ${esc(txName(t))}">${ICON.check}</button>`}</div></div>`;
  };
  const taskRow = (t, o = {}) => {
    const day = taskDay(t), late = !t.done && (day < t0 || (day === t0 && t.time && t.time < now)), open = ui.open === t.id && !t.done;
    const tone = t.done ? 'past' : late ? 'late' : 'task';
    const kindTxt = o.demo ? 'Учебная строка · не сохраняется' : ['Дело', t.done ? 'сделано' : day < t0 ? 'просрочено' : late ? 'время прошло' : '', t.repeat && t.repeat !== 'none' ? TASK_REPEAT[t.repeat].toLowerCase() : ''].filter(Boolean).join(' · ');
    const time = o.date ? `${parseYmd(day).getDate()} ${MONTHS_SHORT[parseYmd(day).getMonth()]}` : esc(t.time || '');
    const head = `<span class="l-name ${t.done ? 'done' : ''}">${esc(t.title)}</span><span class="l-kind ${tone}">${esc(kindTxt)}</span>`;
    if (t.done) return `<div class="l-row past"><span class="l-time">${time}</span><i class="l-dot past"></i>
      <div class="l-card"><button type="button" class="l-main" data-task="${t.id}">${head}</button><span class="l-check on" aria-hidden="true">${ICON.check}</span></div></div>`;
    return `<div class="l-row ${late ? 'late' : ''} ${open ? 'open' : ''}" ${o.demo ? 'data-demo' : ''} data-sw="done" data-sw-col="tasks" data-sw-id="${t.id}" data-sw-label="Сделано"><span class="l-time">${time}</span><i class="l-dot ${tone}"></i>
      <div class="l-card">${open
    ? `<div class="l-open-top"><button type="button" class="l-main" data-toggle="${t.id}" aria-expanded="true">${head}</button></div>
          ${acts('Сделано', t.id, 'task', o.demo ? '' : `${day <= t0 ? `<button type="button" class="l-act" data-tomorrow="${t.id}">Завтра</button>` : ''}<button type="button" class="l-act more" data-task="${t.id}" aria-label="Изменить, время, повтор, удалить">···</button>`)}`
    : `<button type="button" class="l-main" data-toggle="${t.id}" aria-expanded="false">${head}</button>
          <button type="button" class="l-check" data-done="${t.id}" aria-label="Сделано: ${esc(t.title)}">${ICON.check}</button>`}</div></div>`;
  };

  // ----- Лента по порядку -----
  const out = [];
  const lateTx = d.planned.filter((t) => txDay(t) < t0 && showTx(t));
  const lateTasks = showTask ? d.late : [];
  if (lateTx.length || lateTasks.length) {
    out.push(`<div class="l-day late"><b>Просрочено</b><span>${lateTx.length + lateTasks.length} ${plural(lateTx.length + lateTasks.length, 'запись', 'записи', 'записей')}</span></div>`);
    out.push(...lateTasks.map((t) => taskRow(t, { date: true })), ...lateTx.map((t) => txRow(t, { date: true })));
  }
  const todayTasks = d.tasks.filter((t) => taskDay(t) === t0);
  const pastToday = [...(showTask ? todayTasks.filter((t) => t.done).map((t) => taskRow(t)) : []), ...d.paidToday.filter(showTx).map((t) => txRow(t))];
  out.push(...pastToday);
  // Дела на сегодня, чьё время уже прошло, — тоже выше черты «сейчас» (красным), а не среди будущего
  const missed = showTask ? todayTasks.filter((t) => !t.done && t.time && t.time < now).sort(byTime) : [];
  out.push(...missed.map((t) => taskRow(t)));
  out.push(`<div class="l-now" aria-label="Сейчас ${now}"><b>${now}</b><i></i><span></span></div>`);
  // «Останется» к концу дня: деньги на руках и все неоплаченные платежи по этот день включительно
  const leftBy = (day) => d.balance + d.planned.reduce((s, t) => s + (txDay(t) <= day ? net(t) : 0), 0);
  const dayRows = (day) => [
    ...(showTask ? d.tasks.filter((t) => taskDay(t) === day && !t.done && !missed.includes(t)).sort(byOrder).sort((a, b) => (a.time ? 0 : 1) - (b.time ? 0 : 1) || byTime(a, b)).map((t) => taskRow(t)) : []),
    ...d.planned.filter((t) => txDay(t) === day && showTx(t)).map((t) => txRow(t))
  ];
  // «Первые шаги»: учебные строки на сервер не уходят
  const qs = f === 'all' ? quest() : null;
  const demo = (id, title) => taskRow({ id, title, day: `${t0} 12:00:00.000Z`, time: '', done: false, repeat: 'none' }, { demo: true });
  // Учебная строка лежит прямо в карточке «Первые шаги», под заданием — искать её в ленте не надо
  const demoRow = !qs ? '' : qs.cur.id === 'open' ? demo('demo1', 'Нажми на меня') : qs.cur.id === 'done' ? demo('demo1', 'Теперь отметь меня')
    : qs.cur.id === 'swipe' ? demo('demo2', 'Смахни меня влево') : '';
  $tabbarQuest(qs && qs.cur.id === 'ask');
  const first = dayRows(t0);
  out.push(...first);
  if (!first.length && !pastToday.length && !missed.length) out.push(`<div class="l-empty">${f === 'tasks' ? 'На сегодня дел нет.' : f === 'debts' ? 'Сегодня платежей по долгам нет.' : 'На сегодня ничего нет. Можно выдохнуть.'}</div>`);
  for (let i = 1; i <= ui.days; i++) {
    const dt = addDays(new Date(), i), day = ymd(dt), rows = dayRows(day);
    if (!rows.length) continue;
    const left = leftBy(day);
    const wd = WEEKDAYS[dt.getDay()];
    const mon = dt.getMonth() !== new Date().getMonth() ? ` ${MONTHS_GEN[dt.getMonth()]}` : '';
    const title = i === 1 ? `Завтра, ${WD[dt.getDay()]} ${dt.getDate()}${mon}` : `${wd[0].toUpperCase()}${wd.slice(1)}, ${dt.getDate()}${mon}`;
    const nTasks = d.tasks.filter((t) => taskDay(t) === day && !t.done).length;
    const right = f === 'tasks' ? `${nTasks} ${plural(nTasks, 'дело', 'дела', 'дел')}` : `останется <strong class="${left < 0 ? 'neg' : ''}">${moneySigned(left)}</strong>`;
    out.push(`<div class="l-day"><b>${title}</b><span>${right}</span></div>`, ...rows);
  }
  if (ui.days < MAX_DAYS) out.push('<button type="button" class="l-more" id="l-more">Показать дальше</button>');
  else out.push('<a class="l-more" href="#/calendar">Весь календарь платежей</a>');

  const chip = (id, label, dot) => `<button type="button" class="l-chip" data-f="${id}" aria-pressed="${f === id}">${dot ? `<i style="background:${dot}"></i>` : ''}${label}</button>`;
  const dnow = new Date();
  $view.innerHTML = `<div class="l-top">
      <div class="l-date"><span>${WEEKDAYS[dnow.getDay()]}</span><b>${dnow.getDate()} ${MONTHS_GEN[dnow.getMonth()]}</b></div>
      <div class="l-top-btns">
        <button type="button" class="icon-btn" id="hide" aria-label="Скрыть суммы" aria-pressed="${sumsHidden()}">${sumsHidden() ? ICON.eyeOff : ICON.eye}</button>
        <button type="button" class="icon-btn l-ask" id="l-ask" aria-label="Помощник"><i class="orb" aria-hidden="true"></i></button>
        <button type="button" class="icon-btn" id="l-menu" aria-label="Все разделы">${ICON.list}</button>
      </div></div>
    ${heroHtml}
    ${qs ? `<section class="l-quest" aria-label="Первые шаги">
      <div class="l-quest-top"><b>Первые шаги</b><span>${qs.n + 1} из ${qs.total}</span><button type="button" id="q-hide" aria-label="Скрыть первые шаги">${ICON.close}</button></div>
      <div class="l-quest-bar" aria-hidden="true">${qs.steps.map((_, k) => `<i class="${k < qs.n ? 'on' : k === qs.n ? 'cur' : ''}"></i>`).join('')}</div>
      <div class="l-quest-step"><strong>${qs.cur.t}</strong><span>${qs.cur.d}</span></div>${demoRow}</section>` : ''}
    <div class="l-chips" role="group" aria-label="Что показывать">
      ${chip('all', 'Всё')}${chip('money', 'Деньги', 'var(--exp)')}${chip('tasks', 'Дела', 'var(--task)')}${biz
    ? '<a class="l-chip" href="#/projects"><i style="background:var(--inc)"></i>Проекты</a>' : chip('debts', 'Долги', 'var(--inc)')}
      ${f === 'debts' ? `<a class="l-chip" href="#/debts">Все долги</a>` : ''}
    </div>
    <div class="l-line">${out.join('')}</div>`;

  // ----- Нажатия -----
  const q = (s) => $view.querySelectorAll(s);
  const findTx = (id) => d.planned.find((t) => t.id === id);
  const findTask = (id) => [...d.tasks, ...d.late].find((t) => t.id === id);
  $view.querySelector('#hide').onclick = (e) => { const on = !sumsHidden(); setSumsHidden(on); e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.innerHTML = on ? ICON.eyeOff : ICON.eye; };
  $view.querySelector('#l-menu').onclick = () => menuSheet(d.balance);
  $view.querySelector('#l-ask').onclick = (e) => { openAssistant(e.currentTarget); questDone('ask'); };
  q('[data-f]').forEach((b) => b.onclick = () => { ui.filter = b.dataset.f; ui.open = null; paint(d); });
  $view.querySelector('#q-hide')?.addEventListener('click', questHide);
  q('[data-toggle]').forEach((b) => b.onclick = () => {
    ui.open = ui.open === b.dataset.toggle ? null : b.dataset.toggle;
    if (ui.open === 'demo1' && questDone('open')) return; // шаг «нажми на строку» — карточку перерисует событие quest
    paint(d);
  });
  $view.querySelector('#l-more')?.addEventListener('click', () => { ui.days = Math.min(MAX_DAYS, ui.days + STEP); paint(d); });
  q('[data-pay]').forEach((b) => b.onclick = async () => {
    const t = findTx(b.dataset.pay); if (!t) return;
    b.disabled = true;
    try { await markPaid(t); ui.open = null; render(); } catch (e) { toast(errText(e)); b.disabled = false; }
  });
  q('[data-done]').forEach((b) => b.onclick = async () => {
    const row = b.closest('.l-row');
    if (row?.dataset.demo !== undefined) { // учебная строка: ничего не сохраняем, только засчитываем шаг
      ui.open = null;
      if (b.dataset.done === 'demo1') questDone('done');
      else if (row.dataset.swiped) questDone('swipe');
      else { toast('Почти! Проведи по строке пальцем справа налево'); }
      return;
    }
    const t = findTask(b.dataset.done); if (!t) return;
    b.disabled = true;
    try {
      const undo = await completeTask(t);
      ui.open = null;
      if (taskDay(t) === t0 && d.tasks.filter((x) => taskDay(x) === t0 && !x.done).length === 1) celebrate(); // закрыто последнее дело дня
      toast('Сделано', { label: 'Отменить', run: async () => { await undo(); render(); } });
      render();
    } catch (e) { toast(errText(e)); b.disabled = false; }
  });
  q('[data-tomorrow]').forEach((b) => b.onclick = async () => {
    const id = b.dataset.tomorrow, tx = findTx(id), task = findTask(id), to = pbDate(ymd(addDays(new Date(), 1)));
    const col = tx ? 'transactions' : 'tasks', field = tx ? 'date' : 'day', was = tx ? tx.date : task?.day;
    if (!tx && !task) return;
    b.disabled = true;
    try {
      await pb.collection(col).update(id, { [field]: to });
      toast('Перенёс на завтра', { label: 'Отменить', run: async () => { await pb.collection(col).update(id, { [field]: was }); render(); } });
      ui.open = null; render();
    } catch (e) { toast(errText(e)); b.disabled = false; }
  });
  q('[data-task]').forEach((b) => b.onclick = () => { const t = findTask(b.dataset.task); if (t) taskSheet(t); });
}

// Шар в чёрной строке пульсирует, когда текущий шаг знакомства — «нажми на шар»
function $tabbarQuest(on) { const tb = document.getElementById('tabbar'); if (tb) tb.dataset.quest = on ? 'ask' : ''; }

// Все разделы — одним окном: старые экраны никуда не делись, но ходить в них каждый день больше не нужно
function menuSheet(balance) {
  const biz = state.book === 'business';
  const items = [
    ['#/calendar', ICON.cal, 'Платежи', 'календарь на месяц'],
    ['#/tasks', ICON.tasks, 'Дела', 'неделя, «когда-нибудь»'],
    biz ? ['#/projects', ICON.case, 'Проекты', 'прибыль по проектам'] : ['#/debts', ICON.debt, 'Долги', 'сколько осталось'],
    ['#/overview', ICON.pie, 'Обзор', 'куда уходят деньги'],
    ['#/history', ICON.list, 'История', 'все записи'],
    ['#/settings', ICON.gear, 'Настройки', '']
  ];
  openSheet('', (s) => {
    s.innerHTML = `<h2>Все разделы</h2>
      <nav class="l-menu">${items.map(([h, ic, t, sub]) => `<a href="${h}">${ic}${t}<span>${sub}</span></a>`).join('')}
        <a href="#" id="l-cash">${ICON.edit}${biz ? 'Остаток на счёте' : 'Остаток на руках'}<span>поправить вручную</span></a></nav>`;
    s.querySelectorAll('a[href^="#/"]').forEach((a) => a.addEventListener('click', closeSheet));
    s.querySelector('#l-cash').onclick = (e) => { e.preventDefault(); cashSheet(balance); };
  });
}
