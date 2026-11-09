// Выбор вида аккаунта «Для себя» / «Для бизнеса». Показывается вместо приложения, пока вид не выбран
// (старые аккаунты — один раз после обновления; новые выбирают при регистрации). Сменить — в Настройках.
import { esc } from '../core/util.js';
import { $view, errText, toast } from '../ui.js';
import { MODES, setMode } from '../core/data.js';
import { render } from '../router.js';

// Что входит в каждый вид — одинаково для окна выбора, регистрации и Настроек
export const MODE_TEXT = {
  personal: 'Свои деньги, платежи, долги и дела. Расходы с Apple Pay записываются сами.',
  business: 'Проекты и их прибыль, платежи, долги и дела. Только записи бизнеса.'
};

// Сервер ещё без поля users.mode — не мучаем окном выбора до перезапуска, работаем как раньше (всё вместе)
let skipped = false;
export const modeSkipped = () => skipped;

export function modeScreen() {
  $view.innerHTML = `<div class="mode-pick">
    <h1>Как будешь пользоваться?</h1>
    <p>От этого зависит, что видно в приложении. Сменить можно потом в Настройках — записи не пропадут.</p>
    ${Object.entries(MODES).map(([k, v]) => `<button type="button" class="card mode-card" data-mode="${k}">
      <b>${esc(v)}</b><span>${esc(MODE_TEXT[k])}</span></button>`).join('')}
    <div class="error" role="alert"></div>
  </div>`;
  const err = $view.querySelector('.error');
  const btns = $view.querySelectorAll('[data-mode]');
  btns.forEach((b) => b.onclick = async () => {
    btns.forEach((x) => { x.disabled = true; });
    b.setAttribute('aria-busy', 'true');
    err.textContent = '';
    try {
      await setMode(b.dataset.mode);
      if (location.hash !== '#/') location.hash = '#/'; else render();
    } catch (e) {
      if (/Сервер ещё не обновлён/.test(e.message)) { skipped = true; toast(e.message); render(); return; }
      err.textContent = errText(e);
      btns.forEach((x) => { x.disabled = false; });
      b.removeAttribute('aria-busy');
    }
  });
}
