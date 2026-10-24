/// <reference path="../pb_data/types.d.ts" />
// Запрещает менять поле owner при обновлении записи (нельзя «подкинуть» запись в чужой аккаунт)
const COLLECTIONS = ["transactions", "categories", "custom_fields", "debts", "push_subscriptions"]

migrate((app) => {
  for (const name of COLLECTIONS) {
    const collection = app.findCollectionByNameOrId(name)
    unmarshal({
      "updateRule": "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)"
    }, collection)
    app.save(collection)
  }
}, (app) => {
  for (const name of COLLECTIONS) {
    const collection = app.findCollectionByNameOrId(name)
    unmarshal({ "updateRule": "owner = @request.auth.id" }, collection)
    app.save(collection)
  }
})
