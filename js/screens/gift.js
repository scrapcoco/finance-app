// Подарок тем, кто был с приложением до первого большого обновления («Лента»): звание «Первопроходец» и особые цвета
// главной карточки — их нельзя получить, зарегистрировавшись позже. Окно показывается один раз на устройстве
// (localStorage `gift1:<id>`), выбранный цвет — `skin:<id>`, применяется атрибутом data-skin на <html> (цвета — в app.css).
// На сервер ничего не пишется. maybeGift() зовёт лента, applySkin() — router при каждой отрисовке, выбор цвета — Настройки.
import { pb, uid } from '../core/pb.js';
import { toast, celebrate } from '../ui.js';

const RELEASE = '2026-11-14'; // день выхода «Ленты»: аккаунт создан раньше — первопроходец
export const SKINS = { dawn: 'Рассвет', aurora: 'Аврора', gold: 'Золото' };

const get = (k) => { try { return localStorage.getItem(`${k}:${uid() || ''}`); } catch (e) { return null; } };
const set = (k, v) => { try { localStorage.setItem(`${k}:${uid() || ''}`, v); } catch (e) { /* приватный режим */ } };

// Дата создания аккаунта приходит с записью пользователя; если сервер её не отдал — считаем по подарку, полученному раньше
export const isPioneer = () => { const c = pb.authStore.record?.created; return c ? c.slice(0, 10) < RELEASE : get('gift1') === '1'; };
export const curSkin = () => { const s = get('skin'); return isPioneer() && SKINS[s] ? s : 'dawn'; };
export function applySkin() { const s = curSkin(); if (s === 'dawn') delete document.documentElement.dataset.skin; else document.documentElement.dataset.skin = s; }
export function setSkin(s) { set('skin', SKINS[s] ? s : 'dawn'); applySkin(); }

// Лента после отрисовки: первопроходец ещё не видел подарок — показать (не поверх знакомства и «Что нового»)
export function maybeGift() {
  if (!isPioneer() || get('gift1') === '1' || document.querySelector('.ob, .tour-backdrop')) return;
  const bd = document.createElement('div');
  bd.className = 'tour-backdrop';
  let pick = curSkin();
  const close = () => { set('gift1', '1'); setSkin(pick); bd.remove(); celebrate(); toast('Цвет можно сменить в Настройках'); };
  bd.innerHTML = `<div class="tour gift" role="dialog" aria-modal="true" aria-labelledby="gift-t">
      <i class="orb gift-orb" aria-hidden="true"></i>
      <span class="news-tag">Подарок</span>
      <h2 id="gift-t">Спасибо, что ты с нами с самого начала</h2>
      <p>Это наше первое большое обновление, и ты был здесь до него. Поэтому у тебя теперь звание «Первопроходец» и свои цвета главной карточки. Тем, кто придёт позже, они не достанутся.</p>
      <div class="gift-skins" role="radiogroup" aria-label="Цвет главной карточки">${Object.entries(SKINS).map(([k, v]) =>
    `<button type="button" class="gift-skin" role="radio" data-skin-pick="${k}" aria-checked="${k === pick}"><i data-skin="${k}"></i>${v}</button>`).join('')}</div>
      <div class="btns"><button type="button" class="btn" id="gift-ok">Забрать подарок</button></div></div>`;
  bd.querySelectorAll('[data-skin-pick]').forEach((b) => b.onclick = () => {
    pick = b.dataset.skinPick;
    bd.querySelectorAll('[data-skin-pick]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  });
  bd.querySelector('#gift-ok').onclick = close;
  document.body.append(bd);
  bd.querySelector('#gift-ok').focus();
}
