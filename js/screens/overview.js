// Обзор (вместо отдельных «Отчётов»): сводка за день/неделю/месяц — плитки, кольцо «по категориям»,
// кольцо «доход периода», цифры, график за полгода, крупные траты
import { esc, money, moneySigned, MONTHS, MONTHS_GEN, MONTHS_SHORT, ymd, parseYmd, txDay, today, addMonths, addDays, shortDate } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { state } from '../core/state.js';
import { pb, ownerFilter } from '../core/pb.js';
import { $view, monthSwitch, bindMonthSwitch } from '../ui.js';
import { txBetween, getCats, getDebts, withBook } from '../core/data.js';
import { render } from '../router.js';

// Цвета категорий: 6 слотов без голубого и оранжевого — эти два цвета в приложении значат «доход» и «расход».
// Проверены валидатором палитры на тёмном фоне (все проверки пройдены, CVD ΔE ≥ 8.4, контраст ≥ 3:1).
// Цвет закреплён за категорией (её место в списке категорий), а не за размером траты.
// Седьмая и дальше, а также «без категории» — серое «Остальное».
const SLOTS = ['#199e70', '#c98500', '#d55181', '#9085e9', '#5a9e2a', '#2aa0b5'];
const OTHER = '#6b7785';
const INC = 'var(--inc)', EXP = 'var(--exp)';

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
  // Маска «обводит» кольцо по кругу при входе в раздел (анимация .ov-reveal в app.css; без неё кольцо видно сразу)
  return `<div class="ov-donut" id="${id}">
    <svg viewBox="0 0 180 180" role="img" aria-label="${esc(center.aria)}">
      <defs><mask id="${id}-m"><circle class="ov-reveal" r="${R}" cx="90" cy="90" fill="none" stroke="#fff" stroke-width="${W + 4}"
        stroke-dasharray="440" stroke-dashoffset="0" transform="rotate(-90 90 90)"/></mask></defs>
      <circle r="${R}" cx="90" cy="90" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${W}"/>
      <g mask="url(#${id}-m)">${segs}</g>
    </svg>
    <div class="ov-center"><b>${center.value}</b><span>${esc(center.label)}</span></div>
  </div>`;
}

