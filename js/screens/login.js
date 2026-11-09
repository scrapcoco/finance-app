// Экран входа и регистрации, условия тестирования
import { esc } from '../core/util.js';
import { state } from '../core/state.js';
import { pb } from '../core/pb.js';
import { $view, toast, errText, openSheet, closeSheet } from '../ui.js';
import { ensureDefaults, userMode, MODES } from '../core/data.js';
import { MODE_TEXT } from './mode.js';
import { goHome } from '../router.js';

const TERMS_VERSION = '1';

export const COPYRIGHT = `© ${new Date().getFullYear()} HardPoint. Все права защищены.`;

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

export function termsSheet() {
  openSheet(`<h2>Условия тестирования</h2><div class="terms-body">${TERMS_HTML}</div>
    <p class="copyright">${esc(COPYRIGHT)}</p>
    <button class="btn" id="tclose">Понятно</button>`, (s) => { s.querySelector('#tclose').onclick = closeSheet; });
}

// Вход и регистрация — одна стеклянная рамка, разрезанная косой полосой: слева «Вход», справа «Регистрация».
// Нажатие на свёрнутую сторону сдвигает полосу и открывает её форму (раскладка — в app.css, .auth[data-mode])
export function viewLogin(mode = 'login') {
  $view.classList.add('no-tabs');
  $view.innerHTML = `<div class="auth" id="auth" data-mode="${mode === 'register' ? 'register' : 'login'}">
    <section class="auth-pane auth-login" data-side="login">
      <form class="auth-form" id="f-login" novalidate>
        <h1>Вход</h1>
        <p>Войди, чтобы увидеть свои доходы, расходы и платежи.</p>
        <div class="auth-fields">
          <label class="afield"><span class="sr">Email</span><input name="em" type="email" autocomplete="username" placeholder="Email" required></label>
          <label class="afield"><span class="sr">Пароль</span><input name="pw" type="password" autocomplete="current-password" placeholder="Пароль" required></label>
        </div>
        <div class="error" role="alert"></div>
        ${slideHTML('Войти', 'Входим…')}
      </form>
      <button class="auth-tease" type="button" data-go="login"><small>Уже есть аккаунт?</small><b>Вход</b></button>
    </section>
    <section class="auth-pane auth-register" data-side="register">
      <form class="auth-form" id="f-register" novalidate>
        <h1>Регистрация</h1>
        <p>Создай аккаунт по коду приглашения.</p>
        <div class="auth-fields">
          <label class="afield"><span class="sr">Email</span><input name="em" type="email" autocomplete="email" placeholder="Email" required></label>
          <label class="afield"><span class="sr">Пароль</span><input name="pw" type="password" autocomplete="new-password" placeholder="Пароль от 8 символов" required></label>
          <label class="afield"><span class="sr">Пароль ещё раз</span><input name="pw2" type="password" autocomplete="new-password" placeholder="Пароль ещё раз" required></label>
          <label class="afield"><span class="sr">Код приглашения</span><input name="inv" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Код приглашения" required></label>
        </div>
        <div class="segment reg-mode" role="group" aria-label="Для чего аккаунт">${Object.entries(MODES).map(([k, v]) =>
          `<button type="button" data-regmode="${k}" aria-pressed="${k === 'personal'}">${esc(v)}</button>`).join('')}</div>
        <p class="reg-mode-hint" aria-live="polite">${esc(MODE_TEXT.personal)}</p>
        <label class="check"><input type="checkbox" name="agree"><span>Я прочитал и согласен с <button type="button" class="link-btn inline" data-terms>условиями тестирования</button></span></label>
        <div class="error" role="alert"></div>
        ${slideHTML('Создать аккаунт', 'Создаём…')}
      </form>
      <button class="auth-tease" type="button" data-go="register"><small>Нет аккаунта?</small><b>Регистрация</b></button>
    </section>
    <div class="auth-seam" aria-hidden="true"></div>
  </div>
  <p class="copyright">${esc(COPYRIGHT)}</p>`;

  const box = document.getElementById('auth');
  const fLogin = document.getElementById('f-login'), fReg = document.getElementById('f-register');
  // Свёрнутая форма недоступна с клавиатуры и для экранного диктора; открытая — наоборот, её «заставка» прячется
  const setMode = (m, focus) => {
    box.dataset.mode = m;
    fLogin.inert = m !== 'login'; fReg.inert = m !== 'register';
    box.querySelector('[data-go="login"]').inert = m === 'login';
    box.querySelector('[data-go="register"]').inert = m === 'register';
    if (focus) setTimeout(() => (m === 'login' ? fLogin : fReg).querySelector('input')?.focus({ preventScroll: true }), 420);
  };
  setMode(box.dataset.mode);
  box.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => setMode(b.dataset.go, true); });
  fReg.querySelector('[data-terms]').onclick = termsSheet;
  // Вид аккаунта при регистрации: «Для себя» по умолчанию, подсказка ниже говорит, что в него входит
  let regMode = 'personal';
  fReg.querySelectorAll('[data-regmode]').forEach((b) => b.onclick = () => {
    regMode = b.dataset.regmode;
    fReg.querySelectorAll('[data-regmode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    fReg.querySelector('.reg-mode-hint').textContent = MODE_TEXT[regMode];
  });

  const enter = async (email, password) => {
    await pb.collection('users').authWithPassword(email, password);
    state.cache = { cats: null, fields: null, debts: null };
    // Стартовые категории — для книги своего вида; вид не выбран (старый аккаунт) — их создаст окно выбора
    if (userMode()) await ensureDefaults(userMode());
    goHome();
  };

  // Вместо кнопок — слайдеры: дотянул до конца → отправка формы
  const slides = new Map([fLogin, fReg].map((f) => [f, mountSlide(f.querySelector('[data-slide]'), () => f.requestSubmit())]));
  // Без кнопки отправки Enter в поле форму не отправляет — отправляем сами
  for (const f of [fLogin, fReg]) {
    f.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])')) { e.preventDefault(); f.requestSubmit(); }
    });
  }

  const submit = (form, reg) => async (e) => {
    e.preventDefault();
    const err = form.querySelector('.error');
    const setBusy = (on) => slides.get(form).busy(on);
    const fail = (msg) => { err.textContent = msg; setBusy(false); };
    const email = form.em.value.trim(), password = form.pw.value;
    err.textContent = '';
    if (!email || !password) return fail('Введи email и пароль.');
    if (reg) {
      if (password.length < 8) return fail('Пароль должен быть не короче 8 символов.');
      if (password !== form.pw2.value) return fail('Пароли не совпадают.');
      if (!form.inv.value.trim()) return fail('Введи код приглашения.');
      if (!form.agree.checked) return fail('Нужно согласиться с условиями тестирования.');
    }
    setBusy(true);
    try {
      if (reg) {
        try {
          await pb.collection('users').create({
            email, password, passwordConfirm: password,
            invite: form.inv.value.trim(), terms_version: TERMS_VERSION, mode: regMode
          });
        } catch (ex) {
          const d = ex.response?.data || {};
          if (d.email) err.textContent = d.email.code === 'validation_not_unique' ? 'Такой email уже зарегистрирован. Попробуй войти.' : 'Проверь email.';
          else if (d.password) err.textContent = 'Пароль должен быть не короче 8 символов.';
          else if (ex.status === 400 || ex.status === 403) err.textContent = 'Неверный код приглашения.';
          else err.textContent = errText(ex);
          setBusy(false);
          return;
        }
      }
      await enter(email, password);
      if (reg) toast('Аккаунт создан. Добро пожаловать!');
    } catch (ex) {
      fail(ex.status === 400 ? 'Неверный email или пароль.' : errText(ex));
    }
  };
  fLogin.onsubmit = submit(fLogin, false);
  fReg.onsubmit = submit(fReg, true);
}

