// Состояние интерфейса между экранами и кэш справочников
import { today, firstOfMonth } from './util.js';

export const state = {
  month: firstOfMonth(new Date()),
  selDay: today(),
  period: 'month',
  repDay: null,
  repWeek: null,
  histKind: 'all',
  // Книга: переключателя нет — видно всё (Личное и Бизнес вместе), новые записи — в «Личное».
  // Позже выбор «для себя / для бизнеса» будет при регистрации
  book: 'all',
  histQuery: '',
  ovKind: 'expense',
  debtDir: 'owe',
  // «Дела»: выбранный день, режим «Когда-нибудь», раскрыт ли список сделанных
  taskDay: today(),
  taskSomeday: false,
  taskShowDone: false,
  // «Записи» (ПК): поиск, фильтры и сортировка таблицы
  rec: { q: '', kind: 'all', cat: '', proj: '', status: '', sort: 'date', dir: -1 },
  cache: { cats: null, fields: null, debts: null, projects: null }
};
