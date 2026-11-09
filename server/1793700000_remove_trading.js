/// <reference path="../pb_data/types.d.ts" />
// Торговый бот убран из приложения (2026-11-09): удаляем его коллекции
// (созданы 1793300000_trading.js и серверной 1793300001_trading_secrets.js). Обратно не восстанавливаем.
migrate((app) => {
  for (const name of ["trading_events", "trading_status", "trading_members", "trading_config"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) { /* уже нет */ }
  }
}, (app) => {});
