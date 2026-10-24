// Настройки: свои поля, категории, аккаунт
import { esc, FIELD_TYPES } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { state } from '../core/state.js';
import { CFG, pb, uid } from '../core/pb.js';
import { mountPushBlock } from './push.js';
import { $view, toast, errText, openSheet, closeSheet } from '../ui.js';
import { getCats, getFields } from '../core/data.js';
import { render } from '../router.js';
import { COPYRIGHT, termsSheet } from './login.js';
import { newCategorySheet } from './form.js';

export async function settingsScreen(route, alive) {
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

  mountPushBlock();
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
      const linked = await pb.collection('transactions').getFullList({ filter: pb.filter('owner = {:o} && category = {:c}', { o: uid(), c: b.dataset.delcat }), fields: 'id' });
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
}

export function deleteAccountSheet() {
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

export function fieldSheet(x, nextSort) {
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
