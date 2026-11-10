// @ts-nocheck
// PikabuPacks.js — наборы за рубли в сборке Пикабу Игр (js/PikabuShop.js). Цены и названия товаров — в Студии
// (каталог CSV: coins_s 19 ₽, coins_m 49 ₽, coins_l 99 ₽, starter 29 ₽, no_ads 59 ₽), здесь — что игрок получает.
// Деньги растут лавиной, поэтому наборы — лапки (валюта косметики, GameState.addPaws) и буст ×2 к доходу (cash2x).
const PIKABU_GIVE = (paws, boostMin) => {
    if (paws) GameState.addPaws(paws, 'pikabu');
    if (boostMin) GameState.addBoost('cash2x', boostMin * 60);
    GameState.saveNow();
};
PikabuShop.setup({
    colors: ['#ff9800', '#8bc34a'],
    ready: () => !!(typeof GameState !== 'undefined' && GameState.state && typeof Cosmetics !== 'undefined' && Cosmetics.CATALOG),
    visible: () => !(Cosmetics.isOpen && Cosmetics.isOpen()),
    persist: () => GameState.saveNow(),
    button: { corner: 'tr', x: 12, y: 74 },
    packs: [
        { id: 'coins_s', type: 'consumable', icon: '🐾', name: 'Горсть лапок', desc: '150 лапок на наряды, сёдла и шапки', grant: () => PIKABU_GIVE(150, 0) },
        { id: 'coins_m', type: 'consumable', icon: '💰', name: 'Мешок лапок', desc: '500 лапок и двойной доход на 30 минут', grant: () => PIKABU_GIVE(500, 30) },
        { id: 'coins_l', type: 'consumable', icon: '👑', name: 'Сундук лапок', desc: '1 500 лапок и двойной доход на 2 часа', best: true, grant: () => PIKABU_GIVE(1500, 120) },
        {
            id: 'starter', type: 'non_consumable', icon: '🌵', name: 'Набор наездника', best: 'Один раз',
            desc: '200 лапок, наряд «Кактуссо Ламарино», корона и кибервизор',
            grant: () => PIKABU_GIVE(200, 0),
            apply: () => { ['outfit_skin_cactusso', 'hat_crown', 'face_cyber'].forEach((id) => { if (!Cosmetics.isOwned(id)) Cosmetics.grant(id); }); GameState.saveNow(); },
        },
        { id: 'no_ads', type: 'non_consumable', icon: '🚫', name: 'Без рекламы', desc: 'Убирает межстраничную рекламу навсегда. Награды за рекламу остаются', noAds: true },
    ],
});
