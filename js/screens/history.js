// История всех оплаченных записей
import { MONTHS, parseYmd, txDay } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { state } from '../core/state.js';
import { pb, ownerFilter } from '../core/pb.js';
import { $view, toast, errText, txRow } from '../ui.js';
import { render } from '../router.js';

export async function historyScreen(route, alive) {
  const PAGE = 50;
  let filter = `${ownerFilter()} && status = 'paid'`;
  if (state.histKind !== 'all') filter += ` && ${pb.filter('kind = {:k}', { k: state.histKind })}`;
  const load = (page) => pb.collection('transactions').getList(page, PAGE, { filter, sort: '-date,-created', expand: 'category' });
  const first = await load(1);
  if (!alive()) return;
  const items = first.items.slice();
  let page = 1;

  const listHtml = () => {
    if (!items.length) return `<div class="list"><div class="empty">${state.histKind === 'income' ? 'Доходов' : state.histKind === 'expense' ? 'Расходов' : 'Записей'} пока нет.</div></div>`;
    const groups = [];
    for (const t of items) {
      const key = txDay(t).slice(0, 7);
      if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, list: [] });
      groups[groups.length - 1].list.push(t);
    }
    return groups.map((g) => {
      const d = parseYmd(`${g.key}-01`);
      return `<section class="sec"><div class="sec-head"><h2>${MONTHS[d.getMonth()]} ${d.getFullYear()}</h2></div>
        <div class="list">${g.list.map((t) => txRow(t, { back: 'history' })).join('')}</div></section>`;
    }).join('');
  };
  const draw = () => {
    $view.querySelector('#hist-list').innerHTML = listHtml();
    const more = $view.querySelector('#hist-more');
    more.hidden = page >= first.totalPages;
    more.disabled = false;
  };

  const seg = (k, l) => `<button type="button" data-hk="${k}" aria-pressed="${state.histKind === k}">${l}</button>`;
  $view.innerHTML = `
    <div class="head"><a class="icon-btn" href="#/" aria-label="Назад">${ICON.left}</a><div class="title">История</div><div style="width:44px"></div></div>
    <div class="segment" role="group" aria-label="Тип записей">${seg('all', 'Все')}${seg('income', 'Доходы')}${seg('expense', 'Расходы')}</div>
    <div id="hist-list" style="display:flex;flex-direction:column;gap:20px"></div>
    <button class="btn secondary" id="hist-more">Показать ещё</button>`;
  draw();
  $view.querySelectorAll('[data-hk]').forEach((b) => b.onclick = () => { state.histKind = b.dataset.hk; render(); });
  const more = $view.querySelector('#hist-more');
  more.onclick = async () => {
    more.disabled = true;
    try {
      const res = await load(page + 1);
      if (!alive()) return;
      page++; items.push(...res.items); draw();
    } catch (e) { toast(errText(e)); more.disabled = false; }
  };
}
