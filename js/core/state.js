// Состояние интерфейса между экранами и кэш справочников
import { today, firstOfMonth } from './util.js';

export const state = {
  month: firstOfMonth(new Date()),
  selDay: today(),
  period: 'month',
  catKind: 'expense',
  repDay: null,
  repWeek: null,
  histKind: 'all',
  cache: { cats: null, fields: null, debts: null }
};
