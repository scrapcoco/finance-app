(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const pb = new PocketBase(CFG.PB_URL);
  pb.autoCancellation(false);

  const $view = document.getElementById('view');
  const $tabbar = document.getElementById('tabbar');
  const $sheetRoot = document.getElementById('sheet-root');
  const $toast = document.getElementById('toast');

  /* ---------- helpers ---------- */

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat(CFG.LOCALE, { maximumFractionDigits: 2 });
  const money = (v) => `${nf.format(Math.abs(Math.round(v * 100) / 100))} ${CFG.CURRENCY}`;
  const signed = (v, kind) => `${kind === 'income' ? '+' : '−'}${money(v)}`;
  const moneySigned = (v) => `${v < 0 ? '−' : ''}${money(v)}`;
  const parseAmount = (s) => {
    const n = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };

  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MONTHS_PREP = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю'];
  const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const REPEAT_LABEL = { none: 'Не повторять', weekly: 'Каждую неделю', monthly: 'Каждый месяц', yearly: 'Каждый год' };
  const REPEAT_SHORT = { weekly: 'Каждую неделю', monthly: 'Каждый месяц', yearly: 'Каждый год' };
  const FIELD_TYPES = { text: 'Текст', number: 'Число', select: 'Список', date: 'Дата', bool: 'Да/Нет', url: 'Ссылка' };

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const pbDate = (s) => `${s} 12:00:00.000Z`;
  const txDay = (t) => (t.date || '').slice(0, 10);
  const today = () => ymd(new Date());
  const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
  const shiftMonthKeepDay = (d, n) => {
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    t.setDate(Math.min(d.getDate(), daysIn(t.getFullYear(), t.getMonth())));
    return t;
  };
  const nextOccurrence = (s, repeat) => {
    const d = parseYmd(s);
    if (repeat === 'weekly') return ymd(addDays(d, 7));
    if (repeat === 'monthly') return ymd(shiftMonthKeepDay(d, 1));
    if (repeat === 'yearly') return ymd(shiftMonthKeepDay(d, 12));
    return null;
  };
  const humanDate = (s) => { const d = parseYmd(s); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; };
  const shortDate = (s) => {
    const t = today();
    if (s === t) return 'Сегодня';
    if (s === ymd(addDays(new Date(), -1))) return 'Вчера';
    const d = parseYmd(s); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  };
  const daysUntil = (s) => Math.round((parseYmd(s) - parseYmd(today())) / 86400000);
  const whenLabel = (s) => {
    const n = daysUntil(s);
    if (n < 0) return 'просрочено';
    if (n === 0) return 'сегодня';
    if (n === 1) return 'завтра';
    if (n < 5) return `через ${n} дня`;
    return `через ${n} дней`;
  };

  const ICON = {
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    debt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-7 0-11-7-11-7a19 19 0 0 1 5.1-5.9M9.9 5.2A9.6 9.6 0 0 1 12 5c7 0 11 7 11 7a19 19 0 0 1-2.2 3.2M1 1l22 22"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>'
  };

  const state = {
    month: firstOfMonth(new Date()),
    selDay: today(),
    period: 'month',
    cache: { cats: null, fields: null, debts: null }
  };

  let toastTimer;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.hidden = true; }, 2600);
  }

  function errText(e) {
    if (!e) return 'Что-то пошло не так.';
    if (e.status === 0) return 'Сервер не отвечает. Проверь интернет.';
    if (e.status === 401 || e.status === 403) return 'Нет доступа. Войди заново.';
    if (e.status === 429) return 'Слишком много запросов. Подожди пару секунд.';
    const data = e.response?.data;
    if (data && typeof data === 'object') {
      const first = Object.entries(data)[0];
      if (first) return `Поле «${first[0]}»: ${first[1].message || 'ошибка'}`;
    }
    return e.response?.message || e.message || 'Что-то пошло не так.';
  }

  /* ---------- data ---------- */

  const uid = () => pb.authStore.record?.id;
  const ownerFilter = () => pb.filter('owner = {:o}', { o: uid() });

  async function getCats(force) {
    if (!state.cache.cats || force) {
      state.cache.cats = await pb.collection('categories').getFullList({ sort: 'sort,name' });
    }
    return state.cache.cats;
  }
  async function getFields(force) {
    if (!state.cache.fields || force) {
      state.cache.fields = await pb.collection('custom_fields').getFullList({ sort: 'sort,created' });
    }
    return state.cache.fields;
  }
  async function getDebts(force) {
    if (!state.cache.debts || force) {
      state.cache.debts = await pb.collection('debts').getFullList({ sort: 'closed,created' });
    }
    return state.cache.debts;
  }
  function txBetween(from, to, extra) {
    let f = pb.filter('date >= {:a} && date < {:b}', { a: `${from} 00:00:00`, b: `${to} 00:00:00` });
    if (extra) f += ` && ${extra}`;
    return pb.collection('transactions').getFullList({ filter: f, sort: 'date,created', expand: 'category' });
  }

  async function ensureDefaults() {
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

  async function markPaid(tx) {
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

  async function bumpDebtDue(debtId, payDay) {
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

  /* ---------- shell ---------- */

  const TABS = [
    { r: '', label: 'Главная', icon: ICON.home },
    { r: 'calendar', label: 'Платежи', icon: ICON.cal },
    { r: 'add', label: '', icon: ICON.plus, add: true },
    { r: 'reports', label: 'Отчёты', icon: ICON.chart },
    { r: 'debts', label: 'Долги', icon: ICON.debt }
  ];

  function renderTabbar(active) {
    $tabbar.innerHTML = TABS.map((t) => t.add
      ? `<a class="tab-add" href="#/add" aria-label="Добавить запись">${t.icon}</a>`
      : `<a class="tab" href="#/${t.r}" ${t.r === active ? 'aria-current="page"' : ''}>${t.icon}${t.label}</a>`
    ).join('');
  }

  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, q] = h.split('?');
    const [name, id] = path.split('/');
    return { name: name || '', id, params: new URLSearchParams(q || '') };
  }

  const ROUTES = {};
  let renderSeq = 0;

  async function render() {
    closeSheet();
    const seq = ++renderSeq;
    if (!pb.authStore.isValid) { $tabbar.hidden = true; return viewLogin(); }
    const route = parseRoute();
    const fn = ROUTES[route.name] || ROUTES[''];
    const withTabs = !['add', 'edit', 'settings'].includes(route.name);
    $tabbar.hidden = !withTabs;
    $view.classList.toggle('no-tabs', !withTabs);
    if (withTabs) renderTabbar(route.name);
    if (!$view.innerHTML.trim()) $view.innerHTML = '<div class="loading">Загрузка…</div>';
    try {
      await fn(route, () => seq === renderSeq);
    } catch (e) {
      if (e?.status === 401) { pb.authStore.clear(); return render(); }
      if (seq !== renderSeq) return;
      $view.innerHTML = `<div class="empty"><p>${esc(errText(e))}</p><button class="btn small secondary" id="retry">Повторить</button></div>`;
      document.getElementById('retry').onclick = render;
    }
  }

  function monthSwitch() {
    const m = state.month;
    return `<div class="month-switch">
      <button class="icon-btn ghost" data-m="-1" aria-label="Предыдущий месяц">${ICON.left}</button>
      <div class="title">${MONTHS[m.getMonth()]} ${m.getFullYear()}</div>
      <button class="icon-btn ghost" data-m="1" aria-label="Следующий месяц">${ICON.right}</button>
    </div>`;
  }
  function bindMonthSwitch() {
    $view.querySelectorAll('[data-m]').forEach((b) => {
      b.onclick = () => { state.month = addMonths(state.month, Number(b.dataset.m)); render(); };
    });
  }

  function txRow(t, opts = {}) {
    const cat = t.expand?.category?.name;
    const title = t.note || cat || (t.kind === 'income' ? 'Доход' : 'Расход');
    const metaParts = [];
    if (opts.planned) {
      if (t.repeat && t.repeat !== 'none') metaParts.push(REPEAT_SHORT[t.repeat]);
      metaParts.push(whenLabel(txDay(t)));
    } else {
      metaParts.push(shortDate(txDay(t)));
      if (cat && t.note) metaParts.push(cat);
    }
    const d = parseYmd(txDay(t));
    const lead = opts.planned
      ? `<div class="datebox ${daysUntil(txDay(t)) < 0 ? 'overdue' : ''}"><b>${d.getDate()}</b><span>${MONTHS_SHORT[d.getMonth()]}</span></div>`
      : '';
    return `<a class="row" href="#/edit/${t.id}">
      ${lead}
      <div class="main"><div class="name">${esc(title)}</div><div class="meta">${esc(metaParts.join(', '))}</div></div>
      <div class="amt ${t.kind === 'income' ? 'inc' : 'exp'}">${signed(t.amount, t.kind)}</div>
    </a>`;
  }

  /* ---------- sheet ---------- */

  function openSheet(html, bind) {
    $sheetRoot.innerHTML = `<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
    const bd = $sheetRoot.firstElementChild;
    bd.addEventListener('click', (e) => { if (e.target === bd) closeSheet(); });
    bind(bd.querySelector('.sheet'));
    const first = bd.querySelector('input, select');
    if (first) setTimeout(() => first.focus(), 50);
  }
  function closeSheet() { $sheetRoot.innerHTML = ''; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $sheetRoot.innerHTML) closeSheet(); });

  /* ---------- login ---------- */

  const TERMS_VERSION = '1';
  const COPYRIGHT = `© ${new Date().getFullYear()} HardPoint. Все права защищены.`;
  const TERMS_HTML = `
    <ol class="terms">
      <li><b>Это тестовая версия.</b> Приложение создаётся одним человеком для себя и друзей. Оно бесплатное, это не коммерческий сервис, и в нём могут быть ошибки.</li>
      <li><b>Что хранится:</b> твой email, пароль (в зашифрованном виде, его никто не может прочитать) и записи, которые ты вносишь сам: суммы, категории, даты, комментарии, долги.</li>
      <li><b>Кто видит данные.</b> Другие пользователи твои записи не видят. Владелец сервера технически имеет доступ к базе данных, но обязуется не просматривать твои записи без твоей просьбы (например, чтобы помочь с ошибкой).</li>
      <li><b>Не вноси секретное:</b> номера карт, пароли от банков, PIN-коды и другие данные, утечка которых может навредить. Для теста можно использовать примерные суммы.</li>
      <li><b>Данные никому не передаются и не продаются.</b> Рекламы нет. Сервер находится в Германии (Oracle Cloud, Франкфурт).</li>
      <li><b>Сохранность.</b> Каждый день делаются резервные копии, но в тестовой версии полной гарантии сохранности нет.</li>
      <li><b>Удаление.</b> Ты можешь в любой момент удалить аккаунт в настройках, и все твои данные будут удалены безвозвратно.</li>
      <li><b>Изменения.</b> Тестирование может быть остановлено, а условия изменены. Об этом ты узнаешь заранее.</li>
    </ol>
    <p class="terms-contact">Вопросы и предложения: <a href="https://t.me/dogshitx" target="_blank" rel="noopener">@dogshitx</a> в Telegram</p>`;

  function termsSheet() {
    openSheet(`<h2>Условия тестирования</h2><div class="terms-body">${TERMS_HTML}</div>
      <p class="copyright">${esc(COPYRIGHT)}</p>
      <button class="btn" id="tclose">Понятно</button>`, (s) => { s.querySelector('#tclose').onclick = closeSheet; });
  }

  function viewLogin(mode = 'login') {
    $view.classList.add('no-tabs');
    const reg = mode === 'register';
    $view.innerHTML = `<form class="login" id="login" novalidate>
      <h1>Финансы</h1>
      <p>${reg ? 'Создай аккаунт по коду приглашения.' : 'Войди, чтобы увидеть свои доходы, расходы и платежи.'}</p>
      <div class="form-list">
        <div class="frow"><label for="em">Email</label><input id="em" type="email" autocomplete="${reg ? 'email' : 'username'}" required></div>
        <div class="frow"><label for="pw">Пароль</label><input id="pw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" placeholder="${reg ? 'Минимум 8 символов' : ''}" required></div>
        ${reg ? `
        <div class="frow"><label for="pw2">Ещё раз</label><input id="pw2" type="password" autocomplete="new-password" required></div>
        <div class="frow"><label for="inv">Код приглашения</label><input id="inv" autocomplete="off" autocapitalize="characters" required></div>` : ''}
      </div>
      ${reg ? `<label class="check"><input type="checkbox" id="agree"><span>Я прочитал и согласен с <button type="button" class="link-btn inline" id="terms">условиями тестирования</button></span></label>` : ''}
      <div class="error" id="err" role="alert"></div>
      <button class="btn" type="submit">${reg ? 'Создать аккаунт' : 'Войти'}</button>
      <button class="link-btn" type="button" id="switch" style="align-self:center">${reg ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Регистрация по приглашению'}</button>
      <p class="copyright">${esc(COPYRIGHT)}</p>
    </form>`;
    const form = document.getElementById('login');
    const err = document.getElementById('err');
    document.getElementById('switch').onclick = () => viewLogin(reg ? 'login' : 'register');
    if (reg) document.getElementById('terms').onclick = termsSheet;

    const enter = async (email, password) => {
      await pb.collection('users').authWithPassword(email, password);
      state.cache = { cats: null, fields: null, debts: null };
      await ensureDefaults();
      location.hash = '#/';
      render();
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      const email = form.em.value.trim(), password = form.pw.value;
      err.textContent = '';
      if (!email || !password) { err.textContent = 'Введи email и пароль.'; return; }
      if (reg) {
        if (password.length < 8) { err.textContent = 'Пароль должен быть не короче 8 символов.'; return; }
        if (password !== form.pw2.value) { err.textContent = 'Пароли не совпадают.'; return; }
        if (!form.inv.value.trim()) { err.textContent = 'Введи код приглашения.'; return; }
        if (!form.agree.checked) { err.textContent = 'Нужно согласиться с условиями тестирования.'; return; }
      }
      btn.disabled = true;
      try {
        if (reg) {
          try {
            await pb.collection('users').create({
              email, password, passwordConfirm: password,
              invite: form.inv.value.trim(), terms_version: TERMS_VERSION
            });
          } catch (ex) {
            const d = ex.response?.data || {};
            if (d.email) err.textContent = d.email.code === 'validation_not_unique' ? 'Такой email уже зарегистрирован. Попробуй войти.' : 'Проверь email.';
            else if (d.password) err.textContent = 'Пароль должен быть не короче 8 символов.';
            else if (ex.status === 400 || ex.status === 403) err.textContent = 'Неверный код приглашения.';
            else err.textContent = errText(ex);
            btn.disabled = false;
            return;
          }
        }
        await enter(email, password);
        if (reg) toast('Аккаунт создан. Добро пожаловать!');
      } catch (ex) {
        err.textContent = ex.status === 400 ? 'Неверный email или пароль.' : errText(ex);
        btn.disabled = false;
      }
    };
  }

  /* ---------- home ---------- */

  ROUTES[''] = async (route, alive) => {
    const m = state.month;
    const from = ymd(m), to = ymd(addMonths(m, 1));
    const isCur = ymd(firstOfMonth(new Date())) === from;
    const [allPaid, monthTx, upcoming, recent] = await Promise.all([
      pb.collection('transactions').getFullList({ filter: "status = 'paid'", fields: 'kind,amount' }),
      txBetween(from, to),
      pb.collection('transactions').getList(1, 5, { filter: "status = 'planned'", sort: 'date,created', expand: 'category' }),
      pb.collection('transactions').getList(1, 5, { filter: "status = 'paid'", sort: '-date,-created', expand: 'category' })
    ]);
    if (!alive()) return;
    const balance = allPaid.reduce((s, t) => s + (t.kind === 'income' ? t.amount : -t.amount), 0);
    let inc = 0, exp = 0, plannedNet = 0;
    for (const t of monthTx) {
      if (t.status === 'paid') { if (t.kind === 'income') inc += t.amount; else exp += t.amount; }
      else plannedNet += t.kind === 'income' ? t.amount : -t.amount;
    }
    const lastDay = `${daysIn(m.getFullYear(), m.getMonth())} ${MONTHS_GEN[m.getMonth()]}`;
    const note = isCur
      ? (plannedNet ? `С учётом запланированных: ${moneySigned(balance + plannedNet)} к ${lastDay}` : 'Запланированных платежей до конца месяца нет')
      : `Итог за ${MONTHS[m.getMonth()].toLowerCase()}: ${moneySigned(inc - exp)}`;

    $view.innerHTML = `
      <div class="head">${monthSwitch()}<a class="icon-btn" href="#/settings" aria-label="Настройки">${ICON.gear}</a></div>
      <section class="hero">
        <div><div class="label">Баланс на сегодня</div><div class="big">${moneySigned(balance)}</div></div>
        <div class="pair">
          <div><div class="k">Доходы</div><div class="v inc">+${money(inc)}</div></div>
          <div><div class="k">Расходы</div><div class="v exp">−${money(exp)}</div></div>
        </div>
        <div class="note">${esc(note)}</div>
      </section>
      <section class="sec">
        <div class="sec-head"><h2>Ближайшие платежи</h2><a href="#/calendar">Календарь</a></div>
        ${upcoming.items.length
          ? `<div class="list">${upcoming.items.map((t) => txRow(t, { planned: true })).join('')}</div>`
          : `<div class="list"><div class="empty">Будущих платежей нет. Добавь запись и включи «Будущий платёж».</div></div>`}
      </section>
      <section class="sec">
        <div class="sec-head"><h2>Последние записи</h2></div>
        ${recent.items.length
          ? `<div class="list">${recent.items.map((t) => txRow(t)).join('')}</div>`
          : `<div class="list"><div class="empty">Записей пока нет.<br><a class="btn small" href="#/add" style="display:inline-flex;align-items:center;margin-top:10px;text-decoration:none">Добавить первую запись</a></div></div>`}
      </section>`;
    bindMonthSwitch();
  };

  /* ---------- add / edit ---------- */

  ROUTES.add = (route, alive) => viewForm(null, route, alive);
  ROUTES.edit = async (route, alive) => {
    const tx = await pb.collection('transactions').getOne(route.id);
    return viewForm(tx, route, alive);
  };

  async function viewForm(tx, route, alive) {
    const [cats, fields, debts] = await Promise.all([getCats(), getFields(), getDebts()]);
    if (!alive()) return;
    const p = route.params;
    const presetDebt = p.get('debt') ? debts.find((d) => d.id === p.get('debt')) : null;
    const f = tx ? {
      kind: tx.kind, amount: String(tx.amount).replace('.', ','), category: tx.category || '', date: txDay(tx),
      note: tx.note || '', planned: tx.status === 'planned', repeat: tx.repeat || 'none', debt: tx.debt || '',
      extra: { ...(tx.extra || {}) }
    } : {
      kind: presetDebt ? 'expense' : (p.get('kind') || 'expense'), amount: presetDebt?.monthly_payment ? String(presetDebt.monthly_payment).replace('.', ',') : '',
      category: '', date: p.get('date') || today(), note: presetDebt ? presetDebt.name : '',
      planned: p.get('date') ? p.get('date') > today() : false, repeat: 'none', debt: presetDebt?.id || '', extra: {}
    };

    const draw = () => {
      const kindCats = cats.filter((c) => c.kind === f.kind);
      const openDebts = debts.filter((d) => !d.closed || d.id === f.debt);
      const visibleFields = fields.filter((x) => !x.hidden);
      $view.innerHTML = `
        <div class="head">
          <a class="icon-btn" href="#/" aria-label="Закрыть">${ICON.close}</a>
          <div class="title">${tx ? 'Запись' : 'Новая запись'}</div>
          <div style="width:44px"></div>
        </div>
        <div class="segment" role="group" aria-label="Тип записи">
          <button type="button" class="exp-on" data-kind="expense" aria-pressed="${f.kind === 'expense'}">Расход</button>
          <button type="button" class="inc-on" data-kind="income" aria-pressed="${f.kind === 'income'}">Доход</button>
        </div>
        <div class="amount-box">
          <label for="amt">Сумма</label>
          <div class="line"><input id="amt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(f.amount)}"><div class="cur">${esc(CFG.CURRENCY)}</div></div>
        </div>
        <div class="sec">
          <div class="field-label">Категория</div>
          <div class="chips">
            ${kindCats.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${f.category === c.id}">${esc(c.name)}</button>`).join('')}
            <button type="button" class="chip dashed" id="newcat">+ Своя</button>
          </div>
        </div>
        <div class="form-list">
          <div class="frow"><label for="dt">Дата</label><input id="dt" type="date" value="${esc(f.date)}"></div>
          <div class="frow"><label for="nt">Комментарий</label><input id="nt" maxlength="500" placeholder="Например, аренда" value="${esc(f.note)}"></div>
          <div class="frow">
            <div><label id="pl-l">Будущий платёж</label><div class="hint">Ещё не оплачен</div></div>
            <button type="button" class="switch" id="pl" role="switch" aria-labelledby="pl-l" aria-checked="${f.planned}"></button>
          </div>
          ${f.planned ? `<div class="frow"><label for="rp">Повторять</label><select id="rp">${Object.entries(REPEAT_LABEL).map(([k, v]) => `<option value="${k}" ${f.repeat === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>` : ''}
          ${f.kind === 'expense' && openDebts.length ? `<div class="frow"><label for="db">Платёж по долгу</label><select id="db"><option value="">Нет</option>${openDebts.map((d) => `<option value="${d.id}" ${f.debt === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>` : ''}
        </div>
        <div class="sec">
          <div class="sec-head"><div class="field-label">Мои поля</div><a href="#/settings">Настроить</a></div>
          ${visibleFields.length ? `<div class="form-list">${visibleFields.map(fieldInput).join('')}</div>`
            : `<div class="list"><div class="empty">Своих полей пока нет. Добавь их в настройках, например «Проект» или «Способ оплаты».</div></div>`}
        </div>
        <div class="error" id="err" role="alert"></div>
        <button class="btn" id="save">${tx ? 'Сохранить изменения' : 'Сохранить'}</button>
        ${tx ? `<button class="btn danger" id="del">Удалить запись</button>` : ''}`;
      bind();
    };

    const fieldInput = (x) => {
      const v = f.extra[x.id];
      const id = `cf_${x.id}`;
      const label = `<label for="${id}">${esc(x.label)}</label>`;
      switch (x.field_type) {
        case 'number': return `<div class="frow">${label}<input id="${id}" data-cf="${x.id}" inputmode="decimal" value="${esc(v ?? '')}"></div>`;
        case 'date': return `<div class="frow">${label}<input id="${id}" data-cf="${x.id}" type="date" value="${esc(v ?? '')}"></div>`;
        case 'url': return `<div class="frow">${label}<input id="${id}" data-cf="${x.id}" type="url" placeholder="https://" value="${esc(v ?? '')}"></div>`;
        case 'bool': return `<div class="frow"><label id="${id}-l">${esc(x.label)}</label><button type="button" class="switch" id="${id}" data-cfb="${x.id}" role="switch" aria-labelledby="${id}-l" aria-checked="${!!v}"></button></div>`;
        case 'select': {
          const opts = Array.isArray(x.options) ? x.options : [];
          return `<div class="frow">${label}<select id="${id}" data-cf="${x.id}"><option value="">—</option>${opts.map((o) => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
        }
        default: return `<div class="frow">${label}<input id="${id}" data-cf="${x.id}" value="${esc(v ?? '')}"></div>`;
      }
    };

    const bind = () => {
      const q = (s) => $view.querySelector(s);
      q('#amt').oninput = (e) => { f.amount = e.target.value; };
      q('#dt').onchange = (e) => {
        f.date = e.target.value || today();
        if (!tx && f.date > today() && !f.planned) { f.planned = true; draw(); }
      };
      q('#nt').oninput = (e) => { f.note = e.target.value; };
      $view.querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => {
        if (f.kind === b.dataset.kind) return;
        f.kind = b.dataset.kind; f.category = ''; if (f.kind === 'income') f.debt = ''; draw();
      });
      $view.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => {
        f.category = f.category === b.dataset.cat ? '' : b.dataset.cat; draw();
      });
      q('#pl').onclick = () => { f.planned = !f.planned; draw(); };
      if (q('#rp')) q('#rp').onchange = (e) => { f.repeat = e.target.value; };
      if (q('#db')) q('#db').onchange = (e) => { f.debt = e.target.value; };
      $view.querySelectorAll('[data-cf]').forEach((el) => {
        const ev = el.tagName === 'SELECT' || el.type === 'date' ? 'onchange' : 'oninput';
        el[ev] = () => { f.extra[el.dataset.cf] = el.value; };
      });
      $view.querySelectorAll('[data-cfb]').forEach((el) => el.onclick = () => {
        f.extra[el.dataset.cfb] = !f.extra[el.dataset.cfb]; el.setAttribute('aria-checked', String(!!f.extra[el.dataset.cfb]));
      });
      q('#newcat').onclick = () => newCategorySheet(f.kind, (c) => { cats.push(c); f.category = c.id; draw(); });
      q('#save').onclick = save;
      if (q('#del')) q('#del').onclick = async () => {
        if (!confirm('Удалить эту запись?')) return;
        try { await pb.collection('transactions').delete(tx.id); toast('Запись удалена'); location.hash = '#/'; }
        catch (e) { q('#err').textContent = errText(e); }
      };
      if (!tx && !f.amount) setTimeout(() => q('#amt')?.focus(), 50);
    };

    const save = async () => {
      const err = $view.querySelector('#err');
      const amount = parseAmount(f.amount);
      if (!(amount > 0)) { err.textContent = 'Введи сумму больше нуля.'; $view.querySelector('#amt').focus(); return; }
      const extra = {};
      for (const x of fields) {
        let v = f.extra[x.id];
        if (v === '' || v === undefined || v === null || v === false) continue;
        if (x.field_type === 'number') { v = parseAmount(v); if (!Number.isFinite(v)) continue; }
        extra[x.id] = v;
      }
      const data = {
        kind: f.kind, amount: Math.round(amount * 100) / 100, date: pbDate(f.date || today()),
        category: f.category, note: f.note.trim(), status: f.planned ? 'planned' : 'paid',
        repeat: f.planned ? f.repeat : 'none', debt: f.kind === 'expense' ? f.debt : '', extra
      };
      const btn = $view.querySelector('#save');
      btn.disabled = true; err.textContent = '';
      try {
        if (tx) {
          await pb.collection('transactions').update(tx.id, data);
          toast('Изменения сохранены');
        } else {
          await pb.collection('transactions').create({ ...data, owner: uid() });
          if (data.debt && data.status === 'paid') await bumpDebtDue(data.debt, f.date);
          toast(data.status === 'planned' ? 'Платёж запланирован' : 'Запись сохранена');
        }
        location.hash = route.params.get('back') ? `#/${route.params.get('back')}` : '#/';
      } catch (e) {
        err.textContent = errText(e); btn.disabled = false;
      }
    };

    draw();
  }

  function newCategorySheet(kind, done) {
    openSheet(`<h2>Новая категория</h2>
      <div class="form-list"><div class="frow"><label for="cn">Название</label><input id="cn" maxlength="60" placeholder="${kind === 'income' ? 'Например, Фриланс' : 'Например, Спорт'}"></div></div>
      <div class="error" id="cerr" role="alert"></div>
      <div class="btns"><button class="btn secondary" id="cc">Отмена</button><button class="btn" id="cs">Добавить</button></div>`, (s) => {
      s.querySelector('#cc').onclick = closeSheet;
      s.querySelector('#cs').onclick = async () => {
        const name = s.querySelector('#cn').value.trim();
        if (!name) { s.querySelector('#cerr').textContent = 'Введи название.'; return; }
        try {
          const c = await pb.collection('categories').create({ name, kind, sort: 100, owner: uid() });
          state.cache.cats = null; closeSheet(); done(c);
        } catch (e) { s.querySelector('#cerr').textContent = errText(e); }
      };
    });
  }

  /* ---------- calendar ---------- */

  ROUTES.calendar = async (route, alive) => {
    const m = state.month;
    const from = ymd(m), to = ymd(addMonths(m, 1));
    if (state.selDay < from || state.selDay >= to) state.selDay = from <= today() && today() < to ? today() : from;
    const txs = await txBetween(from, to);
    if (!alive()) return;
    let expInc = 0, expExp = 0;
    const byDay = {};
    for (const t of txs) {
      (byDay[txDay(t)] ||= []).push(t);
      if (t.status === 'planned') { if (t.kind === 'income') expInc += t.amount; else expExp += t.amount; }
    }
    const lead = (m.getDay() + 6) % 7;
    const n = daysIn(m.getFullYear(), m.getMonth());
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div></div>');
    const t0 = today();
    for (let d = 1; d <= n; d++) {
      const key = ymd(new Date(m.getFullYear(), m.getMonth(), d));
      const list = byDay[key] || [];
      const hasI = list.some((t) => t.kind === 'income'), hasE = list.some((t) => t.kind === 'expense');
      const cls = ['day', key < t0 ? 'past' : '', key === t0 ? 'today' : ''].join(' ');
      cells.push(`<button class="${cls}" data-day="${key}" aria-pressed="${key === state.selDay}" aria-label="${d} ${MONTHS_GEN[m.getMonth()]}${list.length ? `, записей: ${list.length}` : ''}">
        <span class="n">${d}</span><span class="dots">${hasI ? '<i class="di"></i>' : ''}${hasE ? '<i class="de"></i>' : ''}</span></button>`);
    }
    const sel = byDay[state.selDay] || [];
    const sd = parseYmd(state.selDay);

    $view.innerHTML = `
      <div class="head"><h1>Платежи</h1>${monthSwitch()}</div>
      <div class="stats">
        <div class="stat"><div class="k">Ожидается</div><div class="v inc">+${money(expInc)}</div></div>
        <div class="stat"><div class="k">К оплате</div><div class="v exp">−${money(expExp)}</div></div>
      </div>
      <div class="cal">
        <div class="cal-week"><div>Пн</div><div>Вт</div><div>Ср</div><div>Чт</div><div>Пт</div><div>Сб</div><div>Вс</div></div>
        <div class="cal-grid">${cells.join('')}</div>
      </div>
      <section class="sec">
        <div class="sec-head"><h2>${sd.getDate()} ${MONTHS_GEN[sd.getMonth()]}, ${WEEKDAYS[sd.getDay()]}</h2>
          <a href="#/add?date=${state.selDay}&back=calendar">Добавить</a></div>
        ${sel.length ? `<div class="list">${sel.map((t) => `
          ${txRow(t, { planned: t.status === 'planned' })}
          ${t.status === 'planned' ? `<div class="frow" style="border-bottom:1px solid var(--line)"><span class="hint">Не оплачено</span><button class="btn small" data-pay="${t.id}">Отметить оплаченным</button></div>` : ''}`).join('')}</div>`
          : `<div class="list"><div class="empty">В этот день записей нет.</div></div>`}
      </section>`;
    $view.querySelector('.month-switch').querySelectorAll('[data-m]').forEach((b) => {
      b.onclick = () => { state.month = addMonths(state.month, Number(b.dataset.m)); render(); };
    });
    $view.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { state.selDay = b.dataset.day; render(); });
    $view.querySelectorAll('[data-pay]').forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try { await markPaid(sel.find((t) => t.id === b.dataset.pay)); render(); }
      catch (e) { toast(errText(e)); b.disabled = false; }
    });
  };

  /* ---------- reports ---------- */

  ROUTES.reports = async (route, alive) => {
    const m = state.month;
    let pFrom, pTo, pLabel;
    if (state.period === 'week') {
      const t = parseYmd(today()); const start = addDays(t, -((t.getDay() + 6) % 7));
      pFrom = ymd(start); pTo = ymd(addDays(start, 7)); pLabel = 'Эта неделя';
    } else if (state.period === 'year') {
      pFrom = `${m.getFullYear()}-01-01`; pTo = `${m.getFullYear() + 1}-01-01`; pLabel = String(m.getFullYear());
    } else {
      pFrom = ymd(m); pTo = ymd(addMonths(m, 1)); pLabel = `${MONTHS[m.getMonth()]} ${m.getFullYear()}`;
    }
    const cFrom = ymd(addMonths(m, -5)), cTo = ymd(addMonths(m, 1));
    const from = pFrom < cFrom ? pFrom : cFrom, to = pTo > cTo ? pTo : cTo;
    const txs = await txBetween(from, to, "status = 'paid'");
    if (!alive()) return;

    let inc = 0, exp = 0; const byCat = {};
    for (const t of txs) {
      const d = txDay(t); if (d < pFrom || d >= pTo) continue;
      if (t.kind === 'income') inc += t.amount;
      else { exp += t.amount; const name = t.expand?.category?.name || 'Без категории'; byCat[name] = (byCat[name] || 0) + t.amount; }
    }
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const s = addMonths(m, -i), e = addMonths(s, 1);
      let mi = 0, me = 0;
      for (const t of txs) { const d = txDay(t); if (d >= ymd(s) && d < ymd(e)) { if (t.kind === 'income') mi += t.amount; else me += t.amount; } }
      months.push({ label: MONTHS_SHORT[s.getMonth()], inc: mi, exp: me, cur: i === 0 });
    }
    const max = Math.max(1, ...months.map((x) => Math.max(x.inc, x.exp)));
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const catMax = cats[0]?.[1] || 1;
    const seg = (k, l) => `<button type="button" data-p="${k}" aria-pressed="${state.period === k}">${l}</button>`;

    $view.innerHTML = `
      <div class="head"><h1>Отчёты</h1>${state.period === 'week' ? `<div class="title">${pLabel}</div>` : monthSwitch()}</div>
      <div class="segment" role="group" aria-label="Период">${seg('week', 'Неделя')}${seg('month', 'Месяц')}${seg('year', 'Год')}</div>
      <div class="stats">
        <div class="stat"><div class="k">Доходы</div><div class="v inc">+${nf.format(Math.round(inc))}</div></div>
        <div class="stat"><div class="k">Расходы</div><div class="v exp">−${nf.format(Math.round(exp))}</div></div>
        <div class="stat"><div class="k">Осталось</div><div class="v">${inc - exp < 0 ? '−' : ''}${nf.format(Math.abs(Math.round(inc - exp)))}</div></div>
      </div>
      <section class="panel">
        <div class="sec-head"><h2>Полгода</h2><div class="legend"><span><i style="background:var(--inc)"></i>Доходы</span><span><i style="background:var(--exp)"></i>Расходы</span></div></div>
        <div class="bars" role="img" aria-label="Доходы и расходы за последние шесть месяцев">
          ${months.map((x) => `<div class="bar-col ${x.cur ? 'cur' : ''}"><div class="bar-pair">
            <div class="bar" style="height:${(x.inc / max) * 100}%;background:var(--inc);opacity:${x.cur ? 1 : 0.55}"></div>
            <div class="bar" style="height:${(x.exp / max) * 100}%;background:var(--exp);opacity:${x.cur ? 1 : 0.55}"></div>
          </div><div class="lbl">${x.label}</div></div>`).join('')}
        </div>
      </section>
      <section class="panel">
        <h2>Расходы по категориям</h2>
        ${cats.length ? cats.map(([name, v]) => `<div class="cat-row">
          <div class="top"><b>${esc(name)}</b><span><b style="color:var(--ink)">${money(v)}</b> · ${Math.round((v / exp) * 100)}%</span></div>
          <div class="meter"><i style="width:${(v / catMax) * 100}%"></i></div></div>`).join('')
          : '<div class="empty">За этот период расходов нет.</div>'}
      </section>`;
    $view.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { state.period = b.dataset.p; render(); });
    bindMonthSwitch();
  };

  /* ---------- debts ---------- */

  ROUTES.debts = async (route, alive) => {
    const [debts, pays] = await Promise.all([
      getDebts(true),
      pb.collection('transactions').getFullList({ filter: "status = 'paid' && debt != ''", fields: 'debt,amount,date' })
    ]);
    if (!alive()) return;
    const paidBy = {};
    for (const p of pays) paidBy[p.debt] = (paidBy[p.debt] || 0) + p.amount;
    const rows = debts.map((d) => {
      const paid = paidBy[d.id] || 0;
      const left = Math.max(0, d.total - paid);
      return { ...d, paid, left, pct: d.total > 0 ? Math.min(100, Math.round((paid / d.total) * 100)) : 0 };
    });
    const open = rows.filter((d) => !d.closed);
    const totalAll = open.reduce((s, d) => s + d.total, 0);
    const leftAll = open.reduce((s, d) => s + d.left, 0);
    const pctAll = totalAll > 0 ? Math.round(((totalAll - leftAll) / totalAll) * 100) : 0;

    let forecast = '';
    const active = open.filter((d) => d.left > 0);
    if (active.length && active.every((d) => d.monthly_payment > 0)) {
      const months = Math.max(...active.map((d) => Math.ceil(d.left / d.monthly_payment)));
      const end = addMonths(new Date(), months);
      forecast = `Без долгов к <b style="color:var(--ink)">${MONTHS_PREP[end.getMonth()]} ${end.getFullYear()}</b>`;
    } else if (active.length) {
      forecast = 'Укажи платёж в месяц, чтобы увидеть прогноз';
    }

    const mNow = firstOfMonth(new Date());
    const chart = [];
    for (let i = 5; i >= 0; i--) {
      const end = ymd(addMonths(mNow, -i + 1));
      let v = 0;
      for (const d of debts) {
        if ((d.created || '').slice(0, 10) >= end) continue;
        const paidTo = pays.filter((p) => p.debt === d.id && txDay(p) < end).reduce((s, p) => s + p.amount, 0);
        v += Math.max(0, d.total - paidTo);
      }
      const md = addMonths(mNow, -i);
      chart.push({ label: MONTHS_SHORT[md.getMonth()], v, cur: i === 0 });
    }
    const cMax = Math.max(1, ...chart.map((c) => c.v));
    const firstNonZero = chart.find((c) => c.v > 0);
    const drop = firstNonZero ? firstNonZero.v - chart[5].v : 0;
    const k = (v) => (v >= 1000 ? `${nf.format(Math.round(v / 100) / 10)}k` : nf.format(Math.round(v)));

    $view.innerHTML = `
      <div class="head"><h1>Долги</h1><button class="icon-btn" id="add-debt" aria-label="Добавить долг">${ICON.plus}</button></div>
      ${rows.length ? `
      <section class="hero">
        <div><div class="label">Осталось выплатить</div>
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><div class="big">${money(leftAll)}</div><div class="note">из ${money(totalAll)}</div></div></div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div class="meter inc" style="height:8px;background:rgba(255,255,255,0.08)"><i style="width:${pctAll}%"></i></div>
          <div class="note" style="display:flex;justify-content:space-between;gap:8px"><span><b style="color:var(--ink)">${pctAll}%</b> погашено</span><span>${forecast}</span></div>
        </div>
      </section>
      <section class="panel">
        <div class="sec-head"><h2>Как уменьшается долг</h2>${drop > 0 ? `<span class="inc" style="font-size:12px;font-weight:700">−${money(drop)} за полгода</span>` : ''}</div>
        <div class="bars" role="img" aria-label="Остаток долга по месяцам">
          ${chart.map((c) => `<div class="bar-col ${c.cur ? 'cur' : ''}"><div class="val">${c.v ? k(c.v) : ''}</div><div class="bar-pair">
            <div class="bar wide" style="height:${(c.v / cMax) * 100}%;background:${c.cur ? 'var(--inc)' : '#3A3A3F'}"></div></div>
            <div class="lbl">${c.label}</div></div>`).join('')}
        </div>
      </section>
      <section class="sec">${rows.map((d) => `
        <div class="debt ${d.closed ? 'closed' : ''}">
          <div class="top"><b>${esc(d.name)}</b><b>${d.left > 0 ? money(d.left) : 'Погашен'}</b></div>
          <div class="meter inc"><i style="width:${d.pct}%"></i></div>
          <div class="sub"><span>${esc([d.monthly_payment ? `${money(d.monthly_payment)}/мес` : 'Без графика', d.next_due ? `след. ${shortDate(d.next_due.slice(0, 10))}` : ''].filter(Boolean).join(', '))}</span><span><b style="color:var(--ink)">${d.pct}%</b> погашено</span></div>
          <div class="actions">
            ${d.left > 0 && !d.closed ? `<a class="btn small" style="display:inline-flex;align-items:center;text-decoration:none" href="#/add?debt=${d.id}&back=debts">Внести платёж</a>` : ''}
            <button class="btn small secondary" data-edit="${d.id}">Изменить</button>
          </div>
        </div>`).join('')}</section>`
      : `<div class="list"><div class="empty">Долгов нет. Если они есть — добавь, и здесь появится прогресс погашения.<br><button class="btn small" id="add-debt-2" style="margin-top:10px">Добавить долг</button></div></div>`}`;
    const openNew = () => debtSheet(null);
    $view.querySelector('#add-debt').onclick = openNew;
    $view.querySelector('#add-debt-2')?.addEventListener('click', openNew);
    $view.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => debtSheet(debts.find((d) => d.id === b.dataset.edit)));
  };

  function debtSheet(d) {
    openSheet(`<h2>${d ? 'Долг' : 'Новый долг'}</h2>
      <div class="form-list">
        <div class="frow"><label for="dn">Название</label><input id="dn" maxlength="80" placeholder="Кредит на машину" value="${esc(d?.name || '')}"></div>
        <div class="frow"><label for="dt2">Сумма долга</label><input id="dt2" inputmode="decimal" placeholder="0" value="${esc(d ? String(d.total).replace('.', ',') : '')}"></div>
        <div class="frow"><label for="dm">Платёж в месяц</label><input id="dm" inputmode="decimal" placeholder="Необязательно" value="${esc(d?.monthly_payment ? String(d.monthly_payment).replace('.', ',') : '')}"></div>
        <div class="frow"><label for="dd">Следующий платёж</label><input id="dd" type="date" value="${esc(d?.next_due ? d.next_due.slice(0, 10) : '')}"></div>
        <div class="frow"><label for="dnote">Заметка</label><input id="dnote" maxlength="500" value="${esc(d?.note || '')}"></div>
        ${d ? `<div class="frow"><label id="dcl-l">Закрыт</label><button type="button" class="switch" id="dcl" role="switch" aria-labelledby="dcl-l" aria-checked="${!!d.closed}"></button></div>` : ''}
      </div>
      <div class="error" id="derr" role="alert"></div>
      <div class="btns"><button class="btn secondary" id="dc">Отмена</button><button class="btn" id="ds">${d ? 'Сохранить' : 'Добавить'}</button></div>
      ${d ? '<button class="btn danger" id="ddel">Удалить долг</button>' : ''}`, (s) => {
      let closed = !!d?.closed;
      s.querySelector('#dcl')?.addEventListener('click', (e) => { closed = !closed; e.currentTarget.setAttribute('aria-checked', String(closed)); });
      s.querySelector('#dc').onclick = closeSheet;
      s.querySelector('#ds').onclick = async () => {
        const name = s.querySelector('#dn').value.trim();
        const total = parseAmount(s.querySelector('#dt2').value);
        const monthly = s.querySelector('#dm').value.trim() ? parseAmount(s.querySelector('#dm').value) : 0;
        const due = s.querySelector('#dd').value;
        const err = s.querySelector('#derr');
        if (!name) { err.textContent = 'Введи название.'; return; }
        if (!(total > 0)) { err.textContent = 'Введи сумму долга больше нуля.'; return; }
        if (!Number.isFinite(monthly) || monthly < 0) { err.textContent = 'Проверь платёж в месяц.'; return; }
        const data = { name, total, monthly_payment: monthly, next_due: due ? pbDate(due) : '', note: s.querySelector('#dnote').value.trim(), closed };
        try {
          if (d) await pb.collection('debts').update(d.id, data);
          else await pb.collection('debts').create({ ...data, owner: uid() });
          state.cache.debts = null; closeSheet(); toast(d ? 'Долг сохранён' : 'Долг добавлен'); render();
        } catch (e) { err.textContent = errText(e); }
      };
      s.querySelector('#ddel')?.addEventListener('click', async () => {
        if (!confirm('Удалить долг? Платежи по нему останутся в записях.')) return;
        try {
          const linked = await pb.collection('transactions').getFullList({ filter: pb.filter('debt = {:d}', { d: d.id }), fields: 'id' });
          for (const t of linked) await pb.collection('transactions').update(t.id, { debt: '' });
          await pb.collection('debts').delete(d.id);
          state.cache.debts = null; closeSheet(); toast('Долг удалён'); render();
        } catch (e) { s.querySelector('#derr').textContent = errText(e); }
      });
    });
  }

  /* ---------- settings ---------- */

  ROUTES.settings = async (route, alive) => {
    const [fields, cats] = await Promise.all([getFields(true), getCats(true)]);
    if (!alive()) return;
    const catBlock = (kind, title) => {
      const list = cats.filter((c) => c.kind === kind);
      return `<div class="field-label">${title}</div>
        <div class="list">${list.map((c) => `<div class="row" style="min-height:52px"><div class="main"><div class="name">${esc(c.name)}</div></div>
          <div class="tools"><button class="icon-btn" data-delcat="${c.id}" aria-label="Удалить категорию ${esc(c.name)}">${ICON.trash}</button></div></div>`).join('')
          || '<div class="empty">Категорий нет.</div>'}</div>
        <button class="chip dashed" data-addcat="${kind}" style="align-self:flex-start">+ Добавить</button>`;
    };
    $view.innerHTML = `
      <div class="head"><a class="icon-btn" href="#/" aria-label="Назад">${ICON.left}</a><div class="title">Настройки</div><div style="width:44px"></div></div>
      <section class="sec">
        <div class="sec-head"><h2>Мои поля</h2></div>
        <p class="hint" style="margin:0;color:var(--muted);font-size:13px">Поля появляются в каждой записи. Меняй порядок стрелками, скрывай ненужные.</p>
        ${fields.length ? `<div class="list">${fields.map((x, i) => `
          <div class="row" style="${x.hidden ? 'opacity:.55' : ''}">
            <div class="main"><div class="name">${esc(x.label)}</div><div class="meta">${FIELD_TYPES[x.field_type] || x.field_type}${x.field_type === 'select' && Array.isArray(x.options) ? `: ${esc(x.options.join(', '))}` : ''}</div></div>
            <div class="tools">
              <button class="icon-btn" data-mv="${i}" data-dir="-1" aria-label="Выше" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
              <button class="icon-btn" data-mv="${i}" data-dir="1" aria-label="Ниже" ${i === fields.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
              <button class="icon-btn" data-hide="${x.id}" aria-label="${x.hidden ? 'Показать' : 'Скрыть'} поле">${x.hidden ? ICON.eyeOff : ICON.eye}</button>
              <button class="icon-btn" data-editf="${x.id}" aria-label="Изменить поле">${ICON.edit}</button>
            </div>
          </div>`).join('')}</div>` : '<div class="list"><div class="empty">Своих полей пока нет.</div></div>'}
        <button class="btn secondary" id="addf">Добавить поле</button>
      </section>
      <section class="sec"><div class="sec-head"><h2>Категории</h2></div>${catBlock('expense', 'Расходы')}${catBlock('income', 'Доходы')}</section>
      <section class="sec">
        <div class="sec-head"><h2>Аккаунт</h2></div>
        <div class="list"><div class="row" style="min-height:52px"><div class="main"><div class="name">${esc(pb.authStore.record?.email || '')}</div><div class="meta">Сервер: ${esc(CFG.PB_URL.replace('https://', ''))}</div></div></div></div>
        <button class="btn secondary" id="logout">Выйти</button>
        <button class="link-btn" id="show-terms" style="align-self:flex-start">Условия тестирования</button>
        <button class="btn danger" id="del-account">Удалить аккаунт</button>
        <p class="copyright">${esc(COPYRIGHT)}</p>
      </section>`;

    $view.querySelector('#addf').onclick = () => fieldSheet(null, fields.length);
    $view.querySelectorAll('[data-editf]').forEach((b) => b.onclick = () => fieldSheet(fields.find((x) => x.id === b.dataset.editf)));
    $view.querySelectorAll('[data-hide]').forEach((b) => b.onclick = async () => {
      const x = fields.find((y) => y.id === b.dataset.hide);
      try { await pb.collection('custom_fields').update(x.id, { hidden: !x.hidden }); render(); } catch (e) { toast(errText(e)); }
    });
    $view.querySelectorAll('[data-mv]').forEach((b) => b.onclick = async () => {
      const i = Number(b.dataset.mv), j = i + Number(b.dataset.dir);
      const order = fields.slice(); [order[i], order[j]] = [order[j], order[i]];
      try { await Promise.all(order.map((x, k) => (x.sort !== k ? pb.collection('custom_fields').update(x.id, { sort: k }) : null))); render(); }
      catch (e) { toast(errText(e)); }
    });
    $view.querySelectorAll('[data-addcat]').forEach((b) => b.onclick = () => newCategorySheet(b.dataset.addcat, () => { toast('Категория добавлена'); render(); }));
    $view.querySelectorAll('[data-delcat]').forEach((b) => b.onclick = async () => {
      if (!confirm('Удалить категорию? Записи останутся, но будут без категории.')) return;
      try {
        const linked = await pb.collection('transactions').getFullList({ filter: pb.filter('category = {:c}', { c: b.dataset.delcat }), fields: 'id' });
        for (const t of linked) await pb.collection('transactions').update(t.id, { category: '' });
        await pb.collection('categories').delete(b.dataset.delcat);
        state.cache.cats = null; toast('Категория удалена'); render();
      } catch (e) { toast(errText(e)); }
    });
    $view.querySelector('#show-terms').onclick = termsSheet;
    $view.querySelector('#del-account').onclick = () => deleteAccountSheet();
    $view.querySelector('#logout').onclick = () => {
      pb.authStore.clear(); state.cache = { cats: null, fields: null, debts: null }; location.hash = '#/'; render();
    };
  };

  function deleteAccountSheet() {
    openSheet(`<h2>Удалить аккаунт?</h2>
      <p style="margin:0;color:var(--soft)">Будут безвозвратно удалены аккаунт и все твои данные: записи, категории, долги, поля и напоминания. Отменить это нельзя.</p>
      <div class="form-list"><div class="frow"><label for="dconf">Напиши УДАЛИТЬ</label><input id="dconf" autocomplete="off" autocapitalize="characters"></div></div>
      <div class="error" id="aerr" role="alert"></div>
      <div class="btns"><button class="btn secondary" id="acancel">Отмена</button><button class="btn danger" id="ago">Удалить навсегда</button></div>`, (s) => {
      s.querySelector('#acancel').onclick = closeSheet;
      s.querySelector('#ago').onclick = async () => {
        if (s.querySelector('#dconf').value.trim().toUpperCase() !== 'УДАЛИТЬ') { s.querySelector('#aerr').textContent = 'Напиши слово УДАЛИТЬ, чтобы подтвердить.'; return; }
        const b = s.querySelector('#ago'); b.disabled = true;
        try {
          try {
            const reg = await navigator.serviceWorker?.ready;
            const sub = await reg?.pushManager?.getSubscription();
            if (sub) await sub.unsubscribe();
          } catch (e) { /* не критично */ }
          await pb.collection('users').delete(uid());
          pb.authStore.clear(); state.cache = { cats: null, fields: null, debts: null };
          closeSheet(); location.hash = '#/'; render(); toast('Аккаунт удалён');
        } catch (e) { s.querySelector('#aerr').textContent = errText(e); b.disabled = false; }
      };
    });
  }

  function fieldSheet(x, nextSort) {
    let type = x?.field_type || 'text';
    const draw = (s) => {
      s.innerHTML = `<h2>${x ? 'Поле' : 'Новое поле'}</h2>
        <div class="form-list">
          <div class="frow"><label for="fl">Название</label><input id="fl" maxlength="60" placeholder="Например, Проект" value="${esc(s.dataset.label ?? x?.label ?? '')}"></div>
          <div class="frow"><label for="ft">Тип</label><select id="ft">${Object.entries(FIELD_TYPES).map(([k, v]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          ${type === 'select' ? `<div class="frow"><label for="fo">Варианты</label><input id="fo" placeholder="Через запятую" value="${esc(s.dataset.opts ?? (Array.isArray(x?.options) ? x.options.join(', ') : ''))}"></div>` : ''}
        </div>
        <div class="error" id="ferr" role="alert"></div>
        <div class="btns"><button class="btn secondary" id="fc">Отмена</button><button class="btn" id="fs">${x ? 'Сохранить' : 'Добавить'}</button></div>
        ${x ? '<button class="btn danger" id="fdel">Удалить поле</button>' : ''}`;
      s.querySelector('#ft').onchange = (e) => {
        s.dataset.label = s.querySelector('#fl').value; type = e.target.value; draw(s);
      };
      s.querySelector('#fo')?.addEventListener('input', (e) => { s.dataset.opts = e.target.value; });
      s.querySelector('#fc').onclick = closeSheet;
      s.querySelector('#fs').onclick = async () => {
        const label = s.querySelector('#fl').value.trim();
        const err = s.querySelector('#ferr');
        if (!label) { err.textContent = 'Введи название.'; return; }
        const options = type === 'select' ? (s.querySelector('#fo').value || '').split(',').map((o) => o.trim()).filter(Boolean) : null;
        if (type === 'select' && !options.length) { err.textContent = 'Добавь хотя бы один вариант.'; return; }
        const data = { label, field_type: type, options };
        try {
          if (x) await pb.collection('custom_fields').update(x.id, data);
          else await pb.collection('custom_fields').create({ ...data, sort: nextSort, hidden: false, owner: uid() });
          state.cache.fields = null; closeSheet(); toast(x ? 'Поле сохранено' : 'Поле добавлено'); render();
        } catch (e) { err.textContent = errText(e); }
      };
      s.querySelector('#fdel')?.addEventListener('click', async () => {
        if (!confirm('Удалить поле? Значения в старых записях перестанут показываться.')) return;
        try { await pb.collection('custom_fields').delete(x.id); state.cache.fields = null; closeSheet(); toast('Поле удалено'); render(); }
        catch (e) { s.querySelector('#ferr').textContent = errText(e); }
      });
    };
    openSheet('', draw);
  }

  /* ---------- boot ---------- */

  window.addEventListener('hashchange', render);
  pb.authStore.onChange(() => { if (!pb.authStore.isValid) state.cache = { cats: null, fields: null, debts: null }; });
  if (pb.authStore.isValid) {
    pb.collection('users').authRefresh().catch((e) => { if (e.status === 401 || e.status === 403) { pb.authStore.clear(); render(); } });
  }
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
