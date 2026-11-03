// Загрузка справочников и операции с записями
import { ymd, parseYmd, pbDate, txDay, shiftMonthKeepDay, nextOccurrence, dayOf, humanDate, daysUntil, net } from './util.js';
import { render } from '../router.js';
import { state } from './state.js';
import { pb, uid, ownerFilter } from './pb.js';
import { toast } from '../ui.js';

export async function getCats(force) {
  if (!state.cache.cats || force) {
    state.cache.cats = await pb.collection('categories').getFullList({ filter: ownerFilter(), sort: 'sort,name' });
  }
  return state.cache.cats;
}

export async function getFields(force) {
  if (!state.cache.fields || force) {
    state.cache.fields = await pb.collection('custom_fields').getFullList({ filter: ownerFilter(), sort: 'sort,created' });
  }
  return state.cache.fields;
}

export async function getDebts(force) {
  if (!state.cache.debts || force) {
    state.cache.debts = await pb.collection('debts').getFullList({ filter: ownerFilter(), sort: 'closed,created' });
  }
  return state.cache.debts;
}

export function txBetween(from, to, extra) {
  let f = `${ownerFilter()} && ` + pb.filter('date >= {:a} && date < {:b}', { a: `${from} 00:00:00`, b: `${to} 00:00:00` });
  if (extra) f += ` && ${extra}`;
  return pb.collection('transactions').getFullList({ filter: f, sort: 'date,created', expand: 'category' });
}

export async function ensureDefaults() {
  const cats = await getCats(true);
  if (cats.length) return;
  const defs = [
    ['Жильё', 'expense'], ['Еда', 'expense'], ['Транспорт', 'expense'], ['Подписки', 'expense'],
    ['Здоровье', 'expense'], ['Другое', 'expense'],
    ['Зарплата', 'income'], ['Подработка', 'income'], ['Другое', 'income']
  ];
  for (let i = 0; i < defs.length; i++) {
    await pb.collection('categories').create({ name: defs[i][0], kind: defs[i][1], sort: i, owner: uid() });
  }
  await getCats(true);
}

// Плановый платёж только что стал оплаченным: создать следующий повтор и сдвинуть срок долга.
// tx — запись с датой планового платежа (от неё считается следующая).
// Возвращает, что изменилось (для «Отменить»): { next — дата следующего повтора или null, createdId, prevDue }.
export async function afterPaid(tx) {
  const r = { next: null, createdId: null, prevDue: null };
  if (tx.repeat && tx.repeat !== 'none') {
    // У старых записей repeat_day нет — тогда день берётся из даты, как раньше
    const day = tx.repeat_day || dayOf(txDay(tx));
    r.next = nextOccurrence(txDay(tx), tx.repeat, day);
    const created = await pb.collection('transactions').create({
      kind: tx.kind, amount: tx.amount, date: pbDate(r.next), category: tx.category || '',
      note: tx.note || '', status: 'planned', repeat: tx.repeat, repeat_day: day, debt: tx.debt || '',
      extra: tx.extra || {}, owner: uid()
    });
    r.createdId = created.id;
  }
  if (tx.debt) r.prevDue = await bumpDebtDue(tx.debt, txDay(tx));
  return r;
}

export const paidText = (next) => (next ? `Оплачено. Следующий платёж — ${humanDate(next)}` : 'Отмечено как оплачено');

// Отметить оплаченным (кнопки ✓ и календарь). В тосте — «Отменить»: вернуть как было, если нажал по ошибке.
export async function markPaid(tx) {
  await pb.collection('transactions').update(tx.id, { status: 'paid' });
  const r = await afterPaid(tx);
  toast(paidText(r.next), { label: 'Отменить', run: () => undoPaid(tx, r) });
}

async function undoPaid(tx, r) {
  if (r.createdId) await pb.collection('transactions').delete(r.createdId);
  await pb.collection('transactions').update(tx.id, { status: 'planned' });
  if (r.prevDue) { await pb.collection('debts').update(tx.debt, { next_due: r.prevDue }); state.cache.debts = null; }
  toast('Отменено: платёж снова не оплачен');
  render();
}

// Баланс считает база (view-коллекция balances, server/1793100000_balances_view.js) — одна строка вместо всей истории.
// Пока коллекции нет (404) — по-старому: сумма всех оплаченных записей.
export async function getBalance() {
  try {
    const res = await pb.collection('balances').getList(1, 1, { filter: pb.filter('id = {:o}', { o: uid() }) });
    return Number(res.items[0]?.balance) || 0;
  } catch (e) {
    if (e?.status !== 404) throw e;
    const all = await pb.collection('transactions').getFullList({ filter: `${ownerFilter()} && status = 'paid'`, fields: 'kind,amount' });
    return Math.round(all.reduce((s, t) => s + net(t), 0) * 100) / 100;
  }
}

// Каким типом записи гасится долг: «я должен» — расходом, «мне должны» — доходом (возвратом)
export const debtKind = (d) => (d?.direction === 'lent' ? 'income' : 'expense');

// Сдвигает срок долга на месяц, если оплачен ближайший платёж. Возвращает прежний next_due (если сдвинул) или null.
export async function bumpDebtDue(debtId, payDay) {
  try {
    const d = await pb.collection('debts').getOne(debtId);
    if (!d.next_due) return null;
    const due = d.next_due.slice(0, 10);
    if (daysUntil(due) - daysUntil(payDay) <= 20) {
      await pb.collection('debts').update(debtId, { next_due: pbDate(ymd(shiftMonthKeepDay(parseYmd(due), 1))) });
      state.cache.debts = null;
      return d.next_due;
    }
  } catch (e) { /* not critical */ }
  return null;
}
