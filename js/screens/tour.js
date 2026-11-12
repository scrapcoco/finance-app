// Знакомство с приложением — без отдельного «урока»: 1) короткое приветствие во весь экран (шар-помощник, одна мысль на экран);
// у пустого аккаунта оно заодно спрашивает, сколько денег сейчас и когда следующий доход, — и сразу показывает «Сегодня свободно»;
// 2) «Первые шаги» — карточка в ленте с 3–4 заданиями, которые выполняются настоящими действиями на учебных строках
// (нажать, отметить кружком, смахнуть, открыть помощника). Учебные строки не сохраняются. Состояние — localStorage `quest:<id>`.
// maybeTour(fresh) зовёт лента; replayTour — Настройки → «Показать обучение». Разметку рисует lenta.js (quest(), questDone()).
import { esc, money, parseAmount, ymd, pbDate, today, addMonths, firstOfMonth, daysUntil } from '../core/util.js';
import { CFG, pb, uid } from '../core/pb.js';
import { curBook, isBusiness } from '../core/data.js';
import { toast, errText, celebrate, countUp } from '../ui.js';
import { render } from '../router.js';
import { markNewsSeen } from './news.js';

const key = () => `quest:${uid() || ''}`;
const read = () => { try { return JSON.parse(localStorage.getItem(key()) || 'null'); } catch (e) { return { hidden: true }; } };
const write = (v) => { try { localStorage.setItem(key(), JSON.stringify(v)); } catch (e) { /* приватный режим */ } };
const isPhone = () => !matchMedia('(min-width: 960px)').matches;

const STEPS = [
  { id: 'open', t: 'Нажми на учебную строку', d: 'Она раскроется прямо на месте — никуда переходить не надо.' },
  { id: 'done', t: 'Отметь её: кружок или «Сделано»', d: 'Так закрываются и дела, и платежи.' },
  { id: 'swipe', t: 'Смахни строку влево', d: 'То же самое одним движением пальца.', phone: true },
  { id: 'ask', t: 'Нажми на светящийся шар', d: 'Это помощник: напиши ему «кофе 15» — он запишет сам.' }
];

// Что сейчас показывать в ленте: null — знакомство пройдено, скрыто или ещё не начато
export function quest() {
  const q = read();
  if (!q || q.hidden || q.finished) return null;
  const steps = STEPS.filter((s) => !s.phone || isPhone());
  const cur = steps.find((s) => !q[s.id]);
  if (!cur) return null;
  return { steps, cur, n: steps.indexOf(cur), total: steps.length };
}

// Шаг выполнен. Последний — праздник. Лента перерисовывается по событию `quest` (без запросов и не закрывая окна)
export function questDone(id) {
  const q = read(), now = quest();
  if (!q || !now || now.cur.id !== id) return false;
  q[id] = true;
  const last = now.n === now.total - 1;
  if (last) q.finished = true;
  write(q);
  if (last) { celebrate(); toast('Готово — ты всё умеешь!'); }
  document.dispatchEvent(new Event('quest'));
  return true;
}

export function questHide() {
  write({ ...(read() || {}), hidden: true });
  toast('Вернуть шаги: Настройки → «Показать обучение»');
  document.dispatchEvent(new Event('quest'));
}

