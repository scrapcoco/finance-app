// Главная: баланс (нажатие — «Обзор») и только то, что нельзя пропустить: «не хватит денег» на неделе, платежи на сегодня-завтра и ближайшие дела.
// Если ничего срочного нет — под балансом пусто. Раз в неделю — «Итоги недели» от помощника (если он включён и есть что сказать).
import { esc, money, net, moneySigned, parseAmount, MONTHS, MONTHS_GEN, MONTHS_SHORT, WEEKDAYS, humanDate, parseYmd, ymd, pbDate, today, firstOfMonth, addMonths, addDays, daysIn, txDay, daysUntil, signed } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { state } from '../core/state.js';
import { CFG, pb, uid, ownerFilter } from '../core/pb.js';
import { $view, toast, errText, monthSwitch, bindMonthSwitch, openSheet, closeSheet } from '../ui.js';
import { txBetween, getBalance, withBook, curBook, markPaid } from '../core/data.js';
import { byTime, tasksBetween, completeTask, timeLeft, isMissingCollection } from '../core/tasks.js';
import { taskSheet } from './tasks.js';
import { openAssistant } from './assistant.js';
import { render } from '../router.js';

const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};

// Итоги недели: ответ сервера хранится в localStorage на неделю, чтобы не спрашивать ИИ при каждом открытии главной
const REVIEW = 'asstReview';
const readReview = () => { try { return JSON.parse(localStorage.getItem(REVIEW) || 'null'); } catch (e) { return null; } };
const writeReview = (v) => { try { localStorage.setItem(REVIEW, JSON.stringify(v)); } catch (e) { /* приватный режим */ } };
const asstOn = () => { try { return localStorage.getItem('asstConsent') === '1'; } catch (e) { return false; } };
const weekStart = () => { const d = new Date(); return ymd(addDays(d, -((d.getDay() + 6) % 7))); };

function loadReview(alive) {
  const wk = weekStart(), rv = readReview();
  if (!asstOn() || (rv && rv.week === wk && !(rv.retryAt && Date.now() > rv.retryAt))) return;
  writeReview({ week: wk, text: '', retryAt: Date.now() + 6 * 3600 * 1000 }); // пока ждём и если сервер ответит ошибкой — повтор через 6 ч
  pb.send('/api/finance/review', { method: 'POST', body: { today: today() } })
    .then((r) => { writeReview({ week: wk, text: r.text || '' }); if (r.text && alive()) render(); })
    .catch(() => {});
}

