// Проекты (книга «Бизнес»): список по прибыли с ростом и графиком за полгода, карточка проекта, окно проекта
import { esc, money, moneySigned, MONTHS, MONTHS_SHORT, ymd, txDay, addMonths } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { state } from '../core/state.js';
import { pb, uid, ownerFilter } from '../core/pb.js';
import { $view, toast, errText, openSheet, closeSheet, monthSwitch, bindMonthSwitch, txRow } from '../ui.js';
import { getProjects } from '../core/data.js';
import { donut, SLOTS, OTHER } from './overview.js';
import { render } from '../router.js';

export const KINDS = { online: 'Онлайн-проект', physical: 'Физический бизнес', other: 'Другое' };
export const sum = (arr, kind) => arr.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0);
export const pct = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}%`;
// Рост прибыли к прошлому месяцу; если в прошлом месяце прибыли не было — роста не считаем
export const growth = (cur, prev) => (prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);

// Маленький график прибыли за 6 месяцев (линия), ноль — тонкой линией
export function spark(values) {
  const W = 84, H = 26, min = Math.min(0, ...values), max = Math.max(0, ...values), span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`).join(' ');
  const zero = (H - ((0 - min) / span) * H).toFixed(1);
  const up = values[values.length - 1] >= values[values.length - 2];
  return `<svg class="pj-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><line x1="0" x2="${W}" y1="${zero}" y2="${zero}"/>
    <polyline points="${pts}" style="stroke:${up ? 'var(--inc)' : 'var(--exp)'}"/></svg>`;
}

const bizTxs = (from, to, extra = '') => pb.collection('transactions').getFullList({
  filter: `${ownerFilter()} && book = 'business'${extra} && ` + pb.filter('date >= {:a} && date < {:b}', { a: `${from} 00:00:00`, b: `${to} 00:00:00` }),
  sort: '-date,-created', expand: 'category'
});

function onlyBusiness() {
  $view.innerHTML = `<div class="head"><h1>Проекты</h1></div>
    <div class="list"><div class="empty">Проекты — в книге «Бизнес»: там видно прибыль и рост каждого проекта.<br>
      <button class="btn small" id="to-biz" style="margin-top:10px">Перейти в «Бизнес»</button></div></div>`;
  $view.querySelector('#to-biz').onclick = () => document.querySelector('[data-book="business"]')?.click();
}

// Проекты за месяц m: прибыль, маржа, рост к прошлому месяцу и прибыль за полгода (для графика); итоги по активным.
// Нужна и экрану «Проекты», и главной бизнеса на ПК
export async function projectStats(m) {
  const [projects, txs] = await Promise.all([getProjects(), bizTxs(ymd(addMonths(m, -5)), ymd(addMonths(m, 1)), " && status = 'paid' && project != ''")]);
  const monthKey = (i) => ymd(addMonths(m, -i)).slice(0, 7);
  const rows = projects.map((p) => {
    const mine = txs.filter((t) => t.project === p.id);
    const byMonth = [5, 4, 3, 2, 1, 0].map((i) => { const x = mine.filter((t) => txDay(t).startsWith(monthKey(i))); return sum(x, 'income') - sum(x, 'expense'); });
    const cur = mine.filter((t) => txDay(t).startsWith(monthKey(0)));
    const rev = sum(cur, 'income'), exp = sum(cur, 'expense'), profit = rev - exp;
    return { p, rev, exp, profit, margin: rev > 0 ? (profit / rev) * 100 : null, g: growth(profit, byMonth[4]), byMonth };
  }).sort((a, b) => (a.p.archived - b.p.archived) || (b.profit - a.profit));
  const active = rows.filter((r) => !r.p.archived);
  const totRev = active.reduce((s, r) => s + r.rev, 0), totExp = active.reduce((s, r) => s + r.exp, 0);
  const totG = growth(totRev - totExp, active.reduce((s, r) => s + r.byMonth[4], 0));
  return { rows, totRev, totExp, totG };
}

