/// <reference path="../pb_data/types.d.ts" />
// View-коллекция balances: баланс каждого пользователя считает сама база (одна строка вместо всей истории).
// Правила: видно только свою строку. adjust меняет баланс со своим знаком, как net() в js/core/util.js.
migrate((app) => {
  const view = new Collection({
    type: "view",
    name: "balances",
    listRule: "id = @request.auth.id",
    viewRule: "id = @request.auth.id",
    viewQuery: "SELECT owner AS id, ROUND(SUM(CASE WHEN kind = 'income' THEN amount WHEN kind = 'expense' THEN -amount ELSE amount END), 2) AS balance " +
      "FROM transactions WHERE status = 'paid' GROUP BY owner"
  });
  return app.save(view);
}, (app) => {
  return app.delete(app.findCollectionByNameOrId("balances"));
});