export async function homeScreen(route, alive) {
  const m = state.month;
  const from = ymd(m), to = ymd(addMonths(m, 1));
  const isCur = ymd(firstOfMonth(new Date())) === from;
  // Сравнение с прошлым месяцем: для текущего — с тем же числом (3 ноября против 1–3 октября), иначе в начале месяца всегда «−90%»
  const pm = addMonths(m, -1);
  const prevDays = Math.min(new Date().getDate(), daysIn(pm.getFullYear(), pm.getMonth()));
  const prevTo = isCur ? ymd(addDays(pm, prevDays)) : from;
  const tomorrow = ymd(addDays(new Date(), 1));
  const [balance, monthTx, prevTx, soonPay, todayTasks, weekPay] = await Promise.all([
    getBalance(),
    txBetween(from, to),
    txBetween(ymd(pm), prevTo, "status = 'paid'"),
    // Неоплаченные платежи по завтрашний день включительно (и просроченные)
    pb.collection('transactions').getFullList({
      filter: withBook(`${ownerFilter()} && status = 'planned' && ` + pb.filter('date < {:t}', { t: `${ymd(addDays(new Date(), 2))} 00:00:00` })),
      sort: 'date,created', expand: 'category'
    }),
    // Дела на сегодня; если сервер ещё без коллекции дел — просто без них
    tasksBetween(today(), today()).catch((e) => { if (isMissingCollection(e)) return []; throw e; }),
    // Платежи на неделю вперёд (и просроченные) — для предупреждения «не хватит денег»
    pb.collection('transactions').getFullList({
      filter: withBook(`${ownerFilter()} && status = 'planned' && ` + pb.filter('date < {:t}', { t: `${ymd(addDays(new Date(), 8))} 00:00:00` })),
      sort: 'date,created', fields: 'kind,amount,date'
    })
  ]);
  if (!alive()) return;
  let inc = 0, exp = 0, plannedNet = 0;
  for (const t of monthTx) {
    if (t.status === 'paid') { if (t.kind === 'income') inc += t.amount; else if (t.kind === 'expense') exp += t.amount; }
    else plannedNet += net(t);
  }
  let prevInc = 0, prevExp = 0;
  for (const t of prevTx) { if (t.kind === 'income') prevInc += t.amount; else if (t.kind === 'expense') prevExp += t.amount; }
  const prevLabel = isCur ? `1–${prevDays} ${MONTHS_GEN[pm.getMonth()]}` : MONTHS[pm.getMonth()].toLowerCase();
  // Плашка «+12% к окт»: рост доходов — хорошо, рост расходов — плохо
  const delta = (cur, prev, upIsGood) => {
    if (!(prev > 0)) return '';
    const p = Math.round(((cur - prev) / prev) * 100);
    const cls = p === 0 ? '' : (p > 0) === upIsGood ? 'good' : 'bad';
    return `<span class="delta ${cls}" title="По сравнению с: ${esc(prevLabel)} (${money(prev)})">${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}% к ${MONTHS_SHORT[pm.getMonth()]}</span>`;
  };
  const monthName = MONTHS[m.getMonth()].toLowerCase();
  const lastDay = `${daysIn(m.getFullYear(), m.getMonth())} ${MONTHS_GEN[m.getMonth()]}`;
  const note = isCur
    ? (plannedNet ? `С учётом запланированных: ${moneySigned(balance + plannedNet)} к ${lastDay}` : '')
    : `Итог за ${monthName}: ${moneySigned(inc - exp)}${plannedNet ? `, запланировано: ${moneySigned(plannedNet)}` : ''}`;

  // ===== Не пропустить =====
  const pays = soonPay.slice(0, 3);
  const open = todayTasks.filter((t) => !t.done).sort(byTime);
  // На главной — дела со временем (до двух ближайших); остальные — одной ссылкой
  const nowHm = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const timed = open.filter((t) => t.time);
  const upcoming = timed.filter((t) => t.time >= nowHm);
  const missed = timed.filter((t) => t.time < nowHm);
  const shownTasks = [...missed.slice(-1), ...upcoming].slice(0, 2);
  const restTasks = open.length - shownTasks.length;
  const payLabel = (t) => {
    const n = daysUntil(txDay(t));
    const what = t.kind === 'income' ? 'Поступление' : 'Оплата';
    return n < 0 ? `${what} просрочена` : n === 0 ? `${what} сегодня` : `${what} завтра`;
  };
  const payCard = (t) => {
    const name = t.note || t.expand?.category?.name || (t.kind === 'income' ? 'Доход' : 'Расход');
    const late = daysUntil(txDay(t)) < 0;
    return `<div class="card nudge">
      <a class="nudge-link" href="#/edit/${t.id}">
        <span class="nudge-ic ${late ? 'late' : t.kind === 'income' ? 'inc' : 'exp'}">${ICON.cal}</span>
        <span class="main"><span class="nudge-k ${late ? 'late' : t.kind === 'income' ? 'inc' : 'exp'}">${payLabel(t)}</span>
        <span class="name pay-name"><span class="t">${esc(name)}</span><span class="sum">${signed(t.amount, t.kind).replace(/^[+−]/, '')}</span></span></span></a>
      <button type="button" class="btn small secondary" data-pay="${t.id}">${t.kind === 'income' ? 'Получено' : 'Оплачено'}</button></div>`;
  };
  const taskCard = (t) => {
    const left = timeLeft(t.time);
    return `<div class="card nudge">
      <button type="button" class="nudge-link" data-open="${t.id}">
        <span class="nudge-ic inc">${ICON.clock}</span>
        <span class="main"><span class="nudge-k ${left === 'Время прошло' ? 'late' : 'inc'}">${left} · ${esc(t.time)}</span>
        <span class="name">${esc(t.title)}</span></span></button>
      <button type="button" class="btn small secondary" data-done="${t.id}">Сделано</button></div>`;
  };
  // Предупреждение: идём по платежам недели по порядку дат — в какой день денег на руках станет меньше нуля
  const shortage = (() => {
    let run = balance, need = 0;
    for (const t of weekPay) {
      if (t.kind === 'expense') need += t.amount;
      run += net(t);
      if (t.kind === 'expense' && run < 0) return { day: txDay(t), need, lack: -run };
    }
    return null;
  })();
  const shortCard = (w) => {
    const n = daysUntil(w.day);
    const when = n <= 0 ? 'сегодня' : n === 1 ? 'завтра' : `к ${humanDate(w.day)}, ${WEEKDAYS[parseYmd(w.day).getDay()]}`;
    return `<div class="card nudge">
      <a class="nudge-link" href="#/calendar">
        <span class="nudge-ic late">${ICON.cal}</span>
        <span class="main"><span class="nudge-k late">Не хватит ${money(w.lack)} ${esc(when)}</span>
        <span class="name">Платежей ${money(w.need)}, на руках ${moneySigned(balance)}</span></span></a></div>`;
  };
  const wk = weekStart(), rv = readReview();
  const review = isCur && rv?.week === wk && rv.text && !rv.hidden ? rv.text : '';
  const reviewCard = () => `<div class="card nudge">
      <span class="nudge-ic inc">${ICON.spark}</span>
      <span class="main"><span class="nudge-k inc">Итоги недели</span><span class="review-text">${esc(review)}</span></span>
      <button type="button" class="icon-btn ghost" id="rv-x" aria-label="Скрыть итоги недели">${ICON.close}</button></div>`;
  const nudges = isCur ? [...(shortage ? [shortCard(shortage)] : []), ...(review ? [reviewCard()] : []), ...pays.map(payCard), ...shownTasks.map(taskCard)].join('') : '';
  const moreLink = isCur && restTasks > 0
    ? `<a class="someday-link" href="#/tasks">${shownTasks.length ? 'Ещё' : 'На сегодня'} ${restTasks} ${plural(restTasks, 'дело', 'дела', 'дел')}${ICON.right}</a>` : '';

  $view.innerHTML = `
    <div class="head">${monthSwitch()}<div class="head-btns"><button type="button" class="icon-btn asst-btn" id="asst" aria-label="Помощник">${ICON.spark}</button><a class="icon-btn" href="#/settings" aria-label="Настройки">${ICON.gear}</a></div></div>
    <section class="hero">
      <div class="hero-top">
        <a class="bal-btn" href="#/overview" aria-label="Баланс на сегодня ${moneySigned(balance)}. Открыть обзор">
          <span class="label"><span>Баланс на сегодня</span><span class="ov-link" aria-hidden="true">Обзор${ICON.right}</span></span>
          <span class="big">${moneySigned(balance)}</span></a>
        <button type="button" class="icon-btn ghost cash-btn" id="cash" aria-label="Изменить остаток на руках">${ICON.edit}</button>
      </div>
      <div class="pair">
        <div><div class="k">Доходы</div><div class="v inc">+${money(inc)}</div>${delta(inc, prevInc, true)}</div>
        <div><div class="k">Расходы</div><div class="v exp">−${money(exp)}</div>${delta(exp, prevExp, false)}</div>
      </div>
      ${note ? `<div class="note">${esc(note)}</div>` : ''}
    </section>
    ${nudges || moreLink ? `<section class="sec nudges" aria-label="Не пропустить">${nudges}${moreLink}</section>` : ''}`;
  bindMonthSwitch();
  $view.querySelector('#asst').onclick = (e) => openAssistant(e.currentTarget);
  $view.querySelector('#cash').onclick = () => cashSheet(balance);
  $view.querySelector('#rv-x')?.addEventListener('click', () => { writeReview({ ...readReview(), hidden: true }); render(); });
  if (isCur) loadReview(alive);
  $view.querySelectorAll('[data-pay]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await markPaid(pays.find((t) => t.id === b.dataset.pay)); render(); }
    catch (e) { toast(errText(e)); b.disabled = false; }
  });
  $view.querySelectorAll('[data-done]').forEach((b) => b.onclick = async () => {
    const t = shownTasks.find((x) => x.id === b.dataset.done); if (!t) return;
    b.disabled = true;
    try {
      const undo = await completeTask(t);
      toast('Сделано', { label: 'Отменить', run: async () => { await undo(); render(); } });
      render();
    } catch (e) { toast(errText(e)); b.disabled = false; }
  });
  $view.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { const t = shownTasks.find((x) => x.id === b.dataset.open); if (t) taskSheet(t); });
}

