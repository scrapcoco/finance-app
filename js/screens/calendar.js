// Календарь платежей
import { money, MONTHS_GEN, WEEKDAYS, ymd, parseYmd, txDay, today, addMonths, daysIn } from '../core/util.js';
import { state } from '../core/state.js';
import { $view, toast, errText, monthSwitch, txRow } from '../ui.js';
import { txBetween, markPaid } from '../core/data.js';
import { render } from '../router.js';

export async function calendarScreen(route, alive) {
  const m = state.month;
  const from = ymd(m), to = ymd(addMonths(m, 1));
  if (state.selDay < from || state.selDay >= to) state.selDay = from <= today() && today() < to ? today() : from;
  const txs = await txBetween(from, to);
  if (!alive()) return;
  let expInc = 0, expExp = 0;
  const byDay = {};
  for (const t of txs) {
    (byDay[txDay(t)] ||= []).push(t);
    if (t.status === 'planned') { if (t.kind === 'income') expInc += t.amount; else if (t.kind === 'expense') expExp += t.amount; }
  }
  const lead = (m.getDay() + 6) % 7;
  const n = daysIn(m.getFullYear(), m.getMonth());
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div></div>');
  const t0 = today();
  for (let d = 1; d <= n; d++) {
    const key = ymd(new Date(m.getFullYear(), m.getMonth(), d));
    const list = byDay[key] || [];
    const hasI = list.some((t) => t.kind === 'income'), hasE = list.some((t) => t.kind === 'expense');
    const cls = ['day', key < t0 ? 'past' : '', key === t0 ? 'today' : ''].join(' ');
    cells.push(`<button class="${cls}" data-day="${key}" aria-pressed="${key === state.selDay}" aria-label="${d} ${MONTHS_GEN[m.getMonth()]}${list.length ? `, записей: ${list.length}` : ''}">
      <span class="n">${d}</span><span class="dots">${hasI ? '<i class="di"></i>' : ''}${hasE ? '<i class="de"></i>' : ''}</span></button>`);
  }
  const sel = byDay[state.selDay] || [];
  const sd = parseYmd(state.selDay);

  $view.innerHTML = `
    <div class="head"><h1>Платежи</h1>${monthSwitch()}</div>
    <div class="stats">
      <div class="stat"><div class="k">Ожидается</div><div class="v inc">+${money(expInc)}</div></div>
      <div class="stat"><div class="k">К оплате</div><div class="v exp">−${money(expExp)}</div></div>
    </div>
    <div class="cal">
      <div class="cal-week"><div>Пн</div><div>Вт</div><div>Ср</div><div>Чт</div><div>Пт</div><div>Сб</div><div>Вс</div></div>
      <div class="cal-grid">${cells.join('')}</div>
    </div>
    <section class="sec">
      <div class="sec-head"><h2>${sd.getDate()} ${MONTHS_GEN[sd.getMonth()]}, ${WEEKDAYS[sd.getDay()]}</h2>
        <a href="#/add?date=${state.selDay}&back=calendar">Добавить</a></div>
      ${sel.length ? `<div class="list">${sel.map((t) => `
        ${txRow(t, { planned: t.status === 'planned' })}
        ${t.status === 'planned' ? `<div class="frow" style="border-bottom:1px solid var(--line)"><span class="hint">Не оплачено</span><button class="btn small" data-pay="${t.id}">Отметить оплаченным</button></div>` : ''}`).join('')}</div>`
        : `<div class="list"><div class="empty">В этот день записей нет.</div></div>`}
    </section>`;
  $view.querySelector('.month-switch').querySelectorAll('[data-m]').forEach((b) => {
    b.onclick = () => { state.month = addMonths(state.month, Number(b.dataset.m)); render(); };
  });
  $view.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { state.selDay = b.dataset.day; render(); });
  $view.querySelectorAll('[data-pay]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await markPaid(sel.find((t) => t.id === b.dataset.pay)); render(); }
    catch (e) { toast(errText(e)); b.disabled = false; }
  });
}
