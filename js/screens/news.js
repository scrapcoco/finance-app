// «Что нового»: окно после обновления приложения. NEWS — список обновлений, новое добавляется В НАЧАЛО с номером на 1 больше.
// Каждый аккаунт на устройстве помнит номер последнего просмотренного (localStorage `newsSeen:<id>`): если в NEWS есть
// номера больше — при входе на главную показывается окно с ними. Все обновления — Настройки → «Что нового».
// Новичкам окно не показывается: им показывают обучение (tour.js), и оно отмечает все обновления просмотренными.
import { uid } from '../core/pb.js';

export const NEWS = [
  {
    n: 1, date: 'ноябрь 2026', title: 'Лента вместо вкладок',
    items: [
      ['Всё на одном экране', 'Платежи, траты и дела идут одной лентой по порядку. Черта «сейчас» делит прошлое и будущее.'],
      ['Сегодня свободно', 'Главная цифра — сколько можно потратить сегодня, чтобы хватило до следующего дохода.'],
      ['Останется', 'У каждого дня написано, сколько денег будет после всех платежей.'],
      ['Нажми на строку', 'Она раскроется на месте: «Оплачено», «Завтра», изменить. Кружок справа — готово одним касанием.'],
      ['Жесты', 'Смахни строку влево — «Оплачено» или «Сделано». Подержи — быстрые действия. Потяни вниз — обновить.'],
      ['Новый вид и скрытие сумм', 'Светлое оформление, крупные цифры. Кнопка-глаз прячет все суммы.']
    ]
  }
];

const key = () => `newsSeen:${uid() || ''}`;
const latest = () => NEWS[0]?.n || 0;
const seen = () => { try { return Number(localStorage.getItem(key()) || 0); } catch (e) { return latest(); } };
export const markNewsSeen = () => { try { localStorage.setItem(key(), String(latest())); } catch (e) { /* приватный режим */ } };
export const hasNews = () => seen() < latest();

// all — показать все обновления (из Настроек); иначе только те, что ещё не видели
export function showNews(all = false) {
  const since = all ? 0 : seen();
  const list = NEWS.filter((x) => x.n > since);
  if (!list.length) return;
  document.querySelector('.tour-backdrop')?.remove();
  const bd = document.createElement('div');
  bd.className = 'tour-backdrop';
  const close = () => { markNewsSeen(); bd.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  bd.innerHTML = `<div class="tour news" role="dialog" aria-modal="true" aria-labelledby="news-t">
      <div class="news-top"><span class="news-tag">Что нового</span></div>
      <div class="news-body">${list.map((r) => `<section>
        <h2 ${r === list[0] ? 'id="news-t"' : ''}>${r.title}</h2>
        <div class="news-date">${r.date}</div>
        <ul>${r.items.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ul>
      </section>`).join('')}</div>
      <div class="btns"><button type="button" class="btn" id="news-ok">Понятно</button></div></div>`;
  bd.addEventListener('click', (e) => { if (e.target === bd) close(); });
  bd.querySelector('#news-ok').onclick = close;
  document.addEventListener('keydown', onKey);
  document.body.append(bd);
  bd.querySelector('#news-ok').focus();
}

// Вызывает главная после отрисовки (после maybeTour): есть непросмотренные обновления — показать
export function maybeNews() {
  if (!hasNews() || document.querySelector('.tour-backdrop, .ob')) return;
  showNews();
}
