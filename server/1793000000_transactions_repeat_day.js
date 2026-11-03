/// <reference path="../pb_data/types.d.ts" />
// transactions.repeat_day — «родной» день повторяющегося платежа (1–31).
// Без него платёж 31-го после 28 февраля навсегда «съезжал» на 28-е. Пусто у старых записей = день из даты.
migrate((app) => {
  const tx = app.findCollectionByNameOrId("transactions");
  tx.fields.add(new NumberField({ name: "repeat_day", min: 0, max: 31, onlyInt: true }));
  return app.save(tx);
}, (app) => {
  const tx = app.findCollectionByNameOrId("transactions");
  tx.fields.removeByName("repeat_day");
  return app.save(tx);
});
