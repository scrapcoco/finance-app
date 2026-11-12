// Обучение-проводник при первом входе (подсказки — облачка как в комиксе): ведёт по настоящему приложению. Экран затемнён, светлая рамка («прожектор»)
// показывает один блок; нажать можно только на него. Шаги двух видов:
//   act: true  — «нажми сюда»: нажатие в рамке передаётся настоящей кнопке, приложение переходит на следующий экран;
//   без act    — пояснение блока, дальше кнопкой «Дальше».
// На телефоне ещё два шага-пробы жестов на учебной строке (demo: 'swipe' | 'hold') — она ненастоящая.
// Обучение ничего не сохраняет: в форму новой записи заходим и выходим крестиком.
// Один раз на устройстве для каждого аккаунта (localStorage `tourDone:<id>`); повторить — Настройки → «Показать обучение».
// Своё окно, не #sheet-root: его очищает каждый render(), а экраны при обучении меняются.
import { ICON } from '../core/icons.js';
import { uid } from '../core/pb.js';
import { isBusiness } from '../core/data.js';
import { markNewsSeen } from './news.js';
import { celebrate } from '../ui.js';

const key = () => `tourDone:${uid() || ''}`;
const done = () => { try { return localStorage.getItem(key()) === '1'; } catch (e) { return true; } };
const markDone = () => { try { localStorage.setItem(key(), '1'); } catch (e) { /* приватный режим */ } };

const HASH = { home: '#/', add: '#/add', calendar: '#/calendar', tasks: '#/tasks' };

// screen — на каком экране шаг; sel — что подсветить
function steps(phone) {
  const biz = isBusiness();
  const all = [
    { screen: 'home', sel: '#view .hero, #view .dk-stats', title: 'Привет! Я покажу, что тут где',
      text: biz ? 'Это главное окно: сколько на счёте, выручка и прибыль. Минута — и ты всё умеешь. Поехали?' : 'Это главное окно: сколько денег на руках, что пришло и что ушло. Минута — и ты всё умеешь. Поехали?' },
    { screen: 'home', sel: '#tabbar .tab-add', act: true, word: 'ТЫЦ!', title: 'Жми на «+»!', text: 'Купил кофе, получил зарплату, ждёшь счёт за свет — всё начинается с этой кнопки.' },
    { screen: 'add', sel: '#view .amount-box', title: 'Сколько?', text: 'Сюда — сумму. Чуть выше выбираешь: это расход или доход.' },
    { screen: 'add', sel: '#view .chips', title: 'На что?', text: 'Еда, дом, транспорт… Нет нужной категории — добавь свою кнопкой «+ Своя».' },
    { screen: 'add', sel: '#view .form-list', title: 'Ещё не заплатил?', text: 'Включи «Будущий платёж» — запись уедет в календарь, а я напомню, когда придёт срок.' },
    { screen: 'add', sel: '#view .head .icon-btn', act: true, word: 'ХЛОП!', title: 'Жми на крестик', text: 'Это была тренировка — сохранять ничего не будем.' },
    { screen: 'home', sel: '#tabbar .tab[data-r="calendar"]', act: true, word: 'ТЫЦ!', title: 'Теперь — «Платежи»', text: 'Заглянем в будущее: что скоро платить и что придёт.' },
    { screen: 'calendar', sel: '#view .cal', title: 'Весь месяц как на ладони',
      text: phone ? 'Точка под числом — в этот день платёж. Нажми на день — увидишь какой. Подержи день — добавишь новый. Смахни вбок — другой месяц.'
        : 'Точка под числом — в этот день платёж. Нажми на день — справа увидишь какой. Стрелки ← и → листают месяцы.' },
    { screen: 'calendar', sel: '#tabbar .tab[data-r="tasks"]', act: true, word: 'ТЫЦ!', title: 'А теперь — «Дела»', text: 'Деньги деньгами, а дела сами себя не сделают.' },
    { screen: 'tasks', sel: '#view .quick-add', title: 'Запиши, чтобы не забыть', text: 'Пишешь дело, жмёшь «+» — готово. Нажми на дело потом — добавишь время и напоминание.' },
    { screen: 'tasks', demo: 'swipe', title: 'Фокус! Смахни влево', text: 'Проведи пальцем по строке справа налево — так отмечают «сделано» и «оплачено».' },
    { screen: 'tasks', demo: 'hold', title: 'Ещё фокус! Подержи', text: 'Прижми строку пальцем и не отпускай секунду — откроются быстрые действия.' },
    { screen: 'tasks', sel: '#tabbar .tab[data-r=""]', act: true, word: 'ДОМОЙ!', title: 'Назад на «Главную»', text: 'Остался последний секрет.' },
    { screen: 'home', sel: '#view .head-btns', title: 'Два секрета напоследок',
      text: 'Искорка — помощник: спроси его «сколько я трачу на еду». Глаз — прячет суммы от любопытных. Всё, ты готов!' }
  ];
  return phone ? all : all.filter((s) => !s.demo);
}

