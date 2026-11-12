// Объявление о грядущем большом обновлении: узкая яркая полоска на главной под шапкой (переливающаяся рамка,
// метка «СКОРО»). Нажатие — окно с тем, что появится; крестик прячет полоску на сутки (localStorage `announceHidden`).
// Временный файл: когда обновление выйдет, убрать его, вызов в home.js, блок в app.css и строку в sw.js.
import { ICON } from '../core/icons.js';
import { $view, openSheet, closeSheet } from '../ui.js';

const DAY = 24 * 3600 * 1000;
const hidden = () => { try { return Date.now() - Number(localStorage.getItem('announceHidden') || 0) < DAY; } catch (e) { return false; } };

const ITEMS = [
  ['Новый вид', 'Тёмное стекло, крупные цифры, фото в «окнах» — всё читается с первого взгляда.'],
  ['Жесты на телефоне', 'Смахнул строку — «Оплачено». Потянул вниз — обновил. Подержал — быстрые действия.'],
  ['Обучение за минуту', 'Весёлый проводник покажет, что где, прямо в приложении.'],
  ['Скрыть суммы', 'Одна кнопка — и цифры не видны чужим глазам.']
];

function details() {
  openSheet('', (s) => {
    s.innerHTML = `<h2>Скоро большое обновление</h2>
      <p class="ann-lead">Приложение обновится само, ничего делать не нужно. Все записи, платежи и дела останутся на месте.</p>
      <ul class="ann-list">${ITEMS.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ul>
      <div class="btns"><button type="button" class="btn" id="ann-ok">Жду!</button></div>`;
    s.querySelector('#ann-ok').onclick = closeSheet;
  });
}

// Вызывает главная после отрисовки: вставляет полоску под шапкой
export function mountAnnounce() {
  const head = $view.querySelector('.head');
  if (!head || hidden() || $view.querySelector('.ann')) return;
  const el = document.createElement('div');
  el.className = 'ann';
  el.innerHTML = `<button type="button" class="ann-main" id="ann-open">
      <span class="ann-tag">Скоро</span>
      <span class="ann-text">Большое обновление<span class="ann-more">: новый вид и жесты</span></span>
      <span class="ann-go" aria-hidden="true">${ICON.right}</span></button>
    <button type="button" class="ann-x" id="ann-x" aria-label="Скрыть объявление до завтра">${ICON.close}</button>`;
  head.after(el);
  el.querySelector('#ann-open').onclick = details;
  el.querySelector('#ann-x').onclick = () => {
    try { localStorage.setItem('announceHidden', String(Date.now())); } catch (e) { /* приватный режим */ }
    el.remove();
  };
}
