/// <reference path="../pb_data/types.d.ts" />
// Две книги («Личное» / «Бизнес») и проекты.
// - transactions/categories/debts.book: personal | business (пусто у старых записей = personal)
// - projects: проекты бизнеса (онлайн-продукт, физический бизнес, другое); видно и меняет только владелец
// - transactions.project → projects (необязательно); при удалении проекта ссылка просто очищается
// - balances (view): баланс отдельно по каждой книге (строка на пару «пользователь + книга»)
const OWN = "owner = @request.auth.id";
const CREATE = "@request.auth.id != '' && @request.body.owner = @request.auth.id";
const UPDATE = "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)";

migrate((app) => {
  for (const name of ["transactions", "categories", "debts"]) {
    const c = app.findCollectionByNameOrId(name);
    c.fields.add(new SelectField({ name: "book", values: ["personal", "business"], maxSelect: 1 }));
    app.save(c);
  }

  const users = app.findCollectionByNameOrId("users");
  const projects = new Collection({
    type: "base",
    name: "projects",
    listRule: OWN, viewRule: OWN, createRule: CREATE, updateRule: UPDATE, deleteRule: OWN,
    fields: [
      { type: "text", name: "name", required: true, max: 80 },
      { type: "select", name: "kind", values: ["online", "physical", "other"], maxSelect: 1 },
      { type: "text", name: "color", max: 9 },
      { type: "bool", name: "archived" },
      { type: "text", name: "note", max: 500 },
      { type: "relation", name: "owner", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true }
    ]
  });
  app.save(projects);

  const tx = app.findCollectionByNameOrId("transactions");
  tx.fields.add(new RelationField({ name: "project", collectionId: projects.id, cascadeDelete: false, maxSelect: 1 }));
  app.save(tx);

  const balances = app.findCollectionByNameOrId("balances");
  unmarshal({
    listRule: OWN, viewRule: OWN,
    viewQuery: "SELECT (owner || '_' || COALESCE(NULLIF(book, ''), 'personal')) AS id, owner, COALESCE(NULLIF(book, ''), 'personal') AS book, " +
      "ROUND(SUM(CASE WHEN kind = 'income' THEN amount WHEN kind = 'expense' THEN -amount ELSE amount END), 2) AS balance " +
      "FROM transactions WHERE status = 'paid' GROUP BY owner, COALESCE(NULLIF(book, ''), 'personal')"
  }, balances);
  app.save(balances);
}, (app) => {
  const balances = app.findCollectionByNameOrId("balances");
  unmarshal({
    listRule: "id = @request.auth.id", viewRule: "id = @request.auth.id",
    viewQuery: "SELECT owner AS id, ROUND(SUM(CASE WHEN kind = 'income' THEN amount WHEN kind = 'expense' THEN -amount ELSE amount END), 2) AS balance " +
      "FROM transactions WHERE status = 'paid' GROUP BY owner"
  }, balances);
  app.save(balances);
  const tx = app.findCollectionByNameOrId("transactions");
  tx.fields.removeByName("project");
  app.save(tx);
  app.delete(app.findCollectionByNameOrId("projects"));
  for (const name of ["transactions", "categories", "debts"]) {
    const c = app.findCollectionByNameOrId(name);
    c.fields.removeByName("book");
    app.save(c);
  }
});