export function cashSheet(balance) {
  // Чаще всего хочется просто сказать «у меня сейчас столько» — этот режим первый
  let mode = 'set';
  const draw = (s) => {
    const amtVal = s.querySelector('#ca')?.value ?? '';
    const noteVal = s.querySelector('#cn2')?.value ?? '';
    s.innerHTML = `<h2>Остаток на руках</h2>
      <p style="margin:0;color:var(--soft);font-size:14px">Это не доход и не расход: в отчёты не попадает, только меняет баланс. Удобно, чтобы учесть наличные или деньги, которые были до начала учёта.</p>
      <div class="segment" role="group" aria-label="Способ">
        <button type="button" data-mode="set" aria-pressed="${mode === 'set'}">Указать точно</button>
        <button type="button" data-mode="add" aria-pressed="${mode === 'add'}">Добавить к балансу</button>
      </div>
      <div class="amount-box"><label for="ca">${mode === 'add' ? 'Сколько добавить' : 'Сколько у меня сейчас всего'}</label>
        <div class="line"><input id="ca" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(amtVal)}"><div class="cur">${esc(CFG.CURRENCY)}</div></div></div>
      <div class="form-list"><div class="frow"><label for="cn2">Комментарий</label><input id="cn2" maxlength="500" placeholder="Например, наличные в кармане" value="${esc(noteVal)}"></div></div>
      <p class="hint" id="cprev" style="margin:0;color:var(--muted);font-size:13px"></p>
      <div class="error" id="cerr2" role="alert"></div>
      <div class="btns"><button class="btn secondary" id="ccl">Отмена</button><button class="btn" id="csv">Сохранить</button></div>`;
    const prev = () => {
      const v = parseAmount(s.querySelector('#ca').value);
      const el = s.querySelector('#cprev');
      if (!Number.isFinite(v)) { el.textContent = `Сейчас баланс: ${moneySigned(balance)}`; return; }
      const after = mode === 'add' ? balance + v : v;
      el.textContent = `Баланс: ${moneySigned(balance)} → ${moneySigned(after)}`;
    };
    prev();
    s.querySelector('#ca').oninput = prev;
    s.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { mode = b.dataset.mode; draw(s); });
    s.querySelector('#ccl').onclick = closeSheet;
    s.querySelector('#csv').onclick = async () => {
      const v = parseAmount(s.querySelector('#ca').value);
      const err = s.querySelector('#cerr2');
      if (!Number.isFinite(v) || (mode === 'add' && v === 0)) { err.textContent = 'Введи сумму.'; return; }
      const delta = Math.round((mode === 'add' ? v : v - balance) * 100) / 100;
      if (delta === 0) { err.textContent = 'Баланс уже равен этой сумме.'; return; }
      try {
        await pb.collection('transactions').create({
          kind: 'adjust', amount: delta, book: curBook(), date: pbDate(today()), status: 'paid', repeat: 'none',
          note: s.querySelector('#cn2').value.trim() || 'Остаток на руках', extra: {}, owner: uid()
        });
        closeSheet(); toast('Баланс обновлён'); render();
      } catch (e) { err.textContent = errText(e); }
    };
  };
  openSheet('', draw);
}
