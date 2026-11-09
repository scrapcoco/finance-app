/// <reference path="../pb_data/types.d.ts" />
// Вид аккаунта: users.mode — personal («Для себя») | business («Для бизнеса»). Пусто — ещё не выбран
// (старые аккаунты: приложение один раз спросит). Свою запись users пользователь меняет сам (стандартное правило users).
// assistant_reviews.week: у бизнеса ключ «понедельник + b» (11 знаков) — поднимаем предел до 12.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new SelectField({ name: "mode", values: ["personal", "business"], maxSelect: 1 }));
  app.save(users);
  const rv = app.findCollectionByNameOrId("assistant_reviews");
  rv.fields.getByName("week").max = 12;
  app.save(rv);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("mode");
  app.save(users);
});
