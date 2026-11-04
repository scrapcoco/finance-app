// Состояние интерфейса между экранами и кэш справочников
import { today, firstOfMonth } from './util.js';

export const state = {
  month: firstOfMonth(new Date()),
  selDay: today(),
  period: 'month',
  repDay: null,
  repWeek: null,
  histKind: 'all',
  // Книга: personal | business | all (запоминается между запусками)
  book: (() => { try { return localStorage.getItem('book') || 'personal'; } catch (e) { return 'personal'; } })(),
  histQuery: '',
  ovKind: 'expense',
  debtDir: 'owe',
  // «Записи» (ПК): поиск, фильтры и сортировка таблицы
  rec: { q: '', kind: 'all', cat: '', proj: '', status: '', sort: 'date', dir: -1 },
  cache: { cats: null, fields: null, debts: null, projects: null }
};