export async function projectsScreen(route, alive) {
  if (state.book === 'personal') return onlyBusiness();
  const m = state.month;
  const { rows, totRev, totExp, totG } = await projectStats(m);
  if (!alive()) return;

  $view.innerHTML = `
    <div class="head"><h1>Проекты</h1>${monthSwitch()}<button class="icon-btn" id="pj-add" aria-label="Новый проект">${ICON.plus}</button></div>
    <div class="stats ov-stats">
      <div class="stat"><div class="k">Выручка</div><div class="v inc">+${money(totRev)}</div></div>
      <div class="stat"><div class="k">Расходы</div><div class="v exp">−${money(totExp)}</div></div>
      <div class="stat"><div class="k">Прибыль</div><div class="v">${moneySigned(totRev - totExp)}</div>
        ${totG !== null ? `<div class="ov-sub">${pct(totG)} к ${MONTHS_SHORT[addMonths(m, -1).getMonth()]}</div>` : ''}</div>
    </div>
    <section class="sec">
      <div class="sec-head"><h2>По прибыли · ${MONTHS[m.getMonth()].toLowerCase()}</h2></div>
      ${rows.length ? `<div class="list">${rows.map(({ p, rev, exp, profit, margin, g, byMonth }) => `
        <a class="row pj-row ${p.archived ? 'pj-archived' : ''}" href="#/project/${p.id}">
          <i class="pj-dot" style="background:${esc(p.color || SLOTS[0])}"></i>
          <div class="main"><div class="name">${esc(p.name)}</div>
            <div class="meta">${esc(KINDS[p.kind] || KINDS.other)} · выручка ${money(rev)} · расходы ${money(exp)}${margin !== null ? ` · маржа ${Math.round(margin)}%` : ''}</div></div>
          ${spark(byMonth)}
          <div class="pj-num"><div class="amt ${profit >= 0 ? 'inc' : 'exp'}">${moneySigned(profit)}</div>
            ${g !== null ? `<div class="delta ${g >= 0 ? 'good' : 'bad'}">${pct(g)}</div>` : ''}</div>
        </a>`).join('')}</div>`
      : `<div class="list"><div class="empty">Проектов пока нет. Добавь первый — например, онлайн-курс или магазин — и привязывай к нему доходы и расходы.<br>
          <button class="btn small" id="pj-add-2" style="margin-top:10px">Новый проект</button></div></div>`}
    </section>`;
  bindMonthSwitch();
  $view.querySelector('#pj-add').onclick = () => projectSheet(null);
  $view.querySelector('#pj-add-2')?.addEventListener('click', () => projectSheet(null));
}

export async function projectScreen(route, alive) {
  const m = state.month;
  const [projects, txs, cats] = await Promise.all([getProjects(), bizTxs(ymd(addMonths(m, -11)), ymd(addMonths(m, 1)), pb.filter(' && project = {:p}', { p: route.id })),
    pb.collection('categories').getFullList({ filter: `${ownerFilter()} && book = 'business' && kind = 'expense'`, sort: 'sort,name' })]);
  if (!alive()) return;
  const p = projects.find((x) => x.id === route.id);
  if (!p) { $view.innerHTML = `<div class="head"><a class="icon-btn" href="#/projects" aria-label="Назад">${ICON.left}</a></div><div class="list"><div class="empty">Проект не найден.</div></div>`; return; }
  const paid = txs.filter((t) => t.status === 'paid');
  const cur = paid.filter((t) => txDay(t).startsWith(ymd(m).slice(0, 7)));
  const rev = sum(cur, 'income'), exp = sum(cur, 'expense'), profit = rev - exp;
  const months = [];
  for (let i = 11; i >= 0; i--) { const x = paid.filter((t) => txDay(t).startsWith(ymd(addMonths(m, -i)).slice(0, 7))); months.push({ label: MONTHS_SHORT[addMonths(m, -i).getMonth()], inc: sum(x, 'income'), exp: sum(x, 'expense'), cur: i === 0 }); }
  const maxBar = Math.max(1, ...months.map((x) => Math.max(x.inc, x.exp)));
  // Расходы проекта за месяц по категориям (цвет — по месту категории в книге «Бизнес»)
  const expCats = cats;
  const parts = [...cur.filter((t) => t.kind === 'expense').reduce((mp, t) => mp.set(t.category || 'other', (mp.get(t.category || 'other') || 0) + t.amount), new Map())]
    .map(([k, v]) => { const i = expCats.findIndex((c) => c.id === k); return { label: i >= 0 ? expCats[i].name : 'Без категории', value: v, color: i >= 0 && i < SLOTS.length ? SLOTS[i] : OTHER }; })
    .sort((a, b) => b.value - a.value);

  $view.innerHTML = `
    <div class="head"><a class="icon-btn" href="#/projects" aria-label="Назад">${ICON.left}</a>
      <div class="title"><i class="pj-dot" style="background:${esc(p.color || SLOTS[0])}"></i> ${esc(p.name)}</div>
      <button class="icon-btn" id="pj-edit" aria-label="Изменить проект">${ICON.edit}</button></div>
    <div class="pj-sub"><span class="ov-muted">${esc(KINDS[p.kind] || KINDS.other)}${p.archived ? ' · в архиве' : ''}</span>${monthSwitch()}</div>
    <div class="stats ov-stats">
      <div class="stat"><div class="k">Выручка</div><div class="v inc">+${money(rev)}</div></div>
      <div class="stat"><div class="k">Расходы</div><div class="v exp">−${money(exp)}</div></div>
      <div class="stat"><div class="k">Прибыль</div><div class="v">${moneySigned(profit)}</div>${rev > 0 ? `<div class="ov-sub">маржа ${Math.round((profit / rev) * 100)}%</div>` : ''}</div>
    </div>
    <section class="panel ov-chart">
      <div class="sec-head"><h2>Год</h2><div class="legend"><span><i style="background:var(--inc)"></i>Выручка</span><span><i style="background:var(--exp)"></i>Расходы</span></div></div>
      <div class="bars" role="img" aria-label="Выручка и расходы проекта по месяцам">${months.map((x) => `<div class="bar-col ${x.cur ? 'cur' : ''}" title="${x.label}: выручка ${money(x.inc)}, расходы ${money(x.exp)}, прибыль ${moneySigned(x.inc - x.exp)}"><div class="bar-pair">
        <div class="bar" style="height:${(x.inc / maxBar) * 100}%;background:var(--inc);opacity:${x.cur ? 1 : 0.55}"></div>
        <div class="bar" style="height:${(x.exp / maxBar) * 100}%;background:var(--exp);opacity:${x.cur ? 1 : 0.55}"></div></div><div class="lbl">${x.label}</div></div>`).join('')}</div>
    </section>
    ${parts.length ? `<section class="panel ov-cats"><h2>Куда уходят деньги · ${MONTHS[m.getMonth()].toLowerCase()}</h2>
      <div class="ov-donut-wrap">${donut(parts, exp, { value: money(exp), label: 'расходы за месяц', aria: 'Расходы проекта по категориям' }, 'pj-cat')}
        <ul class="ov-legend">${parts.map((x) => `<li><i style="background:${x.color}"></i><span class="n">${esc(x.label)}</span><span class="a">${money(x.value)}</span><span class="p">${Math.round((x.value / exp) * 100)}%</span></li>`).join('')}</ul></div></section>` : ''}
    <section class="sec ov-top">
      <div class="sec-head"><h2>Записи проекта</h2><a href="#/add?kind=income&project=${p.id}&back=project/${p.id}">Добавить</a></div>
      ${txs.length ? `<div class="list">${txs.slice(0, 40).map((t) => txRow(t, { back: `project/${p.id}` })).join('')}</div>` : '<div class="list"><div class="empty">Записей пока нет — при добавлении записи в «Бизнес» выбери этот проект.</div></div>'}
    </section>`;
  bindMonthSwitch();
  $view.querySelector('#pj-edit').onclick = () => projectSheet(p);
}

