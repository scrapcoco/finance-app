// История всех оплаченных записей: фильтр по типу, поиск по комментарию и категории, «Показать ещё»
import { esc, MONTHS, parseYmd, txDay } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { state } from '../core/state.js';
import { pb, ownerFilter } from '../core/pb.js';
import { $view, toast, errText, txRow } from '../ui.js';
import { render } from '../router.js';

export async function historyScreen(route, alive) {
  const PAGE = 50;
  const filter = () => {
    let f = `${ownerFilter()} && status = 'paid'`;
    if (state.histKind !== 'all') f += ` && ${pb.filter('kind = {:k}', { k: state.histKind })}`;
    const q = state.histQuery.trim();
    if (q) {
      // SQLite LIKE не различает регистр только у латиницы: «еда» не нашла бы «Еда», «żab» — «Żabka».
      // Поэтому ищем как ввели, строчными, с заглавной и заглавными
      const low = q.toLocaleLowerCase('ru');
      const variants = [...new Set([q, low, low[0].toLocaleUpperCase('ru') + low.slice(1), q.toLocaleUpperCase('ru')])];
      const params = Object.fromEntries(variants.map((v, i) => [`q${i}`, v]));
      const expr = variants.map((_, i) => `note ~ {:q${i}} || category.name ~ {:q${i}}`).join(' || ');
      f += ` && ${pb.filter(`(${expr})`, params)}`;
    }
    return f;
  };
  const load = (page) => pb.collection('transactions').getList(page, PAGE, { filter: filter(), sort: '-date,-created', expand: 'category' });
  const first = await load(1);
  if (!alive()) return;
  let items = first.items.slice();
  let page = 1, totalPages = first.totalPages;

  const listHtml = () => {
    if (!items.length) {
      if (state.histQuery.trim()) return `<div class="list"><div class="empty">Ничего не нашлось по «${esc(state.histQuery.trim())}».</div></div>`;
      return `<div class="list"><div class="empty">${state.histKind === 'income' ? 'Доходов' : state.histKind === 'expense' ? 'Расходов' : 'Записей'} пока нет.</div></div>`;
    }
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
    more.hidden = page >= totalPages;
    more.disabled = false;
  };

  const seg = (k, l) => `<button type="button" data-hk="${k}" aria-pressed="${state.histKind === k}">${l}</button>`;
  $view.innerHTML = `
    <div class="head"><a class="icon-btn" href="#/" aria-label="Назад">${ICON.left}</a><div class="title">История</div><div style="width:44px"></div></div>
    <div class="segment" role="group" aria-label="Тип записей">${seg('all', 'Все')}${seg('income', 'Доходы')}${seg('expense', 'Расходы')}</div>
    <div class="search"><input id="hist-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Поиск: Żabka, аренда, Еда…" aria-label="Поиск по комментарию и категории" value="${esc(state.histQuery)}"></div>
    <div id="hist-list" style="display:flex;flex-direction:column;gap:20px"></div>
    <button class="btn secondary" id="hist-more">Показать ещё</button>`;
  draw();
  $view.querySelectorAll('[data-hk]').forEach((b) => b.onclick = () => { state.histKind = b.dataset.hk; render(); });

  // Поиск: ждём паузу в наборе 300 мс; ответ на устаревший запрос (набрал дальше) отбрасываем
  let timer, seq = 0;
  $view.querySelector('#hist-q').oninput = (e) => {
    state.histQuery = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const my = ++seq;
      try {
        const res = await load(1);
        if (!alive() || my !== seq) return;
        items = res.items.slice(); page = 1; totalPages = res.totalPages; draw();
      } catch (err) { if (alive()) toast(errText(err)); }
    }, 300);
  };

  const more = $view.querySelector('#hist-more');
  more.onclick = async () => {
    more.disabled = true;
    try {
      const res = await load(page + 1);
      if (!alive()) return;
      page++; items.push(...res.items); totalPages = res.totalPages; draw();
    } catch (e) { toast(errText(e)); more.disabled = false; }
  };
}
