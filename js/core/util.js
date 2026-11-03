// Форматирование денег и дат, названия месяцев, подписи
import { CFG } from './pb.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const nf = new Intl.NumberFormat(CFG.LOCALE, { maximumFractionDigits: 2 });

const nf2 = new Intl.NumberFormat(CFG.LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Целые суммы без копеек («2 200 zł»), дробные — всегда с двумя знаками («49,90 zł»)
export const money = (v) => {
  const r = Math.abs(Math.round(v * 100) / 100);
  return `${(Number.isInteger(r) ? nf : nf2).format(r)} ${CFG.CURRENCY}`;
};

export const signed = (v, kind) => kind === 'adjust' ? `${v < 0 ? '−' : '+'}${money(v)}` : `${kind === 'income' ? '+' : '−'}${money(v)}`;

export const net = (t) => t.kind === 'income' ? t.amount : t.kind === 'expense' ? -t.amount : t.amount;

export const moneySigned = (v) => `${v < 0 ? '−' : ''}${money(v)}`;

// «12,5», «1 234,56», «1.234,56», «1,234.56», «−20» → число; мусор («12abc», «,») → NaN.
// Последний разделитель с 1–2 цифрами после него — дробная часть, остальные — разделители тысяч
// (та же логика, что в server/pb_hooks/finance_ingest.pb.js)
export const parseAmount = (s) => {
  let t = String(s ?? '').replace(/[\s ]/g, '').replace(/^[−–]/, '-').replace(/^\+/, '');
  const neg = t.startsWith('-');
  if (neg) t = t.slice(1);
  if (!/^[\d.,]*\d[\d.,]*$/.test(t)) return NaN;
  const last = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  t = last >= 0 && t.length - last - 1 <= 2
    ? t.slice(0, last).replace(/[.,]/g, '') + '.' + t.slice(last + 1)
    : t.replace(/[.,]/g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
};

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export const MONTHS_PREP = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю'];

export const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export const REPEAT_LABEL = { none: 'Не повторять', weekly: 'Каждую неделю', monthly: 'Каждый месяц', yearly: 'Каждый год' };

export const REPEAT_SHORT = { weekly: 'Еженедельно', monthly: 'Ежемесячно', yearly: 'Ежегодно' };

export const FIELD_TYPES = { text: 'Текст', number: 'Число', select: 'Список', date: 'Дата', bool: 'Да/Нет', url: 'Ссылка' };

export const pad = (n) => String(n).padStart(2, '0');

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseYmd = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };

export const pbDate = (s) => `${s} 12:00:00.000Z`;

export const txDay = (t) => (t.date || '').slice(0, 10);

export const today = () => ymd(new Date());

export const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

export const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

export const shiftMonthKeepDay = (d, n) => {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(d.getDate(), daysIn(t.getFullYear(), t.getMonth())));
  return t;
};

// day — «родной» день серии (repeat_day): платёж 31-го после 28 февраля вернётся на 31 марта, а не останется 28-го
export const nextOccurrence = (s, repeat, day) => {
  const d = parseYmd(s);
  if (repeat === 'weekly') return ymd(addDays(d, 7));
  const n = repeat === 'monthly' ? 1 : repeat === 'yearly' ? 12 : 0;
  if (!n) return null;
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day || d.getDate(), daysIn(t.getFullYear(), t.getMonth())));
  return ymd(t);
};

export const dayOf = (s) => Number(String(s).slice(8, 10));

export const humanDate = (s) => { const d = parseYmd(s); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; };

export const shortDate = (s) => {
  const t = today();
  if (s === t) return 'Сегодня';
  if (s === ymd(addDays(new Date(), -1))) return 'Вчера';
  const d = parseYmd(s); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

export const daysUntil = (s) => Math.round((parseYmd(s) - parseYmd(today())) / 86400000);

export const whenLabel = (s) => {
  const n = daysUntil(s);
  if (n < 0) return 'просрочено';
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n < 5) return `через ${n} дня`;
  return `через ${n} дней`;
};