// Период: день / неделя / месяц (state.period, сдвиг — state.repDay / state.repWeek, месяц — state.month)
function periodRange() {
  const m = state.month, t0 = parseYmd(today());
  if (state.period === 'day') {
    const d = state.repDay ? parseYmd(state.repDay) : t0;
    const from = ymd(d);
    const label = from === today() ? 'Сегодня' : from === ymd(addDays(t0, -1)) ? 'Вчера' : `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
    return { from, to: ymd(addDays(d, 1)), label, word: 'день', days: 1 };
  }
  if (state.period === 'week') {
    const thisMon = addDays(t0, -((t0.getDay() + 6) % 7));
    const start = state.repWeek ? parseYmd(state.repWeek) : thisMon, end = addDays(start, 6);
    const label = ymd(start) === ymd(thisMon) ? 'Эта неделя'
      : start.getMonth() === end.getMonth() ? `${start.getDate()}–${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`
      : `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
    return { from: ymd(start), to: ymd(addDays(start, 7)), label, word: 'неделю', days: 7 };
  }
  return { from: ymd(m), to: ymd(addMonths(m, 1)), label: `${MONTHS[m.getMonth()]} ${m.getFullYear()}`, word: 'месяц', days: null };
}

export async function overviewScreen(route, alive) {
  if (!['day', 'week', 'month'].includes(state.period)) state.period = 'month';
  const m = state.month;
  const P = periodRange();
  // Одним запросом: выбранный период + полгода для графика
  const cFrom = ymd(addMonths(m, -5)), cTo = ymd(addMonths(m, 1));
  const qFrom = P.from < cFrom ? P.from : cFrom, qTo = P.to > cTo ? P.to : cTo;
  const [all, cats, debts, debtPays] = await Promise.all([
    txBetween(qFrom, qTo),
    getCats(),
    getDebts(),
    pb.collection('transactions').getFullList({ filter: withBook(`${ownerFilter()} && status = 'paid' && debt != ''`), fields: 'debt,amount' })
  ]);
  if (!alive()) return;

  const inP = all.filter((t) => { const d = txDay(t); return d >= P.from && d < P.to; });
  const paid = inP.filter((t) => t.status === 'paid');
  const sum = (arr, kind) => arr.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0);
  const inc = sum(paid, 'income'), exp = sum(paid, 'expense'), saved = inc - exp;
  const plannedExp = sum(inP.filter((t) => t.status === 'planned'), 'expense');
  // Дней для «среднего в день»: прошедшие дни периода (текущий месяц/неделя — до сегодня включительно)
  const lastDay = today() < P.to ? today() : ymd(addDays(parseYmd(P.to), -1));
  const daysPassed = Math.max(1, Math.round((parseYmd(lastDay) - parseYmd(P.from)) / 86400000) + 1);
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
    const key = (slotOf[t.category] ?? -1) >= 0 ? t.category : 'other';
    sums.set(key, (sums.get(key) || 0) + t.amount);
  }
  const parts = [...sums.entries()].map(([key, value]) => {
    if (key === 'other') return { key, value, label: 'Остальное', color: OTHER };
    return { key, value, label: kindCats.find((x) => x.id === key).name, color: SLOTS[slotOf[key]] };
  }).sort((a, b) => b.value - a.value);
  const catTotal = parts.reduce((s, p) => s + p.value, 0);
  const kindWord = kind === 'income' ? 'доходы' : 'расходы';

  // Кольцо «доход периода»: цвета смысловые — потрачено цветом расходов, осталось цветом доходов
  const spentPart = inc > 0 ? Math.min(exp, inc) : 0;
  const incomeRing = inc > 0
    ? donut([
        { label: 'Потрачено', value: spentPart, color: EXP },
        ...(inc - spentPart > 0 ? [{ label: 'Осталось', value: inc - spentPart, color: INC }] : [])
      ], inc, { value: `${Math.round((Math.max(0, saved) / inc) * 100)}%`, label: 'осталось', aria: `Из дохода ${money(inc)} потрачено ${money(spentPart)}` }, 'ov-income')
    : '';

  // График за полгода (до выбранного месяца): доходы и расходы по месяцам
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const s = ymd(addMonths(m, -i)), e = ymd(addMonths(m, -i + 1));
    const inM = all.filter((t) => t.status === 'paid' && txDay(t) >= s && txDay(t) < e);
    months.push({ label: MONTHS_SHORT[addMonths(m, -i).getMonth()], inc: sum(inM, 'income'), exp: sum(inM, 'expense'), cur: i === 0 });
  }
  const maxBar = Math.max(1, ...months.map((x) => Math.max(x.inc, x.exp)));
  const hasHistory = months.some((x) => x.inc || x.exp);

  const segK = (k, l) => `<button type="button" class="${k === 'expense' ? 'exp-on' : 'inc-on'}" data-ok="${k}" aria-pressed="${kind === k}">${l}</button>`;
  const segP = (k, l) => `<button type="button" data-p="${k}" aria-pressed="${state.period === k}">${l}</button>`;
  const head = state.period === 'month' ? monthSwitch() : `<div class="month-switch">
      <button class="icon-btn ghost" data-shift="-1" aria-label="Назад">${ICON.left}</button>
      <div class="title">${esc(P.label)}</div>
      <button class="icon-btn ghost" data-shift="1" aria-label="Вперёд" ${P.to > today() ? 'disabled style="opacity:.3"' : ''}>${ICON.right}</button>
    </div>`;

  $view.innerHTML = `
    <div class="head"><h1>Обзор</h1>${head}</div>
    <div class="segment ov-period" role="group" aria-label="Период">${segP('day', 'День')}${segP('week', 'Неделя')}${segP('month', 'Месяц')}</div>
    <div class="stats ov-stats">
      <div class="stat"><div class="k">Доходы</div><div class="v inc">+${money(inc)}</div></div>
      <div class="stat"><div class="k">Расходы</div><div class="v exp">−${money(exp)}</div></div>
      <div class="stat"><div class="k">Сбережения</div><div class="v">${moneySigned(saved)}</div>
        ${inc > 0 ? `<div class="ov-sub">${Math.round((saved / inc) * 100)}% дохода</div>` : ''}</div>
    </div>
    <section class="panel ov-cats">
      <div class="sec-head"><h2>По категориям</h2><span class="ov-muted">${esc(P.label)}</span></div>
      <div class="segment" role="group" aria-label="Тип для диаграммы">${segK('expense', 'Расходы')}${segK('income', 'Доходы')}</div>
      ${parts.length ? `<div class="ov-donut-wrap">
        ${donut(parts, catTotal, { value: money(catTotal), label: `${kindWord} за ${P.word}`, aria: `${kindWord} по категориям` }, 'ov-cat')}
        <ul class="ov-legend">${parts.map((p, i) => `<li data-i="${i}"><i style="background:${p.color}"></i><span class="n">${esc(p.label)}</span>
          <span class="a">${money(p.value)}</span><span class="p">${Math.round((p.value / catTotal) * 100)}%</span></li>`).join('')}</ul>
      </div>` : `<div class="empty">За этот период ${kind === 'income' ? 'доходов' : 'расходов'} нет.</div>`}
    </section>
    <section class="panel ov-side">
      <h2>Доход за ${P.word}</h2>
      ${incomeRing ? `<div class="ov-donut-wrap small">${incomeRing}
        <ul class="ov-legend"><li><i style="background:${EXP}"></i><span class="n">Потрачено</span><span class="a">${money(spentPart)}</span></li>
          <li><i style="background:${INC}"></i><span class="n">Осталось</span><span class="a">${money(Math.max(0, saved))}</span></li></ul></div>`
        : '<div class="empty">Доходов за этот период нет.</div>'}
      <div class="ov-facts">
        <div><span>Средний расход в день</span><b>${money(exp / daysPassed)}</b></div>
        <div><span>Самая крупная трата</span><b>${biggest[0] ? money(biggest[0].amount) : '—'}</b></div>
        <div><span>Ещё к оплате за ${P.word}</span><b>${money(plannedExp)}</b></div>
        <div><span>Осталось по долгам</span><b>${money(debtLeft)}</b></div>
      </div>
    </section>
    ${hasHistory ? `<section class="panel ov-chart">
      <div class="sec-head"><h2>Полгода</h2><div class="legend"><span><i style="background:var(--inc)"></i>Доходы</span><span><i style="background:var(--exp)"></i>Расходы</span></div></div>
      <div class="bars" role="img" aria-label="Доходы и расходы за последние шесть месяцев">
        ${months.map((x) => `<div class="bar-col ${x.cur ? 'cur' : ''}" title="${x.label}: доходы ${money(x.inc)}, расходы ${money(x.exp)}"><div class="bar-pair">
          <div class="bar" style="height:${(x.inc / maxBar) * 100}%;background:var(--inc);opacity:${x.cur ? 1 : 0.55}"></div>
          <div class="bar" style="height:${(x.exp / maxBar) * 100}%;background:var(--exp);opacity:${x.cur ? 1 : 0.55}"></div>
        </div><div class="lbl">${x.label}</div></div>`).join('')}
      </div>
    </section>` : ''}
    <section class="sec ov-top">
      <div class="sec-head"><h2>Крупные траты</h2><a href="#/history">Вся история</a></div>
      ${biggest.length ? `<div class="list">${biggest.slice(0, 5).map((t) => `<a class="row" href="#/edit/${t.id}?back=overview">
        <div class="main"><div class="name">${esc(t.note || t.expand?.category?.name || 'Расход')}</div>
        <div class="meta">${esc([shortDate(txDay(t)), t.note ? t.expand?.category?.name : ''].filter(Boolean).join(', '))}</div></div>
        <div class="amt exp">−${money(t.amount)}</div></a>`).join('')}</div>`
        : '<div class="list"><div class="empty">Трат за этот период нет.</div></div>'}
    </section>`;

  bindMonthSwitch();
  $view.querySelectorAll('[data-ok]').forEach((b) => b.onclick = () => { state.ovKind = b.dataset.ok; render(); });
  $view.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { state.period = b.dataset.p; render(); });
  $view.querySelectorAll('[data-shift]').forEach((b) => b.onclick = () => {
    const n = Number(b.dataset.shift);
    if (state.period === 'day') state.repDay = ymd(addDays(parseYmd(P.from), n));
    else state.repWeek = ymd(addDays(parseYmd(P.from), 7 * n));
    render();
  });

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
