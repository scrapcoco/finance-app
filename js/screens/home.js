// Главная: баланс, платежи и записи месяца
import { esc, money, net, moneySigned, parseAmount, MONTHS, MONTHS_GEN, MONTHS_SHORT, ymd, pbDate, today, firstOfMonth, addMonths, addDays, daysIn } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { state } from '../core/state.js';
import { CFG, pb, uid, ownerFilter } from '../core/pb.js';
import { $view, toast, errText, monthSwitch, bindMonthSwitch, txRow, bindPay, openSheet, closeSheet } from '../ui.js';
import { txBetween, getBalance, withBook, curBook } from '../core/data.js';
import { render } from '../router.js';

export async function homeScreen(route, alive) {
  const m = state.month;
  const from = ymd(m), to = ymd(addMonths(m, 1));
  const isCur = ymd(firstOfMonth(new Date())) === from;
  // Сравнение с прошлым месяцем: для текущего — с тем же числом (3 ноября против 1–3 октября), иначе в начале месяца всегда «−90%»
  const pm = addMonths(m, -1);
  const prevDays = Math.min(new Date().getDate(), daysIn(pm.getFullYear(), pm.getMonth()));
  const prevTo = isCur ? ymd(addDays(pm, prevDays)) : from;
  const recentN = matchMedia('(min-width: 960px)').matches ? 8 : 5; // на ПК справа целая колонка
  const [balance, monthTx, prevTx, upcoming, recent] = await Promise.all([
    getBalance(),
    txBetween(from, to),
    txBetween(ymd(pm), prevTo, "status = 'paid'"),
    isCur ? pb.collection('transactions').getList(1, 5, { filter: withBook(`${ownerFilter()} && status = 'planned'`), sort: 'date,created', expand: 'category' }) : null,
    isCur ? pb.collection('transactions').getList(1, recentN, { filter: withBook(`${ownerFilter()} && status = 'paid'`), sort: '-date,-created', expand: 'category' }) : null
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
  // Для другого месяца списки показывают записи именно этого месяца
  const monthName = MONTHS[m.getMonth()].toLowerCase();
  const upcomingItems = isCur ? upcoming.items : monthTx.filter((t) => t.status === 'planned').slice(0, 5);
  const recentItems = isCur ? recent.items : monthTx.filter((t) => t.status === 'paid').reverse().slice(0, recentN);
  const lastDay = `${daysIn(m.getFullYear(), m.getMonth())} ${MONTHS_GEN[m.getMonth()]}`;
  const note = isCur
    ? (plannedNet ? `С учётом запланированных: ${moneySigned(balance + plannedNet)} к ${lastDay}` : 'Запланированных платежей до конца месяца нет')
    : `Итог за ${monthName}: ${moneySigned(inc - exp)}${plannedNet ? `, запланировано: ${moneySigned(plannedNet)}` : ''}`;

  $view.innerHTML = `
    <div class="head">${monthSwitch()}<a class="icon-btn" href="#/settings" aria-label="Настройки">${ICON.gear}</a></div>
    <section class="hero">
      <button type="button" class="bal-btn" id="cash" aria-label="Баланс на сегодня ${moneySigned(balance)}. Изменить остаток">
        <div class="label">Баланс на сегодня ${ICON.edit}</div><div class="big">${moneySigned(balance)}</div></button>
      <div class="pair">
        <div><div class="k">Доходы</div><div class="v inc">+${money(inc)}</div>${delta(inc, prevInc, true)}</div>
        <div><div class="k">Расходы</div><div class="v exp">−${money(exp)}</div>${delta(exp, prevExp, false)}</div>
      </div>
      <div class="note">${esc(note)}</div>
    </section>
    <section class="sec sec-up">
      <div class="sec-head"><h2>${isCur ? 'Ближайшие платежи' : `Платежи за ${monthName}`}</h2><a href="#/calendar">Календарь</a></div>
      ${upcomingItems.length
        ? `<div class="list">${upcomingItems.map((t) => txRow(t, { planned: true, pay: true })).join('')}</div>`
        : `<div class="list"><div class="empty">${isCur ? 'Будущих платежей нет. Добавь запись и включи «Будущий платёж».' : 'Неоплаченных платежей в этом месяце нет.'}</div></div>`}
    </section>
    <section class="sec sec-recent">
      <div class="sec-head"><h2>${isCur ? 'Последние записи' : `Записи за ${monthName}`}</h2><a href="#/history">Все</a></div>
      ${recentItems.length
        ? `<div class="list">${recentItems.map((t) => txRow(t)).join('')}</div>`
        : isCur
          ? `<div class="list"><div class="empty">Записей пока нет.<br><a class="btn small" href="#/add" style="display:inline-flex;align-items:center;margin-top:10px;text-decoration:none">Добавить первую запись</a></div></div>`
          : `<div class="list"><div class="empty">Оплаченных записей в этом месяце нет.</div></div>`}
    </section>`;
  bindMonthSwitch();
  bindPay(upcomingItems);
  $view.querySelector('#cash').onclick = () => cashSheet(balance);
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
