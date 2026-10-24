// Push-напоминания о платежах: блок в «Настройках» и подписка этого устройства
import { esc } from '../core/util.js';
import { CFG, pb, uid } from '../core/pb.js';
import { $view, toast } from '../ui.js';

const errText = (e) => (e && e.name === 'NotAllowedError')
  ? 'Уведомления не разрешены в настройках телефона'
  : (e?.response?.message || e?.message || 'Что-то пошло не так.');

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushKey = () => (CFG.VAPID_PUBLIC_KEY && !CFG.VAPID_PUBLIC_KEY.startsWith('PASTE')) ? CFG.VAPID_PUBLIC_KEY : '';
const deviceName = () => {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Устройство';
};
const b64ToBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const byEndpoint = (endpoint) => pb.collection('push_subscriptions').getFullList({ filter: pb.filter('owner = {:o} && endpoint = {:e}', { o: uid(), e: endpoint }) });

async function saveSubscription(sub) {
  const j = sub.toJSON();
  const data = { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: deviceName() };
  const recs = await byEndpoint(j.endpoint);
  if (recs.length) await pb.collection('push_subscriptions').update(recs[0].id, data);
  else await pb.collection('push_subscriptions').create({ ...data, owner: uid() });
}

async function pushStatus() {
  if (isIOS && !isStandalone()) return { state: 'ios-browser' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { state: 'unsupported' };
  if (!pushKey()) return { state: 'no-key' };
  if (Notification.permission === 'denied') return { state: 'denied' };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { state: 'off' };
  if (!(await byEndpoint(sub.endpoint)).length) await saveSubscription(sub);
  return { state: 'on', sub };
}

async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Уведомления не разрешены'); return false; }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(pushKey()) });
  await saveSubscription(sub);
  return true;
}

async function disablePush(sub) {
  for (const r of await byEndpoint(sub.endpoint)) await pb.collection('push_subscriptions').delete(r.id);
  await sub.unsubscribe();
}

const MSG = {
  'ios-browser': 'Чтобы получать напоминания на iPhone, сначала установи приложение: в Safari нажми «Поделиться» → «На экран „Домой“», затем открой его с иконки и вернись сюда.',
  unsupported: 'Этот браузер не поддерживает уведомления.',
  'no-key': 'Напоминания ещё не настроены на сервере.',
  denied: 'Уведомления запрещены. Разреши их: Настройки iPhone → Уведомления → Финансы.',
  off: 'За 3 дня, за 2 дня, за 1 день и в день оплаты — в 9:00. И на следующий день, если платёж не отмечен оплаченным.',
  on: 'Напоминания включены на этом устройстве: за 3, 2, 1 день и в день оплаты, в 9:00.'
};

function draw(holder, st) {
  const btn = st.state === 'off' ? '<button class="btn" id="push-on">Включить на этом устройстве</button>'
    : st.state === 'on' ? '<button class="btn secondary" id="push-off">Выключить на этом устройстве</button>' : '';
  holder.innerHTML = `<section class="sec">
    <div class="sec-head"><h2>Напоминания о платежах</h2>${st.state === 'on' ? '<span class="badge" style="color:var(--inc)">Включены</span>' : ''}</div>
    <div class="list"><div class="empty" style="color:var(--soft)">${esc(MSG[st.state])}</div></div>
    ${btn}
  </section>`;
  const refresh = async () => draw(holder, await pushStatus().catch(() => ({ state: 'unsupported' })));
  const on = holder.querySelector('#push-on');
  if (on) on.onclick = async () => {
    on.disabled = true;
    try { if (await enablePush()) toast('Напоминания включены'); }
    catch (e) { toast(errText(e)); }
    refresh();
  };
  const off = holder.querySelector('#push-off');
  if (off) off.onclick = async () => {
    off.disabled = true;
    try { await disablePush(st.sub); toast('Напоминания выключены'); }
    catch (e) { toast(errText(e)); }
    refresh();
  };
}

// Вставляет блок сразу под заголовком экрана «Настройки»
export async function mountPushBlock() {
  const head = $view.querySelector('.head');
  if (!head || $view.querySelector('#push-block')) return;
  const holder = document.createElement('div');
  holder.id = 'push-block';
  holder.style.display = 'contents';
  head.after(holder);
  draw(holder, await pushStatus().catch(() => ({ state: 'unsupported' })));
}
