// Экран входа и регистрации, условия тестирования
import { esc } from '../core/util.js';
import { state } from '../core/state.js';
import { pb } from '../core/pb.js';
import { $view, toast, errText, openSheet, closeSheet } from '../ui.js';
import { ensureDefaults } from '../core/data.js';
import { render } from '../router.js';

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

export function viewLogin(mode = 'login') {
  $view.classList.add('no-tabs');
  const reg = mode === 'register';
  $view.innerHTML = `<form class="login" id="login" novalidate>
    <h1>Финансы</h1>
    <p>${reg ? 'Создай аккаунт по коду приглашения.' : 'Войди, чтобы увидеть свои доходы, расходы и платежи.'}</p>
    <div class="form-list">
      <div class="frow"><label for="em">Email</label><input id="em" type="email" autocomplete="${reg ? 'email' : 'username'}" required></div>
      <div class="frow"><label for="pw">Пароль</label><input id="pw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" placeholder="${reg ? 'Минимум 8 символов' : ''}" required></div>
      ${reg ? `
      <div class="frow"><label for="pw2">Ещё раз</label><input id="pw2" type="password" autocomplete="new-password" required></div>
      <div class="frow"><label for="inv">Код приглашения</label><input id="inv" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" required></div>` : ''}
    </div>
    ${reg ? `<label class="check"><input type="checkbox" id="agree"><span>Я прочитал и согласен с <button type="button" class="link-btn inline" id="terms">условиями тестирования</button></span></label>` : ''}
    <div class="error" id="err" role="alert"></div>
    <button class="btn" type="submit">${reg ? 'Создать аккаунт' : 'Войти'}</button>
    <button class="link-btn" type="button" id="switch" style="align-self:center">${reg ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Регистрация по приглашению'}</button>
    <p class="copyright">${esc(COPYRIGHT)}</p>
  </form>`;
  const form = document.getElementById('login');
  const err = document.getElementById('err');
  document.getElementById('switch').onclick = () => viewLogin(reg ? 'login' : 'register');
  if (reg) document.getElementById('terms').onclick = termsSheet;

  const enter = async (email, password) => {
    await pb.collection('users').authWithPassword(email, password);
    state.cache = { cats: null, fields: null, debts: null };
    await ensureDefaults();
    location.hash = '#/';
    render();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
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
}