const demoRow = () => `<div class="slab tour-demo"><div class="card nudge" id="tour-row" data-sw="done" data-sw-label="Сделано">
    <span class="nudge-link"><span class="nudge-ic inc">${ICON.clock}</span>
      <span class="main"><span class="nudge-k inc">Учебное дело</span><span class="name">Выпить кофе</span></span></span>
    <span class="btn small secondary" aria-hidden="true">Сделано</span></div></div>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function showTour() {
  document.querySelector('.tour-backdrop')?.remove();
  const view = document.getElementById('view');
  const list = steps(!matchMedia('(min-width: 960px)').matches);
  let i = 0, timer = 0, alive = true, target = null;
  const bd = document.createElement('div');
  bd.className = 'tour-backdrop spot wait';
  bd.innerHTML = '<div class="tour-hole" aria-hidden="true"></div><div class="tour" role="dialog" aria-modal="true" aria-labelledby="tour-t"></div>';
  const hole = bd.firstElementChild, card = bd.lastElementChild;
  const tick = setInterval(() => place(), 300); // экраны перерисовываются и «въезжают» — рамка догоняет блок

  function close() {
    alive = false; clearTimeout(timer); clearInterval(tick); markDone(); markNewsSeen(); bd.remove();
    document.documentElement.classList.remove('tour-open');
    document.removeEventListener('keydown', onKey, true);
  }
  // Клавиши приложения (N, стрелки, Esc) на время обучения отключены; Esc закрывает обучение
  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== ' ') e.stopPropagation();
  }

  const find = (s) => (s.sel ? document.querySelector(s.sel) : null);
  const ready = (s) => view.dataset.screen === s.screen && !view.querySelector('.loading') && (s.demo || !!find(s)?.getBoundingClientRect().width);

  // Перейти к шагу n: дождаться его экрана и блока (если экран не тот — открыть нужный; блока нет — пропустить шаг)
  async function go(n) {
    clearTimeout(timer);
    if (n >= list.length) { close(); return; }
    i = n; target = null;
    bd.classList.add('wait');
    const s = list[i];
    for (let k = 0; alive && !ready(s) && k < 80; k++) {
      if (k === 25 && view.dataset.screen !== s.screen) location.hash = HASH[s.screen];
      await sleep(100);
    }
    if (!alive) return;
    if (!ready(s)) { go(n + 1); return; }
    document.activeElement?.blur?.(); // форма сама ставит курсор в сумму — клавиатура закрыла бы пол-экрана
    target = find(s);
    if (target) {
      const r = target.getBoundingClientRect();
      if (r.top < 60 || r.bottom > innerHeight - 60) { target.scrollIntoView({ block: 'center' }); await sleep(60); }
    }
    draw();
    await sleep(350); // блоки экрана ещё «въезжают»
    if (alive && i === n) { place(); bd.classList.remove('wait'); }
  }

  // Рамка встаёт на блок, карточка — под ним или над ним (где больше места)
  function place() {
    const s = list[i];
    if (!alive || !s) return;
    if (s.sel && (!target || !target.isConnected)) target = find(s); // экран перерисовался — блок новый
    const r = target?.getBoundingClientRect();
    if (!r || !r.width) { bd.classList.add('nohole'); card.style.top = ''; card.style.bottom = ''; card.dataset.tail = ''; return; }
    bd.classList.remove('nohole');
    const pad = 6, vh = innerHeight;
    Object.assign(hole.style, {
      left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
      borderRadius: `${(parseFloat(getComputedStyle(target).borderTopLeftRadius) || 18) + pad}px`
    });
    if (r.height > vh * 0.6) { card.style.top = `${(vh - card.offsetHeight) / 2}px`; card.style.bottom = ''; card.dataset.tail = ''; return; }
    const below = r.top + r.height / 2 < vh / 2;
    card.style.top = below ? `${Math.max(12, Math.min(r.bottom + pad + 14, vh - card.offsetHeight - 12))}px` : '';
    card.style.bottom = below ? '' : `${Math.max(12, Math.min(vh - r.top + pad + 14, vh - card.offsetHeight - 12))}px`;
    // «Хвостик» облачка смотрит на подсвеченный блок: сверху, если облачко под блоком, иначе снизу
    const c = card.getBoundingClientRect();
    card.dataset.tail = below ? 'up' : 'down';
    card.style.setProperty('--tail-x', `${Math.max(34, Math.min(r.left + r.width / 2 - c.left, c.width - 34))}px`);
  }

  function draw() {
    const s = list[i], isLast = i === list.length - 1;
    hole.classList.toggle('act', !!s.act);
    card.innerHTML = `<img class="tour-mascot" src="icons/icon.svg" alt="" width="52" height="52"><h2 id="tour-t">${s.title}</h2>
      <p>${s.text}</p>
      ${s.demo ? `${demoRow()}<div class="tour-ok" id="tour-ok" role="status"></div>` : ''}
      <div class="tour-foot">
        <div class="tour-step">${i + 1} из ${list.length}</div>
        <div class="btns">
          ${isLast ? '' : '<button type="button" class="btn small secondary" id="tour-skip">Пропустить</button>'}
          ${s.act ? '' : `<button type="button" class="btn small" id="tour-next">${isLast ? 'Поехали!' : i === 0 ? 'Поехали' : 'Дальше'}</button>`}
        </div></div>`;
    card.querySelector('#tour-skip')?.addEventListener('click', close);
    card.querySelector('#tour-next')?.addEventListener('click', () => { if (isLast) celebrate(); go(i + 1); });
    if (s.demo) bindDemo(s.demo);
    place();
  }

  // Нажатия ловит затемнение. В шаге «нажми сюда» нажатие внутри рамки передаётся настоящей кнопке, остальное — мимо
  bd.addEventListener('click', (e) => {
    if (card.contains(e.target) || bd.classList.contains('wait')) return;
    const s = list[i], r = hole.getBoundingClientRect();
    const inside = s.act && target && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) { hole.classList.remove('nudge'); void hole.offsetWidth; hole.classList.add('nudge'); return; }
    const el = target, n = i + 1;
    boom(s.word || 'ТЫЦ!', e.clientX, e.clientY);
    bd.classList.add('wait');
    el.click();
    go(n);
  });

  // Слово-вспышка, как в комиксе («ТЫЦ!», «ВЖУХ!») — в точке нажатия
  function boom(word, x, y) {
    const b = document.createElement('div');
    b.className = 'tour-boom'; b.textContent = word;
    b.style.left = `${Math.max(70, Math.min(x, innerWidth - 70))}px`; b.style.top = `${Math.max(60, y - 70)}px`;
    bd.append(b);
    setTimeout(() => b.remove(), 900);
  }

  // Учебная строка: свои обработчики касаний (общие жесты работают только внутри экрана приложения)
  function bindDemo(kind) {
    const row = card.querySelector('#tour-row'), ok = card.querySelector('#tour-ok');
    let x0 = 0, y0 = 0, x = 0, mode = '', hold = 0;
    const n = i;
    const win = (msg) => { ok.textContent = msg; ok.classList.add('on'); timer = setTimeout(() => { if (i === n) go(n + 1); }, 1100); };
    row.addEventListener('touchstart', (e) => {
      const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; x = 0; mode = '';
      if (kind === 'hold') hold = setTimeout(() => { mode = 'held'; row.classList.add('sw-lift'); navigator.vibrate?.(10); (boom('ОПА!', innerWidth / 2, row.getBoundingClientRect().top), win('Есть! В настоящих строках тут откроются действия.')); }, 450);
    }, { passive: true });
    row.addEventListener('touchmove', (e) => {
      const t = e.touches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (!mode && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) { clearTimeout(hold); mode = kind === 'swipe' && Math.abs(dx) > Math.abs(dy) && dx < 0 ? 'row' : 'none'; }
      if (mode !== 'row') return;
      e.preventDefault();
      x = Math.max(0, -dx);
      row.classList.add('sw-on'); row.style.transform = `translateX(${-x}px)`;
    }, { passive: false });
    const end = () => {
      clearTimeout(hold);
      if (mode !== 'row') return;
      row.classList.remove('sw-on');
      if (x > 70) { row.style.transform = 'translateX(-105%)'; (boom('ВЖУХ!', innerWidth / 2, row.getBoundingClientRect().top), win('Есть! Вот так отмечают сделанное.')); }
      else row.style.transform = '';
      mode = '';
    };
    row.addEventListener('touchend', end);
    row.addEventListener('touchcancel', end);
  }

  document.body.append(bd);
  document.documentElement.classList.add('tour-open');
  document.addEventListener('keydown', onKey, true);
  scrollTo(0, 0);
  go(0);
}

// Настройки → «Показать обучение»: отметка снимается, обучение начинается с главной
export function replayTour() {
  try { localStorage.removeItem(key()); } catch (e) { /* приватный режим */ }
  if (location.hash === '#/' || location.hash === '') showTour(); else location.hash = '#/';
}

// Вызывает главная после отрисовки: первый раз на этом устройстве — показать обучение
export function maybeTour() {
  if (done() || document.querySelector('.tour-backdrop')) return;
  showTour();
}
