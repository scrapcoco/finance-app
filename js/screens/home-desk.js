// Главная на ПК (от 960px): своя раскладка у каждого вида аккаунта. Телефонная главная — в home.js, её не трогаем.
//  «Для себя»: слева баланс, предупреждения и «Куда уходят деньги» (категории месяца); справа — дела на сегодня и платежи на 2 недели.
//  «Для бизнеса»: сверху четыре плитки (на счёте, выручка, расходы, прибыль); ниже проекты по прибыли и платежи на 2 недели
//  (придёт / уйдёт), затем предупреждения и дела на сегодня.
// Здесь только разметка; данные собирает и кнопки навешивает homeScreen (data-pay, data-done, data-open — как на телефоне).
import { esc, money, moneySigned, signed, MONTHS, MONTHS_SHORT, WEEKDAYS, humanDate, parseYmd, txDay, daysUntil, addMonths } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { KINDS, spark, pct } from './projects.js';
import { SLOTS } from './overview.js';

const dayLabel = (s) => {
  const n = daysUntil(s);
  return n < 0 ? 'Просрочено' : n === 0 ? 'Сегодня' : n === 1 ? 'Завтра' : `${WEEKDAYS[parseYmd(s).getDay()]}, ${humanDate(s)}`;
};
const txName = (t) => t.note || t.expand?.category?.name || (t.kind === 'income' ? 'Доход' : 'Расход');

// Платежи на 2 недели: строка = когда, что, сумма и кнопка «Оплачено/Получено»; внизу — сколько уйдёт и придёт
function paysPanel(list, biz) {
  let out = 0, inn = 0;
  for (const t of list) { if (t.kind === 'income') inn += t.amount; else if (t.kind === 'expense') out += t.amount; }
  const rows = list.slice(0, 8).map((t) => {
    const late = daysUntil(txDay(t)) < 0;
    const done = t.kind === 'income' ? 'Получено' : 'Оплачено';
    return `<div class="row dk-pay">
      <a class="main" href="#/edit/${t.id}"><span class="meta ${late ? 'late' : ''}">${esc(dayLabel(txDay(t)))}</span><span class="name">${esc(txName(t))}</span></a>
      <span class="amt ${t.kind === 'income' ? 'inc' : ''}">${signed(t.amount, t.kind)}</span>
      <button type="button" class="icon-btn ghost" data-pay="${t.id}" aria-label="${done}: ${esc(txName(t))}" title="${done}">${ICON.check}</button>
    </div>`;
  }).join('');
  const more = list.length > 8 ? `<a class="dk-more" href="#/calendar">Ещё ${list.length - 8}${ICON.right}</a>` : '';
  return `<section class="sec dk-panel dk-pays">
    <div class="sec-head"><h2>Платежи · 2 недели</h2><a href="#/calendar">Календарь</a></div>
    ${list.length ? `<div class="list">${rows}</div>${more}
      <div class="dk-sum">${biz ? `<span>Придёт <b class="inc">+${money(inn)}</b></span>` : ''}<span>Уйдёт <b>−${money(out)}</b></span>${biz || inn ? `<span>Итог <b>${moneySigned(inn - out)}</b></span>` : ''}</div>`
      : '<div class="list"><div class="empty">На две недели вперёд платежей нет.</div></div>'}
  </section>`;
}

// Дела на сегодня: все несделанные; кружок — «Сделано», нажатие на название открывает дело
function tasksPanel(tasks) {
  const open = tasks.filter((t) => !t.done), done = tasks.length - open.length;
  return `<section class="sec dk-panel dk-tasks">
    <div class="sec-head"><h2>Дела на сегодня</h2><a href="#/tasks">Все дела</a></div>
    <div class="list">${open.length ? open.map((t) => `<div class="row dk-task">
        <button type="button" class="dk-check" data-done="${t.id}" aria-label="Сделано: ${esc(t.title)}"></button>
        <button type="button" class="main" data-open="${t.id}"><span class="name">${esc(t.title)}</span>${t.note ? `<span class="meta">${esc(t.note)}</span>` : ''}</button>
        ${t.time ? `<span class="dk-time">${esc(t.time)}</span>` : ''}</div>`).join('')
      : `<div class="empty">${done ? 'Всё на сегодня сделано.' : 'На сегодня дел нет.'}</div>`}</div>
    ${done && open.length ? `<div class="dk-foot">Сделано · ${done}</div>` : ''}
  </section>`;
}

