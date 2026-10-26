/// <reference path="../pb_data/types.d.ts" />
// debts.direction: owe — я должен (гасится расходами), lent — мне должны (возвраты приходят доходами).
// Пустое значение у старых долгов = owe.
migrate((app) => {
  const debts = app.findCollectionByNameOrId("debts");
  debts.fields.add(new SelectField({ name: "direction", values: ["owe", "lent"], maxSelect: 1 }));
  return app.save(debts);
}, (app) => {
  const debts = app.findCollectionByNameOrId("debts");
  debts.fields.removeByName("direction");
  return app.save(debts);
});
