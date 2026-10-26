// Добавление и редактирование записи, корректировка баланса, новая категория
import { esc, parseAmount, REPEAT_LABEL, pbDate, txDay, today } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { state } from '../core/state.js';
import { CFG, pb, uid } from '../core/pb.js';
import { $view, toast, errText, openSheet, closeSheet } from '../ui.js';
import { getCats, getFields, getDebts, bumpDebtDue, debtKind } from '../core/data.js';

export function viewAdjust(tx) {
  $view.innerHTML = `
    <div class="head"><a class="icon-btn" href="#/" aria-label="Закрыть">${ICON.close}</a><div class="title">Остаток на руках</div><div style="width:44px"></div></div>
    <p style="margin:0;color:var(--soft);font-size:14px">Корректировка баланса. Не учитывается в доходах, расходах и отчётах.</p>
    <div class="amount-box"><label for="aa">Сумма (минус — уменьшить баланс)</label>
      <div class="line"><input id="aa" inputmode="decimal" autocomplete="off" value="${esc(String(tx.amount).replace('.', ','))}"><div class="cur">${esc(CFG.CURRENCY)}</div></div></div>
    <div class="form-list">
      <div class="frow"><label for="ad">Дата</label><input id="ad" type="date" value="${esc(txDay(tx))}"></div>
      <div class="frow"><label for="an">Комментарий</label><input id="an" maxlength="500" value="${esc(tx.note || '')}"></div>
    </div>
    <div class="error" id="aerr2" role="alert"></div>
    <button class="btn" id="asv">Сохранить изменения</button>
    <button class="btn danger" id="adel">Удалить</button>`;
  const q = (x) => $view.querySelector(x);
  q('#asv').onclick = async () => {
    const v = parseAmount(q('#aa').value.replace('−', '-'));
    if (!Number.isFinite(v) || v === 0) { q('#aerr2').textContent = 'Введи сумму (не ноль).'; return; }
    try {
      await pb.collection('transactions').update(tx.id, { amount: Math.round(v * 100) / 100, date: pbDate(q('#ad').value || today()), note: q('#an').value.trim() });
      toast('Сохранено'); location.hash = '#/';
    } catch (e) { q('#aerr2').textContent = errText(e); }
  };
  q('#adel').onclick = async () => {
    if (!confirm('Удалить эту корректировку?')) return;
    try { await pb.collection('transactions').delete(tx.id); toast('Удалено'); location.hash = '#/'; }
    catch (e) { q('#aerr2').textContent = errText(e); }
  };
}

export const addScreen = (route, alive) => viewForm(null, route, alive);

export async function editScreen(route, alive) {
  const tx = await pb.collection('transactions').getOne(route.id);
  if (!alive()) return;
  if (tx.kind === 'adjust') return viewAdjust(tx);
  return viewForm(tx, route, alive);
}

export async function viewForm(tx, route, alive) {
  const [cats, fields, debts] = await Promise.all([getCats(), getFields(), getDebts()]);
  if (!alive()) return;
  const p = route.params;
  const presetDebt = p.get('debt') ? debts.find((d) => d.id === p.get('debt')) : null;
  const f = tx ? {
    kind: tx.kind, amount: String(tx.amount).replace('.', ','), category: tx.category || '', date: txDay(tx),
    note: tx.note || '', planned: tx.status === 'planned', repeat: tx.repeat || 'none', debt: tx.debt || '',
    extra: { ...(tx.extra || {}) }
  } : {
    kind: presetDebt ? debtKind(presetDebt) : (p.get('kind') || 'expense'), amount: presetDebt?.monthly_payment ? String(presetDebt.monthly_payment).replace('.', ',') : '',
    category: '', date: p.get('date') || today(), note: presetDebt ? presetDebt.name : '',
    planned: p.get('date') ? p.get('date') > today() : false, repeat: 'none', debt: presetDebt?.id || '', extra: {}
  };

  const draw = () => {
    const kindCats = cats.filter((c) => c.kind === f.kind);
    const openDebts = debts.filter((d) => (!d.closed || d.id === f.debt) && debtKind(d) === f.kind);
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
        ${openDebts.length ? `<div class="frow"><label for="db">${f.kind === 'income' ? 'Возврат долга' : 'Платёж по долгу'}</label><select id="db"><option value="">Нет</option>${openDebts.map((d) => `<option value="${d.id}" ${f.debt === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>` : ''}
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
      f.kind = b.dataset.kind; f.category = ''; f.debt = ''; draw();
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
      repeat: f.planned ? f.repeat : 'none', debt: f.debt, extra
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

export function newCategorySheet(kind, done) {
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
