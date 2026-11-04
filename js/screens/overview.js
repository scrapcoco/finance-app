// Обзор: полная сводка за месяц — плитки, кольцо «по категориям», кольцо «доход месяца», цифры, крупные траты
import { esc, money, moneySigned, MONTHS, ymd, txDay, today, addMonths, daysIn, shortDate } from '../core/util.js';
import { state } from '../core/state.js';
import { pb, ownerFilter } from '../core/pb.js';
import { $view, monthSwitch, bindMonthSwitch } from '../ui.js';
import { txBetween, getCats, getDebts } from '../core/data.js';
import { render } from '../router.js';

// Цвета категорий: 6 слотов, проверены валидатором палитры на тёмном фоне (CVD ΔE ≥ 8.4, контраст ≥ 3:1).
// Цвет закреплён за категорией (её место в списке категорий), а не за размером траты — от месяца к месяцу
// «Еда» остаётся одного цвета. Седьмая и дальше, а также «без категории» — в серое «Остальное».
const SLOTS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
const OTHER = '#6b7785';

// Кольцо (SVG): сегменты — дуги одной окружности через stroke-dasharray, между ними зазор 2px
function donut(parts, total, center, id) {
  const R = 70, W = 20, C = 2 * Math.PI * R, GAP = parts.length > 1 ? 2.5 : 0;
  let acc = 0;
  const segs = parts.map((p, i) => {
    const len = (p.value / total) * C;
    const seg = `<circle class="ov-seg" data-i="${i}" r="${R}" cx="90" cy="90" fill="none" stroke="${p.color}" stroke-width="${W}"
      stroke-dasharray="${Math.max(0.01, len - GAP)} ${C}" stroke-dashoffset="${-acc}" transform="rotate(-90 90 90)">
      <title>${esc(p.label)}: ${money(p.value)} · ${Math.round((p.value / total) * 100)}%</title></circle>`;
    acc += len;
    return seg;
  }).join('');
  return `<div class="ov-donut" id="${id}">
    <svg viewBox="0 0 180 180" role="img" aria-label="${esc(center.aria)}">
      <circle r="${R}" cx="90" cy="90" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${W}"/>${segs}
    </svg>
    <div class="ov-center"><b>${center.value}</b><span>${esc(center.label)}</span></div>
  </div>`;
}

