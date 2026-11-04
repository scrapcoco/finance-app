// «Записи» (ПК): таблица записей месяца — поиск, фильтры, сортировка, быстрое добавление,
// панель правки справа и действия над несколькими записями. На телефоне вместо неё «История».
// Принцип: на виду — таблица, итоги и поиск; редкое (фильтры, галочки, массовые действия) — тихо или по требованию.
import { esc, money, signed, moneySigned, parseAmount, ymd, pbDate, txDay, today, addMonths, shortDate, dayOf } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { state } from '../core/state.js';
import { pb, uid, ownerFilter } from '../core/pb.js';
import { $view, $sheetRoot, toast, errText, monthSwitch, bindMonthSwitch } from '../ui.js';
import { txBetween, getProjects, curBook, bookOf, afterPaid, paidText } from '../core/data.js';

const KIND_ALL = { all: 'Все', income: 'Доходы', expense: 'Расходы' };

function plural(n) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return 'запись';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'записи';
  return 'записей';
}

export async function recordsScreen(route, alive) {
  const R = state.rec;
  const m = state.month;
  const from = ymd(m), to = ymd(addMonths(m, 1));
  const load = () => txBetween(from, to, "kind != 'adjust'");
  let [txs, cats, projects] = await Promise.all([
    load(),
    pb.collection('categories').getFullList({ filter: ownerFilter(), sort: 'sort,name' }),
    getProjects()
  ]);
  if (!alive()) return;

  const catById = new Map(cats.map((c) => [c.id, c]));
  const pjById = new Map(projects.map((p) => [p.id, p]));
  // Колонка «Проект» — только когда есть что показать
  const showProj = state.book !== 'personal' && projects.length > 0;
  if (!showProj) R.proj = '';
  const sel = new Set();
  let openId = null;
  let newKind = 'expense';

  const catName = (t) => catById.get(t.category)?.name || '';
  const title = (t) => t.note || catName(t) || (t.kind === 'income' ? 'Доход' : 'Расход');
  const catsFor = (book, kind) => cats.filter((c) => bookOf(c) === book && (!kind || c.kind === kind));
  // Категории, которые встречаются в записях месяца (для фильтра)
  const usedCats = [...new Map(txs.filter((t) => catName(t)).map((t) => [t.category, catName(t)]))].sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  if (R.cat && !usedCats.some(([id]) => id === R.cat)) R.cat = '';

  const visible = () => {
    const q = R.q.trim().toLocaleLowerCase('ru');
    const list = txs.filter((t) => (R.kind === 'all' || t.kind === R.kind)
      && (!R.cat || t.category === R.cat)
      && (!R.proj || (R.proj === '-' ? !t.project : t.project === R.proj))
      && (!R.status || t.status === R.status)
      && (!q || [t.note, catName(t), pjById.get(t.project)?.name, String(t.amount).replace('.', ',')]
        .some((s) => (s || '').toLocaleLowerCase('ru').includes(q))));
    const k = R.sort === 'amount' ? (t) => t.amount : (t) => txDay(t) + (t.created || '');
    return list.sort((a, b) => (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0) * R.dir);
  };

  // ===== Разметка =====
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(label)}</option>`;
  const catOptions = (cur, list) => list.map((c) => opt(c.id, c.name, cur)).join('');
  const cols = `28px 112px minmax(0, 2.2fr) minmax(0, 1fr)${showProj ? ' minmax(0, 1fr)' : ''} 132px`;
  const arrow = (key) => (R.sort === key ? `<span class="rec-arrow">${R.dir < 0 ? '↓' : '↑'}</span>` : '');

  const rowHtml = (t) => {
    const pj = pjById.get(t.project);
    return `<div class="rec-row ${sel.has(t.id) ? 'sel' : ''} ${openId === t.id ? 'open' : ''} ${t.status === 'planned' ? 'planned' : ''}" data-id="${t.id}" tabindex="0">
      <span><input type="checkbox" class="rec-ck" data-ck="${t.id}" ${sel.has(t.id) ? 'checked' : ''} aria-label="Выбрать: ${esc(title(t))}"></span>
      <span class="rec-date">${shortDate(txDay(t))}</span>
      <span class="rec-title">${esc(title(t))}</span>
      <span class="rec-muted">${t.note ? esc(catName(t)) : ''}</span>
      ${showProj ? `<span class="rec-muted">${pj ? `<i class="pj-dot" style="background:${esc(pj.color || '#199e70')}"></i> ${esc(pj.name)}` : ''}</span>` : ''}
      <span class="rec-amt ${t.kind === 'income' ? 'inc' : 'exp'}">${t.status === 'planned' ? '<span class="rec-tag">план</span>' : ''}${signed(t.amount, t.kind)}</span>
    </div>`;
  };

  const kindBtn = () => `<button type="button" id="rn-kind" class="${newKind === 'income' ? 'inc' : 'exp'}" title="Расход / доход"
    aria-label="${newKind === 'income' ? 'Доход — сменить на расход' : 'Расход — сменить на доход'}">${newKind === 'income' ? '+' : '−'}</button>`;

  const newRowHtml = () => {
    const book = curBook();
    return `<form class="rec-row rec-new" id="rec-new" autocomplete="off">
      <span class="rec-plus">${ICON.plus}</span>
      <input type="date" id="rn-date" value="${today().slice(0, 7) === from.slice(0, 7) ? today() : from}" aria-label="Дата">
      <input id="rn-note" maxlength="500" placeholder="Новая запись — опиши и нажми Enter" aria-label="Описание">
      <select id="rn-cat" aria-label="Категория"><option value="">Категория</option>${catOptions('', catsFor(book, newKind))}</select>
      ${showProj ? `<select id="rn-pj" aria-label="Проект" ${book !== 'business' ? 'disabled' : ''}><option value="">Проект</option>${projects.filter((p) => !p.archived).map((p) => opt(p.id, p.name, '')).join('')}</select>` : ''}
      <span class="rec-amt-in">${kindBtn()}<input id="rn-amt" inputmode="decimal" placeholder="0" aria-label="Сумма"></span>
      <button type="submit" hidden></button>
    </form>`;
  };

  const tableHtml = (list) => `
    <div class="rec-row rec-th">
      <span><input type="checkbox" class="rec-ck" id="rec-all" ${list.length && list.every((t) => sel.has(t.id)) ? 'checked' : ''} aria-label="Выбрать все"></span>
      <button type="button" data-sort="date">Дата${arrow('date')}</button>
      <span>Описание</span><span>Категория</span>${showProj ? '<span>Проект</span>' : ''}
      <button type="button" data-sort="amount" class="r">Сумма${arrow('amount')}</button>
    </div>
    ${newRowHtml()}
    ${list.length ? list.map(rowHtml).join('') : `<div class="empty">${txs.length ? 'Ничего не нашлось — смени фильтр или поиск.' : 'В этом месяце записей нет. Добавь первую строкой выше.'}</div>`}`;

  const sumHtml = (list) => {
    const paid = list.filter((t) => t.status === 'paid');
    const inc = paid.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = paid.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
    const plan = list.length - paid.length;
    return `<span><span class="k">Доходы</span> <b class="inc">+${money(inc)}</b></span>
      <span><span class="k">Расходы</span> <b class="exp">−${money(exp)}</b></span>
      <span><span class="k">Итог</span> <b>${moneySigned(inc - exp)}</b></span>
      <span class="rec-muted">${list.length} ${plural(list.length)}${plan ? ` · в плане ${plan}` : ''}</span>`;
  };

  const filterSel = (id, label, cur, options) => `<label class="rec-filter ${cur ? 'on' : ''}">
    <select id="${id}" aria-label="${label}">${opt('', label, cur)}${options}</select></label>`;

  $view.innerHTML = `
    <div class="head"><h1>Записи</h1>${monthSwitch()}<div style="width:44px"></div></div>
    <div class="rec-tools">
      <div class="search"><input id="rq" type="search" placeholder="Поиск по описанию, категории, сумме" aria-label="Поиск" value="${esc(R.q)}"></div>
      <div class="segment rec-kind" role="group" aria-label="Тип">${Object.entries(KIND_ALL).map(([k, v]) =>
        `<button type="button" data-rk="${k}" class="${k === 'income' ? 'inc-on' : k === 'expense' ? 'exp-on' : ''}" aria-pressed="${R.kind === k}">${v}</button>`).join('')}</div>
      <div class="rec-filters">
        ${filterSel('rf-cat', 'Категория', R.cat, usedCats.map(([id, n]) => opt(id, n, R.cat)).join(''))}
        ${showProj ? filterSel('rf-pj', 'Проект', R.proj, opt('-', 'Без проекта', R.proj) + projects.map((p) => opt(p.id, p.name, R.proj)).join('')) : ''}
        ${filterSel('rf-st', 'Статус', R.status, opt('paid', 'Оплачено', R.status) + opt('planned', 'В плане', R.status))}
      </div>
    </div>
    <div class="rec-sum" id="rec-sum"></div>
    <div class="rec-layout" id="rec-layout">
      <div class="list rec-table" id="rec-table" style="--rec-cols:${cols}"></div>
      <aside class="panel rec-panel" id="rec-panel" aria-label="Правка записи" hidden></aside>
    </div>
    <div class="rec-bulk" id="rec-bulk" role="toolbar" aria-label="Действия с выбранными" hidden></div>`;

  const $ = (s) => $view.querySelector(s);

  // ===== Перерисовка таблицы, итогов и полоски действий — без перезагрузки экрана =====
  const draw = () => {
    const list = visible();
    for (const id of [...sel]) if (!list.some((t) => t.id === id)) sel.delete(id);
    $('#rec-table').innerHTML = tableHtml(list);
    $('#rec-table').classList.toggle('has-sel', sel.size > 0);
    $('#rec-sum').innerHTML = sumHtml(list);
    drawBulk();
    bindNew();
  };

  const reload = async () => {
    const fresh = await load();
    if (!alive()) return;
    txs = fresh;
    draw();
  };

  // ===== Быстрое добавление (строка над таблицей) =====
  const bindNew = () => {
    $('#rn-kind').onclick = () => {
      newKind = newKind === 'expense' ? 'income' : 'expense';
      $('#rn-kind').outerHTML = kindBtn();
      $('#rn-cat').innerHTML = `<option value="">Категория</option>${catOptions('', catsFor(curBook(), newKind))}`;
      bindNew();
    };
    $('#rec-new').onsubmit = async (e) => {
      e.preventDefault();
      const amount = parseAmount($('#rn-amt').value);
      if (!(amount > 0)) { $('#rn-amt').focus(); toast('Введи сумму больше нуля'); return; }
      const date = $('#rn-date').value || today();
      const book = curBook();
      try {
        await pb.collection('transactions').create({
          kind: newKind, amount: Math.round(amount * 100) / 100, date: pbDate(date), category: $('#rn-cat').value,
          note: $('#rn-note').value.trim(), status: date > today() ? 'planned' : 'paid', repeat: 'none', repeat_day: dayOf(date),
          book, project: book === 'business' ? ($('#rn-pj')?.value || '') : '', extra: {}, owner: uid()
        });
        if (!alive()) return;
        toast(date > today() ? 'Платёж запланирован' : 'Запись добавлена');
        await reload();
        $('#rn-note')?.focus();
      } catch (err) { toast(errText(err)); }
    };
  };

  // ===== Панель правки справа =====
  const closePanel = () => {
    openId = null;
    $('#rec-panel').hidden = true;
    $('#rec-panel').innerHTML = '';
    $('#rec-layout').classList.remove('open');
    $view.querySelectorAll('.rec-row.open').forEach((r) => r.classList.remove('open'));
  };

  const openPanel = (id) => {
    const t = txs.find((x) => x.id === id);
    if (!t) return;
    openId = id;
    $view.querySelectorAll('.rec-row.open').forEach((r) => r.classList.remove('open'));
    $view.querySelector(`.rec-row[data-id="${id}"]`)?.classList.add('open');
    const f = { kind: t.kind, book: bookOf(t), paid: t.status === 'paid' };
    const pjOpts = f.book === 'business' ? projects.filter((x) => !x.archived || x.id === t.project) : [];
    const p = $('#rec-panel');
    p.innerHTML = `
      <div class="rec-panel-head"><h2>Запись</h2><button type="button" class="icon-btn ghost" id="rp-x" aria-label="Закрыть панель">${ICON.close}</button></div>
      <div class="segment" role="group" aria-label="Тип записи">
        <button type="button" class="exp-on" data-pk="expense" aria-pressed="${f.kind === 'expense'}">Расход</button>
        <button type="button" class="inc-on" data-pk="income" aria-pressed="${f.kind === 'income'}">Доход</button>
      </div>
      <div class="rec-fields">
        <div class="frow"><label for="rp-amt">Сумма</label><input id="rp-amt" inputmode="decimal" value="${esc(String(t.amount).replace('.', ','))}"></div>
        <div class="frow"><label for="rp-date">Дата</label><input id="rp-date" type="date" value="${esc(txDay(t))}"></div>
        <div class="frow"><label for="rp-cat">Категория</label><select id="rp-cat"><option value="">Без категории</option>${catOptions(t.category, catsFor(f.book, f.kind))}</select></div>
        ${pjOpts.length ? `<div class="frow"><label for="rp-pj">Проект</label><select id="rp-pj"><option value="">Без проекта</option>${pjOpts.map((x) => opt(x.id, x.name, t.project)).join('')}</select></div>` : ''}
        <div class="frow"><label for="rp-note">Комментарий</label><input id="rp-note" maxlength="500" value="${esc(t.note || '')}"></div>
        <div class="frow"><label id="rp-paid-l">Оплачено</label><button type="button" class="switch" id="rp-paid" role="switch" aria-labelledby="rp-paid-l" aria-checked="${f.paid}"></button></div>
      </div>
      <div class="error" id="rp-err" role="alert"></div>
      <button class="btn" id="rp-save">Сохранить</button>
      <div class="rec-panel-more"><a href="#/edit/${t.id}?back=records">Все поля</a><button type="button" id="rp-del">Удалить</button></div>`;
    const q = (s) => p.querySelector(s);
    q('#rp-x').onclick = closePanel;
    p.querySelectorAll('[data-pk]').forEach((b) => b.onclick = () => {
      if (f.kind === b.dataset.pk) return;
      f.kind = b.dataset.pk;
      p.querySelectorAll('[data-pk]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      q('#rp-cat').innerHTML = `<option value="">Без категории</option>${catOptions('', catsFor(f.book, f.kind))}`;
    });
    q('#rp-paid').onclick = (e) => { f.paid = !f.paid; e.currentTarget.setAttribute('aria-checked', String(f.paid)); };
    p.onkeydown = (e) => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); q('#rp-save').click(); } };
    q('#rp-save').onclick = async () => {
      const amount = parseAmount(q('#rp-amt').value);
      const err = q('#rp-err');
      if (!(amount > 0)) { err.textContent = 'Введи сумму больше нуля.'; return; }
      const date = q('#rp-date').value || txDay(t);
      const data = {
        kind: f.kind, amount: Math.round(amount * 100) / 100, date: pbDate(date), category: q('#rp-cat').value,
        note: q('#rp-note').value.trim(), status: f.paid ? 'paid' : 'planned'
      };
      if (q('#rp-pj')) data.project = q('#rp-pj').value;
      if (date !== txDay(t)) data.repeat_day = dayOf(date);
      // Сменили тип — долг отвязываем: «я должен» гасится только расходом, «мне должны» — доходом
      if (f.kind !== t.kind) data.debt = '';
      q('#rp-save').disabled = true;
      try {
        await pb.collection('transactions').update(t.id, data);
        let msg = 'Сохранено';
        // Как в форме: следующий повтор считается от плановой даты
        if (t.status === 'planned' && data.status === 'paid') msg = paidText((await afterPaid({ ...t, ...data, date: t.date })).next);
        if (!alive()) return;
        toast(msg); closePanel(); await reload();
      } catch (e) { err.textContent = errText(e); q('#rp-save').disabled = false; }
    };
    q('#rp-del').onclick = async () => {
      if (!confirm('Удалить эту запись?')) return;
      try {
        await pb.collection('transactions').delete(t.id);
        if (!alive()) return;
        toast('Запись удалена'); closePanel(); await reload();
      } catch (e) { q('#rp-err').textContent = errText(e); }
    };
    p.hidden = false;
    $('#rec-layout').classList.add('open');
    q('#rp-amt').focus();
  };

  // ===== Действия над выбранными (полоска внизу появляется, только когда что-то отмечено) =====
  const drawBulk = () => {
    const b = $('#rec-bulk');
    if (!sel.size) { b.hidden = true; b.innerHTML = ''; return; }
    const chosen = txs.filter((t) => sel.has(t.id));
    const planned = chosen.filter((t) => t.status === 'planned').length;
    const books = new Set(chosen.map(bookOf));
    const book = books.size === 1 ? [...books][0] : null; // категории у книг свои — менять можно в пределах одной
    const group = (kind, label) => {
      const list = book ? catsFor(book, kind) : [];
      return list.length ? `<optgroup label="${label}">${catOptions('', list)}</optgroup>` : '';
    };
    b.hidden = false;
    b.innerHTML = `<b>Выбрано: ${sel.size}</b>
      ${book ? `<select id="rb-cat" aria-label="Сменить категорию"><option value="">Категория…</option>${group('expense', 'Расходы')}${group('income', 'Доходы')}</select>` : ''}
      ${book === 'business' && projects.length ? `<select id="rb-pj" aria-label="Сменить проект"><option value="">Проект…</option><option value="-">Без проекта</option>${projects.filter((p) => !p.archived).map((p) => opt(p.id, p.name, '')).join('')}</select>` : ''}
      ${planned ? `<button type="button" id="rb-paid">Оплачено (${planned})</button>` : ''}
      <button type="button" id="rb-del" class="danger">Удалить</button>
      <button type="button" id="rb-x" class="icon-btn ghost" aria-label="Снять выбор">${ICON.close}</button>`;
    const run = async (fn, done) => {
      b.querySelectorAll('button, select').forEach((x) => { x.disabled = true; });
      let n = 0;
      try { for (const t of chosen) if (await fn(t)) n++; } catch (e) { toast(errText(e)); }
      if (!alive()) return;
      sel.clear();
      if (n) toast(done(n));
      if (openId && chosen.some((t) => t.id === openId)) closePanel();
      await reload();
    };
    b.querySelector('#rb-x').onclick = () => { sel.clear(); draw(); };
    b.querySelector('#rb-cat')?.addEventListener('change', (e) => {
      const c = catById.get(e.target.value);
      if (!c) return;
      // Категория подходит только записям своего типа — остальные пропускаем и говорим об этом
      const skip = chosen.filter((t) => t.kind !== c.kind).length;
      run(async (t) => { if (t.kind !== c.kind) return false; await pb.collection('transactions').update(t.id, { category: c.id }); return true; },
        (n) => `Категория «${c.name}»: ${n} ${plural(n)}${skip ? `, пропущено ${skip} (другой тип)` : ''}`);
    });
    b.querySelector('#rb-pj')?.addEventListener('change', (e) => {
      if (!e.target.value) return;
      const v = e.target.value === '-' ? '' : e.target.value;
      run(async (t) => { await pb.collection('transactions').update(t.id, { project: v }); return true; },
        (n) => (v ? `Проект «${pjById.get(v)?.name}»: ${n} ${plural(n)}` : `Проект снят: ${n} ${plural(n)}`));
    });
    b.querySelector('#rb-paid')?.addEventListener('click', () => run(async (t) => {
      if (t.status !== 'planned') return false;
      await pb.collection('transactions').update(t.id, { status: 'paid' });
      await afterPaid(t);
      return true;
    }, (n) => `Оплачено: ${n} ${plural(n)}`));
    b.querySelector('#rb-del').onclick = () => {
      if (!confirm(`Удалить ${sel.size} ${plural(sel.size)}? Это нельзя отменить.`)) return;
      run(async (t) => { await pb.collection('transactions').delete(t.id); return true; }, (n) => `Удалено: ${n} ${plural(n)}`);
    };
  };

  // ===== События (делегирование: таблица перерисовывается, обработчик остаётся) =====
  const table = $('#rec-table');
  table.addEventListener('click', (e) => {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      const k = sortBtn.dataset.sort;
      if (R.sort === k) R.dir = -R.dir; else { R.sort = k; R.dir = -1; }
      draw(); return;
    }
    if (e.target.id === 'rec-all') {
      if (e.target.checked) visible().forEach((t) => sel.add(t.id)); else sel.clear();
      draw(); return;
    }
    const ck = e.target.closest('[data-ck]');
    if (ck) {
      if (ck.checked) sel.add(ck.dataset.ck); else sel.delete(ck.dataset.ck);
      ck.closest('.rec-row').classList.toggle('sel', ck.checked);
      table.classList.toggle('has-sel', sel.size > 0);
      $('#rec-all').checked = visible().every((t) => sel.has(t.id));
      drawBulk(); return;
    }
    if (e.target.closest('.rec-new') || e.target.closest('.rec-row > span:first-child')) return;
    const row = e.target.closest('.rec-row[data-id]');
    if (row) { if (openId === row.dataset.id) closePanel(); else openPanel(row.dataset.id); }
  });
  table.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches?.('.rec-row[data-id]')) { e.preventDefault(); openPanel(e.target.dataset.id); }
  });

  let timer;
  $('#rq').oninput = (e) => { R.q = e.target.value; clearTimeout(timer); timer = setTimeout(() => { if (alive()) draw(); }, 150); };
  $view.querySelectorAll('[data-rk]').forEach((b) => b.onclick = () => {
    R.kind = b.dataset.rk;
    $view.querySelectorAll('[data-rk]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  for (const [id, key] of [['rf-cat', 'cat'], ['rf-pj', 'proj'], ['rf-st', 'status']]) {
    const el = $(`#${id}`);
    if (el) el.onchange = () => { R[key] = el.value; el.parentElement.classList.toggle('on', !!el.value); draw(); };
  }
  bindMonthSwitch();

  // Esc: сначала закрывает панель, потом снимает выбор (окна-шторки закрывает ui.js)
  const onKey = (e) => {
    if (!alive()) { document.removeEventListener('keydown', onKey); return; }
    if (e.key !== 'Escape' || $sheetRoot.innerHTML) return;
    if (openId) { closePanel(); e.preventDefault(); } else if (sel.size) { sel.clear(); draw(); }
  };
  document.addEventListener('keydown', onKey);

  draw();
}