// ----- Приветствие во весь экран -----
function welcome(fresh) {
  document.querySelector('.ob')?.remove();
  const biz = isBusiness();
  const pages = fresh ? ['hello', 'cash', 'income', 'free'] : ['hello', 'go'];
  const ans = { cash: 0, income: 0, incomeDay: ymd(firstOfMonth(addMonths(new Date(), 1))) };
  let i = 0;
  const el = document.createElement('div');
  el.className = 'ob'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'ob-h');
  const finish = (skipped) => {
    write({ started: true, ...(skipped ? { hidden: true } : {}) });
    markNewsSeen(); // всё новое человек только что увидел
    el.remove(); document.documentElement.classList.remove('ob-open');
    render();
  };
  const next = () => { i += 1; if (i >= pages.length) finish(false); else draw(); };
  const body = {
    hello: () => `<i class="orb ob-orb" aria-hidden="true"></i>
      <h1 id="ob-h">${fresh ? 'Привет! Я твой помощник' : 'Привет! Тут всё по-новому'}</h1>
      <p>${fresh ? 'Здесь деньги и дела живут на одной ленте. Два вопроса — и я покажу главную цифру.' : 'Вкладок больше нет: платежи, траты и дела идут одной лентой по порядку. Покажу за полминуты.'}</p>
      <div class="ob-btns"><button type="button" class="btn" id="ob-next">${fresh ? 'Начать' : 'Показать'}</button></div>`,
    cash: () => `<i class="orb ob-orb small" aria-hidden="true"></i>
      <h1 id="ob-h">${biz ? 'Сколько сейчас на счёте?' : 'Сколько у тебя сейчас денег?'}</h1>
      <p>Примерно — потом поправишь. Это видишь только ты.</p>
      <div class="amount-box"><label for="ob-cash">Сумма</label><div class="line"><input id="ob-cash" inputmode="decimal" autocomplete="off" placeholder="0"><div class="cur">${esc(CFG.CURRENCY)}</div></div></div>
      <div class="error" id="ob-err" role="alert"></div>
      <div class="ob-btns"><button type="button" class="btn" id="ob-next">Дальше</button><button type="button" class="ob-later" id="ob-later">Не сейчас</button></div>`,
    income: () => `<i class="orb ob-orb small" aria-hidden="true"></i>
      <h1 id="ob-h">Когда следующий доход?</h1>
      <p>Зарплата, оплата от клиента — что придёт ближайшим. От этого дня я считаю, сколько можно тратить.</p>
      <div class="amount-box"><label for="ob-inc">Сколько придёт</label><div class="line"><input id="ob-inc" inputmode="decimal" autocomplete="off" placeholder="0"><div class="cur">${esc(CFG.CURRENCY)}</div></div></div>
      <div class="form-list"><div class="frow"><label for="ob-day">Когда</label><input id="ob-day" type="date" value="${ans.incomeDay}" min="${today()}"></div></div>
      <div class="error" id="ob-err" role="alert"></div>
      <div class="ob-btns"><button type="button" class="btn" id="ob-next">Дальше</button><button type="button" class="ob-later" id="ob-later">Не сейчас</button></div>`,
    free: () => {
      const days = Math.max(1, ans.income ? daysUntil(ans.incomeDay) : daysUntil(ymd(firstOfMonth(addMonths(new Date(), 1)))));
      return `<div class="ob-card"><span>${biz ? 'На счёте' : 'Сегодня свободно'}</span><b id="ob-big">0</b></div>
      <h1 id="ob-h">${biz ? 'Вот твоя главная цифра' : 'Столько можно тратить в день'}</h1>
      <p>${biz ? 'Она всегда сверху. Ниже — лента: что придёт и что нужно оплатить.' : `Чтобы хватило на ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'} до дохода. Цифра сама пересчитывается, когда ты что-то записываешь.`}</p>
      <p class="ob-hint">Осталось несколько коротких шагов — прямо в ленте.</p>
      <div class="ob-btns"><button type="button" class="btn" id="ob-next">В ленту</button></div>`;
    },
    go: () => `<i class="orb ob-orb small" aria-hidden="true"></i>
      <h1 id="ob-h">Пара шагов — и ты всё умеешь</h1>
      <ul class="ob-list"><li><b>Одна лента</b><span>Черта «сейчас» делит то, что было, и то, что будет.</span></li>
        <li><b>Главная цифра</b><span>Сколько можно потратить сегодня, чтобы хватило до дохода.</span></li>
        <li><b>Всё делается на месте</b><span>Попробуй на учебных строках — они ждут в ленте.</span></li></ul>
      <div class="ob-btns"><button type="button" class="btn" id="ob-next">В ленту</button></div>`
  };
  const amount = (id) => { const v = parseAmount(el.querySelector(id).value); return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0; };
  async function onNext(btn) {
    const page = pages[i], err = el.querySelector('#ob-err');
    try {
      if (page === 'cash') {
        const v = amount('#ob-cash');
        if (!v) { err.textContent = 'Введи сумму или нажми «Не сейчас».'; return; }
        btn.disabled = true;
        await pb.collection('transactions').create({ kind: 'adjust', amount: v, book: curBook(), date: pbDate(today()), status: 'paid', repeat: 'none', note: 'Остаток на руках', extra: {}, owner: uid() });
        ans.cash = v;
      } else if (page === 'income') {
        const v = amount('#ob-inc'), day = el.querySelector('#ob-day').value;
        if (!v || !day) { err.textContent = 'Введи сумму и день или нажми «Не сейчас».'; return; }
        btn.disabled = true;
        await pb.collection('transactions').create({ kind: 'income', amount: v, book: curBook(), date: pbDate(day), status: 'planned', repeat: 'monthly', note: biz ? 'Поступление' : 'Зарплата', extra: {}, owner: uid() });
        ans.income = v; ans.incomeDay = day;
      }
      next();
    } catch (e) { btn.disabled = false; if (err) err.textContent = errText(e); else toast(errText(e)); }
  }
  function draw() {
    el.innerHTML = `<div class="ob-in">
        <div class="ob-top"><div class="ob-dots" aria-label="Шаг ${i + 1} из ${pages.length}">${pages.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
          <button type="button" class="ob-skip" id="ob-skip">Пропустить</button></div>
        <div class="ob-body">${body[pages[i]]()}</div></div>`;
    el.querySelector('#ob-skip').onclick = () => finish(true);
    el.querySelector('#ob-next').onclick = (e) => onNext(e.currentTarget);
    el.querySelector('#ob-later')?.addEventListener('click', next);
    const inp = el.querySelector('input:not([type="date"])');
    if (inp) { setTimeout(() => inp.focus(), 80); inp.onkeydown = (e) => { if (e.key === 'Enter') el.querySelector('#ob-next').click(); }; }
    else el.querySelector('#ob-next').focus();
    if (pages[i] === 'free') {
      const days = Math.max(1, ans.income ? daysUntil(ans.incomeDay) : daysUntil(ymd(firstOfMonth(addMonths(new Date(), 1)))));
      countUp(el.querySelector('#ob-big'), 0, biz ? ans.cash : Math.floor(ans.cash / days), money);
    }
  }
  draw();
  document.body.append(el);
  document.documentElement.classList.add('ob-open');
}

// Лента после отрисовки: знакомство ещё не начинали — показать приветствие. fresh — аккаунт пустой (спросим деньги и доход)
export function maybeTour(fresh) {
  if (read() || document.querySelector('.ob, .tour-backdrop')) return;
  welcome(!!fresh);
}

export const showTour = () => welcome(false);

// Настройки → «Показать обучение»: всё с начала (без вопросов про деньги)
export function replayTour() {
  try { localStorage.removeItem(key()); } catch (e) { /* приватный режим */ }
  if (location.hash === '#/' || location.hash === '') welcome(false); else location.hash = '#/';
}