export function projectSheet(p) {
  let color = p?.color || SLOTS[0], archived = !!p?.archived;
  openSheet(`<h2>${p ? 'Проект' : 'Новый проект'}</h2>
    <div class="form-list">
      <div class="frow"><label for="pn">Название</label><input id="pn" maxlength="80" placeholder="Например, онлайн-курс" value="${esc(p?.name || '')}"></div>
      <div class="frow"><label for="pk">Тип</label><select id="pk">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${(p?.kind || 'online') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="frow"><label for="pnote">Заметка</label><input id="pnote" maxlength="500" value="${esc(p?.note || '')}"></div>
      ${p ? `<div class="frow"><label id="pa-l">В архиве</label><button type="button" class="switch" id="pa" role="switch" aria-labelledby="pa-l" aria-checked="${archived}"></button></div>` : ''}
    </div>
    <div class="field-label">Цвет</div>
    <div class="chips">${SLOTS.map((c) => `<button type="button" class="pj-color" data-c="${c}" aria-label="Цвет ${c}" aria-pressed="${c === color}" style="background:${c}"></button>`).join('')}</div>
    <div class="error" id="perr" role="alert"></div>
    <div class="btns"><button class="btn secondary" id="pc">Отмена</button><button class="btn" id="ps">${p ? 'Сохранить' : 'Добавить'}</button></div>
    ${p ? '<button class="btn danger" id="pdel">Удалить проект</button>' : ''}`, (s) => {
    s.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { color = b.dataset.c; s.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
    s.querySelector('#pa')?.addEventListener('click', (e) => { archived = !archived; e.currentTarget.setAttribute('aria-checked', String(archived)); });
    s.querySelector('#pc').onclick = closeSheet;
    s.querySelector('#ps').onclick = async () => {
      const name = s.querySelector('#pn').value.trim(), err = s.querySelector('#perr');
      if (!name) { err.textContent = 'Введи название.'; return; }
      const data = { name, kind: s.querySelector('#pk').value, note: s.querySelector('#pnote').value.trim(), color, archived };
      try {
        if (p) await pb.collection('projects').update(p.id, data);
        else await pb.collection('projects').create({ ...data, owner: uid() });
        state.cache.projects = null; closeSheet(); toast(p ? 'Проект сохранён' : 'Проект добавлен'); render();
      } catch (e) { err.textContent = errText(e); }
    };
    s.querySelector('#pdel')?.addEventListener('click', async () => {
      if (!confirm('Удалить проект? Записи останутся, но без проекта.')) return;
      try {
        const linked = await pb.collection('transactions').getFullList({ filter: pb.filter('owner = {:o} && project = {:p}', { o: uid(), p: p.id }), fields: 'id' });
        for (const t of linked) await pb.collection('transactions').update(t.id, { project: '' });
        await pb.collection('projects').delete(p.id);
        state.cache.projects = null; closeSheet(); toast('Проект удалён'); location.hash = '#/projects';
      } catch (e) { s.querySelector('#perr').textContent = errText(e); }
    });
  });
}