export async function overviewScreen(route, alive) {
  const m = state.month;
  const from = ymd(m), to = ymd(addMonths(m, 1));
  const [txs, cats, debts, debtPays] = await Promise.all([
    txBetween(from, to),
    getCats(),
    getDebts(),
    pb.collection('transactions').getFullList({ filter: `${ownerFilter()} && status = 'paid' && debt != ''`, fields: 'debt,amount' })
  ]);
  if (!alive()) return;

  const paid = txs.filter((t) => t.status === 'paid');
  const inc = paid.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
  const exp = paid.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
  const saved = inc - exp;
  const plannedExp = txs.filter((t) => t.status === 'planned' && t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
  const isCur = from <= today() && today() < to;
  const daysPassed = isCur ? Number(today().slice(8, 10)) : daysIn(m.getFullYear(), m.getMonth());
  const biggest = paid.filter((t) => t.kind === 'expense').sort((a, b) => b.amount - a.amount);
  const paidBy = {};
  for (const p of debtPays) paidBy[p.debt] = (paidBy[p.debt] || 0) + p.amount;
  const debtLeft = debts.filter((d) => !d.closed && d.direction !== 'lent').reduce((s, d) => s + Math.max(0, d.total - (paidBy[d.id] || 0)), 0);

  // Кольцо по категориям выбранного типа
  const kind = state.ovKind === 'income' ? 'income' : 'expense';
  const kindCats = cats.filter((c) => c.kind === kind);
  const slotOf = Object.fromEntries(kindCats.map((c, i) => [c.id, i < SLOTS.length ? i : -1]));
  const sums = new Map();
  for (const t of paid.filter((x) => x.kind === kind)) {
    const slot = slotOf[t.category] ?? -1;
    const key = slot >= 0 ? t.category : 'other';
    sums.set(key, (sums.get(key) || 0) + t.amount);
  }
  const parts = [...sums.entries()].map(([key, value]) => {
    if (key === 'other') return { key, value, label: 'Остальное', color: OTHER };
    const c = kindCats.find((x) => x.id === key);
    return { key, value, label: c.name, color: SLOTS[slotOf[key]] };
  }).sort((a, b) => b.value - a.value);
  const catTotal = parts.reduce((s, p) => s + p.value, 0);
  const kindWord = kind === 'income' ? 'доходы' : 'расходы';

  // Кольцо «доход месяца»: сколько потрачено и сколько осталось
  const spentPart = inc > 0 ? Math.min(exp, inc) : 0;
  const incomeRing = inc > 0
    ? donut([
        { label: 'Потрачено', value: spentPart, color: SLOTS[1] },
        ...(inc - spentPart > 0 ? [{ label: 'Осталось', value: inc - spentPart, color: SLOTS[2] }] : [])
      ], inc, { value: `${Math.round((Math.max(0, saved) / inc) * 100)}%`, label: 'осталось', aria: `Из дохода ${money(inc)} потрачено ${money(spentPart)}` }, 'ov-income')
    : '';

  const monthLabel = `${MONTHS[m.getMonth()]} ${m.getFullYear()}`;
  const seg = (k, l) => `<button type="button" class="${k === 'expense' ? 'exp-on' : 'inc-on'}" data-ok="${k}" aria-pressed="${kind === k}">${l}</button>`;

  $view.innerHTML = `
    <div class="head"><h1>Обзор</h1>${monthSwitch()}</div>
    <div class="stats ov-stats">
      <div class="stat"><div class="k">Доходы</div><div class="v inc">+${money(inc)}</div></div>
      <div class="stat"><div class="k">Расходы</div><div class="v exp">−${money(exp)}</div></div>
      <div class="stat"><div class="k">Сбережения</div><div class="v">${moneySigned(saved)}</div>
        ${inc > 0 ? `<div class="ov-sub">${Math.round((saved / inc) * 100)}% дохода</div>` : ''}</div>
    </div>
    <section class="panel ov-cats">
      <div class="sec-head"><h2>По категориям</h2><span class="ov-muted">${esc(monthLabel)}</span></div>
      <div class="segment" role="group" aria-label="Тип для диаграммы">${seg('expense', 'Расходы')}${seg('income', 'Доходы')}</div>
      ${parts.length ? `<div class="ov-donut-wrap">
        ${donut(parts, catTotal, { value: money(catTotal), label: `${kindWord} за месяц`, aria: `${kindWord} по категориям` }, 'ov-cat')}
        <ul class="ov-legend">${parts.map((p, i) => `<li data-i="${i}"><i style="background:${p.color}"></i><span class="n">${esc(p.label)}</span>
          <span class="a">${money(p.value)}</span><span class="p">${Math.round((p.value / catTotal) * 100)}%</span></li>`).join('')}</ul>
      </div>` : `<div class="empty">За ${MONTHS[m.getMonth()].toLowerCase()} ${kind === 'income' ? 'доходов' : 'расходов'} нет.</div>`}
    </section>
    <section class="panel ov-side">
      <h2>Доход месяца</h2>
      ${incomeRing ? `<div class="ov-donut-wrap small">${incomeRing}
        <ul class="ov-legend"><li><i style="background:${SLOTS[1]}"></i><span class="n">Потрачено</span><span class="a">${money(spentPart)}</span></li>
          <li><i style="background:${SLOTS[2]}"></i><span class="n">Осталось</span><span class="a">${money(Math.max(0, saved))}</span></li></ul></div>`
        : '<div class="empty">Доходов в этом месяце пока нет.</div>'}
      <div class="ov-facts">
        <div><span>Средний расход в день</span><b>${money(daysPassed ? exp / daysPassed : 0)}</b></div>
        <div><span>Самая крупная трата</span><b>${biggest[0] ? money(biggest[0].amount) : '—'}</b></div>
        <div><span>Ещё к оплате в этом месяце</span><b>${money(plannedExp)}</b></div>
        <div><span>Осталось по долгам</span><b>${money(debtLeft)}</b></div>
      </div>
    </section>
    <section class="sec ov-top">
      <div class="sec-head"><h2>Крупные траты</h2><a href="#/history">Вся история</a></div>
      ${biggest.length ? `<div class="list">${biggest.slice(0, 5).map((t) => `<a class="row" href="#/edit/${t.id}?back=overview">
        <div class="main"><div class="name">${esc(t.note || t.expand?.category?.name || 'Расход')}</div>
        <div class="meta">${esc([shortDate(txDay(t)), t.note ? t.expand?.category?.name : ''].filter(Boolean).join(', '))}</div></div>
        <div class="amt exp">−${money(t.amount)}</div></a>`).join('')}</div>`
        : '<div class="list"><div class="empty">Трат в этом месяце нет.</div></div>'}
    </section>`;

  bindMonthSwitch();
  $view.querySelectorAll('[data-ok]').forEach((b) => b.onclick = () => { state.ovKind = b.dataset.ok; render(); });

  // Наведение/нажатие на сектор или строку легенды — в центре кольца эта категория, остальные приглушаются
  const wrap = $view.querySelector('.ov-cats .ov-donut-wrap');
  if (wrap) {
    const center = wrap.querySelector('.ov-center');
    const base = center.innerHTML;
    let pinned = null;
    const show = (i) => {
      wrap.classList.toggle('focus', i !== null);
      wrap.querySelectorAll('[data-i]').forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === i));
      center.innerHTML = i === null ? base
        : `<b>${money(parts[i].value)}</b><span>${esc(parts[i].label)} · ${Math.round((parts[i].value / catTotal) * 100)}%</span>`;
    };
    wrap.querySelectorAll('[data-i]').forEach((el) => {
      const i = Number(el.dataset.i);
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && pinned === null) show(i); });
      el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && pinned === null) show(null); });
      el.addEventListener('click', () => { pinned = pinned === i ? null : i; show(pinned); });
    });
  }
}
