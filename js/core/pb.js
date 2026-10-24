// Подключение к PocketBase и фильтр «только мои записи»

export const CFG = window.APP_CONFIG;

export const pb = new PocketBase(CFG.PB_URL);

pb.autoCancellation(false);

export const uid = () => pb.authStore.record?.id;

export const ownerFilter = () => pb.filter('owner = {:o}', { o: uid() });
