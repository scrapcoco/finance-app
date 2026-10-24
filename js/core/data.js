// Загрузка справочников и операции с записями
import { ymd, parseYmd, pbDate, txDay, shiftMonthKeepDay, nextOccurrence, humanDate, daysUntil } from './util.js';
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

export async function markPaid(tx) {
  await pb.collection('transactions').update(tx.id, { status: 'paid' });
  let msg = 'Отмечено как оплачено';
  if (tx.repeat && tx.repeat !== 'none') {
    const next = nextOccurrence(txDay(tx), tx.repeat);
    await pb.collection('transactions').create({
      kind: tx.kind, amount: tx.amount, date: pbDate(next), category: tx.category || '',
      note: tx.note || '', status: 'planned', repeat: tx.repeat, debt: tx.debt || '',
      extra: tx.extra || {}, owner: uid()
    });
    msg = `Оплачено. Следующий платёж — ${humanDate(next)}`;
  }
  if (tx.debt) await bumpDebtDue(tx.debt, txDay(tx));
  toast(msg);
}

export async function bumpDebtDue(debtId, payDay) {
  try {
    const d = await pb.collection('debts').getOne(debtId);
    if (!d.next_due) return;
    const due = d.next_due.slice(0, 10);
    if (daysUntil(due) - daysUntil(payDay) <= 20) {
      await pb.collection('debts').update(debtId, { next_due: pbDate(ymd(shiftMonthKeepDay(parseYmd(due), 1))) });
      state.cache.debts = null;
    }
  } catch (e) { /* not critical */ }
}
