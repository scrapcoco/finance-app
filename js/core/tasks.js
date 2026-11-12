// Дела: запросы к коллекции tasks, повторы, отметка «сделано»
import { ymd, parseYmd, pbDate, today, addDays, daysIn } from './util.js';
import { pb, uid, ownerFilter } from './pb.js';

export const TASK_REPEAT = { none: 'Не повторять', daily: 'Каждый день', weekdays: 'По будням', weekly: 'Каждую неделю', monthly: 'Каждый месяц' };

export const TASK_REMIND = { none: 'Не напоминать', at: 'Во время дела', 15: 'За 15 минут', 30: 'За 30 минут', 60: 'За час' };

export const taskDay = (t) => (t.day || '').slice(0, 10);

// Сначала дела со временем (по порядку), потом без времени — в порядке добавления
export const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.created.localeCompare(b.created);
// Порядок в списке дел: сначала расставленные вручную (поле sort, перетаскивание на телефоне), остальные — по времени
export const byOrder = (a, b) => (a.sort || 1e9) - (b.sort || 1e9) || byTime(a, b);

// Дела с from по to включительно (ymd)
export function tasksBetween(from, to) {
  const f = `${ownerFilter()} && ` + pb.filter('day >= {:a} && day <= {:b}', { a: `${from} 00:00:00`, b: `${to} 23:59:59` });
  return pb.collection('tasks').getFullList({ filter: f, sort: 'day,created' });
}

// Не сделанные дела прошлых дней
export function overdueTasks() {
  const f = `${ownerFilter()} && done = false && day != '' && ` + pb.filter('day < {:t}', { t: `${today()} 00:00:00` });
  return pb.collection('tasks').getFullList({ filter: f, sort: 'day,created' });
}

// «Когда-нибудь» — дела без дня
export function somedayTasks() {
  return pb.collection('tasks').getFullList({ filter: `${ownerFilter()} && day = '' && done = false`, sort: 'created' });
}

export function nextTaskDay(s, repeat) {
  const d = parseYmd(s);
  if (repeat === 'daily') return ymd(addDays(d, 1));
  if (repeat === 'weekdays') { let n = addDays(d, 1); while (n.getDay() === 0 || n.getDay() === 6) n = addDays(n, 1); return ymd(n); }
  if (repeat === 'weekly') return ymd(addDays(d, 7));
  if (repeat === 'monthly') {
    const t = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    t.setDate(Math.min(d.getDate(), daysIn(t.getFullYear(), t.getMonth())));
    return ymd(t);
  }
  return null;
}

// Дело со временем по умолчанию напоминает в момент начала (push шлёт server/task_push.py)
export const newTask = (data) => pb.collection('tasks').create({ repeat: 'none', note: '', time: '', remind: data.time ? 'at' : 'none', ...data, owner: uid() });

// Отметить сделанным. У повторяющегося — создать следующее. Возвращает функцию «Отменить».
export async function completeTask(t) {
  await pb.collection('tasks').update(t.id, { done: true, done_at: new Date().toISOString() });
  let createdId = null;
  if (t.repeat && t.repeat !== 'none' && taskDay(t)) {
    const next = nextTaskDay(taskDay(t), t.repeat);
    const c = await newTask({ title: t.title, day: pbDate(next), time: t.time || '', note: t.note || '', repeat: t.repeat, remind: t.remind || 'none' });
    createdId = c.id;
  }
  return async () => {
    if (createdId) await pb.collection('tasks').delete(createdId);
    await pb.collection('tasks').update(t.id, { done: false, done_at: '' });
  };
}

export const uncompleteTask = (t) => pb.collection('tasks').update(t.id, { done: false, done_at: '' });

// «Через 40 минут», «Через 2 ч», «Прошло» — для времени сегодняшнего дела
export function timeLeft(time) {
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  const mins = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
  if (mins < 0) return 'Время прошло';
  if (mins === 0) return 'Сейчас';
  if (mins < 60) return `Через ${mins} мин`;
  if (mins < 180) { const hh = Math.floor(mins / 60), mm = mins % 60; return `Через ${hh} ч${mm ? ` ${mm} мин` : ''}`; }
  return 'Сегодня';
}

export const isMissingCollection = (e) => e?.status === 404;