// Куда уходят деньги: 5 самых больших категорий расходов месяца полосками
function catsPanel(monthTx, m) {
  const by = new Map();
  let total = 0;
  for (const t of monthTx) {
    if (t.status !== 'paid' || t.kind !== 'expense') continue;
    const n = t.expand?.category?.name || 'Без категории';
    by.set(n, (by.get(n) || 0) + t.amount); total += t.amount;
  }
  const top = [...by].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = top[0]?.[1] || 1;
  return `<section class="sec dk-panel dk-cats">
    <div class="sec-head"><h2>Куда уходят деньги · ${MONTHS[m.getMonth()].toLowerCase()}</h2><a href="#/overview">Обзор</a></div>
    <div class="list">${top.length ? top.map(([n, v], i) => `<div class="dk-cat">
        <div class="dk-cat-top"><span class="name">${esc(n)}</span><span class="amt">${money(v)} <small>${Math.round((v / total) * 100)}%</small></span></div>
        <div class="dk-bar"><i style="width:${Math.max(3, (v / max) * 100).toFixed(1)}%;background:${SLOTS[i % SLOTS.length]}"></i></div></div>`).join('')
      : '<div class="empty">В этом месяце расходов пока нет.</div>'}</div>
  </section>`;
}

// Проекты по прибыли: до 5 активных, как на экране «Проекты»
function projectsPanel(st, m) {
  const rows = st.rows.filter((r) => !r.p.archived).slice(0, 5);
  return `<section class="sec dk-panel dk-proj">
    <div class="sec-head"><h2>Проекты · ${MONTHS[m.getMonth()].toLowerCase()}</h2><a href="#/projects">Все проекты</a></div>
    ${rows.length ? `<div class="list">${rows.map(({ p, rev, profit, margin, g, byMonth }) => `
      <a class="row pj-row" href="#/project/${p.id}">
        <i class="pj-dot" style="background:${esc(p.color || SLOTS[0])}"></i>
        <div class="main"><div class="name">${esc(p.name)}</div>
          <div class="meta">${esc(KINDS[p.kind] || KINDS.other)} · выручка ${money(rev)}${margin !== null ? ` · маржа ${Math.round(margin)}%` : ''}</div></div>
        ${spark(byMonth)}
        <div class="pj-num"><div class="amt ${profit >= 0 ? 'inc' : 'exp'}">${moneySigned(profit)}</div>
          ${g !== null ? `<div class="delta ${g >= 0 ? 'good' : 'bad'}">${pct(g)}</div>` : ''}</div>
      </a>`).join('')}</div>`
    : `<div class="list"><div class="empty">Проектов пока нет. Заведи проект — и увидишь прибыль каждого отдельно.<br><a class="btn small" href="#/projects">К проектам</a></div></div>`}
  </section>`;
}

// c: { book, m, isCur, balance, forecast, inc, exp, delta(cur, prev, upIsGood), prevInc, prevExp, note, hero, alerts, monthTx, pay14, tasks, proj }
export function deskHome(c) {
  const alerts = c.alerts ? `<section class="sec nudges dk-alerts" aria-label="Не пропустить">${c.alerts}</section>` : '';
  if (c.book !== 'business') {
    return `<div class="dk-grid dk-personal">
      <div class="dk-col">${c.hero}${alerts}${catsPanel(c.monthTx, c.m)}</div>
      <div class="dk-col">${c.isCur ? tasksPanel(c.tasks) : ''}${paysPanel(c.pay14, false)}</div>
    </div>`;
  }
  const profit = c.inc - c.exp, prevProfit = c.prevInc - c.prevExp;
  const prevMonth = MONTHS_SHORT[addMonths(c.m, -1).getMonth()];
  return `<div class="stats dk-stats">
      <a class="stat dk-stat" href="#/overview"><div class="k">На счёте</div><div class="v">${moneySigned(c.balance)}</div>${c.forecast ? `<div class="ov-sub">с платежами: ${esc(c.forecast)}</div>` : c.note && !c.isCur ? `<div class="ov-sub">${esc(c.note)}</div>` : ''}</a>
      <div class="stat dk-stat"><div class="k">Выручка</div><div class="v inc">+${money(c.inc)}</div>${c.delta(c.inc, c.prevInc, true)}</div>
      <div class="stat dk-stat"><div class="k">Расходы</div><div class="v exp">−${money(c.exp)}</div>${c.delta(c.exp, c.prevExp, false)}</div>
      <div class="stat dk-stat"><div class="k">Прибыль</div><div class="v">${moneySigned(profit)}</div>
        <div class="ov-sub">${c.inc > 0 ? `маржа ${Math.round((profit / c.inc) * 100)}%` : `за ${MONTHS[c.m.getMonth()].toLowerCase()}`}${prevProfit ? ` · ${pct(((profit - prevProfit) / Math.abs(prevProfit)) * 100)} к ${prevMonth}` : ''}</div></div>
    </div>
    <div class="dk-grid dk-business">
      <div class="dk-col">${projectsPanel(c.proj, c.m)}${alerts}</div>
      <div class="dk-col">${paysPanel(c.pay14, true)}${c.isCur ? tasksPanel(c.tasks) : ''}</div>
    </div>`;
}
