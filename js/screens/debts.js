// Долги: «я должен» и «мне должны» — прогресс и прогноз погашения
import { esc, nf, money, parseAmount, MONTHS_SHORT, MONTHS_PREP, ymd, pbDate, txDay, firstOfMonth, addMonths, shortDate } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { state } from '../core/state.js';
import { pb, uid, ownerFilter } from '../core/pb.js';
import { $view, toast, errText, openSheet, closeSheet } from '../ui.js';
import { getDebts } from '../core/data.js';
import { render } from '../router.js';

// Тексты экрана для двух направлений долга
const TXT = {
  owe: { left: 'Осталось выплатить', done: 'погашено', free: 'Без долгов к', chart: 'Как уменьшается долг', pay: 'Внести платёж', closed: 'Погашен',
    empty: 'Долгов нет. Если они есть — добавь, и здесь появится прогресс погашения.', name: 'Кредит на машину' },
  lent: { left: 'Осталось получить', done: 'возвращено', free: 'Всё вернут к', chart: 'Как возвращают долги', pay: 'Получить возврат', closed: 'Возвращён',
    empty: 'Тебе никто не должен. Если дал в долг — добавь, и здесь будет видно, сколько уже вернули.', name: 'Андрей, занял на ремонт' }
};
const dirOf = (d) => (d.direction === 'lent' ? 'lent' : 'owe');

