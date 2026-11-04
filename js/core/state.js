// Состояние интерфейса между экранами и кэш справочников
import { today, firstOfMonth } from './util.js';

export const state = {
  month: firstOfMonth(new Date()),
  selDay: today(),
  period: 'month',
  repDay: null,
  repWeek: null,
  histKind: 'all',
  histQuery: '',
  ovKind: 'expense',
  debtDir: 'owe',
  cache: { cats: null, fields: null, debts: null }
};
