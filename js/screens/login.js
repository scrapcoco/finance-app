// Экран входа и регистрации, условия тестирования
import { esc } from '../core/util.js';
import { state } from '../core/state.js';
import { pb } from '../core/pb.js';
import { $view, toast, errText, openSheet, closeSheet } from '../ui.js';
import { ensureDefaults } from '../core/data.js';
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
          <label class="afield"><span>Email</span><input name="em" type="email" autocomplete="username" required></label>
          <label class="afield"><span>Пароль</span><input name="pw" type="password" autocomplete="current-password" required></label>
        </div>
        <div class="error" role="alert"></div>
        <button class="btn" type="submit">Войти</button>
      </form>
      <button class="auth-tease" type="button" data-go="login"><small>Уже есть аккаунт?</small><b>Вход</b></button>
    </section>
    <section class="auth-pane auth-register" data-side="register">
      <form class="auth-form" id="f-register" novalidate>
        <h1>Регистрация</h1>
        <p>Создай аккаунт по коду приглашения.</p>
        <div class="auth-fields">
          <label class="afield"><span>Email</span><input name="em" type="email" autocomplete="email" required></label>
          <label class="afield"><span>Пароль</span><input name="pw" type="password" autocomplete="new-password" placeholder="Минимум 8 символов" required></label>
          <label class="afield"><span>Ещё раз</span><input name="pw2" type="password" autocomplete="new-password" required></label>
          <label class="afield"><span>Код приглашения</span><input name="inv" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
        </div>
        <label class="check"><input type="checkbox" name="agree"><span>Я прочитал и согласен с <button type="button" class="link-btn inline" data-terms>условиями тестирования</button></span></label>
        <div class="error" role="alert"></div>
        <button class="btn" type="submit">Создать аккаунт</button>
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

  const enter = async (email, password) => {
    await pb.collection('users').authWithPassword(email, password);
    state.cache = { cats: null, fields: null, debts: null };
    await ensureDefaults();
    goHome();
  };

  const submit = (form, reg) => async (e) => {
    e.preventDefault();
    const err = form.querySelector('.error');
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
  fLogin.onsubmit = submit(fLogin, false);
  fReg.onsubmit = submit(fReg, true);
}