export async function debtsScreen(route, alive) {
  const [allDebts, pays] = await Promise.all([
    getDebts(true),
    pb.collection('transactions').getFullList({ filter: `${ownerFilter()} && status = 'paid' && debt != ''`, fields: 'debt,amount,date' })
  ]);
  if (!alive()) return;
  const dir = state.debtDir;
  const T = TXT[dir];
  const debts = allDebts.filter((d) => dirOf(d) === dir);
  const paidBy = {};
  for (const p of pays) paidBy[p.debt] = (paidBy[p.debt] || 0) + p.amount;
  const rows = debts.map((d) => {
    const paid = paidBy[d.id] || 0;
    const left = Math.max(0, d.total - paid);
    return { ...d, paid, left, pct: d.total > 0 ? Math.min(100, Math.round((paid / d.total) * 100)) : 0 };
  });
  const open = rows.filter((d) => !d.closed);
  const totalAll = open.reduce((s, d) => s + d.total, 0);
  const leftAll = open.reduce((s, d) => s + d.left, 0);
  const pctAll = totalAll > 0 ? Math.round(((totalAll - leftAll) / totalAll) * 100) : 0;

  let forecast = '';
  const active = open.filter((d) => d.left > 0);
  if (active.length && active.every((d) => d.monthly_payment > 0)) {
    const months = Math.max(...active.map((d) => Math.ceil(d.left / d.monthly_payment)));
    const end = addMonths(new Date(), months);
    forecast = `${T.free} <b style="color:var(--ink)">${MONTHS_PREP[end.getMonth()]} ${end.getFullYear()}</b>`;
  } else if (active.length) {
    forecast = 'Укажи платёж в месяц, чтобы увидеть прогноз';
  }

  const mNow = firstOfMonth(new Date());
  const chart = [];
  for (let i = 5; i >= 0; i--) {
    const end = ymd(addMonths(mNow, -i + 1));
    let v = 0;
    for (const d of debts) {
      if ((d.created || '').slice(0, 10) >= end) continue;
      const paidTo = pays.filter((p) => p.debt === d.id && txDay(p) < end).reduce((s, p) => s + p.amount, 0);
      v += Math.max(0, d.total - paidTo);
    }
    const md = addMonths(mNow, -i);
    chart.push({ label: MONTHS_SHORT[md.getMonth()], v, cur: i === 0 });
  }
  const cMax = Math.max(1, ...chart.map((c) => c.v));
  const firstNonZero = chart.find((c) => c.v > 0);
  const drop = firstNonZero ? firstNonZero.v - chart[5].v : 0;
  const k = (v) => (v >= 1000 ? `${nf.format(Math.round(v / 100) / 10)}k` : nf.format(Math.round(v)));

  $view.innerHTML = `
    <div class="head"><h1>Долги</h1><button class="icon-btn" id="add-debt" aria-label="Добавить долг">${ICON.plus}</button></div>
    <div class="segment" role="group" aria-label="Чьи долги">
      <button type="button" data-dir="owe" aria-pressed="${dir === 'owe'}">Я должен</button>
      <button type="button" data-dir="lent" aria-pressed="${dir === 'lent'}">Мне должны</button>
    </div>
    ${rows.length ? `
    <section class="hero">
      <div><div class="label">${T.left}</div>
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><div class="big">${money(leftAll)}</div><div class="note">из ${money(totalAll)}</div></div></div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="meter inc" style="height:8px;background:rgba(255,255,255,0.08)"><i style="width:${pctAll}%"></i></div>
        <div class="note" style="display:flex;justify-content:space-between;gap:8px"><span><b style="color:var(--ink)">${pctAll}%</b> ${T.done}</span><span>${forecast}</span></div>
      </div>
    </section>
    <section class="panel">
      <div class="sec-head"><h2>${T.chart}</h2>${drop > 0 ? `<span class="inc" style="font-size:12px;font-weight:700">−${money(drop)} за полгода</span>` : ''}</div>
      <div class="bars" role="img" aria-label="Остаток долга по месяцам">
        ${chart.map((c) => `<div class="bar-col ${c.cur ? 'cur' : ''}"><div class="val">${c.v ? k(c.v) : ''}</div><div class="bar-pair">
          <div class="bar wide" style="height:${(c.v / cMax) * 100}%;background:${c.cur ? 'var(--inc)' : '#3A3A3F'}"></div></div>
          <div class="lbl">${c.label}</div></div>`).join('')}
      </div>
    </section>
    <section class="sec">${rows.map((d) => `
      <div class="debt ${d.closed ? 'closed' : ''}">
        <div class="top"><b>${esc(d.name)}</b><b>${d.left > 0 ? money(d.left) : T.closed}</b></div>
        <div class="meter inc"><i style="width:${d.pct}%"></i></div>
        <div class="sub"><span>${esc([d.monthly_payment ? `${money(d.monthly_payment)}/мес` : 'Без графика', d.next_due ? `след. ${shortDate(d.next_due.slice(0, 10))}` : ''].filter(Boolean).join(', '))}</span><span><b style="color:var(--ink)">${d.pct}%</b> ${T.done}</span></div>
        <div class="actions">
          ${d.left > 0 && !d.closed ? `<a class="btn small" style="display:inline-flex;align-items:center;text-decoration:none" href="#/add?debt=${d.id}&back=debts">${T.pay}</a>` : ''}
          <button class="btn small secondary" data-edit="${d.id}">Изменить</button>
        </div>
      </div>`).join('')}</section>`
    : `<div class="list"><div class="empty">${T.empty}<br><button class="btn small" id="add-debt-2" style="margin-top:10px">Добавить долг</button></div></div>`}`;
  const openNew = () => debtSheet(null);
  $view.querySelector('#add-debt').onclick = openNew;
  $view.querySelector('#add-debt-2')?.addEventListener('click', openNew);
  $view.querySelectorAll('[data-dir]').forEach((b) => b.onclick = () => { state.debtDir = b.dataset.dir; render(); });
  $view.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => debtSheet(debts.find((d) => d.id === b.dataset.edit)));
}