// Слайдер «проведи, чтобы…»: кругляш тянется пальцем/мышью, за ним заливка; отпустил дальше 85% — onDone,
// иначе пружинит назад. Enter/пробел на кругляше — то же самое (клавиатура, экранный диктор).
const slideHTML = (label, busyLabel) => `<div class="slide-submit" data-slide data-busy="${esc(busyLabel)}">
          <span class="slide-fill" aria-hidden="true"></span>
          <span class="slide-text" aria-hidden="true">${esc(label)}</span>
          <button type="button" class="slide-knob" aria-label="${esc(label)}">
            <svg class="ar" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <svg class="sp" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="34 50"/></svg>
          </button>
        </div>`;

function mountSlide(el, onDone) {
  const knob = el.querySelector('.slide-knob'), text = el.querySelector('.slide-text');
  const label = text.textContent, busyLabel = el.dataset.busy;
  let x = 0, startX = 0, drag = false, locked = false;
  const max = () => el.clientWidth - knob.offsetWidth - 8;
  const place = (v) => { x = v; el.style.setProperty('--x', `${v}px`); el.style.setProperty('--p', String(max() ? v / max() : 0)); };
  const springBack = () => { el.classList.add('back'); place(0); setTimeout(() => el.classList.remove('back'), 360); };
  const finish = () => { locked = true; el.classList.add('back'); place(max()); onDone(); };

  knob.addEventListener('pointerdown', (e) => {
    if (locked) return;
    drag = true; startX = e.clientX - x; knob.setPointerCapture(e.pointerId); el.classList.remove('back');
  });
  knob.addEventListener('pointermove', (e) => { if (drag) place(Math.min(max(), Math.max(0, e.clientX - startX))); });
  const release = () => {
    if (!drag) return;
    drag = false;
    if (x >= max() * 0.85) finish(); else springBack();
  };
  knob.addEventListener('pointerup', release);
  knob.addEventListener('pointercancel', release);
  knob.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !locked) { e.preventDefault(); finish(); }
  });

  return {
    // Пока идёт отправка — кругляш в конце и крутится; ошибка — возвращается в начало
    busy(on) {
      el.classList.toggle('busy', on);
      text.textContent = on ? busyLabel : label;
      if (on) { locked = true; el.classList.add('back'); place(max()); }
      else { locked = false; springBack(); }
    }
  };
}
