// Загрузка справочников и операции с записями
import { ymd, parseYmd, pbDate, txDay, shiftMonthKeepDay, nextOccurrence, dayOf, humanDate, daysUntil, net } from './util.js';
import { render } from '../router.js';
import { state } from './state.js';
import { pb, uid, ownerFilter } from './pb.js';
import { toast } from '../ui.js';

// ===== Книги: «Личное» / «Бизнес». У старых записей поле book пустое — это «Личное» =====
export const BOOKS = { personal: 'Личное', business: 'Бизнес', all: 'Всё' };
// Книга для новых записей (в режиме «Всё» — «Личное»)
export const curBook = () => (state.book === 'business' ? 'business' : 'personal');
export const bookOf = (rec) => (rec?.book === 'business' ? 'business' : 'personal');
// Фильтр PocketBase по текущей книге ('' — все книги)
export const bookFilter = () => (state.book === 'business' ? "book = 'business'" : state.book === 'all' ? '' : "book != 'business'");
export const withBook = (f) => { const b = bookFilter(); return b ? `${f} && ${b}` : f; };

export async function getCats(force) {
  if (!state.cache.cats || force) {
    state.cache.cats = await pb.collection('categories').getFullList({ filter: withBook(ownerFilter()), sort: 'sort,name' });
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
    state.cache.debts = await pb.collection('debts').getFullList({ filter: withBook(ownerFilter()), sort: 'closed,created' });
  }
  return state.cache.debts;
}

// Проекты (книга «Бизнес»): активные сверху, по названию
export async function getProjects(force) {
  if (!state.cache.projects || force) {
    state.cache.projects = await pb.collection('projects').getFullList({ filter: ownerFilter(), sort: 'archived,name' });
  }
  return state.cache.projects;
}

export function txBetween(from, to, extra) {
  let f = withBook(ownerFilter()) + ' && ' + pb.filter('date >= {:a} && date < {:b}', { a: `${from} 00:00:00`, b: `${to} 00:00:00` });
  if (extra) f += ` && ${extra}`;
  return pb.collection('transactions').getFullList({ filter: f, sort: 'date,created', expand: 'category' });
}

// Стартовые категории книги (если в ней ещё нет ни одной)
const DEFAULT_CATS = {
  personal: [['Жильё', 'expense'], ['Еда', 'expense'], ['Транспорт', 'expense'], ['Подписки', 'expense'],
    ['Здоровье', 'expense'], ['Другое', 'expense'], ['Зарплата', 'income'], ['Подработка', 'income'], ['Другое', 'income']],
  business: [['Реклама', 'expense'], ['Закупка товара', 'expense'], ['Сервисы и софт', 'expense'], ['Зарплаты', 'expense'],
    ['Налоги', 'expense'], ['Другое', 'expense'], ['Продажи', 'income'], ['Услуги', 'income'], ['Другое', 'income']]
};
export async function ensureDefaults(book = 'personal') {
  const filter = `${ownerFilter()} && ` + (book === 'business' ? "book = 'business'" : "book != 'business'");
  const has = await pb.collection('categories').getList(1, 1, { filter });
  if (has.items.length) return;
  const defs = DEFAULT_CATS[book];
  for (let i = 0; i < defs.length; i++) {
    await pb.collection('categories').create({ name: defs[i][0], kind: defs[i][1], sort: i, book, owner: uid() });
  }
  state.cache.cats = null;
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
      book: tx.book || '', project: tx.project || '',
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
    // По книгам (book_balances): строка на каждую книгу; в режиме «Всё» — сумма строк
    const rows = await pb.collection('book_balances').getFullList({ filter: pb.filter('owner = {:o}', { o: uid() }) });
    const pick = state.book === 'all' ? rows : rows.filter((r) => r.book === curBook());
    return Math.round(pick.reduce((s, r) => s + (Number(r.balance) || 0), 0) * 100) / 100;
  } catch (e) {
    if (e?.status !== 404) throw e;
    const all = await pb.collection('transactions').getFullList({ filter: withBook(`${ownerFilter()} && status = 'paid'`), fields: 'kind,amount' });
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