export function debtSheet(d) {
  let dir = d ? dirOf(d) : state.debtDir;
  openSheet(`<h2>${d ? 'Долг' : 'Новый долг'}</h2>
    ${d ? '' : `<div class="segment" role="group" aria-label="Чей долг">
      <button type="button" data-sdir="owe" aria-pressed="${dir === 'owe'}">Я должен</button>
      <button type="button" data-sdir="lent" aria-pressed="${dir === 'lent'}">Мне должны</button>
    </div>`}
    <div class="form-list">
      <div class="frow"><label for="dn">Название</label><input id="dn" maxlength="80" placeholder="${TXT[dir].name}" value="${esc(d?.name || '')}"></div>
      <div class="frow"><label for="dt2">Сумма долга</label><input id="dt2" inputmode="decimal" placeholder="0" value="${esc(d ? String(d.total).replace('.', ',') : '')}"></div>
      <div class="frow"><label for="dm">Платёж в месяц</label><input id="dm" inputmode="decimal" placeholder="Необязательно" value="${esc(d?.monthly_payment ? String(d.monthly_payment).replace('.', ',') : '')}"></div>
      <div class="frow"><label for="dd">Следующий платёж</label><input id="dd" type="date" value="${esc(d?.next_due ? d.next_due.slice(0, 10) : '')}"></div>
      <div class="frow"><label for="dnote">Заметка</label><input id="dnote" maxlength="500" value="${esc(d?.note || '')}"></div>
      ${d ? `<div class="frow"><label id="dcl-l">Закрыт</label><button type="button" class="switch" id="dcl" role="switch" aria-labelledby="dcl-l" aria-checked="${!!d.closed}"></button></div>` : ''}
    </div>
    <div class="error" id="derr" role="alert"></div>
    <div class="btns"><button class="btn secondary" id="dc">Отмена</button><button class="btn" id="ds">${d ? 'Сохранить' : 'Добавить'}</button></div>
    ${d ? '<button class="btn danger" id="ddel">Удалить долг</button>' : ''}`, (s) => {
    let closed = !!d?.closed;
    s.querySelectorAll('[data-sdir]').forEach((b) => b.onclick = () => {
      dir = b.dataset.sdir;
      s.querySelectorAll('[data-sdir]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      s.querySelector('#dn').placeholder = TXT[dir].name;
    });
    s.querySelector('#dcl')?.addEventListener('click', (e) => { closed = !closed; e.currentTarget.setAttribute('aria-checked', String(closed)); });
    s.querySelector('#dc').onclick = closeSheet;
    s.querySelector('#ds').onclick = async () => {
      const name = s.querySelector('#dn').value.trim();
      const total = parseAmount(s.querySelector('#dt2').value);
      const monthly = s.querySelector('#dm').value.trim() ? parseAmount(s.querySelector('#dm').value) : 0;
      const due = s.querySelector('#dd').value;
      const err = s.querySelector('#derr');
      if (!name) { err.textContent = 'Введи название.'; return; }
      if (!(total > 0)) { err.textContent = 'Введи сумму долга больше нуля.'; return; }
      if (!Number.isFinite(monthly) || monthly < 0) { err.textContent = 'Проверь платёж в месяц.'; return; }
      const data = { name, total, monthly_payment: monthly, next_due: due ? pbDate(due) : '', note: s.querySelector('#dnote').value.trim(), closed };
      try {
        if (d) await pb.collection('debts').update(d.id, data);
        else await pb.collection('debts').create({ ...data, direction: dir, owner: uid() });
        state.cache.debts = null; closeSheet(); toast(d ? 'Долг сохранён' : 'Долг добавлен'); render();
      } catch (e) { err.textContent = errText(e); }
    };
    s.querySelector('#ddel')?.addEventListener('click', async () => {
      if (!confirm('Удалить долг? Платежи по нему останутся в записях.')) return;
      try {
        const linked = await pb.collection('transactions').getFullList({ filter: pb.filter('owner = {:o} && debt = {:d}', { o: uid(), d: d.id }), fields: 'id' });
        for (const t of linked) await pb.collection('transactions').update(t.id, { debt: '' });
        await pb.collection('debts').delete(d.id);
        state.cache.debts = null; closeSheet(); toast('Долг удалён'); render();
      } catch (e) { s.querySelector('#derr').textContent = errText(e); }
    });
  });
}
