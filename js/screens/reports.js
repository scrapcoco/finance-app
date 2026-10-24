// Отчёты: день, неделя, месяц, категории
import { esc, nf, money, MONTHS, MONTHS_GEN, MONTHS_SHORT, ymd, parseYmd, txDay, today, addMonths, addDays } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { state } from '../core/state.js';
import { $view, monthSwitch, bindMonthSwitch } from '../ui.js';
import { txBetween } from '../core/data.js';
import { render } from '../router.js';

export async function reportsScreen(route, alive) {
  const m = state.month;
  let pFrom, pTo, pLabel;
  if (state.period === 'year') state.period = 'month';
  const t0 = parseYmd(today());
  if (state.period === 'day') {
    const d = state.repDay ? parseYmd(state.repDay) : t0;
    pFrom = ymd(d); pTo = ymd(addDays(d, 1));
    pLabel = pFrom === today() ? 'Сегодня' : pFrom === ymd(addDays(t0, -1)) ? 'Вчера' : `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  } else if (state.period === 'week') {
    const thisMon = addDays(t0, -((t0.getDay() + 6) % 7));
    const start = state.repWeek ? parseYmd(state.repWeek) : thisMon;
    const end = addDays(start, 6);
    pFrom = ymd(start); pTo = ymd(addDays(start, 7));
    pLabel = pFrom === ymd(thisMon) ? 'Эта неделя'
      : start.getMonth() === end.getMonth() ? `${start.getDate()}–${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`
      : `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
  } else {
    pFrom = ymd(m); pTo = ymd(addMonths(m, 1)); pLabel = `${MONTHS[m.getMonth()]} ${m.getFullYear()}`;
  }
  const cFrom = ymd(addMonths(m, -5)), cTo = ymd(addMonths(m, 1));
  const from = pFrom < cFrom ? pFrom : cFrom, to = pTo > cTo ? pTo : cTo;
  const txs = await txBetween(from, to, "status = 'paid'");
  if (!alive()) return;

  let inc = 0, exp = 0; const byCat = {}, byCatInc = {};
  for (const t of txs) {
    const d = txDay(t); if (d < pFrom || d >= pTo) continue;
    if (t.kind === 'income') { inc += t.amount; const name = t.expand?.category?.name || 'Без категории'; byCatInc[name] = (byCatInc[name] || 0) + t.amount; }
    else if (t.kind === 'expense') { exp += t.amount; const name = t.expand?.category?.name || 'Без категории'; byCat[name] = (byCat[name] || 0) + t.amount; }
  }
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const s = addMonths(m, -i), e = addMonths(s, 1);
    let mi = 0, me = 0;
    for (const t of txs) { const d = txDay(t); if (d >= ymd(s) && d < ymd(e)) { if (t.kind === 'income') mi += t.amount; else if (t.kind === 'expense') me += t.amount; } }
    months.push({ label: MONTHS_SHORT[s.getMonth()], inc: mi, exp: me, cur: i === 0 });
  }
  const max = Math.max(1, ...months.map((x) => Math.max(x.inc, x.exp)));
  const isInc = state.catKind === 'income';
  const catTotal = isInc ? inc : exp;
  const cats = Object.entries(isInc ? byCatInc : byCat).sort((a, b) => b[1] - a[1]);
  const catMax = cats[0]?.[1] || 1;
  const seg = (k, l) => `<button type="button" data-p="${k}" aria-pressed="${state.period === k}">${l}</button>`;

  $view.innerHTML = `
    <div class="head"><h1>Отчёты</h1>${state.period === 'month' ? monthSwitch() : `<div class="month-switch">
      <button class="icon-btn ghost" data-shift="-1" aria-label="Назад">${ICON.left}</button>
      <div class="title">${esc(pLabel)}</div>
      <button class="icon-btn ghost" data-shift="1" aria-label="Вперёд" ${pTo > today() ? 'disabled style="opacity:.3"' : ''}>${ICON.right}</button>
    </div>`}</div>
    <div class="segment" role="group" aria-label="Период">${seg('day', 'День')}${seg('week', 'Неделя')}${seg('month', 'Месяц')}</div>
    <div class="stats">
      <div class="stat"><div class="k">Доходы</div><div class="v inc">+${nf.format(Math.round(inc))}</div></div>
      <div class="stat"><div class="k">Расходы</div><div class="v exp">−${nf.format(Math.round(exp))}</div></div>
      <div class="stat"><div class="k">Осталось</div><div class="v">${inc - exp < 0 ? '−' : ''}${nf.format(Math.abs(Math.round(inc - exp)))}</div></div>
    </div>
    <section class="panel">
      <div class="sec-head"><h2>Полгода</h2><div class="legend"><span><i style="background:var(--inc)"></i>Доходы</span><span><i style="background:var(--exp)"></i>Расходы</span></div></div>
      <div class="bars" role="img" aria-label="Доходы и расходы за последние шесть месяцев">
        ${months.map((x) => `<div class="bar-col ${x.cur ? 'cur' : ''}"><div class="bar-pair">
          <div class="bar" style="height:${(x.inc / max) * 100}%;background:var(--inc);opacity:${x.cur ? 1 : 0.55}"></div>
          <div class="bar" style="height:${(x.exp / max) * 100}%;background:var(--exp);opacity:${x.cur ? 1 : 0.55}"></div>
        </div><div class="lbl">${x.label}</div></div>`).join('')}
      </div>
    </section>
    <section class="panel">
      <h2>По категориям</h2>
      <div class="segment" role="group" aria-label="Тип">
        <button type="button" class="exp-on" data-ck="expense" aria-pressed="${!isInc}">Расходы</button>
        <button type="button" class="inc-on" data-ck="income" aria-pressed="${isInc}">Доходы</button>
      </div>
      ${cats.length ? cats.map(([name, v]) => `<div class="cat-row">
        <div class="top"><b>${esc(name)}</b><span><b style="color:var(--ink)">${money(v)}</b> · ${Math.round((v / catTotal) * 100)}%</span></div>
        <div class="meter ${isInc ? 'inc' : ''}"><i style="width:${(v / catMax) * 100}%"></i></div></div>`).join('')
        : `<div class="empty">За этот период ${isInc ? 'доходов' : 'расходов'} нет.</div>`}
    </section>`;
  $view.querySelectorAll('[data-ck]').forEach((b) => b.onclick = () => { state.catKind = b.dataset.ck; render(); });
  $view.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { state.period = b.dataset.p; render(); });
  $view.querySelectorAll('[data-shift]').forEach((b) => b.onclick = () => {
    const n = Number(b.dataset.shift);
    if (state.period === 'day') state.repDay = ymd(addDays(parseYmd(pFrom), n));
    else state.repWeek = ymd(addDays(parseYmd(pFrom), 7 * n));
    render();
  });
  bindMonthSwitch();
}
