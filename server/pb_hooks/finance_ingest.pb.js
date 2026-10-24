/// <reference path="../pb_data/types.d.ts" />
// Приём расходов с iPhone (Быстрые команды → «Отримати вміст URL») и выдача личного ключа.
// В базе хранится только sha256 ключа (users.ingest_key_hash, скрытое поле).
// Каждый обработчик PocketBase выполняет изолированно, поэтому весь код — внутри обработчиков.

// Есть ли у текущего пользователя действующий ключ (сам отпечаток наружу не отдаём).
routerAdd("GET", "/api/finance/key", (e) => {
  return e.json(200, { active: !!e.auth.get("ingest_key_hash") });
}, $apis.requireAuth("users"));

// Новый ключ для текущего пользователя. Показывается один раз; старый ключ перестаёт работать.
routerAdd("POST", "/api/finance/key", (e) => {
  const user = e.auth;
  const key = "fk_" + $security.randomString(40);
  user.set("ingest_key_hash", $security.sha256(key));
  e.app.save(user);
  return e.json(200, { key });
}, $apis.requireAuth("users"));

// Отключить ключ.
routerAdd("DELETE", "/api/finance/key", (e) => {
  const user = e.auth;
  user.set("ingest_key_hash", "");
  e.app.save(user);
  return e.json(200, { ok: true });
}, $apis.requireAuth("users"));

// Записать оплаченный расход: заголовок X-Finance-Key, тело { amount: "12,34 zł", merchant: "Żabka" }.
routerAdd("POST", "/api/finance/expense", (e) => {
  const key = String(e.request.header.get("X-Finance-Key") || "").trim();
  if (!/^fk_[A-Za-z0-9]{40}$/.test(key)) throw new UnauthorizedError("Нет ключа или ключ неверный.");
  let user;
  try {
    user = e.app.findFirstRecordByFilter("users", "ingest_key_hash = {:h}", { h: $security.sha256(key) });
  } catch (_) {
    throw new UnauthorizedError("Нет ключа или ключ неверный.");
  }

  const body = e.requestInfo().body || {};
  const rawAmount = String(body.amount ?? "").trim();
  const merchant = String(body.merchant ?? "").replace(/\s+/g, " ").trim().slice(0, 120);

  // «1,00 zł», «PLN 1.00», «-12,50», «1 234,56 zł», «1,234.56»
  let s = rawAmount.replace(/[^\d.,]/g, "");
  const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  if (lastSep >= 0 && s.length - lastSep - 1 <= 2) {
    s = s.slice(0, lastSep).replace(/[.,]/g, "") + "." + s.slice(lastSep + 1);
  } else {
    s = s.replace(/[.,]/g, "");
  }
  const amount = Math.round(parseFloat(s) * 100) / 100;
  if (!isFinite(amount) || amount <= 0 || amount > 1000000) {
    throw new BadRequestError("Не понял сумму: " + rawAmount.slice(0, 40));
  }
  const foreign = /[$€£]|USD|EUR|GBP|UAH/i.test(rawAmount);

  // Сегодняшняя дата по Варшаве (летнее время ЕС: с последнего воскресенья марта по последнее воскресенье октября, 01:00 UTC).
  const now = new Date();
  const y = now.getUTCFullYear();
  const lastSunday = (m) => { const d = new Date(Date.UTC(y, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d; };
  const summer = now >= lastSunday(2) && now < lastSunday(9);
  const local = new Date(now.getTime() + (summer ? 2 : 1) * 3600 * 1000);
  const ymd = local.toISOString().slice(0, 10);

  const tx = new Record(e.app.findCollectionByNameOrId("transactions"));
  tx.set("owner", user.id);
  tx.set("kind", "expense");
  tx.set("status", "paid");
  tx.set("repeat", "none");
  tx.set("amount", amount);
  tx.set("date", ymd + " 12:00:00.000Z");
  tx.set("note", (merchant || "Apple Pay") + (foreign ? " (" + rawAmount.slice(0, 30) + ")" : ""));
  e.app.save(tx);

  const shown = amount.toFixed(2).replace(".", ",") + " zł";
  return e.json(200, { ok: true, id: tx.id, text: "Записано: " + shown + (merchant ? " " + merchant : "") });
});
