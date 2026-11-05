// Shops.js — лавки Food, Gears, Sell, Track, доска улучшений (UI), Индекс, Перерождение, магазин яиц за рекламу.
//
// Всё в одном модуле Shops (Game.register в конце). Лавки открываются событием stall:open { id, handled } (Ranch.openStall):
//   upgrades — доска улучшений: удача вылупления, гнёзда, слоты питомцев
//   food     — корм: 6 видов, питомец (под седлом, потом ранчо), ×1/×5/×10, полоса опыта и взросление
//   gears    — корзина для яиц (вместимость) и 7 радаров с ограниченным запасом, обновлением (таймер, за деньги, за рекламу), автопокупкой
//   track    — табло «Яйца в мире»: живые яйца по типам, слежение (бесплатно для common/rare, иначе нужен радар)
//   sell     — продажа питомцев (нельзя продать питомца под седлом и последнего), «Продать всех обычных»
// Боковые кнопки HUD: слева «Индекс» (книга) и «Перерождение», справа «Магазин» (яйца за рекламу).
//
// Публичный API (логика без UI — её гоняют tests/game-shops.test.mjs):
//   Shops.upgradeInfo(id) / buyUpgrade(id)                    улучшения ранчо (luck | nests | slots), эффекты сразу
//   Shops.feed(uid, foodId, n)                                 кормление: списывает деньги, GameState.addPetExp, pet:fed
//   Shops.buyBasket()                                          вместимость корзины
//   Shops.stockOf(id) / buyRadar(id) / restock(opts) / forceRestock(kind) / setAutoBuy(id, on)    радары и запас
//   Shops.useRadar(id) / trackType(eggType) / lockEgg(egg) / endLock(reason)                        слежение за яйцом (Guide + плашка HUD)
//   Shops.canSell(uid) / sellPet(uid) / commonsToSell() / sellCommons()                              продажа
//   Shops.indexReward(species) / unclaimed() / claim(species) / claimAll() / noteBest()              Индекс
//   Shops.nextRebirth() / rebirthStatus() / rebirth({ skip }) / skipStep() / applyRanchBase(force)   перерождение
//   Shops.bundleStep(kind, rolls) / grantRolls(kind, n, rng)                                         магазин яиц: просмотры рекламы и броски
// События (Game.events): upgrade {id, level, cost}, pet:fed {pet, exp, food, n}, pet:sold {pet, uid, value}, radar {on, egg},
//   index:claim {species}, rebirth {n, skip}, pet:granted {pet, isNew, source}.
// Награды за рекламу (Platform.rewarded): gears-restock, rebirth-skip, egg-dragon-1|3|10|50, egg-giant-1|3|10|50 — не раунды.
// Сохраняется: state.radars, gearsStock, gearsRestockAt, radarAuto, shopAds, rebirthSkip, index.claimed / bestKg, pet.huge.

Lang.add({
    ru: {
        'huge.tag': 'ОГРОМНЫЙ',
        'stl.max': 'МАКС', 'stl.noCash': 'Не хватает денег', 'stl.bought': 'Куплено!', 'stl.buy': 'Купить',
        'stl.lvl': 'Ур. {a} из {b}', 'stl.riding': 'Под седлом', 'stl.onRanch': 'На ранчо', 'stl.perSec': '{v} в секунду',
        'stl.age': 'Возраст {n}', 'stl.dist': '{n} м',
        // доска улучшений
        'stl.upg.title': 'Улучшения ранчо',
        'stl.upg.luck': 'Удача вылупления', 'stl.upg.nests': 'Гнёзда', 'stl.upg.slots': 'Слоты питомцев',
        'stl.upg.luck.desc': 'Шанс редких питомцев ×{a} → ×{b}', 'stl.upg.nests.desc': 'Гнёзд для яиц: {a} → {b}',
        'stl.upg.slots.desc': 'Питомцев на ранчо: {a} → {b}',
        'stl.upg.luck.now': 'Шанс редких питомцев ×{a}', 'stl.upg.nests.now': 'Гнёзд для яиц: {a}', 'stl.upg.slots.now': 'Питомцев на ранчо: {a}',
        'stl.upg.maxed': 'Достигнут максимум',
        // корм
        'stl.food.title': 'Корм', 'stl.food.pick': 'Кого кормим', 'stl.food.exp': '+{n} опыта', 'stl.food.ageUp': 'Возраст {n}!',
        'stl.food.fed': '{name}: +{n} опыта', 'stl.food.none': 'Нет питомцев', 'stl.food.foods': 'Выберите корм',
        'stl.food.expLine': 'Опыт {a} из {b}',
        // снаряжение
        'stl.gears.title': 'Снаряжение', 'stl.gears.basket': 'Корзина для яиц', 'stl.gears.basketDesc': 'Яиц в корзине: {a} → {b}',
        'stl.gears.basketNow': 'Яиц в корзине: {a}', 'stl.gears.basketUp': 'В корзину помещается яиц: {n}',
        'stl.gears.radars': 'Радары', 'stl.gears.restockIn': 'Новый запас через {t}', 'stl.gears.restockCash': 'Обновить сейчас',
        'stl.gears.restockAd': 'Обновить за рекламу', 'stl.gears.restocked': 'Запас радаров обновлён!',
        'stl.gears.stock': 'В наличии: {a} из {b}', 'stl.gears.owned': 'У вас: {n}', 'stl.gears.soldOut': 'Нет в наличии',
        'stl.gears.use': 'Использовать', 'stl.gears.auto': 'Автопокупка', 'stl.gears.autoOn': 'Автопокупка включена',
        'stl.gears.autoHint': 'Покупает радар при каждом обновлении запаса', 'stl.gears.finds': 'Ищет: {list}',
        'stl.gears.autoBought': 'Автопокупка: {name} ×{n}', 'stl.gears.luckBelow': 'удача до', 'stl.gears.luckFrom': 'удача от',
        'stl.gears.intro': 'Радар находит ближайшее яйцо своего вида; если такого нет, яйцо появляется на карте.',
        // радары и слежение
        'stl.radar.locked': 'Радар нашёл: {name}', 'stl.radar.spawned': 'Радар проявил яйцо: {name}!',
        'stl.radar.none': 'Нет радара: {name}', 'stl.radar.fail': 'Сейчас не удаётся найти яйцо',
        'stl.radar.lost': 'Яйцо больше недоступно', 'stl.radar.cancel': 'Остановить слежение',
        'stl.track.title': 'Яйца в мире', 'stl.track.wave': 'Следующая волна через {t}: ×{n}',
        'stl.track.none': 'Сейчас в мире нет яиц. Дождитесь следующей волны!', 'stl.track.btn': 'Следить',
        'stl.track.free': 'Бесплатно', 'stl.track.needs': 'Нужен: {name}', 'stl.track.uses': 'Тратит радар: {name}, у вас {n}',
        'stl.track.nearest': 'Ближайшее: {d}', 'stl.track.on': 'Следим за яйцом: {name}', 'stl.track.active': 'Слежение включено',
        'stl.track.night': 'Только ночью',
        // продажа
        'stl.sell.title': 'Продажа питомцев', 'stl.sell.btn': 'Продать', 'stl.sell.last': 'Последнего питомца продать нельзя',
        'stl.sell.cantRide': 'Питомца под седлом продать нельзя', 'stl.sell.confirmTitle': 'Продать питомца?',
        'stl.sell.confirmText': '{name} уйдёт навсегда. Вы получите {v}.', 'stl.sell.done': 'Продано: {name} за {v}',
        'stl.sell.commons': 'Продать всех обычных', 'stl.sell.commonsTitle': 'Продать обычных?',
        'stl.sell.commonsText': 'Продать обычных питомцев: {n} за {v}? Питомцы под седлом, на ранчо, с мутацией и огромные остаются.',
        'stl.sell.commonsNone': 'Нет обычных питомцев на продажу', 'stl.sell.commonsDone': 'Продано питомцев: {n}, получено {v}',
        'stl.sell.lastShort': 'Последний', 'stl.sell.empty': 'Нет питомцев на продажу', 'stl.sell.rate': 'Цена: доход за {n} секунд',
        // индекс
        'idx.btn': 'Индекс', 'idx.title': 'Индекс', 'idx.pets': 'Питомцы', 'idx.eggs': 'Яйца', 'idx.found': 'Открыто: {a} из {b}',
        'idx.chance': '1 из {n}', 'idx.best': 'Лучший вес: {v}', 'idx.unknown': '???', 'idx.claim': 'Забрать',
        'idx.claimAll': 'Забрать всё: {n}', 'idx.claimed': 'Награда получена!', 'idx.reward': 'Награда за открытие',
        'idx.claimedNow': 'Награда: {cash} и лапки: {paws}', 'idx.hatch': 'Вылупление: {t}', 'idx.new': 'Новое!', 'idx.noBest': 'Лучший вес: нет',
        // перерождение
        'reb.btn': 'Перерождение', 'reb.title': 'Перерождение', 'reb.sub': 'Деньги и удача сбрасываются',
        'reb.rewards': 'Награды', 'reb.reqs': 'Требования', 'reb.cashMult': 'Множитель денег', 'reb.slot': 'Слот питомца',
        'reb.base': 'Новая база ранчо', 'reb.go': 'Переродиться', 'reb.skip': 'ПРОПУСТИТЬ', 'reb.keep': 'Сохранить всё!',
        'reb.skipProgress': 'За рекламу {a}/{b}', 'reb.confirmTitle': 'Переродиться?',
        'reb.confirmText': 'Деньги и уровень удачи сбросятся, питомец «{pet}» уйдёт. Взамен: деньги ×{m} и ещё один слот питомца.',
        'reb.done': 'Перерождение {n}! Деньги ×{m}', 'reb.doneSkip': 'Перерождение {n} без потерь! Деньги ×{m}',
        'reb.max': 'Вы достигли последнего перерождения!', 'reb.count': 'Перерождений: {a} из {b}',
        'reb.slotCap': 'Слотов питомцев: {a} → {b}', 'reb.cashNeed': 'Накопить деньги', 'reb.have': 'Есть', 'reb.missing': 'Нет', 'reb.notMet': 'Требования не выполнены',
        'reb.skipStep': 'Просмотр засчитан: {a} из {b}',
        'reb.base.1': 'Золотой забор', 'reb.base.2': 'Серебристо-синий забор', 'reb.base.3': 'Изумрудный забор', 'reb.base.4': 'Рубиновый забор',
        'reb.base.5': 'Аметистовый забор', 'reb.base.6': 'Обсидиановый забор', 'reb.base.7': 'Алмазный забор',
        // магазин яиц за рекламу
        'esh.btn': 'Магазин', 'esh.title': 'Магазин', 'esh.dragon': 'Драконье яйцо', 'esh.giant': 'Гигантское яйцо',
        'esh.instant': 'Мгновенное вылупление', 'esh.giantDesc': 'Вылупляет случайного ОГРОМНОГО питомца',
        'esh.dragonDesc': 'Шанс получить самого Дракона!', 'esh.odds': 'Шансы', 'esh.oddsTitle': 'Шансы: Гигантское яйцо',
        'esh.oddsNote': 'Питомец всегда ОГРОМНЫЙ: доход ×{m}, вес и размер больше.', 'esh.watch': 'За рекламу {a}/{b}',
        'esh.adNote': 'Броски выдаются после последнего просмотра. Прогресс сохраняется.', 'esh.progress': 'Просмотр засчитан: {a} из {b}',
        'esh.results': 'Результат: ×{n}', 'esh.next': 'Далее', 'esh.ride': 'Сесть', 'esh.rideBest': 'Сесть на лучшего',
        'esh.best': 'ЛУЧШИЙ', 'esh.new': 'НОВЫЙ!', 'esh.hint': 'Питомцы сразу попадают в ваш список', 'esh.giantBonus': 'Доход ×{m}, вес ×{k}',
    },
    en: {
        'huge.tag': 'HUGE',
        'stl.max': 'MAX', 'stl.noCash': 'Not enough cash', 'stl.bought': 'Purchased!', 'stl.buy': 'Buy',
        'stl.lvl': 'Lv {a} of {b}', 'stl.riding': 'Riding', 'stl.onRanch': 'On ranch', 'stl.perSec': '{v} per second',
        'stl.age': 'Age {n}', 'stl.dist': '{n} m',
        'stl.upg.title': 'Ranch Upgrades',
        'stl.upg.luck': 'Hatch Luck', 'stl.upg.nests': 'Nests', 'stl.upg.slots': 'Pet Slots',
        'stl.upg.luck.desc': 'Rare pet odds ×{a} → ×{b}', 'stl.upg.nests.desc': 'Egg nests: {a} → {b}',
        'stl.upg.slots.desc': 'Pets on ranch: {a} → {b}',
        'stl.upg.luck.now': 'Rare pet odds ×{a}', 'stl.upg.nests.now': 'Egg nests: {a}', 'stl.upg.slots.now': 'Pets on ranch: {a}',
        'stl.upg.maxed': 'Maxed out',
        'stl.food.title': 'Food', 'stl.food.pick': 'Who to feed', 'stl.food.exp': '+{n} EXP', 'stl.food.ageUp': 'Age {n}!',
        'stl.food.fed': '{name}: +{n} EXP', 'stl.food.none': 'No pets', 'stl.food.foods': 'Choose food',
        'stl.food.expLine': 'EXP {a} of {b}',
        'stl.gears.title': 'Gears', 'stl.gears.basket': 'Egg Basket', 'stl.gears.basketDesc': 'Basket size: {a} → {b}',
        'stl.gears.basketNow': 'Basket size: {a}', 'stl.gears.basketUp': 'Your basket now holds {n} eggs',
        'stl.gears.radars': 'Radars', 'stl.gears.restockIn': 'New stock in {t}', 'stl.gears.restockCash': 'Restock now',
        'stl.gears.restockAd': 'Restock: watch ad', 'stl.gears.restocked': 'Radar stock refreshed!',
        'stl.gears.stock': 'In stock: {a}/{b}', 'stl.gears.owned': 'Owned: {n}', 'stl.gears.soldOut': 'Sold out',
        'stl.gears.use': 'Use', 'stl.gears.auto': 'Auto-buy', 'stl.gears.autoOn': 'Auto-buy is on',
        'stl.gears.autoHint': 'Buys this radar on every stock refresh', 'stl.gears.finds': 'Finds: {list}',
        'stl.gears.autoBought': 'Auto-buy: {name} ×{n}', 'stl.gears.luckBelow': 'luck below', 'stl.gears.luckFrom': 'luck from',
        'stl.gears.intro': 'A radar finds the nearest egg of its kind; if there is none, an egg appears on the map.',
        'stl.radar.locked': 'Radar found: {name}', 'stl.radar.spawned': 'Radar revealed an egg: {name}!',
        'stl.radar.none': 'No radar: {name}', 'stl.radar.fail': 'Cannot find an egg right now',
        'stl.radar.lost': 'The egg is gone', 'stl.radar.cancel': 'Stop tracking',
        'stl.track.title': 'Eggs in the world', 'stl.track.wave': 'Next wave in {t}: ×{n}',
        'stl.track.none': 'No eggs in the world right now. Wait for the next wave!', 'stl.track.btn': 'Track',
        'stl.track.free': 'Free', 'stl.track.needs': 'Needs: {name}', 'stl.track.uses': 'Uses a radar: {name}, you have {n}',
        'stl.track.nearest': 'Nearest: {d}', 'stl.track.on': 'Tracking egg: {name}', 'stl.track.active': 'Tracking',
        'stl.track.night': 'Night only',
        'stl.sell.title': 'Sell Pets', 'stl.sell.btn': 'Sell', 'stl.sell.last': "You can't sell your last pet",
        'stl.sell.cantRide': "You can't sell the pet you are riding", 'stl.sell.confirmTitle': 'Sell this pet?',
        'stl.sell.confirmText': '{name} will be gone for good. You get {v}.', 'stl.sell.done': 'Sold {name} for {v}',
        'stl.sell.commons': 'Sell all commons', 'stl.sell.commonsTitle': 'Sell commons?',
        'stl.sell.commonsText': 'Sell {n} common pets for {v}? The ridden pet, ranch pets, mutated and HUGE pets stay.',
        'stl.sell.commonsNone': 'No common pets to sell', 'stl.sell.commonsDone': 'Sold {n} pets for {v}',
        'stl.sell.lastShort': 'Last pet', 'stl.sell.empty': 'No pets to sell', 'stl.sell.rate': 'Price: {n} seconds of income',
        'idx.btn': 'Index', 'idx.title': 'Index', 'idx.pets': 'Pets', 'idx.eggs': 'Eggs', 'idx.found': 'Found: {a}/{b}',
        'idx.chance': '1 in {n}', 'idx.best': 'Best weight: {v}', 'idx.unknown': '???', 'idx.claim': 'Claim',
        'idx.claimAll': 'Claim all: {n}', 'idx.claimed': 'Reward claimed!', 'idx.reward': 'Discovery reward',
        'idx.claimedNow': 'Reward: {cash} and {paws} paws', 'idx.hatch': 'Hatch: {t}', 'idx.new': 'New!', 'idx.noBest': 'Best weight: none',
        'reb.btn': 'Rebirth', 'reb.title': 'Rebirth', 'reb.sub': 'Cash and luck are reset',
        'reb.rewards': 'Rewards', 'reb.reqs': 'Requirements', 'reb.cashMult': 'Cash multiplier', 'reb.slot': 'Pet slot',
        'reb.base': 'New ranch base', 'reb.go': 'Rebirth', 'reb.skip': 'SKIP', 'reb.keep': 'Keep everything!',
        'reb.skipProgress': 'Watch ad {a}/{b}', 'reb.confirmTitle': 'Rebirth?',
        'reb.confirmText': 'Cash and luck level reset, and your {pet} is taken. In return: cash ×{m} and one more pet slot.',
        'reb.done': 'Rebirth {n}! Cash ×{m}', 'reb.doneSkip': 'Rebirth {n} — nothing lost! Cash ×{m}',
        'reb.max': 'You reached the last rebirth!', 'reb.count': 'Rebirths: {a}/{b}',
        'reb.slotCap': 'Pet slots: {a} → {b}', 'reb.cashNeed': 'Collect cash', 'reb.have': 'Owned', 'reb.missing': 'Missing', 'reb.notMet': 'Requirements not met',
        'reb.skipStep': 'Ad counted: {a} of {b}',
        'reb.base.1': 'Gold fence', 'reb.base.2': 'Silver-blue fence', 'reb.base.3': 'Emerald fence', 'reb.base.4': 'Ruby fence',
        'reb.base.5': 'Amethyst fence', 'reb.base.6': 'Obsidian fence', 'reb.base.7': 'Diamond fence',
        'esh.btn': 'Shop', 'esh.title': 'Shop', 'esh.dragon': 'Dragon Egg', 'esh.giant': 'Giant Egg',
        'esh.instant': 'Instant Hatch', 'esh.giantDesc': 'Hatches a random HUGE pet',
        'esh.dragonDesc': 'A chance to get the Dragon itself!', 'esh.odds': 'Odds', 'esh.oddsTitle': 'Giant Egg odds',
        'esh.oddsNote': 'The pet is always HUGE: income ×{m}, bigger weight and size.', 'esh.watch': 'Watch ad {a}/{b}',
        'esh.adNote': 'Rolls are given after the last ad. Progress is saved.', 'esh.progress': 'Ad counted: {a} of {b}',
        'esh.results': 'Results: ×{n}', 'esh.next': 'Next', 'esh.ride': 'Ride', 'esh.rideBest': 'Ride the best',
        'esh.best': 'BEST', 'esh.new': 'NEW!', 'esh.hint': 'Pets go straight to your collection', 'esh.giantBonus': 'Income ×{m}, weight ×{k}',
    },
});

/** Стили забора ранчо по числу перерождений: 0 — деревянный по умолчанию, 1 золото, 2 серебристо-синий, 3 изумруд, 4 рубин, 5 аметист, 6 обсидиан, 7 алмаз. */
const SHOPS_RANCH_BASES = [
    null,
    { id: 'gold', post: '#9a6a12', rail: '#ffd23f', cap: '#fff2a8' },
    { id: 'silver', post: '#56708c', rail: '#b4d2f2', cap: '#eef8ff' },
    { id: 'emerald', post: '#0c6236', rail: '#2fd47c', cap: '#b4ffd8' },
    { id: 'ruby', post: '#78101e', rail: '#e8284a', cap: '#ffa2b2' },
    { id: 'amethyst', post: '#46288a', rail: '#a35cff', cap: '#e4cbff' },
    { id: 'obsidian', post: '#14121c', rail: '#322c44', cap: '#9373ff' },
    { id: 'diamond', post: '#52d6f5', rail: '#f4fdff', cap: '#ff8ad8' },
];

const SHOPS_CSS = `
.sh-top{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--u)*10);flex-wrap:wrap;margin-bottom:calc(var(--u)*8)}
.sh-top .sub{font-size:calc(var(--u)*16);color:#7a5a38;font-weight:800}
.sh-sec{margin:calc(var(--u)*12) 0 calc(var(--u)*6);font-size:calc(var(--u)*20);font-weight:900;color:#6b3a17;display:flex;align-items:center;gap:calc(var(--u)*8)}
.sh-sec:first-child{margin-top:0}
.sh-sec .ico{width:calc(var(--u)*26);height:calc(var(--u)*26)}
.sh-note{font-size:calc(var(--u)*14.5);font-weight:800;color:#8a5a30;padding:calc(var(--u)*3) 0;line-height:1.25}
.sh-note.warn{color:#b0301f}
.sh-empty{padding:calc(var(--u)*16);text-align:center;color:#8a6a48;font-weight:800;font-size:calc(var(--u)*17)}
.sh-card{display:flex;align-items:center;gap:calc(var(--u)*12);padding:calc(var(--u)*10);border:calc(var(--u)*3) solid #7a4a22;border-radius:calc(var(--u)*14);background:rgba(255,250,228,.72);box-shadow:inset 0 calc(var(--u)*-3) 0 rgba(150,100,45,.2);min-width:0;margin-bottom:calc(var(--u)*8);flex-wrap:wrap}
.sh-card.ok{background:rgba(214,247,196,.78);border-color:#3f8a2a}
.sh-card.gold{background:rgba(255,236,150,.88);border-color:#c98a0a}
.sh-card.dim{opacity:.72}
.sh-ic{width:calc(var(--u)*62);height:calc(var(--u)*62);flex:none;display:flex;align-items:center;justify-content:center}
.sh-ic .ico{width:calc(var(--u)*46);height:calc(var(--u)*46);vertical-align:0}
.sh-main{flex:1 1 calc(var(--u)*170);min-width:0}
.sh-name{font-size:calc(var(--u)*20);font-weight:900;color:#5b3417;line-height:1.12;overflow-wrap:anywhere}
.sh-line{font-size:calc(var(--u)*15.5);font-weight:800;color:#6b4a28;line-height:1.28;display:flex;align-items:center;gap:calc(var(--u)*6);flex-wrap:wrap}
.sh-line .ico{width:calc(var(--u)*20);height:calc(var(--u)*20);vertical-align:0}
.sh-acts{display:flex;gap:calc(var(--u)*8);align-items:center;flex-wrap:wrap;justify-content:flex-end;flex:0 1 auto;max-width:100%;min-width:0}
.sh-acts .gb,.sh-card>.gb{font-size:calc(var(--u)*17);padding:calc(var(--u)*7) calc(var(--u)*14);border-radius:calc(var(--u)*12);-webkit-text-stroke:calc(var(--u)*4) #0d0602}
.sh-acts .gb .ico,.sh-card>.gb .ico{width:1.15em;height:1.15em;vertical-align:0}
.sh-max{font-size:calc(var(--u)*20);color:#2f9a24;font-weight:900;padding:calc(var(--u)*6) calc(var(--u)*12)}
.sh-bar{height:calc(var(--u)*13);border-radius:999px;background:#5b3417;border:calc(var(--u)*2.5) solid #1c0f06;overflow:hidden;margin-top:calc(var(--u)*5);position:relative}
.sh-bar i{display:block;height:100%;width:0;background:linear-gradient(#a4f27f,#43c431 60%,#2f9a24);transition:width .45s ease-out}
.sh-bar.t0 i{transition:none}
.sh-tag{display:inline-block;font-size:calc(var(--u)*12.5);font-weight:900;line-height:1.25;padding:calc(var(--u)*1) calc(var(--u)*8);border-radius:999px;border:calc(var(--u)*2) solid #120904;color:#fff;margin-left:calc(var(--u)*6);vertical-align:middle;-webkit-text-stroke:calc(var(--u)*2.5) #120904;paint-order:stroke fill;letter-spacing:.02em;white-space:nowrap}
.sh-tag.huge{background:linear-gradient(#ffb23d,#e8392f)}
.sh-tag.free{background:#43c431}
.sh-pic{--rc:#c8d0d8;position:relative;flex:none;border-radius:calc(var(--u)*14);border:calc(var(--u)*4) solid var(--rc);background:radial-gradient(circle at 50% 40%,#fffbea,#ffe9a8);display:flex;align-items:center;justify-content:center}
.sh-pic .pi{width:92%;height:92%}
.sh-pic.sil .pi,.sh-sil .pi{filter:brightness(0) opacity(.5)}
.sh-pic .age{position:absolute;right:calc(var(--u)*-5);bottom:calc(var(--u)*-6);min-width:calc(var(--u)*24);height:calc(var(--u)*22);padding:0 calc(var(--u)*5);border-radius:999px;background:#43c431;border:calc(var(--u)*2.5) solid #120904;font-size:calc(var(--u)*12.5);display:flex;align-items:center;justify-content:center;-webkit-text-stroke:calc(var(--u)*2.5) #120904;paint-order:stroke fill;color:#fff}
.sh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(calc(var(--u)*150),1fr));gap:calc(var(--u)*10)}
.sh-tile{--rc:#c8d0d8;position:relative;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*3);padding:calc(var(--u)*8) calc(var(--u)*6);border:calc(var(--u)*3) solid var(--rc);border-radius:calc(var(--u)*14);background:rgba(255,250,228,.72);box-shadow:inset 0 calc(var(--u)*-3) 0 rgba(150,100,45,.2);text-align:center;min-width:0}
.sh-tile .big{width:calc(var(--u)*84);height:calc(var(--u)*84);border-radius:50%;border:calc(var(--u)*4) solid var(--rc);background:radial-gradient(circle at 50% 40%,#fffbea,#ffe9a8);display:flex;align-items:center;justify-content:center}
.sh-tile .big .pi{width:88%;height:88%}
.sh-tile.sil .big .pi{filter:brightness(0) opacity(.5)}
.sh-tile .nm{font-size:calc(var(--u)*16.5);font-weight:900;color:#5b3417;line-height:1.1;overflow-wrap:anywhere}
.sh-tile .sm{font-size:calc(var(--u)*13.5);font-weight:800;color:#7a5a38;line-height:1.2}
.sh-tile .gb{font-size:calc(var(--u)*14.5);padding:calc(var(--u)*5) calc(var(--u)*10);border-radius:calc(var(--u)*10);margin-top:calc(var(--u)*2);-webkit-text-stroke:calc(var(--u)*3.5) #0d0602}
.sh-tile.gotit{background:rgba(255,236,150,.88)}
.sh-tile .rwd{display:flex;gap:calc(var(--u)*8);align-items:center;justify-content:center;font-size:calc(var(--u)*14);font-weight:900;color:#5b3417}
.sh-tile .rwd .ico{width:calc(var(--u)*18);height:calc(var(--u)*18);vertical-align:0}
.sh-tabs{display:flex;gap:calc(var(--u)*8);flex-wrap:wrap}
.sh-tabs .gb{font-size:calc(var(--u)*17);padding:calc(var(--u)*7) calc(var(--u)*16);border-radius:calc(var(--u)*12)}
.sh-tabs .gb.off{filter:grayscale(.75) brightness(.9);cursor:pointer}
.sh-pick{display:flex;flex-wrap:wrap;gap:calc(var(--u)*10);padding:calc(var(--u)*4) calc(var(--u)*2) calc(var(--u)*8)}
.sh-chip{--rc:#c8d0d8;position:relative;flex:none;width:calc(var(--u)*60);height:calc(var(--u)*60);padding:0;cursor:pointer;border:calc(var(--u)*3.5) solid var(--rc);border-radius:calc(var(--u)*13);background:radial-gradient(circle at 50% 40%,#fffbea,#ffe9a8);display:flex;align-items:center;justify-content:center;font-family:inherit}
.sh-chip .pi{width:90%;height:90%}
.sh-chip.sel{outline:calc(var(--u)*4) solid #ffd21f;outline-offset:calc(var(--u)*1.5);box-shadow:0 0 calc(var(--u)*12) #ffd21f}
.sh-chip .age{position:absolute;right:calc(var(--u)*-6);bottom:calc(var(--u)*-6);min-width:calc(var(--u)*24);height:calc(var(--u)*22);padding:0 calc(var(--u)*5);border-radius:999px;background:#43c431;border:calc(var(--u)*2.5) solid #120904;font-size:calc(var(--u)*12.5);display:flex;align-items:center;justify-content:center;-webkit-text-stroke:calc(var(--u)*2.5) #120904;paint-order:stroke fill;color:#fff;pointer-events:none}
.sh-chip .mk{position:absolute;left:calc(var(--u)*-5);top:calc(var(--u)*-6);width:calc(var(--u)*22);height:calc(var(--u)*22);border-radius:50%;background:#ffd21f;border:calc(var(--u)*2.5) solid #120904;display:flex;align-items:center;justify-content:center;pointer-events:none}
.sh-chip .mk .ico{width:calc(var(--u)*14);height:calc(var(--u)*14);vertical-align:0}
.sh-feedcard{position:relative;display:flex;align-items:center;gap:calc(var(--u)*14);padding:calc(var(--u)*12);border:calc(var(--u)*3) solid #c98a0a;border-radius:calc(var(--u)*14);background:rgba(255,236,150,.88);flex-wrap:wrap;margin-bottom:calc(var(--u)*8);overflow:hidden}
.sh-feedcard .sh-pic{width:calc(var(--u)*92);height:calc(var(--u)*92)}
.sh-feedcard .sh-main{flex:1 1 calc(var(--u)*200)}
.sh-agepop{position:absolute;left:50%;top:calc(var(--u)*6);transform:translateX(-50%);padding:calc(var(--u)*4) calc(var(--u)*16);border-radius:999px;background:linear-gradient(#a4f27f,#43c431);border:calc(var(--u)*3.5) solid #120904;font-size:calc(var(--u)*22);color:#fff;-webkit-text-stroke:calc(var(--u)*4.5) #0d0602;paint-order:stroke fill;pointer-events:none;animation:shagepop 1.5s ease-out forwards;z-index:3;white-space:nowrap}
@keyframes shagepop{0%{transform:translateX(-50%) scale(.4);opacity:0}18%{transform:translateX(-50%) scale(1.18);opacity:1}30%{transform:translateX(-50%) scale(1)}80%{opacity:1}100%{transform:translateX(-50%) translateY(calc(var(--u)*-16)) scale(1);opacity:0}}
.sh-glow{animation:shglow .9s ease-out}
@keyframes shglow{0%{box-shadow:0 0 0 rgba(255,230,90,0)}30%{box-shadow:0 0 calc(var(--u)*26) calc(var(--u)*6) rgba(255,230,90,.95)}100%{box-shadow:0 0 0 rgba(255,230,90,0)}}
.sh-food{display:flex;align-items:center;gap:calc(var(--u)*10);padding:calc(var(--u)*8) calc(var(--u)*4);border-bottom:calc(var(--u)*2) dashed rgba(120,80,40,.3);flex-wrap:wrap}
.sh-food:last-child{border-bottom:0}
.sh-food .sh-main{flex:1 1 calc(var(--u)*150)}
.sh-food .buy{display:flex;gap:calc(var(--u)*6);flex:none;flex-wrap:wrap;justify-content:flex-end}
.sh-qb{flex-direction:column;gap:0;min-width:calc(var(--u)*72);padding:calc(var(--u)*5) calc(var(--u)*8)!important;line-height:1.05}
.sh-qb b{font-size:calc(var(--u)*17);font-weight:900}
.sh-qb span{font-size:calc(var(--u)*13)}
.sh-rad{--rc:#c8d0d8;width:calc(var(--u)*62);height:calc(var(--u)*62);flex:none;border-radius:50%;border:calc(var(--u)*4) solid var(--rc);background:radial-gradient(circle at 50% 35%,#fffbea,#ffe9a8);display:flex;align-items:center;justify-content:center;box-shadow:0 0 calc(var(--u)*10) var(--rc)}
.sh-rad .ico{width:calc(var(--u)*40);height:calc(var(--u)*40);vertical-align:0}
.sh-auto{display:inline-flex;align-items:center;gap:calc(var(--u)*6);cursor:pointer;font-size:calc(var(--u)*14.5);font-weight:900;color:#5b3417;padding:calc(var(--u)*3) calc(var(--u)*4);background:none;border:0;font-family:inherit}
.sh-auto i{width:calc(var(--u)*40);height:calc(var(--u)*22);border-radius:999px;background:#8a7a68;border:calc(var(--u)*2.5) solid #1c0f06;position:relative;transition:background .15s;flex:none}
.sh-auto i::after{content:'';position:absolute;left:calc(var(--u)*2);top:calc(var(--u)*2);width:calc(var(--u)*13);height:calc(var(--u)*13);border-radius:50%;background:#fff;border:calc(var(--u)*1.5) solid #1c0f06;transition:left .15s}
.sh-auto.on i{background:#43c431}
.sh-auto.on i::after{left:calc(var(--u)*19)}
.sh-timer{display:flex;align-items:center;gap:calc(var(--u)*8);font-size:calc(var(--u)*18);font-weight:900;color:#5b3417}
.sh-timer .ico{width:calc(var(--u)*26);height:calc(var(--u)*26);vertical-align:0}
.sh-egg{flex:none}
.sh-trackbtn{flex-direction:column;gap:0;min-width:calc(var(--u)*110)}
.sh-trackbtn small{font-size:calc(var(--u)*11.5);font-weight:800;opacity:.95;-webkit-text-stroke:calc(var(--u)*3) #0d0602;line-height:1.1;white-space:normal;text-align:center}
.rb-sub{text-align:center;font-size:calc(var(--u)*19);color:#7a5a38;margin:0 0 calc(var(--u)*4)}
.rb-count{text-align:center;font-size:calc(var(--u)*14.5);color:#9a7a58;margin-bottom:calc(var(--u)*6)}
.rb-sec{margin:calc(var(--u)*10) 0 calc(var(--u)*6);font-size:calc(var(--u)*22);font-weight:900;color:#6b3a17;text-align:center}
.rb-row{display:flex;gap:calc(var(--u)*10);flex-wrap:wrap;justify-content:center}
.rb-box{flex:1 1 calc(var(--u)*150);max-width:calc(var(--u)*260);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--u)*4);padding:calc(var(--u)*10) calc(var(--u)*8);border:calc(var(--u)*3) solid #7a4a22;border-radius:calc(var(--u)*14);background:rgba(255,250,228,.72);box-shadow:inset 0 calc(var(--u)*-3) 0 rgba(150,100,45,.2);text-align:center;min-height:calc(var(--u)*118)}
.rb-box .big{display:flex;align-items:center;justify-content:center;gap:calc(var(--u)*8);font-size:calc(var(--u)*30);font-weight:900;line-height:1}
.rb-box .big .ico{width:calc(var(--u)*50);height:calc(var(--u)*50);vertical-align:0}
.rb-box .cap{font-size:calc(var(--u)*15);font-weight:800;color:#6b4a28;line-height:1.15}
.rb-req .cap{font-size:calc(var(--u)*15);font-weight:800;color:#6b4a28;line-height:1.15}
.rb-arrow{display:inline-block;width:calc(var(--u)*13);height:calc(var(--u)*13);border-top:calc(var(--u)*5) solid #3f8a2a;border-right:calc(var(--u)*5) solid #3f8a2a;transform:rotate(45deg);margin:0 calc(var(--u)*4)}
.rb-fence{position:relative;width:calc(var(--u)*118);height:calc(var(--u)*54)}
.rb-fence u{position:absolute;bottom:0;width:calc(var(--u)*13);height:calc(var(--u)*50);border-radius:calc(var(--u)*3);border:calc(var(--u)*2.5) solid #1c0f06;text-decoration:none}
.rb-fence u::after{content:'';position:absolute;left:calc(var(--u)*-2.5);right:calc(var(--u)*-2.5);top:calc(var(--u)*-6);height:calc(var(--u)*9);border-radius:calc(var(--u)*3);background:var(--cap);border:calc(var(--u)*2.5) solid #1c0f06}
.rb-fence s{position:absolute;left:0;right:0;height:calc(var(--u)*8);border:calc(var(--u)*2.5) solid #1c0f06;border-radius:calc(var(--u)*3);text-decoration:none}
.rb-req{display:flex;flex-direction:column;align-items:stretch;gap:calc(var(--u)*6);flex:1 1 calc(var(--u)*220);max-width:calc(var(--u)*330);padding:calc(var(--u)*10);border:calc(var(--u)*3) solid #7a4a22;border-radius:calc(var(--u)*14);background:rgba(255,250,228,.72);box-shadow:inset 0 calc(var(--u)*-3) 0 rgba(150,100,45,.2);text-align:center;justify-content:center}
.rb-req.met{border-color:#3f8a2a;background:rgba(214,247,196,.78)}
.rb-prog{position:relative;height:calc(var(--u)*34);border-radius:999px;background:#3f2410;border:calc(var(--u)*3) solid #1c0f06;overflow:hidden}
.rb-prog i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(#a4f27f,#43c431 60%,#2f9a24);transition:width .4s}
.rb-prog>span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:calc(var(--u)*6);font-size:calc(var(--u)*19);color:#fff;-webkit-text-stroke:calc(var(--u)*4) #0d0602;paint-order:stroke fill}
.rb-prog>span .ico{width:calc(var(--u)*24);height:calc(var(--u)*24);vertical-align:0}
.rb-petbox{display:flex;align-items:center;justify-content:center;gap:calc(var(--u)*10)}
.rb-petbox .sh-pic{width:calc(var(--u)*84);height:calc(var(--u)*84)}
.rb-petbox .sh-pic.has{box-shadow:0 0 calc(var(--u)*14) rgba(67,196,49,.9)}
.rb-ok{width:calc(var(--u)*34);height:calc(var(--u)*34);border-radius:50%;display:flex;align-items:center;justify-content:center;border:calc(var(--u)*3) solid #120904;background:#43c431}
.rb-ok.no{background:#e8392f}
.rb-ok .ico{width:calc(var(--u)*20);height:calc(var(--u)*20);vertical-align:0}
.rb-btns{display:flex;gap:calc(var(--u)*14);justify-content:center;flex-wrap:wrap;margin-top:calc(var(--u)*10);align-items:stretch;position:sticky;bottom:calc(var(--u)*-12);padding:calc(var(--u)*10) 0 calc(var(--u)*8);z-index:2;background:linear-gradient(rgba(255,241,200,0),#fff1c8 22%)}
.rb-go{font-size:calc(var(--u)*28)!important;padding:calc(var(--u)*12) calc(var(--u)*34)!important}
.rb-skip{flex-direction:column;gap:calc(var(--u)*1);padding:calc(var(--u)*9) calc(var(--u)*26)!important;min-width:calc(var(--u)*230)}
.rb-skip b{font-size:calc(var(--u)*26);font-weight:900;line-height:1}
.rb-skip em{font-style:normal;font-size:calc(var(--u)*16);line-height:1.1}
.rb-skip small{font-size:calc(var(--u)*13.5);line-height:1.1;opacity:.95;display:flex;align-items:center;gap:calc(var(--u)*5)}
.rb-skip small .ico{width:calc(var(--u)*16);height:calc(var(--u)*16);vertical-align:0}
.es-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(calc(var(--u)*420),1fr));gap:calc(var(--u)*14)}
.es-card{border:calc(var(--u)*4) solid #1c0f06;border-radius:calc(var(--u)*16);background:radial-gradient(ellipse at 50% 20%,#fff7da,#fbe5a8 70%,#efd08a);box-shadow:inset 0 0 0 calc(var(--u)*3) rgba(150,100,45,.3),0 calc(var(--u)*4) 0 rgba(0,0,0,.25);overflow:hidden;min-width:0}
.es-head{display:flex;align-items:center;justify-content:center;gap:calc(var(--u)*10);flex-wrap:wrap;padding:calc(var(--u)*7) calc(var(--u)*10);background:linear-gradient(#92592a,#7b4a24 45%,#5b3417);border-bottom:calc(var(--u)*4) solid #1c0f06;box-shadow:inset 0 calc(var(--u)*2.5) 0 rgba(255,225,170,.4)}
.es-head b{font-size:calc(var(--u)*25);font-weight:900;line-height:1}
.es-pill{padding:calc(var(--u)*2) calc(var(--u)*12);border-radius:999px;background:linear-gradient(#82ee62,#2b9620);border:calc(var(--u)*3) solid #120904;font-size:calc(var(--u)*14.5);-webkit-text-stroke:calc(var(--u)*3.5) #0d0602;paint-order:stroke fill;color:#fff;white-space:nowrap}
.es-body{display:flex;gap:calc(var(--u)*10);padding:calc(var(--u)*10);align-items:center;flex-wrap:wrap;justify-content:center}
.es-art{position:relative;flex:none;width:calc(var(--u)*132);display:flex;flex-direction:column;align-items:center}
.es-art img{width:100%;height:auto;display:block;filter:drop-shadow(0 calc(var(--u)*4) calc(var(--u)*5) rgba(0,0,0,.35));animation:esfloat 2.6s ease-in-out infinite}
@keyframes esfloat{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(calc(var(--u)*-6)) rotate(1.5deg)}}
.es-art .sh-tag{position:absolute;right:calc(var(--u)*-6);top:calc(var(--u)*4);margin:0;transform:rotate(10deg);font-size:calc(var(--u)*16);padding:calc(var(--u)*2) calc(var(--u)*10)}
.es-info{flex:1 1 calc(var(--u)*200);min-width:0;display:flex;flex-direction:column;gap:calc(var(--u)*6)}
.es-desc{font-size:calc(var(--u)*17);font-weight:900;color:#5b3417;line-height:1.2;display:flex;align-items:center;gap:calc(var(--u)*8)}
.es-tiles{display:flex;gap:calc(var(--u)*6);flex-wrap:wrap;align-items:flex-end}
.es-tile{--rc:#c8d0d8;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1);width:calc(var(--u)*78);padding:calc(var(--u)*4) calc(var(--u)*2) calc(var(--u)*3);border:calc(var(--u)*3) solid var(--rc);border-radius:calc(var(--u)*12);background:radial-gradient(circle at 50% 40%,#fffbea,#ffe9a8);box-shadow:inset 0 calc(var(--u)*-3) 0 rgba(150,100,45,.2);min-width:0}
.es-tile .pi{width:calc(var(--u)*50);height:calc(var(--u)*50)}
.es-tile b{font-size:calc(var(--u)*15);font-weight:900;color:#5b3417;line-height:1}
.es-tile span{font-size:calc(var(--u)*11);font-weight:800;color:#7a5a38;line-height:1.05;text-align:center;overflow-wrap:break-word;hyphens:auto;max-width:100%}
.es-tile.hl{width:calc(var(--u)*96);border-color:#ffc21f;background:radial-gradient(circle at 50% 40%,#fffbea,#ffd75a);box-shadow:0 0 calc(var(--u)*14) #ffb800,inset 0 calc(var(--u)*-3) 0 rgba(150,100,45,.2);animation:glow 1.3s ease-in-out infinite alternate}
.es-tile.hl .pi{width:calc(var(--u)*66);height:calc(var(--u)*66)}
.es-tile.hl b{font-size:calc(var(--u)*17)}
.es-tile.sil .pi{filter:brightness(0) opacity(.5)}
.es-bund{display:grid;grid-template-columns:repeat(auto-fit,minmax(calc(var(--u)*88),1fr));gap:calc(var(--u)*8);padding:0 calc(var(--u)*10) calc(var(--u)*10)}
.es-b{flex-direction:column;gap:calc(var(--u)*3);padding:calc(var(--u)*7) calc(var(--u)*6)!important;line-height:1.05;white-space:normal!important;text-align:center;overflow:hidden}
.es-b b{font-size:calc(var(--u)*25);font-weight:900;line-height:1;display:flex;align-items:center;gap:calc(var(--u)*5)}
.es-b b .ico{width:calc(var(--u)*24);height:calc(var(--u)*24);vertical-align:0}
.es-b small{font-size:calc(var(--u)*13);line-height:1.05;opacity:.97;-webkit-text-stroke:calc(var(--u)*3) #0d0602}
.es-b .pg{position:relative;z-index:1;width:88%;height:calc(var(--u)*8);border-radius:999px;background:rgba(0,0,0,.45);border:calc(var(--u)*1.5) solid rgba(0,0,0,.7);overflow:hidden}
.es-b .pg i{display:block;height:100%;background:linear-gradient(#fff6a8,#ffd21f)}
.es-q{flex:none;width:calc(var(--u)*34);height:calc(var(--u)*34);padding:0!important;font-size:calc(var(--u)*22)!important;border-radius:50%!important}
.es-shake{animation:esshake 1.05s ease-in-out both}
@keyframes esshake{0%{transform:rotate(0) scale(.9)}12%{transform:rotate(-9deg) scale(1)}24%{transform:rotate(9deg)}36%{transform:rotate(-12deg)}48%{transform:rotate(12deg)}60%{transform:rotate(-14deg) scale(1.05)}72%{transform:rotate(14deg) scale(1.08)}86%{transform:rotate(-8deg) scale(1.12)}100%{transform:rotate(0) scale(1.18)}}
.es-pop{animation:espop .5s cubic-bezier(.2,1.6,.4,1) both}
@keyframes espop{from{transform:scale(.15) rotate(-14deg);opacity:0}to{transform:none;opacity:1}}
.es-tile2{--rc:#c8d0d8;position:relative;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*2);padding:calc(var(--u)*7) calc(var(--u)*4) calc(var(--u)*6);border:calc(var(--u)*3) solid var(--rc);border-radius:calc(var(--u)*13);background:rgba(255,250,228,.8);box-shadow:inset 0 calc(var(--u)*-3) 0 rgba(150,100,45,.2);text-align:center;min-width:0}
.es-tile2 .pi{width:calc(var(--u)*58);height:calc(var(--u)*58)}
.es-tile2 .nm{font-size:calc(var(--u)*14.5);font-weight:900;color:#5b3417;line-height:1.05;overflow-wrap:anywhere}
.es-tile2 .ct{position:absolute;right:calc(var(--u)*-6);top:calc(var(--u)*-8);min-width:calc(var(--u)*30);height:calc(var(--u)*24);padding:0 calc(var(--u)*6);border-radius:999px;background:linear-gradient(#ffb23d,#e8872f);border:calc(var(--u)*2.5) solid #120904;font-size:calc(var(--u)*15);display:flex;align-items:center;justify-content:center;-webkit-text-stroke:calc(var(--u)*3) #120904;paint-order:stroke fill;color:#fff}
.es-tile2 .sh-tag{margin:0;font-size:calc(var(--u)*11)}
.es-tile2 .sm{font-size:calc(var(--u)*13.5);font-weight:800;color:#7a5a38;line-height:1.1}
.es-tile2.best{border-color:#ffc21f;background:rgba(255,236,150,.95);box-shadow:0 0 calc(var(--u)*16) #ffb800,inset 0 calc(var(--u)*-3) 0 rgba(150,100,45,.2)}
.es-tile2 .bst{position:absolute;left:50%;top:calc(var(--u)*-11);transform:translateX(-50%);padding:calc(var(--u)*1) calc(var(--u)*9);border-radius:999px;background:linear-gradient(#ffe97a,#ffb800);border:calc(var(--u)*2.5) solid #120904;font-size:calc(var(--u)*12.5);-webkit-text-stroke:calc(var(--u)*3) #120904;paint-order:stroke fill;color:#fff;white-space:nowrap}
.es-res{display:grid;grid-template-columns:repeat(auto-fill,minmax(calc(var(--u)*104),1fr));gap:calc(var(--u)*14) calc(var(--u)*10);padding:calc(var(--u)*10) calc(var(--u)*2) calc(var(--u)*6)}
.es-odds{display:grid;grid-template-columns:repeat(auto-fill,minmax(calc(var(--u)*104),1fr));gap:calc(var(--u)*8)}
.sh-chiphud{display:none;align-items:center;gap:calc(var(--u)*8);padding:calc(var(--u)*4) calc(var(--u)*6) calc(var(--u)*4) calc(var(--u)*12);border-radius:999px;font-size:calc(var(--u)*17);line-height:1.1;max-width:100%;pointer-events:none}
.sh-chiphud.on{display:flex;animation:signpop .3s cubic-bezier(.2,1.6,.4,1)}
.sh-chiphud .ico{width:calc(var(--u)*28);height:calc(var(--u)*28);flex:none}
.sh-chiphud .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(var(--u)*190)}
.sh-chiphud .ds{color:#9cff7a;white-space:nowrap}
.sh-chiphud .gb{width:calc(var(--u)*30);height:calc(var(--u)*30);padding:0;border-radius:50%;font-size:calc(var(--u)*17);flex:none;pointer-events:auto}
#game-ui .sbtn.sh-long{padding:0}
#game-ui .sbtn.sh-long .lb{font-size:calc(var(--u)*10.5);letter-spacing:-.02em;white-space:nowrap}

#game-ui.compact .sbtn.sh-long .lb{font-size:calc(var(--u)*9)}
#game-ui.compact .sh-chiphud{font-size:calc(var(--u)*15)}
#game-ui.compact .sh-chiphud .nm{max-width:calc(var(--u)*130)}
#game-ui.short .sh-chiphud{padding:calc(var(--u)*2) calc(var(--u)*5) calc(var(--u)*2) calc(var(--u)*10)}
#game-ui.short .rb-box{min-height:calc(var(--u)*80)}
#game-ui.short .rb-btns{margin-top:calc(var(--u)*4);gap:calc(var(--u)*10)}
#game-ui.short .rb-sub{font-size:calc(var(--u)*16)}
#game-ui.short .rb-sec{margin:calc(var(--u)*4) 0 calc(var(--u)*4);font-size:calc(var(--u)*18)}
#game-ui.short .rb-box .big{font-size:calc(var(--u)*24)}
#game-ui.short .rb-box .big .ico{width:calc(var(--u)*36);height:calc(var(--u)*36)}
#game-ui.short .rb-petbox .sh-pic{width:calc(var(--u)*62);height:calc(var(--u)*62)}
#game-ui.short .rb-go{font-size:calc(var(--u)*22)!important;padding:calc(var(--u)*8) calc(var(--u)*24)!important}
#game-ui.short .rb-skip{padding:calc(var(--u)*6) calc(var(--u)*18)!important}
#game-ui.short .rb-skip b{font-size:calc(var(--u)*21)}
`;

/** @satisfies {Record<string, any>} */
const Shops = (() => {
    const U = 'undefined';
    const t = (key, p) => Lang.t(key, p);
    const E = (tag, props, ...kids) => GameUtil.el(tag, props, ...kids);
    const esc = (s) => GameUtil.esc(s);
    const money = (n) => GameUtil.fmtMoney(n);
    const S = () => GameState.state;
    const ranchOf = () => (typeof Ranch !== U ? Ranch : null);
    const eggsOf = () => (typeof Eggs !== U ? Eggs : null);
    const playerOf = () => (typeof Player !== U ? Player : null);
    const cfg = () => ({
        restock: typeof GEARS_RESTOCK_SECONDS !== U ? GEARS_RESTOCK_SECONDS : GameData.RADAR_RESTOCK_SECONDS,
        indexSecs: typeof INDEX_REWARD_SECONDS !== U ? INDEX_REWARD_SECONDS : 120,
        indexPaws: typeof INDEX_REWARD_PAWS_MULT !== U ? INDEX_REWARD_PAWS_MULT : 2,
        skipViews: typeof REBIRTH_SKIP_VIEWS !== U ? REBIRTH_SKIP_VIEWS : 5,
        waveCount: typeof EGG_WAVE_COUNT !== U ? EGG_WAVE_COUNT : 10,
    });
    const radarDef = (id) => GameData.RADARS.find(r => r.id === id) || null;
    const rarityRank = (pet) => GameData.RARITY[GameData.PETS[pet.species].rarity].rank;
    const petImg = (species) => '<img class="pi" alt="" src="' + GameUI.petIconUrl(species) + '">';
    /** Квадратная рамка с иконкой питомца: цвет рамки — редкость; age — значок возраста. */
    const petPic = (pet, size, withAge, silhouette, extra) => {
        const d = GameData.PETS[pet.species];
        return '<div class="sh-pic' + (silhouette ? ' sil' : '') + (extra ? ' ' + extra : '') + '" style="--rc:' + GameData.rarityColor(d.rarity) + ';width:calc(var(--u)*' + size + ');height:calc(var(--u)*' + size + ')">' +
            petImg(pet.species) + (withAge ? '<span class="age">' + pet.age + '</span>' : '') + '</div>';
    };
    /** Метки питомца: ОГРОМНЫЙ и мутация. */
    const petTags = (pet) => (pet.huge ? '<span class="sh-tag huge">' + esc(t('huge.tag')) + '</span>' : '') +
        (pet.mutation ? '<span class="sh-tag" style="background:' + GameData.MUTATIONS[pet.mutation].color + '">' + esc(GameData.mutationName(pet.mutation)) + '</span>' : '');
    const tierTag = (tier) => '<span class="sh-tag" style="background:' + GameData.tierColor(tier) + '">' + esc(GameData.tierName(tier)) + '</span>';
    const money$ = (cost) => GameUI.icon('banknote') + '<span>' + esc(money(cost)) + '</span>';
    const metres = (px) => t('stl.dist', { n: GameUtil.fmt(Math.round(px / 100)) });
    /** Лучший из результатов магазина: самый редкий вид, при равенстве — больший доход. */
    const bestOf = (list) => list.reduce((a, b) => {
        const ca = GameData.PETS[a.species].chance, cb = GameData.PETS[b.species].chance;
        return cb > ca || (cb === ca && GameState.petIncome(b.pet) > GameState.petIncome(a.pet)) ? b : a;
    });

    // --- Картинки яиц магазина (процедурный canvas, один раз) -----------------------------------------
    /** @type {Record<string, string>} */
    const ART = {};
    function eggPath(g, cx, cy, rx, ry) {
        g.beginPath();
        g.moveTo(cx, cy - ry);
        g.bezierCurveTo(cx + rx * 0.62, cy - ry, cx + rx, cy - ry * 0.12, cx + rx, cy + ry * 0.22);
        g.bezierCurveTo(cx + rx, cy + ry * 0.74, cx + rx * 0.55, cy + ry, cx, cy + ry);
        g.bezierCurveTo(cx - rx * 0.55, cy + ry, cx - rx, cy + ry * 0.74, cx - rx, cy + ry * 0.22);
        g.bezierCurveTo(cx - rx, cy - ry * 0.12, cx - rx * 0.62, cy - ry, cx, cy - ry);
        g.closePath();
    }
    function drawHorn(g, cx, topY, side) {
        g.save();
        g.translate(cx, topY + 6);
        g.scale(side, 1);
        g.beginPath();
        g.moveTo(-12, 30);
        g.bezierCurveTo(-34, 18, -52, -4, -56, -44);
        g.bezierCurveTo(-38, -26, -20, -8, 2, 4);
        g.closePath();
        const gr = g.createLinearGradient(-54, -44, -8, 24);
        gr.addColorStop(0, '#fff6d8'); gr.addColorStop(0.5, '#dcb872'); gr.addColorStop(1, '#8a5a28');
        g.fillStyle = gr; g.fill();
        g.lineWidth = 5; g.strokeStyle = '#2a1608'; g.lineJoin = 'round'; g.stroke();
        g.lineWidth = 2.2; g.strokeStyle = 'rgba(70,40,10,.55)'; g.lineCap = 'round';
        for (const k of [0.3, 0.52, 0.74]) {
            const px = -56 + (1 - k) * 42, py = -44 + k * 56;
            g.beginPath(); g.moveTo(px - 4, py + 8); g.quadraticCurveTo(px + 6, py + 2, px + 14, py + 8); g.stroke();
        }
        g.restore();
    }
    function drawDragonEgg(g, W, H) {
        const cx = W / 2, cy = 174, rx = 84, ry = 110;
        let gr = g.createRadialGradient(cx, cy + 10, 20, cx, cy + 10, 150);
        gr.addColorStop(0, 'rgba(255,170,60,.6)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(cx, 286, 72, 11, 0, 0, Math.PI * 2); g.fill();
        eggPath(g, cx, cy, rx, ry);
        gr = g.createRadialGradient(cx - 28, cy - 46, 8, cx - 10, cy - 10, 150);
        gr.addColorStop(0, '#ffc15a'); gr.addColorStop(0.35, '#ff7a2d'); gr.addColorStop(0.7, '#d93a10'); gr.addColorStop(1, '#7a1304');
        g.fillStyle = gr; g.fill();
        g.save();
        g.clip();
        const rnd = GameUtil.rng('dragon-egg-art');
        for (let row = 12; row >= 0; row--) {
            const y = cy - ry + 8 + row * 19;
            for (let col = -1; col < 9; col++) {
                const x = cx - rx + (col + (row % 2) * 0.5) * 24 + 6;
                const light = Math.max(0, 1 - Math.hypot((x - (cx - 30)) / 130, (y - (cy - 60)) / 150));
                g.fillStyle = 'hsl(' + (10 + light * 24 + rnd() * 6).toFixed(0) + ',92%,' + (27 + light * 30 + rnd() * 5).toFixed(0) + '%)';
                g.beginPath(); g.arc(x, y, 13.5, 0, Math.PI * 2); g.fill();
                g.lineWidth = 2.4; g.strokeStyle = 'rgba(60,6,0,.7)'; g.stroke();
                g.fillStyle = 'rgba(255,225,150,' + (0.08 + light * 0.28).toFixed(2) + ')';
                g.beginPath(); g.arc(x, y - 1, 8, Math.PI * 1.1, Math.PI * 1.9); g.fill();
            }
        }
        gr = g.createRadialGradient(cx - 20, cy - 30, 60, cx, cy, 132);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,0,0,.62)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.lineCap = 'round'; g.lineJoin = 'round';
        const crack = [[cx + 6, cy - 72], [cx + 26, cy - 46], [cx + 10, cy - 22], [cx + 34, cy + 6], [cx + 20, cy + 34]];
        g.shadowColor = '#ffd45a'; g.shadowBlur = 10;
        g.strokeStyle = '#ffe27a'; g.lineWidth = 3.4;
        g.beginPath(); crack.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,255,255,.3)';
        g.beginPath(); g.ellipse(cx - 36, cy - 62, 13, 30, -0.45, 0, Math.PI * 2); g.fill();
        g.restore();
        eggPath(g, cx, cy, rx, ry);
        g.lineWidth = 6; g.lineJoin = 'round'; g.strokeStyle = '#2a0802'; g.stroke();
        drawHorn(g, cx - 22, cy - ry, 1);
        drawHorn(g, cx + 22, cy - ry, -1);
        g.fillStyle = '#ffd45a';
        for (const [x, y, r] of [[28, 120, 3], [208, 96, 3.5], [40, 220, 2.5], [200, 230, 3], [214, 160, 2.5]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    }
    function drawGiantEgg(g, W, H) {
        const cx = W / 2, cy = 178, rx = 94, ry = 116;
        g.save();
        g.translate(cx, cy);
        for (let i = 0; i < 12; i++) {
            g.rotate(Math.PI / 6);
            const gr = g.createLinearGradient(0, 0, 0, -150);
            gr.addColorStop(0, 'rgba(255,214,70,.5)'); gr.addColorStop(1, 'rgba(255,214,70,0)');
            g.fillStyle = gr;
            g.beginPath(); g.moveTo(-9, 0); g.lineTo(0, -150); g.lineTo(9, 0); g.closePath(); g.fill();
        }
        g.restore();
        g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(cx, 292, 78, 11, 0, 0, Math.PI * 2); g.fill();
        eggPath(g, cx, cy, rx, ry);
        let gr = g.createRadialGradient(cx - 30, cy - 50, 8, cx - 8, cy - 8, 160);
        gr.addColorStop(0, '#e2fbff'); gr.addColorStop(0.35, '#7fd8ff'); gr.addColorStop(0.72, '#4a82f0'); gr.addColorStop(1, '#2a2698');
        g.fillStyle = gr; g.fill();
        g.save();
        g.clip();
        g.lineCap = 'round';
        for (const y0 of [cy - 54, cy + 6, cy + 64]) {
            const band = (w, col) => {
                g.lineWidth = w; g.strokeStyle = col;
                g.beginPath(); g.moveTo(cx - rx - 8, y0); g.quadraticCurveTo(cx, y0 + 30, cx + rx + 8, y0); g.stroke();
            };
            band(22, '#3a2208'); band(15, '#ffc21f'); band(5, '#fff3a0');
        }
        for (const [x, y, s] of [[cx - 44, cy - 20, 8], [cx + 40, cy + 34, 9], [cx - 10, cy + 100, 7], [cx + 52, cy - 62, 7], [cx - 56, cy + 62, 6]]) {
            g.fillStyle = '#ffffff';
            g.beginPath(); g.moveTo(x, y - s * 1.6); g.lineTo(x + s * 0.4, y - s * 0.4); g.lineTo(x + s * 1.6, y); g.lineTo(x + s * 0.4, y + s * 0.4);
            g.lineTo(x, y + s * 1.6); g.lineTo(x - s * 0.4, y + s * 0.4); g.lineTo(x - s * 1.6, y); g.lineTo(x - s * 0.4, y - s * 0.4); g.closePath(); g.fill();
        }
        gr = g.createRadialGradient(cx - 20, cy - 30, 60, cx, cy, 138);
        gr.addColorStop(0, 'rgba(0,0,40,0)'); gr.addColorStop(1, 'rgba(10,0,60,.5)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.beginPath(); g.ellipse(cx - 38, cy - 66, 14, 32, -0.45, 0, Math.PI * 2); g.fill();
        g.restore();
        eggPath(g, cx, cy, rx, ry);
        g.lineWidth = 6; g.lineJoin = 'round'; g.strokeStyle = '#120a3a'; g.stroke();
        // золотая корона на макушке
        const by = cy - ry + 26;
        g.beginPath();
        g.moveTo(cx - 38, by); g.lineTo(cx - 40, by - 30); g.lineTo(cx - 20, by - 14); g.lineTo(cx, by - 38); g.lineTo(cx + 20, by - 14); g.lineTo(cx + 40, by - 30); g.lineTo(cx + 38, by); g.closePath();
        gr = g.createLinearGradient(cx, by - 38, cx, by);
        gr.addColorStop(0, '#fff3a0'); gr.addColorStop(0.5, '#ffc21f'); gr.addColorStop(1, '#c97d00');
        g.fillStyle = gr; g.fill();
        g.lineWidth = 4.5; g.strokeStyle = '#3a2208'; g.stroke();
        for (const [x, c] of [[cx - 20, '#ff4f7a'], [cx, '#4fd0ff'], [cx + 20, '#ff4f7a']]) { g.fillStyle = c; g.beginPath(); g.arc(x, by - 9, 5, 0, Math.PI * 2); g.fill(); g.lineWidth = 2; g.strokeStyle = '#3a2208'; g.stroke(); }
    }
    /** dataURL картинки яйца магазина: 'dragon' | 'giant'. */
    /** @type {Record<string, string>} */
    const SHOP_EGG_FILES = {
        dragon: 'assets/ui/shop/egg-dragon.webp', giant: 'assets/ui/shop/egg-giant.webp',
    };
    function eggArt(kind) {
        return GameUI.artUrl(SHOP_EGG_FILES[kind], () => canvasEggArt(kind));
    }
    function canvasEggArt(kind) {
        if (ART[kind]) return ART[kind];
        const W = 240, H = 300;
        const cv = /** @type {HTMLCanvasElement} */ (document.createElement('canvas'));
        cv.width = W; cv.height = H;
        const g = cv.getContext('2d');
        if (kind === 'giant') drawGiantEgg(g, W, H); else drawDragonEgg(g, W, H);
        ART[kind] = cv.toDataURL('image/png');
        return ART[kind];
    }

    // --- Панель из частей: каждая часть перерисовывается по своей подписи sig, остальное не трогаем -----------------
    /**
     * @param {{ id: string, title: string, wide?: boolean, width?: string, cls?: string, ms?: number, parts: { key: string, sig?: (ctx: any) => string, render: (box: HTMLElement, ctx: any, part: any) => void }[], tick?: (ctx: any) => void, onClose?: (ctx: any) => void }} o
     */
    function openPanelEx(o) {
        if (GameUI.isPanelOpen(o.id)) { GameUI.closePanel(o.id); return null; }
        if (GameUI.blocking) return null;
        /** @type {any} */
        const ctx = { id: o.id, closed: false, timer: 0, parts: [], data: {}, body: null, close: () => GameUI.closePanel(o.id) };
        const check = () => {
            if (ctx.closed || !GameUI.isPanelOpen(o.id)) return;
            const ad = GameUI.adsAvailable();
            for (const p of ctx.parts) {
                try {
                    const sg = p.def.sig ? String(p.def.sig(ctx)) : '';
                    if (sg !== p.sig) {
                        p.sig = sg; p.handles = []; p.notes = [];
                        GameUtil.clear(p.box);
                        p.def.render(p.box, ctx, p);
                    }
                    for (const h of p.handles) h.refresh();
                    for (const n of p.notes) n.style.display = ad ? 'none' : '';
                } catch (e) { console.error('Shops panel ' + o.id + '/' + p.key + ':', e); }
            }
            if (o.tick) { try { o.tick(ctx); } catch (e) { console.error('Shops panel tick ' + o.id + ':', e); } }
        };
        ctx.refresh = (key) => { for (const p of ctx.parts) if (!key || p.key === key) p.sig = null; check(); };
        GameUI.openPanel({
            id: o.id, title: o.title, wide: !!o.wide, width: o.width, cls: o.cls,
            onClose: () => { ctx.closed = true; clearInterval(ctx.timer); if (o.onClose) o.onClose(ctx); },
            build: (el) => {
                ctx.body = el;
                for (const def of o.parts) {
                    const box = E('div', { class: 'sh-part' });
                    el.appendChild(box);
                    ctx.parts.push({ key: def.key, def, box, sig: null, handles: [], notes: [] });
                }
                check();
                ctx.timer = window.setInterval(check, o.ms || 400);
            },
        });
        return ctx;
    }
    /** Кнопка награды за рекламу в части панели (повторная отрисовка части пересоздаёт кнопку). */
    function adButton(part, o) {
        const el = E('button', { type: 'button', class: 'gb ' + (o.cls || 'blue') + (o.extra ? ' ' + o.extra : '') });
        const h = GameUI.rewardButton(el, { id: o.id, cls: o.cls || 'blue', label: o.label || '', onReward: o.onReward });
        if (o.html) { h.render = () => { el.innerHTML = o.html(); }; h.render(); }
        part.handles.push(h);
        return el;
    }
    /** Строка «Реклама сейчас недоступна» — показывается панелью, пока рекламы нет. */
    function adNote(part, text) {
        const n = E('div', { class: 'sh-note warn', text: text || t('ad.unavailable') });
        n.style.display = 'none';
        part.notes.push(n);
        return n;
    }
    /** Кнопка с ценой: ok=false — серая (нажатие даёт тост «не хватает денег»). */
    function moneyButton(cost, ok, onClick, label) {
        const b = E('button', { type: 'button', class: 'gb' + (ok ? '' : ' off'), html: (label ? '<span>' + esc(label) + '</span>' : '') + money$(cost) });
        GameUI._press(b, () => { if (!ok) { GameUI.toast(t('stl.noCash'), 'bad'); return; } onClick(); }, true);
        return b;
    }

    // --- Помощники окон Sell / Индекс / Перерождение / Магазин яиц ----------------------------------------------
    /** Забор «базы ранчо» из блоков CSS — превью награды в окне перерождения (b — запись SHOPS_RANCH_BASES). */
    function fenceHtml(b) {
        let h = '<div class="rb-fence" style="--cap:' + b.cap + '">' +
            '<s style="top:calc(var(--u)*17);background:' + b.rail + '"></s><s style="top:calc(var(--u)*33);background:' + b.rail + '"></s>';
        for (let i = 0; i < 4; i++) h += '<u style="left:calc(var(--u)*' + (i * 34) + ');background:' + b.post + '"></u>';
        return h + '</div>';
    }
    /** Шанс в процентах для плитки: 50%, 3,5%, 0,6%. */
    const pctText = (p) => GameUtil.fmt(p, { decimals: p >= 10 ? 0 : p >= 1 ? 1 : 2 }) + '%';
    /** Метка редкости питомца: цветная таблетка. */
    const rarityTag = (rarity) => '<span class="sh-tag" style="margin:0;background:' + GameData.rarityColor(rarity) + '">' + esc(GameData.rarityName(rarity)) + '</span>';
    /** Результаты бросков по видам: одна плитка на вид (ОГРОМНЫЕ отдельно) со счётчиком; редкие — первыми. */
    function groupResults(list) {
        /** @type {Map<string, any>} */
        const m = new Map();
        for (const r of list) {
            const k = r.species + (r.huge ? ':h' : '');
            let g = m.get(k);
            if (!g) { g = { species: r.species, huge: !!r.huge, count: 0, isNew: false, pet: r.pet }; m.set(k, g); }
            g.count++;
            if (r.isNew) g.isNew = true;
        }
        return [...m.values()].sort((a, b) => GameData.PETS[b.species].chance - GameData.PETS[a.species].chance);
    }
    /** Посадить игрока на питомца (если игрок уже создан). */
    function rideNow(uid) {
        const P = playerOf();
        if (P && typeof P.ride === 'function') P.ride(uid);
    }

    return {
        id: 'shops',
        /** @type {LoryApp | null} */
        app: null,
        /** Слежение за яйцом: { egg, type, via, radar, spawned } или null. @type {any} */
        lock: null,
        _lockT: 0,
        _restockLeft: 0,
        _secT: 0,
        _badgeT: 0,
        _feeding: false,
        _idxTab: 'pets',
        /** @type {string | null} */
        _foodSel: null,
        /** @type {any} */
        _chip: null,
        _baseApplied: -1,
        _selling: false,
        _rebBusy: false,
        _lastIdxBadge: -1,
        _lastRebBadge: -1,
        _rsInit: false,
        /** Купленное автопокупкой при загрузке (тост в ready). @type {{ id: string, n: number }[]} */
        _pendingAuto: [],
        /** @type {Record<string, () => any>} */
        _openers: {},

        // =============================================================================================
        // ЛОГИКА
        // =============================================================================================

        // --- Доска улучшений -------------------------------------------------------------------------
        /** Сведения об улучшении id (luck | nests | slots): уровень, число уровней, цена следующего, значение до и после. */
        upgradeInfo(id) {
            const s = S(), up = GameData.UPGRADES[id];
            const cost = GameData.nextUpgradeCost(id, s);
            const level = GameData.upgradeLevel(id, s);
            let cur = 0, next = 0, levels = 0;
            if (id === 'luck') { cur = GameData.luckLevelMult(s.luckLevel); next = GameData.luckLevelMult(s.luckLevel + 1); levels = up.max; }
            else if (id === 'nests') { cur = s.nests; next = s.nests + 1; levels = up.max - up.start; }
            else { cur = s.slots; next = s.slots + 1; levels = Math.max(level, Math.min(up.costs.length, up.max - up.start - s.rebirths)); }
            return { id, level, levels, cost, cur, next, maxed: cost == null };
        },
        /** Купить следующий уровень улучшения; эффект сразу (гнёзда и слоты пересобираются на ранчо). */
        buyUpgrade(id) {
            const s = S();
            const cost = GameData.nextUpgradeCost(id, s);
            if (cost == null) return { ok: false, reason: 'max' };
            if (!GameState.spendCash(cost)) return { ok: false, reason: 'cash', cost };
            const ranch = ranchOf(), eggs = eggsOf();
            if (id === 'luck') s.luckLevel++;
            else if (id === 'nests') {
                s.nests++;
                while (s.nestEggs.length < s.nests) s.nestEggs.push(null);
                if (ranch) ranch.refreshNests();
                if (eggs) eggs.syncNests();
            } else if (id === 'slots') {
                s.slots++;
                if (ranch) { ranch.syncPets(); ranch.updateBadges(); }
            }
            GameState.saveNow();
            Game.events.emit('upgrade', { id, level: GameData.upgradeLevel(id, s), cost });
            return { ok: true, cost };
        },

        // --- Корм ------------------------------------------------------------------------------------
        /** Питомцы для кормления: под седлом, затем на ранчо, затем остальные по доходу. */
        foodPets() {
            const s = S();
            const rank = (p) => (p.uid === s.riding ? 2 : s.ranchPets.includes(p.uid) ? 1 : 0);
            return s.pets.slice().sort((a, b) => rank(b) - rank(a) || GameState.petIncome(b) - GameState.petIncome(a));
        },
        /** Накормить питомца n порциями еды foodId. aged — сколько возрастов набрал (событие pet:aged шлёт ядро). */
        feed(uid, foodId, n = 1) {
            const pet = GameState.findPet(uid), food = GameData.FOODS.find(f => f.id === foodId);
            n = Math.max(1, Math.floor(Number(n)) || 1);
            if (!pet || !food) return { ok: false, reason: 'none' };
            const cost = food.price * n;
            if (!GameState.spendCash(cost)) return { ok: false, reason: 'cash', cost };
            const exp = food.exp * n;
            let aged = 0;
            this._feeding = true;
            try { aged = GameState.addPetExp(pet, exp); } finally { this._feeding = false; }
            GameState.markDirty();
            this.noteBest();
            Game.events.emit('pet:fed', { pet, exp, food: food.id, n, aged });
            return { ok: true, cost, exp, aged, pet };
        },

        // --- Корзина ---------------------------------------------------------------------------------
        basketInfo() {
            const s = S(), B = GameData.BASKET, cap = s.basketCap;
            const price = cap >= B.max ? null : B.prices[cap - B.start];
            return { cap, next: cap + 1, price, maxed: price == null };
        },
        buyBasket() {
            const inf = this.basketInfo();
            if (inf.maxed) return { ok: false, reason: 'max' };
            if (!GameState.spendCash(inf.price)) return { ok: false, reason: 'cash', cost: inf.price };
            S().basketCap = inf.next;
            GameState.saveNow();
            return { ok: true, cost: inf.price, cap: inf.next };
        },

        // --- Радары: запас, покупка, обновление ---------------------------------------------------------
        stockOf(id) {
            const r = radarDef(id);
            if (!r) return 0;
            const v = S().gearsStock[id];
            return v == null ? r.stock : Math.max(0, Math.min(v, r.stock));
        },
        ownedOf(id) { return S().radars[id] | 0; },
        buyRadar(id) {
            const r = radarDef(id), s = S();
            if (!r) return { ok: false, reason: 'none' };
            if (this.stockOf(id) < 1) return { ok: false, reason: 'stock' };
            if (!GameState.spendCash(r.price)) return { ok: false, reason: 'cash', cost: r.price };
            s.gearsStock[id] = this.stockOf(id) - 1;
            s.radars[id] = (s.radars[id] | 0) + 1;
            GameState.markDirty();
            return { ok: true, cost: r.price };
        },
        /** Полный запас радаров и новый отсчёт; opts.auto === false — без автопокупки. Возвращает купленное автопокупкой. */
        restock(opts = {}) {
            const s = S();
            for (const r of GameData.RADARS) s.gearsStock[r.id] = r.stock;
            this._restockLeft = cfg().restock;
            s.gearsRestockAt = Math.round(GameState.now() + this._restockLeft * 1000);
            const bought = opts.auto === false ? [] : this.autoBuy();
            GameState.markDirty();
            Game.events.emit('gears:restock', { bought });
            return bought;
        },
        /** Автопокупка: каждый радар с включённым переключателем докупается из запаса, пока хватает денег. */
        autoBuy() {
            const s = S(), out = [];
            for (const r of GameData.RADARS) {
                if (!s.radarAuto[r.id]) continue;
                let n = 0;
                while (this.stockOf(r.id) > 0 && GameState.canAfford(r.price)) { if (!this.buyRadar(r.id).ok) break; n++; }
                if (n) out.push({ id: r.id, n });
            }
            return out;
        },
        forceRestockCost() { return GameData.RADAR_REFRESH_BASE * (1 + S().rebirths); },
        /** Досрочное обновление запаса: kind 'cash' (платно) или 'ad' (награда уже подтверждена). */
        forceRestock(kind) {
            if (kind === 'cash') {
                const c = this.forceRestockCost();
                if (!GameState.spendCash(c)) return { ok: false, reason: 'cash', cost: c };
            }
            const bought = this.restock();
            GameState.saveNow();
            return { ok: true, bought };
        },
        setAutoBuy(id, on) {
            if (!radarDef(id)) return false;
            if (on) S().radarAuto[id] = true; else delete S().radarAuto[id];
            GameState.markDirty();
            return true;
        },
        /** Запас при загрузке: полный и свежий отсчёт, если время вышло (пока игры не было — тоже). Возвращает купленное автопокупкой. */
        _initRestock() {
            const s = S();
            for (const r of GameData.RADARS) if (s.gearsStock[r.id] == null) s.gearsStock[r.id] = r.stock;
            this._rsInit = true;
            if (!(s.gearsRestockAt > 0)) { this.restock({ auto: false }); return []; }
            const left = (s.gearsRestockAt - GameState.now()) / 1000;
            if (left <= 0) return this.restock();
            this._restockLeft = Math.min(left, cfg().restock);
            return [];
        },
        _tickRestock(dt) {
            if (!this._rsInit) return;
            this._restockLeft -= dt;
            if (this._restockLeft <= 0) {
                const bought = this.restock();
                for (const b of bought) GameUI.toast(t('stl.gears.autoBought', { name: GameData.radarName(b.id), n: b.n }), 'good');
            }
            this._secT += dt;
            if (this._secT >= 1) {
                this._secT = 0;
                S().gearsRestockAt = Math.round(GameState.now() + Math.max(0, this._restockLeft) * 1000);
            }
        },

        // --- Радар и слежение за яйцом ----------------------------------------------------------------
        _nearestLive(filter) {
            const eggs = eggsOf(), P = playerOf();
            if (!eggs || !P) return null;
            return eggs.nearestLive(P.x, P.y, filter);
        },
        /** Яйцо радара появляется на подходящем свободном маркере (если живого яйца этого тира нет). */
        _forceSpawnFor(radarId) {
            const eggs = eggsOf();
            if (!eggs || !eggs.markers) return null;
            const night = typeof GameWorld !== U ? !!GameWorld.isNight : false;
            const free = eggs.markers.filter(m => !eggs.live.some(e => e.marker === m.name));
            const types = GameData.EGG_LIST.filter(e => GameData.radarMatches(radarId, e.id) && (night || !e.night) && e.zones.some(z => free.some(m => m.zone === z))).map(e => e.id);
            if (!types.length) return null;
            const type = GameData.pickEggType(Math.random, night, types);
            const def = GameData.EGGS[type];
            const spots = free.filter(m => def.zones.includes(m.zone));
            if (!spots.length) return null;
            return eggs.spawn(type, GameUtil.pick(spots), { force: true, announce: false });
        },
        /** Использовать радар id: ближайшее живое яйцо его тира или проявленное на маркере; радар тратится только при успехе. */
        useRadar(id) {
            const r = radarDef(id), s = S();
            if (!r) return { ok: false, reason: 'none' };
            if (this.ownedOf(id) < 1) return { ok: false, reason: 'none' };
            let egg = this._nearestLive(e => GameData.radarMatches(id, e.type));
            let spawned = false;
            if (!egg) { egg = this._forceSpawnFor(id); spawned = !!egg; }
            if (!egg) return { ok: false, reason: 'nospawn' };
            s.radars[id] = this.ownedOf(id) - 1;
            GameState.markDirty();
            this.lockEgg(egg, { via: 'radar', radar: id, spawned });
            return { ok: true, egg, spawned };
        },
        /** Нужен ли радар для слежения за яйцом типа type: free — бесплатно (common и rare), иначе radarId и сколько их есть. */
        trackAccess(type) {
            const def = GameData.EGGS[type];
            if (!def) return { free: false, radarId: null, owned: 0 };
            if (def.tier === 'common' || def.tier === 'rare') return { free: true, radarId: null, owned: 0 };
            const r = GameData.radarFor(type);
            return { free: false, radarId: r ? r.id : null, owned: r ? this.ownedOf(r.id) : 0 };
        },
        /** Следить за ближайшим живым яйцом типа type: common и rare бесплатно, остальное тратит подходящий радар. */
        trackType(type) {
            const egg = this._nearestLive(e => e.type === type);
            if (!egg) return { ok: false, reason: 'none' };
            const acc = this.trackAccess(type);
            if (!acc.free) {
                if (!acc.radarId || acc.owned < 1) return { ok: false, reason: 'radar', radarId: acc.radarId };
                S().radars[acc.radarId] = acc.owned - 1;
                GameState.markDirty();
            }
            this.lockEgg(egg, { via: 'track', radar: acc.free ? null : acc.radarId });
            return { ok: true, egg, consumed: !acc.free };
        },
        /** Включить слежение за яйцом: зелёные стрелки к нему и плашка в HUD. */
        lockEgg(egg, meta = {}) {
            this.endLock('replace', true);
            this.lock = { egg, type: egg.type, via: meta.via || 'radar', radar: meta.radar || null, spawned: !!meta.spawned };
            this._lockT = 0;
            this._applyGuide();
            this._updateChip(true);
            Game.events.emit('radar', { on: true, egg });
            return this.lock;
        },
        /** Конец слежения: picked (яйцо подобрано, стрелки уже ведут к ранчо), gone (пропало), cancel, replace, reset. */
        endLock(reason, silent) {
            const L = this.lock;
            if (!L) return false;
            this.lock = null;
            if (this._chip) this._chip.root.classList.remove('on');
            if (reason !== 'picked' && reason !== 'replace') this._clearGuideFor(L.egg);
            if (reason === 'gone' && !silent) GameUI.toast(t('stl.radar.lost'), 'info');
            Game.events.emit('radar', { on: false, egg: L.egg, reason });
            return true;
        },
        _basketFull() { const e = eggsOf(); return !!(e && e.basket && e.basket.length); },
        _clearGuideFor(egg) {
            if (typeof Guide === U || !Guide.target || this._basketFull()) return;
            if (Math.hypot(Guide.target.x - egg.x, Guide.target.y - egg.y) < 2) Guide.set(null);
        },
        _applyGuide() {
            const L = this.lock;
            if (!L || typeof Guide === U || this._basketFull()) return;
            const g = Guide.target;
            if (!g || Math.hypot(g.x - L.egg.x, g.y - L.egg.y) > 1) Guide.set({ x: L.egg.x, y: L.egg.y });
        },
        _tickLock(dt) {
            const L = this.lock;
            if (!L) return;
            this._lockT -= dt;
            if (this._lockT > 0) return;
            this._lockT = 0.25;
            const eggs = eggsOf();
            if (!eggs || !eggs.live.includes(L.egg)) {
                // подобрано игроком (яйцо уже в корзине) или пропало: у «подобрано» стрелки ведут к ранчо, тост не нужен
                this.endLock(eggs && eggs.basket && eggs.basket.some(b => b.uid === L.egg.uid) ? 'picked' : 'gone');
                return;
            }
            this._applyGuide();
            this._updateChip(false);
        },
        _buildChip() {
            const hud = GameUI.hud && GameUI.hud.top;
            if (!hud) return;
            const root = E('div', { class: 'sh-chiphud wood otx-s' });
            const ico = E('span', {});
            const nm = E('span', { class: 'nm' });
            const ds = E('span', { class: 'ds' });
            const x = E('button', { class: 'gb red', type: 'button', text: '✕', title: t('stl.radar.cancel'), 'aria-label': t('stl.radar.cancel') });
            GameUI._press(x, () => this.endLock('cancel'));
            root.append(ico, nm, ds, x);
            hud.appendChild(root);
            this._chip = { root, ico, nm, ds, dist: '' };
        },
        _updateChip(full) {
            const c = this._chip, L = this.lock;
            if (!c || !L) return;
            const P = playerOf();
            if (full) {
                const eggs = eggsOf();
                c.ico.innerHTML = eggs ? eggs.iconHtml(L.type, 28) : GameUI.icon('egg');
                c.nm.textContent = GameData.eggName(L.type);
                c.nm.style.color = GameData.tierColor(GameData.EGGS[L.type].tier);
                c.root.classList.add('on');
                c.dist = '';
            }
            const d = P ? metres(Math.hypot(L.egg.x - P.x, L.egg.y - P.y)) : '';
            if (d !== c.dist) { c.dist = d; c.ds.textContent = d; }
        },

        // --- Продажа ---------------------------------------------------------------------------------
        sellValueOf(pet) { return GameData.sellValue(pet); },
        canSell(uid) {
            const s = S(), pet = GameState.findPet(uid), P = playerOf();
            if (!pet) return { ok: false, reason: 'none' };
            if (s.riding === uid || (P && P.riding === uid)) return { ok: false, reason: 'riding' };
            if (s.pets.length <= 1) return { ok: false, reason: 'last' };
            return { ok: true, value: this.sellValueOf(pet) };
        },
        sellPet(uid, opts = {}) {
            const c = this.canSell(uid);
            if (!c.ok) return c;
            const s = S(), ranch = ranchOf();
            this.noteBest();
            const pet = Object.assign({}, GameState.findPet(uid));
            if (ranch && s.ranchPets.includes(uid) && typeof ranch.collect === 'function') ranch.collect(uid, true);
            if (!GameState.removePet(uid)) return { ok: false, reason: 'fail' };
            GameState.addCash(c.value, 'sell');
            if (ranch && typeof ranch.syncPets === 'function') ranch.syncPets();
            if (!opts.batch) GameState.saveNow();
            Game.events.emit('pet:sold', { pet, uid, value: c.value });
            return { ok: true, value: c.value, pet };
        },
        /** Обычные питомцы на продажу «пачкой»: не под седлом, не на ранчо, без мутации, не ОГРОМНЫЕ. */
        commonsToSell() {
            const s = S();
            return s.pets.filter(p => GameData.PETS[p.species].rarity === 'common' && p.uid !== s.riding && !s.ranchPets.includes(p.uid) && !p.mutation && !p.huge);
        },
        sellCommons() {
            let total = 0, n = 0;
            for (const p of this.commonsToSell()) {
                const r = this.sellPet(p.uid, { batch: true });
                if (r.ok) { total += r.value; n++; }
            }
            if (n) GameState.saveNow();
            return { ok: n > 0, n, total };
        },

        // --- Индекс ----------------------------------------------------------------------------------
        /** Награда за первое открытие питомца: деньги (доход × INDEX_REWARD_SECONDS) и лапки (× INDEX_REWARD_PAWS_MULT). */
        indexReward(species) {
            const d = GameData.PETS[species], c = cfg();
            return { cash: Math.floor(d.income * c.indexSecs), paws: Math.max(1, Math.round(GameData.pawsFor(species) * c.indexPaws)) };
        },
        /** Открытые виды, награда за которые ещё не получена. */
        unclaimed() {
            const idx = S().index;
            return GameData.PET_LIST.filter(p => idx.pets[p.id] && !idx.claimed[p.id]).map(p => p.id);
        },
        claim(species) {
            const idx = S().index;
            if (!GameData.PETS[species] || !idx.pets[species] || idx.claimed[species]) return { ok: false };
            idx.claimed[species] = true;
            const r = this.indexReward(species);
            if (r.cash > 0) GameState.addCash(r.cash, 'reward');
            if (r.paws > 0) GameState.addPaws(r.paws, 'reward');
            GameState.saveNow();
            Game.events.emit('index:claim', { species, reward: r });
            return { ok: true, reward: r };
        },
        claimAll() {
            let cash = 0, paws = 0, n = 0;
            for (const id of this.unclaimed()) {
                const r = this.claim(id);
                if (r.ok) { cash += r.reward.cash; paws += r.reward.paws; n++; }
            }
            return { ok: n > 0, n, cash, paws };
        },
        /** Лучший вес вида в Индексе: запоминается, даже если питомца потом продали. */
        noteBest() {
            const s = S();
            if (!s.index.bestKg) s.index.bestKg = {};
            for (const p of s.pets) {
                const kg = GameData.petKg(p);
                if (kg > (s.index.bestKg[p.species] || 0)) s.index.bestKg[p.species] = kg;
            }
        },

        // --- Перерождение ----------------------------------------------------------------------------
        nextRebirth() { return GameData.REBIRTHS[S().rebirths] || null; },
        /** Экземпляр питомца для сдачи: не под седлом, не на ранчо, с наименьшим доходом. */
        rebirthPet(species) {
            const s = S();
            const list = s.pets.filter(p => p.species === species);
            const rank = (p) => (p.uid === s.riding ? 2 : s.ranchPets.includes(p.uid) ? 1 : 0);
            list.sort((a, b) => rank(a) - rank(b) || GameData.petIncome(a) - GameData.petIncome(b));
            return list[0] || null;
        },
        rebirthStatus() {
            const s = S(), next = this.nextRebirth();
            if (!next) return { max: true, n: s.rebirths, met: false };
            const pet = this.rebirthPet(next.pet), cashOk = s.cash + 1e-6 >= next.cash;
            return { max: false, n: next.n, next, cash: s.cash, cashNeed: next.cash, cashOk, petId: next.pet, pet, hasPet: !!pet, met: cashOk && !!pet, mult: next.mult, fromMult: GameData.rebirthMult(s.rebirths) };
        },
        _equip(uid) {
            const P = playerOf();
            if (P && typeof P.ride === 'function') P.ride(uid); else S().riding = uid;
        },
        /**
         * Перерождение. Обычное: нужны деньги и питомец — сбрасываются деньги и удача, питомец уходит. skip: true — «Пропустить»
         * (без требований и без потерь). В обоих случаях: +1 перерождение, +1 слот, множитель денег по таблице.
         */
        rebirth(opts = {}) {
            const s = S(), st = this.rebirthStatus();
            if (st.max) return { ok: false, reason: 'max' };
            const skip = !!opts.skip;
            let taken = null;
            if (!skip) {
                if (!st.cashOk) return { ok: false, reason: 'cash' };
                if (!st.hasPet) return { ok: false, reason: 'pet' };
                taken = st.pet;
                const others = s.pets.filter(p => p.uid !== taken.uid);
                if (!others.length) others.push(GameState.givePet('snail', { w: 1 }).pet);
                if (s.riding === taken.uid) this._equip(others.slice().sort((a, b) => GameData.petSpeed(b) - GameData.petSpeed(a))[0].uid);
                GameState.removePet(taken.uid);
                if (s.cash > 0) GameState.spendCash(s.cash);
                s.luckLevel = 0;
                s.ranchBank = {};
            }
            s.rebirths++;
            s.slots++;
            GameState.markDirty();
            this.applyRanchBase();
            const ranch = ranchOf();
            if (ranch) { if (typeof ranch.syncPets === 'function') ranch.syncPets(); if (typeof ranch.updateBadges === 'function') ranch.updateBadges(); }
            GameState.saveNow();
            Game.events.emit('rebirth', { n: s.rebirths, skip, mult: GameState.rebirthMult(), taken: taken ? taken.species : null });
            return { ok: true, n: s.rebirths, skip, mult: GameState.rebirthMult(), taken };
        },
        /** Один подтверждённый просмотр рекламы для «Пропустить»: после последнего — перерождение без требований и без потерь. */
        skipStep() {
            const s = S(), views = cfg().skipViews;
            if (this.rebirthStatus().max) return { ok: false, reason: 'max' };
            s.rebirthSkip = (s.rebirthSkip | 0) + 1;
            if (s.rebirthSkip < views) { GameState.saveNow(); return { ok: true, done: false, progress: s.rebirthSkip, views }; }
            s.rebirthSkip = 0;
            const r = this.rebirth({ skip: true });
            return { ok: r.ok, done: true, progress: views, views, result: r };
        },
        /** Стиль забора по числу перерождений: { post, rail, cap } или null (деревянный по умолчанию). */
        fenceStyleFor(n) {
            const b = SHOPS_RANCH_BASES[Math.max(0, Math.min(n | 0, SHOPS_RANCH_BASES.length - 1))];
            return b ? { post: b.post, rail: b.rail, cap: b.cap } : null;
        },
        /** Применить забор «базы ранчо» по числу перерождений (при загрузке и после перерождения). Косметика ранчо важнее. */
        applyRanchBase(force) {
            const s = S(), ranch = ranchOf();
            if (!ranch || !ranch.player || typeof ranch.rebuildFence !== 'function') return false;
            if (s.cosmetics && s.cosmetics.equipped && s.cosmetics.equipped.ranch) return false;
            const n = Math.min(s.rebirths, SHOPS_RANCH_BASES.length - 1);
            if (!force && this._baseApplied === n) return false;
            if (n === 0 && ranch._fenceStyle === 'wood') { this._baseApplied = 0; return false; }
            this._baseApplied = n;
            ranch.rebuildFence(this.fenceStyleFor(n) || 'wood');
            return true;
        },

        // --- Магазин яиц за рекламу -----------------------------------------------------------------------
        bundleOf(rolls) { return GameData.EGG_SHOP.bundles.find(b => b.rolls === rolls) || null; },
        /** Стабильный id награды за рекламу: egg-dragon-3, egg-giant-10 … (без данных игрока). */
        bundleId(kind, rolls) { return 'egg-' + kind + '-' + rolls; },
        bundleProgress(kind, rolls) { return S().shopAds[this.bundleId(kind, rolls)] | 0; },
        /**
         * Один подтверждённый просмотр рекламы пакета: прогресс сохраняется; после последнего просмотра броски выдаются ровно один раз.
         * @returns {{ ok: boolean, done?: boolean, progress?: number, views?: number, results?: any[], reason?: string }}
         */
        bundleStep(kind, rolls, rng) {
            const bd = this.bundleOf(rolls), shop = GameData.EGG_SHOP[kind];
            if (!bd || !shop) return { ok: false, reason: 'none' };
            const s = S(), id = this.bundleId(kind, rolls);
            const p = (s.shopAds[id] | 0) + 1;
            if (p < bd.views) { s.shopAds[id] = p; GameState.saveNow(); return { ok: true, done: false, progress: p, views: bd.views }; }
            delete s.shopAds[id];
            const results = this.grantRolls(kind, bd.rolls, rng);
            GameState.saveNow();
            return { ok: true, done: true, progress: bd.views, views: bd.views, results };
        },
        /** Выдать n бросков яйца магазина: питомцы в сохранение (Индекс обновляется), событие pet:granted на каждого. */
        grantRolls(kind, n, rng = Math.random) {
            const out = [];
            for (let i = 0; i < n; i++) {
                const r = GameData.rollShopEgg(kind, rng);
                const g = GameState.givePet(r.species, { w: r.w, huge: r.huge });
                out.push({ pet: g.pet, isNew: g.isNew, species: r.species, huge: r.huge });
            }
            this.noteBest();
            GameState.markDirty();
            const ranch = ranchOf();
            if (ranch && typeof ranch._newPets === 'number') { ranch._newPets += out.length; if (typeof ranch.updateBadges === 'function') ranch.updateBadges(); }
            for (const r of out) Game.events.emit('pet:granted', { pet: r.pet, isNew: r.isNew, source: 'eggshop', kind });
            return out;
        },

        // =============================================================================================
        // ИНТЕРФЕЙС: доска улучшений
        // =============================================================================================
        openUpgrades() {
            const self = this;
            const ids = ['luck', 'nests', 'slots'];
            return openPanelEx({
                id: 'upgrades', title: t('stl.upg.title'),
                parts: [{
                    key: 'list',
                    sig: () => ids.map(id => { const c = GameData.nextUpgradeCost(id, S()); return id + GameData.upgradeLevel(id, S()) + (c == null ? 'm' : GameState.canAfford(c) ? 'y' : 'n'); }).join('|') + S().rebirths,
                    render: (box, ctx) => {
                        for (const id of ids) {
                            const inf = self.upgradeInfo(id);
                            const icon = 'upg-' + id;
                            const desc = inf.maxed ? t('stl.upg.' + id + '.now', { a: GameUtil.fmt(inf.cur) }) : t('stl.upg.' + id + '.desc', { a: GameUtil.fmt(inf.cur), b: GameUtil.fmt(inf.next) });
                            const pct = inf.maxed ? 100 : Math.round(100 * Math.min(1, inf.level / Math.max(1, inf.levels)));
                            const acts = E('div', { class: 'sh-acts' });
                            if (inf.maxed) acts.appendChild(E('span', { class: 'sh-max', text: t('stl.max') }));
                            else {
                                acts.appendChild(moneyButton(inf.cost, GameState.canAfford(inf.cost), () => {
                                    const r = self.buyUpgrade(id);
                                    if (!r.ok) { GameUI.toast(t('stl.noCash'), 'bad'); return; }
                                    GameUI.sfx('buy');
                                    GameUI.toast(t('stl.bought'), 'good', 1600);
                                    ctx.refresh();
                                }));
                            }
                            box.appendChild(E('div', { class: 'sh-card' + (inf.maxed ? ' ok' : '') },
                                E('div', { class: 'sh-ic', html: GameUI.icon(icon) }),
                                E('div', { class: 'sh-main' },
                                    E('div', { class: 'sh-name', text: t('stl.upg.' + id) }),
                                    E('div', { class: 'sh-line', text: desc }),
                                    E('div', { class: 'sh-line', text: inf.maxed ? t('stl.upg.maxed') : t('stl.lvl', { a: inf.level, b: inf.levels }) }),
                                    E('div', { class: 'sh-bar' }, E('i', { style: { width: pct + '%' } }))),
                                acts));
                        }
                    },
                }],
            });
        },

        // =============================================================================================
        // ИНТЕРФЕЙС: корм
        // =============================================================================================
        _foodPet() {
            let p = this._foodSel ? GameState.findPet(this._foodSel) : null;
            if (!p) { p = GameState.ridingPet(); this._foodSel = p ? p.uid : null; }
            return p;
        },
        /** Накормить выбранного питомца в открытой панели: деньги, полоса опыта с анимацией, взросление. */
        _doFeed(ctx, food, n) {
            const pet = this._foodPet();
            if (!pet) return;
            const r = this.feed(pet.uid, food.id, n);
            if (!r.ok) { GameUI.toast(t('stl.noCash'), 'bad'); return; }
            GameUI.sfx('buy', { volume: 0.5 });
            const c = ctx.card;
            if (c && c.uid === pet.uid) {
                clearTimeout(c.timer);
                const settle = () => { c.setTexts(); };
                if (r.aged > 0) {
                    c.barBox.classList.remove('t0');
                    c.bar.style.width = '100%';
                    c.timer = window.setTimeout(() => {
                        if (ctx.closed || !c.bar.isConnected) return;
                        c.barBox.classList.add('t0');
                        c.bar.style.width = '0%';
                        void c.bar.offsetWidth;
                        c.barBox.classList.remove('t0');
                        c.bar.style.width = Math.round(c.frac() * 100) + '%';
                        settle();
                        const pop = E('div', { class: 'sh-agepop', text: t('stl.food.ageUp', { n: pet.age }) });
                        c.card.appendChild(pop);
                        c.card.classList.add('sh-glow');
                        window.setTimeout(() => { pop.remove(); c.card.classList.remove('sh-glow'); }, 1600);
                    }, 480);
                } else {
                    c.bar.style.width = Math.round(c.frac() * 100) + '%';
                    settle();
                }
            }
            GameUI.toast(t('stl.food.fed', { name: GameData.petName(pet.species), n: GameUtil.fmt(r.exp) }), 'good', 1500);
            ctx.refresh('foods');
            ctx.refresh('pick');
        },
        openFood() {
            const self = this;
            self._foodPet();
            return openPanelEx({
                id: 'food', title: t('stl.food.title'), wide: true,
                parts: [
                    {
                        key: 'card',
                        sig: () => { self._foodPet(); return self._foodSel + '|' + S().pets.length; },
                        render: (box, ctx) => {
                            const pet = self._foodPet();
                            ctx.card = null;
                            if (!pet) { box.appendChild(E('div', { class: 'sh-empty', text: t('stl.food.none') })); return; }
                            const ageEl = E('span', {}), expEl = E('span', {}), bar = E('i'), stats = E('div', { class: 'sh-line' });
                            const barBox = E('div', { class: 'sh-bar' }, bar);
                            const st = pet.uid === S().riding ? t('stl.riding') : S().ranchPets.includes(pet.uid) ? t('stl.onRanch') : '';
                            const card = E('div', { class: 'sh-feedcard' },
                                E('div', { html: petPic(pet, 92, false) }),
                                E('div', { class: 'sh-main' },
                                    E('div', { class: 'sh-name', html: esc(GameData.petName(pet.species)) + petTags(pet) + (st ? '<span class="sh-tag free">' + esc(st) + '</span>' : '') }),
                                    E('div', { class: 'sh-line' }, ageEl, E('span', { text: '·' }), expEl),
                                    barBox, stats));
                            box.appendChild(card);
                            const c = ctx.card = { uid: pet.uid, card, bar, barBox, timer: 0, frac: null, setTexts: null };
                            c.frac = () => GameUtil.clamp(pet.exp / GameData.need(pet.age), 0, 1);
                            c.setTexts = () => {
                                ageEl.textContent = t('stl.age', { n: pet.age });
                                expEl.textContent = t('stl.food.expLine', { a: GameUtil.fmt(Math.floor(pet.exp)), b: GameUtil.fmt(GameData.need(pet.age)) });
                                stats.innerHTML = GameUI.icon('banknote') + '<span>' + esc(t('stl.perSec', { v: money(GameState.petIncome(pet)) })) + '</span>' +
                                    GameUI.icon('bolt') + '<span>' + esc(GameUtil.fmt(GameState.petSpeed(pet))) + '</span><span>' + esc(GameUtil.fmtKg(GameState.petKg(pet))) + '</span>';
                            };
                            c.setTexts();
                            barBox.classList.add('t0');
                            bar.style.width = Math.round(c.frac() * 100) + '%';
                            void bar.offsetWidth;
                            barBox.classList.remove('t0');
                        },
                    },
                    {
                        key: 'pick',
                        sig: () => self._foodSel + '|' + S().riding + '|' + self.foodPets().map(p => p.uid + ':' + p.age).join(','),
                        render: (box, ctx) => {
                            const wrap = E('div', { class: 'sh-pick' });
                            for (const p of self.foodPets()) {
                                const d = GameData.PETS[p.species];
                                const b = E('button', {
                                    type: 'button', class: 'sh-chip' + (p.uid === self._foodSel ? ' sel' : ''), title: GameData.petName(p.species), style: { '--rc': GameData.rarityColor(d.rarity) },
                                    html: petImg(p.species) + '<span class="age">' + p.age + '</span>' + (p.uid === S().riding ? '<span class="mk">' + GameUI.icon('bolt') + '</span>' : ''),
                                });
                                GameUI._press(b, () => { self._foodSel = p.uid; ctx.refresh('card'); ctx.refresh('pick'); });
                                wrap.appendChild(b);
                            }
                            box.append(E('div', { class: 'sh-sec', text: t('stl.food.pick') }), wrap);
                        },
                    },
                    {
                        key: 'foods',
                        sig: () => GameData.FOODS.map(f => [1, 5, 10].map(n => (GameState.canAfford(f.price * n) ? 1 : 0)).join('')).join('|'),
                        render: (box, ctx) => {
                            box.appendChild(E('div', { class: 'sh-sec', text: t('stl.food.foods') }));
                            for (const f of GameData.FOODS) {
                                const buy = E('div', { class: 'buy' });
                                for (const n of [1, 5, 10]) {
                                    const ok = GameState.canAfford(f.price * n);
                                    const b = E('button', { type: 'button', class: 'gb small sh-qb' + (ok ? '' : ' off'), html: '<b>×' + n + '</b><span>' + esc(money(f.price * n)) + '</span>' });
                                    GameUI._press(b, () => {
                                        if (!GameState.canAfford(f.price * n)) { GameUI.toast(t('stl.noCash'), 'bad'); return; }
                                        self._doFeed(ctx, f, n);
                                    }, true);
                                    buy.appendChild(b);
                                }
                                box.appendChild(E('div', { class: 'sh-food' },
                                    E('div', { class: 'sh-ic', html: GameUI.icon(f.icon) }),
                                    E('div', { class: 'sh-main' }, E('div', { class: 'sh-name', text: GameData.foodName(f.id) }), E('div', { class: 'sh-line', text: t('stl.food.exp', { n: GameUtil.fmt(f.exp) }) })),
                                    buy));
                            }
                        },
                    },
                ],
            });
        },

        // =============================================================================================
        // ИНТЕРФЕЙС: снаряжение (корзина и радары)
        // =============================================================================================
        _useRadarUI(id) {
            const r = this.useRadar(id);
            if (!r.ok) {
                GameUI.toast(r.reason === 'none' ? t('stl.radar.none', { name: GameData.radarName(id) }) : t('stl.radar.fail'), 'bad');
                return false;
            }
            GameUI.sfx('unlock', { volume: 0.7 });
            GameUI.toast(t(r.spawned ? 'stl.radar.spawned' : 'stl.radar.locked', { name: GameData.eggName(r.egg.type) }), 'good', 3200);
            GameUI.closePanel();
            return true;
        },
        openGears() {
            const self = this;
            return openPanelEx({
                id: 'gears', title: t('stl.gears.title'), wide: true,
                parts: [
                    {
                        key: 'restock',
                        sig: () => 'r' + (GameState.canAfford(self.forceRestockCost()) ? 1 : 0),
                        render: (box, ctx, part) => {
                            const timerEl = E('span', {});
                            ctx.data.timerEl = timerEl;
                            const acts = E('div', { class: 'sh-acts' });
                            acts.appendChild(moneyButton(self.forceRestockCost(), GameState.canAfford(self.forceRestockCost()), () => {
                                const r = self.forceRestock('cash');
                                if (!r.ok) { GameUI.toast(t('stl.noCash'), 'bad'); return; }
                                GameUI.sfx('buy');
                                GameUI.toast(t('stl.gears.restocked'), 'good');
                                for (const b of r.bought) GameUI.toast(t('stl.gears.autoBought', { name: GameData.radarName(b.id), n: b.n }), 'good');
                                ctx.refresh();
                            }, t('stl.gears.restockCash')));
                            acts.appendChild(adButton(part, {
                                id: 'gears-restock', cls: 'blue',
                                html: () => GameUI.icon('play') + '<span>' + esc(t('stl.gears.restockAd')) + '</span>',
                                onReward: () => {
                                    const r = self.forceRestock('ad');
                                    GameUI.sfx('unlock');
                                    GameUI.toast(t('stl.gears.restocked'), 'good');
                                    for (const b of r.bought) GameUI.toast(t('stl.gears.autoBought', { name: GameData.radarName(b.id), n: b.n }), 'good');
                                    ctx.refresh();
                                },
                            }));
                            box.append(
                                E('div', { class: 'sh-card' }, E('div', { class: 'sh-timer', html: GameUI.icon('hourglass') }, timerEl), E('div', { class: 'sh-main', style: { flexBasis: 'calc(var(--u)*10)' } }), acts),
                                adNote(part), E('div', { class: 'sh-note', text: t('stl.gears.intro') }));
                            timerEl.textContent = t('stl.gears.restockIn', { t: GameUtil.fmtClock(self._restockLeft) });
                        },
                    },
                    {
                        key: 'basket',
                        sig: () => { const b = self.basketInfo(); return b.cap + '|' + (b.maxed ? 'm' : GameState.canAfford(b.price) ? 'y' : 'n'); },
                        render: (box, ctx) => {
                            const b = self.basketInfo();
                            const acts = E('div', { class: 'sh-acts' });
                            if (b.maxed) acts.appendChild(E('span', { class: 'sh-max', text: t('stl.max') }));
                            else acts.appendChild(moneyButton(b.price, GameState.canAfford(b.price), () => {
                                const r = self.buyBasket();
                                if (!r.ok) { GameUI.toast(t('stl.noCash'), 'bad'); return; }
                                GameUI.sfx('buy');
                                GameUI.toast(t('stl.gears.basketUp', { n: r.cap }), 'good');
                                ctx.refresh();
                            }));
                            box.append(E('div', { class: 'sh-sec', html: GameUI.icon('backpack') + '<span>' + esc(t('stl.gears.basket')) + '</span>' }),
                                E('div', { class: 'sh-card' + (b.maxed ? ' ok' : '') },
                                    E('div', { class: 'sh-ic', html: GameUI.icon('backpack') }),
                                    E('div', { class: 'sh-main' }, E('div', { class: 'sh-name', text: t('stl.gears.basket') }),
                                        E('div', { class: 'sh-line', text: b.maxed ? t('stl.gears.basketNow', { a: b.cap }) : t('stl.gears.basketDesc', { a: b.cap, b: b.next }) })),
                                    acts));
                        },
                    },
                    {
                        key: 'radars',
                        sig: () => GameData.RADARS.map(r => r.id + self.stockOf(r.id) + ':' + self.ownedOf(r.id) + (S().radarAuto[r.id] ? 'a' : '') + (GameState.canAfford(r.price) ? 'y' : 'n')).join('|'),
                        render: (box, ctx) => {
                            box.appendChild(E('div', { class: 'sh-sec', html: GameUI.icon('radar') + '<span>' + esc(t('stl.gears.radars')) + '</span>' }));
                            for (const r of GameData.RADARS) {
                                const stock = self.stockOf(r.id), owned = self.ownedOf(r.id), auto = !!S().radarAuto[r.id];
                                const rc = GameData.tierColor(r.tiers[r.tiers.length - 1]);
                                let luck = '';
                                if (r.maxLuck != null) luck = ' (' + t('stl.gears.luckBelow') + ' ' + GameUtil.fmt(r.maxLuck) + ')';
                                else if (r.minLuck != null) luck = ' (' + t('stl.gears.luckFrom') + ' ' + GameUtil.fmt(r.minLuck) + ')';
                                const finds = r.tiers.map(x => GameData.tierName(x)).join(' / ') + luck;
                                const acts = E('div', { class: 'sh-acts' });
                                if (stock > 0) acts.appendChild(moneyButton(r.price, GameState.canAfford(r.price), () => {
                                    const res = self.buyRadar(r.id);
                                    if (!res.ok) { GameUI.toast(t('stl.noCash'), 'bad'); return; }
                                    GameUI.sfx('buy');
                                    ctx.refresh('radars');
                                }));
                                else acts.appendChild(E('button', { type: 'button', class: 'gb off', text: t('stl.gears.soldOut') }));
                                const use = E('button', { type: 'button', class: 'gb blue' + (owned > 0 ? '' : ' off'), html: GameUI.icon('radar') + '<span>' + esc(t('stl.gears.use')) + '</span>' });
                                GameUI._press(use, () => { self._useRadarUI(r.id); });
                                acts.appendChild(use);
                                const tg = E('button', { type: 'button', class: 'sh-auto' + (auto ? ' on' : ''), title: t('stl.gears.autoHint'), html: '<i></i><span>' + esc(t('stl.gears.auto')) + '</span>' });
                                GameUI._press(tg, () => { self.setAutoBuy(r.id, !auto); ctx.refresh('radars'); });
                                box.appendChild(E('div', { class: 'sh-card' + (owned > 0 ? ' ok' : '') },
                                    E('div', { class: 'sh-rad', style: { '--rc': rc }, html: GameUI.icon('radar-' + r.id) }),
                                    E('div', { class: 'sh-main' },
                                        E('div', { class: 'sh-name', text: GameData.radarName(r.id) }),
                                        E('div', { class: 'sh-line', text: t('stl.gears.finds', { list: finds }) }),
                                        E('div', { class: 'sh-line', html: '<span>' + esc(t('stl.gears.stock', { a: stock, b: r.stock })) + '</span><span>·</span><span>' + esc(t('stl.gears.owned', { n: owned })) + '</span>' }),
                                        tg),
                                    acts));
                            }
                        },
                    },
                ],
                tick: (ctx) => {
                    if (ctx.data.timerEl) ctx.data.timerEl.textContent = t('stl.gears.restockIn', { t: GameUtil.fmtClock(self._restockLeft) });
                },
            });
        },

        // =============================================================================================
        // ИНТЕРФЕЙС: Track — табло «Яйца в мире»
        // =============================================================================================
        _liveGroups() {
            const eggs = eggsOf(), P = playerOf();
            /** @type {Map<string, any>} */
            const map = new Map();
            if (eggs) {
                for (const e of eggs.live) {
                    const d = P ? Math.hypot(e.x - P.x, e.y - P.y) : 0;
                    let g = map.get(e.type);
                    if (!g) { g = { type: e.type, count: 0, nearest: Infinity }; map.set(e.type, g); }
                    g.count++;
                    if (d < g.nearest) g.nearest = d;
                }
            }
            return [...map.values()].sort((a, b) => {
                const ea = GameData.EGGS[a.type], eb = GameData.EGGS[b.type];
                return GameData.TIERS[eb.tier].rank - GameData.TIERS[ea.tier].rank || eb.luck - ea.luck;
            });
        },
        openTrack() {
            const self = this;
            return openPanelEx({
                id: 'track', title: t('stl.track.title'), wide: true,
                parts: [
                    {
                        key: 'head',
                        render: (box, ctx) => {
                            const wave = E('div', { class: 'sh-timer', html: GameUI.icon('egg') });
                            const txt = E('span', {});
                            wave.appendChild(txt);
                            ctx.data.waveEl = txt;
                            box.appendChild(E('div', { class: 'sh-top' }, wave));
                        },
                    },
                    {
                        key: 'rows',
                        sig: () => self._liveGroups().map(g => g.type + g.count).join('|') + '#' + GameData.RADARS.map(r => self.ownedOf(r.id)).join(',') + '#' + (self.lock ? self.lock.type : ''),
                        render: (box, ctx) => {
                            ctx.data.dyn = [];
                            const groups = self._liveGroups();
                            if (!groups.length) { box.appendChild(E('div', { class: 'sh-empty', text: t('stl.track.none') })); return; }
                            const eggs = eggsOf();
                            for (const g of groups) {
                                const def = GameData.EGGS[g.type], acc = self.trackAccess(g.type);
                                const radar = acc.radarId ? GameData.radarName(acc.radarId) : '';
                                const near = E('div', { class: 'sh-line' });
                                ctx.data.dyn.push({ type: g.type, el: near });
                                const canTrack = acc.free || acc.owned > 0;
                                const sub = acc.free ? t('stl.track.free') : acc.owned > 0 ? t('stl.track.uses', { name: radar, n: acc.owned }) : t('stl.track.needs', { name: radar });
                                const btn = E('button', { type: 'button', class: 'gb sh-trackbtn' + (canTrack ? '' : ' off'), html: '<span>' + esc(t('stl.track.btn')) + '</span><small>' + esc(sub) + '</small>' });
                                GameUI._press(btn, () => {
                                    const r = self.trackType(g.type);
                                    if (!r.ok) {
                                        if (r.reason === 'radar') GameUI.toast(t('stl.track.needs', { name: radar }), 'bad');
                                        else ctx.refresh('rows');
                                        return;
                                    }
                                    GameUI.sfx('unlock', { volume: 0.7 });
                                    GameUI.toast(t('stl.track.on', { name: GameData.eggName(g.type) }), 'good', 3000);
                                    GameUI.closePanel();
                                });
                                const active = self.lock && self.lock.type === g.type;
                                box.appendChild(E('div', { class: 'sh-card' + (active ? ' ok' : '') },
                                    E('div', { class: 'sh-egg', html: eggs ? eggs.iconHtml(g.type, 58) : '' }),
                                    E('div', { class: 'sh-main' },
                                        E('div', { class: 'sh-name', html: esc(GameData.eggName(g.type)) + tierTag(def.tier) + (def.night ? '<span class="sh-tag" style="background:#3a3a8a">' + esc(t('stl.track.night')) + '</span>' : '') }),
                                        E('div', { class: 'sh-line', html: GameUI.icon('clover') + '<span>' + esc(GameUtil.fmt(def.luck)) + '</span><span>×' + g.count + '</span>' }),
                                        near),
                                    E('div', { class: 'sh-acts' }, active ? E('span', { class: 'sh-max', text: t('stl.track.active') }) : btn)));
                            }
                        },
                    },
                ],
                tick: (ctx) => {
                    const eggs = eggsOf(), P = playerOf();
                    if (ctx.data.waveEl && eggs) ctx.data.waveEl.textContent = t('stl.track.wave', { t: GameUtil.fmtClock(Math.max(0, eggs.waveT)), n: cfg().waveCount });
                    if (ctx.data.dyn && eggs && P) {
                        for (const d of ctx.data.dyn) {
                            let best = Infinity;
                            for (const e of eggs.live) if (e.type === d.type) { const k = Math.hypot(e.x - P.x, e.y - P.y); if (k < best) best = k; }
                            const s = best < Infinity ? t('stl.track.nearest', { d: metres(best) }) : '';
                            if (d.el.textContent !== s) d.el.textContent = s;
                        }
                    }
                },
            });
        },

        // =============================================================================================
        // ИНТЕРФЕЙС: Sell — продажа питомцев
        // =============================================================================================
        /** Питомцы по убыванию редкости и дохода. */
        sellList() {
            return S().pets.slice().sort((a, b) => rarityRank(b) - rarityRank(a) || GameState.petIncome(b) - GameState.petIncome(a));
        },
        /** Продать питомца из окна: редких (rare и выше), мутировавших и ОГРОМНЫХ — после подтверждения. */
        async _sellUI(ctx, uid) {
            if (this._selling) return;
            const pet = GameState.findPet(uid);
            if (!pet) return;
            const c = this.canSell(uid);
            if (!c.ok) { GameUI.toast(t(c.reason === 'riding' ? 'stl.sell.cantRide' : 'stl.sell.last'), 'bad'); return; }
            this._selling = true;
            try {
                if (rarityRank(pet) >= GameData.RARITY.rare.rank || pet.mutation || pet.huge) {
                    const ok = await GameUI.confirm({ title: t('stl.sell.confirmTitle'), text: t('stl.sell.confirmText', { name: GameData.petName(pet.species), v: money(c.value) }), ok: t('stl.sell.btn'), color: 'red' });
                    if (!ok) return;
                }
                const r = this.sellPet(uid);
                if (!r.ok) { GameUI.toast(t(r.reason === 'riding' ? 'stl.sell.cantRide' : 'stl.sell.last'), 'bad'); return; }
                GameUI.sfx('cash');
                GameUI.toast(t('stl.sell.done', { name: GameData.petName(pet.species), v: money(r.value) }), 'good');
                if (!ctx.closed) ctx.refresh();
            } finally { this._selling = false; }
        },
        async _sellCommonsUI(ctx) {
            if (this._selling) return;
            const list = this.commonsToSell();
            if (!list.length) { GameUI.toast(t('stl.sell.commonsNone'), 'info'); return; }
            this._selling = true;
            try {
                const total = list.reduce((a, p) => a + this.sellValueOf(p), 0);
                const ok = await GameUI.confirm({ title: t('stl.sell.commonsTitle'), text: t('stl.sell.commonsText', { n: list.length, v: money(total) }), ok: t('stl.sell.btn'), color: 'red' });
                if (!ok) return;
                const r = this.sellCommons();
                if (!r.ok) { GameUI.toast(t('stl.sell.commonsNone'), 'info'); return; }
                GameUI.sfx('cashBig');
                GameUI.toast(t('stl.sell.commonsDone', { n: r.n, v: money(r.total) }), 'good');
                if (!ctx.closed) ctx.refresh();
            } finally { this._selling = false; }
        },
        openSell() {
            const self = this;
            const secs = typeof SELL_SECONDS !== U ? SELL_SECONDS : 120;
            return openPanelEx({
                id: 'sell', title: t('stl.sell.title'), wide: true,
                parts: [
                    {
                        key: 'top',
                        sig: () => self.commonsToSell().map(p => p.uid).join(','),
                        render: (box, ctx) => {
                            const list = self.commonsToSell();
                            const total = list.reduce((a, p) => a + self.sellValueOf(p), 0);
                            const btn = E('button', { type: 'button', class: 'gb orange' + (list.length ? '' : ' off'), html: '<span>' + esc(t('stl.sell.commons')) + '</span>' + (list.length ? money$(total) : '') });
                            GameUI._press(btn, () => { self._sellCommonsUI(ctx); }, true);
                            box.appendChild(E('div', { class: 'sh-top' }, E('div', { class: 'sub', text: t('stl.sell.rate', { n: secs }) }), btn));
                        },
                    },
                    {
                        key: 'list',
                        sig: () => self.sellList().map(p => p.uid + ':' + p.age + (p.mutation || '') + (p.huge ? 'h' : '')).join('|') + '#' + S().riding + '#' + S().ranchPets.join(','),
                        render: (box, ctx) => {
                            const list = self.sellList();
                            if (!list.length) { box.appendChild(E('div', { class: 'sh-empty', text: t('stl.sell.empty') })); return; }
                            const grid = E('div', { class: 'sh-grid' });
                            for (const pet of list) {
                                const d = GameData.PETS[pet.species], c = self.canSell(pet.uid);
                                let btn;
                                if (c.ok) btn = E('button', { type: 'button', class: 'gb', html: '<span>' + esc(t('stl.sell.btn')) + '</span>' + money$(c.value) });
                                else btn = E('button', { type: 'button', class: 'gb off', text: t(c.reason === 'riding' ? 'stl.riding' : 'stl.sell.lastShort') });
                                GameUI._press(btn, () => { self._sellUI(ctx, pet.uid); }, true);
                                const where = pet.uid === S().riding ? t('stl.riding') : S().ranchPets.includes(pet.uid) ? t('stl.onRanch') : '';
                                grid.appendChild(E('div', { class: 'sh-tile', style: { '--rc': GameData.rarityColor(d.rarity) } },
                                    E('div', { html: petPic(pet, 70, true) }),
                                    E('div', { class: 'nm', text: GameData.petName(pet.species) }),
                                    E('div', { html: rarityTag(d.rarity) + petTags(pet) }),
                                    E('div', { class: 'sm', html: GameUI.icon('banknote') + '<span>' + esc(t('stl.perSec', { v: money(GameState.petIncome(pet)) })) + '</span>' }),
                                    E('div', { class: 'sm', text: where || GameUtil.fmtKg(GameState.petKg(pet)) }),
                                    btn));
                            }
                            box.appendChild(grid);
                        },
                    },
                ],
            });
        },

        // =============================================================================================
        // ИНТЕРФЕЙС: Индекс — 30 питомцев и 23 яйца
        // =============================================================================================
        indexCounts() {
            const idx = S().index;
            return {
                pets: GameData.PET_LIST.filter(p => idx.pets[p.id]).length, petsAll: GameData.PET_LIST.length,
                eggs: GameData.EGG_LIST.filter(e => idx.eggs[e.id]).length, eggsAll: GameData.EGG_LIST.length,
            };
        },
        _claimToast(r) {
            GameUI.sfx('cashBig');
            GameUI.toast(t('idx.claimedNow', { cash: money(r.cash), paws: r.paws }), 'good', 2600);
        },
        openIndex() {
            const self = this;
            return openPanelEx({
                id: 'index', title: t('idx.title'), wide: true,
                parts: [
                    {
                        key: 'tabs',
                        sig: () => { const c = self.indexCounts(); return self._idxTab + '|' + self.unclaimed().length + '|' + c.pets + '|' + c.eggs; },
                        render: (box, ctx) => {
                            const mk = (id, label, cls) => {
                                const b = E('button', { type: 'button', class: 'gb ' + cls + (self._idxTab === id ? '' : ' off'), text: label });
                                GameUI._press(b, () => { self._idxTab = id; ctx.refresh(); });
                                return b;
                            };
                            const c = self.indexCounts(), pets = self._idxTab === 'pets';
                            const acts = E('div', { class: 'sh-acts' });
                            const n = self.unclaimed().length;
                            if (pets && n > 0) {
                                const all = E('button', { type: 'button', class: 'gb', html: GameUI.icon('gift') + '<span>' + esc(t('idx.claimAll', { n })) + '</span>' });
                                GameUI._press(all, () => {
                                    const r = self.claimAll();
                                    if (r.ok) { self._claimToast(r); self._updateBadges(true); ctx.refresh(); }
                                }, true);
                                acts.appendChild(all);
                            }
                            box.appendChild(E('div', { class: 'sh-top' },
                                E('div', { class: 'sh-tabs' }, mk('pets', t('idx.pets'), 'pink'), mk('eggs', t('idx.eggs'), 'orange')),
                                E('div', { class: 'sub', text: pets ? t('idx.found', { a: c.pets, b: c.petsAll }) : t('idx.found', { a: c.eggs, b: c.eggsAll }) }),
                                acts));
                        },
                    },
                    {
                        key: 'body',
                        sig: () => {
                            const idx = S().index;
                            self.noteBest();
                            if (self._idxTab === 'eggs') return 'e' + GameData.EGG_LIST.map(e => (idx.eggs[e.id] ? 1 : 0)).join('');
                            return 'p' + GameData.PET_LIST.map(p => (idx.pets[p.id] ? 1 : 0) + '' + (idx.claimed[p.id] ? 1 : 0) + ((idx.bestKg[p.id] || 0).toFixed(1))).join('|');
                        },
                        render: (box, ctx) => {
                            const idx = S().index, grid = E('div', { class: 'sh-grid' });
                            if (self._idxTab === 'eggs') {
                                const eggs = eggsOf();
                                for (const def of GameData.EGG_LIST) {
                                    const known = !!idx.eggs[def.id];
                                    const tc = GameData.tierColor(def.tier);
                                    grid.appendChild(E('div', { class: 'sh-tile' + (known ? '' : ' sil'), style: { '--rc': known ? tc : '#a99a86' } },
                                        E('div', { class: 'big', html: eggs ? eggs.iconHtml(def.id, 66) : GameUI.icon('egg') }),
                                        E('div', { class: 'nm', text: known ? GameData.eggName(def.id) : t('idx.unknown') }),
                                        E('div', { html: tierTag(def.tier) }),
                                        E('div', { class: 'sm', html: GameUI.icon('clover') + '<span>' + esc(GameUtil.fmt(def.luck)) + '</span>' }),
                                        E('div', { class: 'sm', text: t('idx.hatch', { t: GameUtil.fmtClock(def.hatch) }) })));
                                }
                            } else {
                                for (const d of GameData.PET_LIST) {
                                    const known = !!idx.pets[d.id], claimed = !!idx.claimed[d.id], best = idx.bestKg[d.id] || 0;
                                    const rc = GameData.rarityColor(d.rarity);
                                    const tile = E('div', { class: 'sh-tile' + (known ? '' : ' sil') + (known && claimed ? ' gotit' : ''), style: { '--rc': known ? rc : '#a99a86' } },
                                        E('div', { class: 'big', html: petImg(d.id) }),
                                        E('div', { class: 'nm', text: known ? GameData.petName(d.id) : t('idx.unknown') }),
                                        E('div', { html: rarityTag(d.rarity) }),
                                        E('div', { class: 'sm', text: t('idx.chance', { n: GameUtil.fmt(d.chance) }) }),
                                        E('div', { class: 'sm', text: best > 0 ? t('idx.best', { v: GameUtil.fmtKg(best) }) : t('idx.noBest') }));
                                    if (known && !claimed) {
                                        const r = self.indexReward(d.id);
                                        const btn = E('button', { type: 'button', class: 'gb', text: t('idx.claim') });
                                        GameUI._press(btn, () => {
                                            const res = self.claim(d.id);
                                            if (res.ok) { self._claimToast(res.reward); self._updateBadges(true); ctx.refresh(); }
                                        }, true);
                                        tile.append(E('div', { class: 'rwd', html: GameUI.icon('banknote') + '<span>' + esc(money(r.cash)) + '</span>' + GameUI.icon('paw') + '<span>' + r.paws + '</span>' }), btn);
                                    } else if (known) tile.append(E('div', { class: 'rwd', html: GameUI.icon('check') }));
                                    grid.appendChild(tile);
                                }
                            }
                            box.appendChild(grid);
                        },
                    },
                ],
            });
        },

        // =============================================================================================
        // ИНТЕРФЕЙС: Перерождение
        // =============================================================================================
        _rebirthFx(r) {
            GameUI.flash('#fff3b0', 900);
            GameUI.sfx('revealRare', { volume: 0.8 });
            GameUI.banner(t(r.skip ? 'reb.doneSkip' : 'reb.done', { n: r.n, m: r.mult }), 4200, { color: '#ffd21f' });
        },
        async _rebirthUI(ctx) {
            if (this._rebBusy) return;
            const st = this.rebirthStatus();
            if (st.max) return;
            if (!st.met) { GameUI.toast(t('reb.notMet'), 'bad'); return; }
            this._rebBusy = true;
            try {
                const ok = await GameUI.confirm({ title: t('reb.confirmTitle'), text: t('reb.confirmText', { pet: GameData.petName(st.petId), m: st.mult }), ok: t('reb.go'), color: 'green' });
                if (!ok) return;
                const r = this.rebirth();
                if (!r.ok) { GameUI.toast(t('reb.notMet'), 'bad'); return; }
                this._rebirthFx(r);
                this._updateBadges(true);
                if (!ctx.closed) ctx.refresh();
            } finally { this._rebBusy = false; }
        },
        /** Один подтверждённый просмотр рекламы «Пропустить»: прогресс; после последнего — перерождение без потерь. */
        _skipReward(ctx) {
            const r = this.skipStep();
            if (!r.ok) return;
            if (r.done) { if (r.result && r.result.ok) { this._rebirthFx(r.result); this._updateBadges(true); } }
            else { GameUI.sfx('unlock', { volume: 0.5 }); GameUI.toast(t('reb.skipStep', { a: r.progress, b: r.views }), 'good', 2200); }
            if (ctx && !ctx.closed) ctx.refresh();
        },
        openRebirth() {
            const self = this;
            return openPanelEx({
                id: 'rebirth', title: t('reb.title'), width: 'min(calc(var(--u)*660),100%)',
                parts: [{
                    key: 'main',
                    sig: () => {
                        const st = self.rebirthStatus();
                        return st.max ? 'max' : [st.n, st.cashOk ? 1 : 0, st.hasPet ? 1 : 0, S().rebirthSkip, S().rebirths, S().slots].join('|');
                    },
                    render: (box, ctx, part) => {
                        ctx.data.prog = null;
                        const st = self.rebirthStatus(), s = S(), views = cfg().skipViews;
                        box.appendChild(E('div', { class: 'rb-sub', text: t('reb.sub') }));
                        box.appendChild(E('div', { class: 'rb-count', text: t('reb.count', { a: s.rebirths, b: GameData.REBIRTHS.length }) }));
                        if (st.max) {
                            const b = SHOPS_RANCH_BASES[Math.min(s.rebirths, SHOPS_RANCH_BASES.length - 1)];
                            box.append(
                                E('div', { class: 'rb-row' },
                                    E('div', { class: 'rb-box' }, E('div', { class: 'big', html: GameUI.icon('banknote') + '<span>' + st.n + '×</span>' }), E('div', { class: 'cap', text: t('reb.cashMult') })),
                                    E('div', { class: 'rb-box' }, E('div', { class: 'big', html: GameUI.icon('crown') }), E('div', { class: 'cap', text: t('reb.max') })),
                                    b ? E('div', { class: 'rb-box' }, E('div', { html: fenceHtml(b) }), E('div', { class: 'cap', text: t('reb.base.' + s.rebirths) })) : null));
                            return;
                        }
                        const base = SHOPS_RANCH_BASES[Math.min(st.n, SHOPS_RANCH_BASES.length - 1)];
                        box.appendChild(E('div', { class: 'rb-sec', text: t('reb.rewards') }));
                        box.appendChild(E('div', { class: 'rb-row' },
                            E('div', { class: 'rb-box' },
                                E('div', { class: 'big', html: GameUI.icon('banknote') + '<span>' + st.fromMult + '×</span><i class="rb-arrow"></i><span>' + st.mult + '×</span>' }),
                                E('div', { class: 'cap', text: t('reb.cashMult') })),
                            E('div', { class: 'rb-box' },
                                E('div', { class: 'big', html: GameUI.icon('paw') + '<span>+1</span>' }),
                                E('div', { class: 'cap', text: t('reb.slotCap', { a: s.slots, b: s.slots + 1 }) })),
                            E('div', { class: 'rb-box' },
                                E('div', { html: fenceHtml(base) }),
                                E('div', { class: 'cap', text: t('reb.base') + ': ' + t('reb.base.' + st.n) }))));
                        const bar = E('i'), txt = E('span');
                        const prog = E('div', { class: 'rb-prog' }, bar, txt);
                        ctx.data.prog = { bar, txt, need: st.cashNeed, last: '', met: st.cashOk };
                        box.appendChild(E('div', { class: 'rb-sec', text: t('reb.reqs') }));
                        box.appendChild(E('div', { class: 'rb-row' },
                            E('div', { class: 'rb-req' + (st.cashOk ? ' met' : '') }, prog, E('div', { class: 'cap', text: t('reb.cashNeed') })),
                            E('div', { class: 'rb-req' + (st.hasPet ? ' met' : '') },
                                E('div', { class: 'rb-petbox' },
                                    E('div', { html: petPic({ species: st.petId, age: 1 }, 84, false, !st.hasPet, st.hasPet ? 'has' : '') }),
                                    E('div', { class: 'rb-ok' + (st.hasPet ? '' : ' no'), html: GameUI.icon(st.hasPet ? 'check' : 'cross') })),
                                E('div', { class: 'cap', text: GameData.petName(st.petId) + ' · ' + t(st.hasPet ? 'reb.have' : 'reb.missing') }))));
                        const go = E('button', { type: 'button', class: 'gb big rb-go' + (st.met ? '' : ' off'), text: t('reb.go') });
                        GameUI._press(go, () => { self._rebirthUI(ctx); });
                        const skip = adButton(part, {
                            id: 'rebirth-skip', cls: 'pink rb-skip',
                            html: () => '<b>' + esc(t('reb.skip')) + '</b><em>' + esc(t('reb.keep')) + '</em><small>' + GameUI.icon('play') + esc(t('reb.skipProgress', { a: s.rebirthSkip, b: views })) + '</small>',
                            onReward: () => self._skipReward(ctx),
                        });
                        box.append(E('div', { class: 'rb-btns' }, go, skip), adNote(part));
                        self._rebirthTick(ctx);
                    },
                }],
                tick: (ctx) => self._rebirthTick(ctx),
            });
        },
        /** Полоса денег в окне перерождения обновляется на лету, без перерисовки окна. */
        _rebirthTick(ctx) {
            const p = ctx.data.prog;
            if (!p) return;
            const cash = S().cash;
            const txt = money(cash) + ' / ' + money(p.need);
            if (txt === p.last) return;
            p.last = txt;
            p.bar.style.width = Math.round(GameUtil.clamp(cash / Math.max(1, p.need), 0, 1) * 100) + '%';
            p.txt.innerHTML = GameUI.icon('banknote') + '<span>' + esc(txt) + '</span>';
            const met = cash + 1e-6 >= p.need;
            if (met !== p.met) { p.met = met; if (ctx.refresh) ctx.refresh('main'); }
        },

        // =============================================================================================
        // ИНТЕРФЕЙС: Магазин яиц за рекламу (Драконье и Гигантское яйцо)
        // =============================================================================================
        /** Один подтверждённый просмотр рекламы пакета: прогресс на кнопке; после последнего — сцена с результатами. */
        _bundleReward(kind, rolls, ctx) {
            const r = this.bundleStep(kind, rolls);
            if (!r.ok) return;
            if (ctx && !ctx.closed) ctx.refresh('cards');
            if (!r.done) {
                GameUI.sfx('unlock', { volume: 0.5 });
                GameUI.toast(t('esh.progress', { a: r.progress, b: r.views }), 'good', 2200);
                return;
            }
            this._updateBadges(true);
            this._showShopResults(kind, r.results || []);
        },
        _shopCard(kind, ctx, part) {
            const self = this;
            const odds = GameData.shopOdds(kind);
            const head = E('div', { class: 'es-head otx' }, E('b', { text: t('esh.' + kind) }), E('span', { class: 'es-pill', text: t('esh.instant') }));
            const art = E('div', { class: 'es-art' }, E('img', { alt: '', src: eggArt(kind) }));
            if (kind === 'giant') art.appendChild(E('span', { class: 'sh-tag huge', text: t('huge.tag') }));
            const info = E('div', { class: 'es-info' });
            if (kind === 'dragon') {
                info.appendChild(E('div', { class: 'es-desc', text: t('esh.dragonDesc') }));
                const tiles = E('div', { class: 'es-tiles' });
                for (const o of odds) {
                    tiles.appendChild(E('div', { class: 'es-tile' + (o.species === 'dragon' ? ' hl' : ''), style: { '--rc': GameData.rarityColor(GameData.PETS[o.species].rarity) },
                        html: petImg(o.species) + '<b>' + esc(pctText(o.pct)) + '</b><span>' + esc(GameData.petName(o.species)) + '</span>' }));
                }
                info.appendChild(tiles);
            } else {
                const q = E('button', { type: 'button', class: 'gb yellow es-q', text: '?', title: t('esh.odds'), 'aria-label': t('esh.odds') });
                GameUI._press(q, () => { self._showOdds(); });
                const hc = GameData.hugeCfg();
                info.appendChild(E('div', { class: 'es-desc' }, E('span', { text: t('esh.giantDesc') }), q));
                info.appendChild(E('div', { class: 'sh-line', html: GameUI.icon('banknote') + '<span>' + esc(t('esh.giantBonus', { m: hc.income, k: hc.kg })) + '</span>' }));
                const tiles = E('div', { class: 'es-tiles' });
                for (const sp of ['pig', 'panda', 'lion']) {
                    tiles.appendChild(E('div', { class: 'es-tile sil', style: { '--rc': '#c98a0a' }, html: petImg(sp) + '<b>?</b><span>' + esc(t('huge.tag')) + '</span>' }));
                }
                info.appendChild(tiles);
            }
            const bund = E('div', { class: 'es-bund' });
            for (const bd of GameData.EGG_SHOP.bundles) {
                const prog = self.bundleProgress(kind, bd.rolls);
                bund.appendChild(adButton(part, {
                    id: self.bundleId(kind, bd.rolls), cls: (kind === 'dragon' ? 'orange' : 'blue') + ' es-b',
                    html: () => '<b>' + GameUI.icon('egg') + '×' + bd.rolls + '</b><small>' + esc(t('esh.watch', { a: prog, b: bd.views })) + '</small><span class="pg"><i style="width:' + Math.round(100 * prog / bd.views) + '%"></i></span>',
                    onReward: () => self._bundleReward(kind, bd.rolls, ctx),
                }));
            }
            return E('div', { class: 'es-card' }, head, E('div', { class: 'es-body' }, art, info), bund);
        },
        openEggShop() {
            const self = this;
            return openPanelEx({
                id: 'eggshop', title: t('esh.title'), wide: true,
                parts: [{
                    key: 'cards',
                    sig: () => Object.keys(S().shopAds).sort().map(k => k + '=' + S().shopAds[k]).join(','),
                    render: (box, ctx, part) => {
                        box.appendChild(adNote(part));
                        box.appendChild(E('div', { class: 'es-grid' }, self._shopCard('dragon', ctx, part), self._shopCard('giant', ctx, part)));
                        box.appendChild(E('div', { class: 'sh-note', text: t('esh.adNote') }));
                    },
                }],
            });
        },
        /** Окно «Шансы» Гигантского яйца. */
        _showOdds() {
            const odds = GameData.shopOdds('giant').sort((a, b) => b.pct - a.pct);
            GameUI.showModal({
                title: t('esh.oddsTitle'), cls: 'res-body', width: 'min(calc(var(--u)*640),100%)',
                build: (el, rec) => {
                    const grid = E('div', { class: 'es-odds' });
                    for (const o of odds) {
                        const d = GameData.PETS[o.species];
                        grid.appendChild(E('div', { class: 'es-tile2', style: { '--rc': GameData.rarityColor(d.rarity) },
                            html: petImg(o.species) + '<div class="nm">' + esc(GameData.petName(o.species)) + '</div><div class="sm">' + esc(pctText(o.pct)) + '</div>' }));
                    }
                    const ok = E('button', { type: 'button', class: 'gb orange', text: t('ui.close') });
                    GameUI._press(ok, () => rec.finish(true));
                    el.append(grid, E('div', { class: 'res-text', text: t('esh.oddsNote', { m: GameData.hugeCfg().income }) }), E('div', { class: 'res-btns' }, ok));
                },
            });
        },
        /** Результаты пакета: один бросок — сцена с яйцом и питомцем, несколько — сетка с подсветкой лучшего. Это не раунд. */
        _showShopResults(kind, results) {
            if (!results.length) return;
            if (results.length === 1) { this._showShopSingle(kind, results[0]); return; }
            const groups = groupResults(results), best = bestOf(results);
            const bestPet = best.pet;
            GameUI.flash('#fff4c0', 700);
            GameUI.sfx(GameData.PETS[best.species].chance >= 1e4 ? 'revealRare' : 'reveal', { volume: 0.85 });
            GameUI.showModal({
                title: t('esh.results', { n: results.length }), noEsc: true, light: true, cls: 'res-body', width: 'min(calc(var(--u)*780),100%)',
                build: (el, rec) => {
                    const grid = E('div', { class: 'es-res' });
                    groups.forEach((g, i) => {
                        const d = GameData.PETS[g.species];
                        const isBest = g.species === best.species && g.huge === !!best.huge;
                        grid.appendChild(E('div', { class: 'es-tile2 es-pop' + (isBest ? ' best' : ''), style: { '--rc': GameData.rarityColor(d.rarity), animationDelay: Math.min(i * 0.14, 3) + 's' },
                            html: (isBest ? '<span class="bst">' + esc(t('esh.best')) + '</span>' : '') + (g.count > 1 ? '<span class="ct">×' + g.count + '</span>' : '') +
                                petImg(g.species) + '<div class="nm">' + esc(GameData.petName(g.species)) + '</div>' +
                                '<div>' + rarityTag(d.rarity) + '</div><div>' + (g.huge ? '<span class="sh-tag huge" style="margin:0">' + esc(t('huge.tag')) + '</span>' : '') + (g.isNew ? '<span class="sh-tag free" style="margin:0">' + esc(t('esh.new')) + '</span>' : '') + '</div>' }));
                    });
                    const ride = E('button', { type: 'button', class: 'gb yellow', text: t('esh.rideBest') });
                    const next = E('button', { type: 'button', class: 'gb orange', text: t('esh.next') });
                    GameUI._press(ride, () => { rec.finish(true); rideNow(bestPet.uid); });
                    GameUI._press(next, () => rec.finish(true));
                    el.append(grid, E('div', { class: 'res-text', text: t('esh.hint') }), E('div', { class: 'res-btns' }, ride, next));
                },
            });
        },
        _showShopSingle(kind, r) {
            const pet = r.pet, d = GameData.PETS[pet.species], rar = GameData.RARITY[d.rarity];
            GameUI.sfx('crack', { volume: 0.7 });
            GameUI.showModal({
                title: t('esh.' + kind), noEsc: true, light: true, cls: 'res-body',
                build: (el, rec) => {
                    el.appendChild(E('div', { class: 'res', style: { minHeight: 'calc(var(--u)*196)' } },
                        E('img', { class: 'es-shake', alt: '', src: eggArt(kind), style: { width: 'calc(var(--u)*128)', height: 'auto' } })));
                    window.setTimeout(() => {
                        if (rec.done) return;
                        GameUI.flash('#fff4c0', 700);
                        GameUI.sfx(rar.rank >= GameData.RARITY.epic.rank ? 'revealRare' : 'reveal', { volume: 0.85 });
                        GameUtil.clear(el);
                        const ico = E('div', { class: 'res-ico es-pop rar-' + d.rarity, style: { '--rc': rar.color }, html: GameUI.petIcon(pet.species, 128) });
                        if (r.isNew) ico.appendChild(E('span', { class: 'res-new', text: t('esh.new') }));
                        const stat = (icon, text) => E('div', { class: 'st', html: GameUI.icon(icon) + '<span>' + esc(text) + '</span>' });
                        const info = E('div', { class: 'res-info' },
                            E('div', { class: 'res-name otx', text: GameData.petName(pet.species), style: { color: rar.color } }),
                            E('div', { class: 'res-rar otx-s', text: GameData.rarityName(d.rarity) + ' · ' + t('idx.chance', { n: GameUtil.fmt(d.chance) }), style: { color: rar.color } }),
                            E('div', { html: petTags(pet) }),
                            E('div', { class: 'res-stats otx-s' },
                                stat('bolt', GameUtil.fmt(GameState.petSpeed(pet))),
                                stat('banknote', t('hatch.perSec', { v: money(GameState.petIncome(pet)) })),
                                E('div', { class: 'st', html: '<span>' + esc(t('hatch.weight') + ': ' + GameUtil.fmtKg(GameState.petKg(pet))) + '</span>' })));
                        const ride = E('button', { type: 'button', class: 'gb yellow', text: t('esh.ride') });
                        const next = E('button', { type: 'button', class: 'gb orange', text: t('esh.next') });
                        GameUI._press(ride, () => { rec.finish(true); rideNow(pet.uid); });
                        GameUI._press(next, () => rec.finish(true));
                        el.append(E('div', { class: 'res' }, ico, info), E('div', { class: 'res-btns' }, ride, next));
                    }, 1100);
                },
            });
        },

        // =============================================================================================
        // Модуль Game
        // =============================================================================================
        /** Значки на кнопках: Индекс — число неполученных наград, Перерождение — 1, когда требования выполнены. */
        _updateBadges(force) {
            const n = this.unclaimed().length;
            if (force || n !== this._lastIdxBadge) { this._lastIdxBadge = n; GameUI.setBadge('index', n); }
            const st = this.rebirthStatus();
            const r = !st.max && st.met ? 1 : 0;
            if (force || r !== this._lastRebBadge) { this._lastRebBadge = r; GameUI.setBadge('rebirth', r); }
        },
        init(app) {
            this.app = app;
            GameUI.addCss('shops', SHOPS_CSS);
            GameUI.addSideButton({ id: 'index', side: 'left', icon: 'book', label: t('idx.btn'), color: 'orange', onClick: () => { this.openIndex(); } });
            const reb = GameUI.addSideButton({ id: 'rebirth', side: 'left', icon: 'rebirth', label: t('reb.btn'), color: 'green', onClick: () => { this.openRebirth(); } });
            if (reb) reb.classList.add('sh-long');   // та же ширина, что у соседних кнопок; длинная подпись — мельче
            GameUI.addSideButton({ id: 'eggshop', side: 'right', icon: 'shop', label: t('esh.btn'), color: 'yellow', onClick: () => { this.openEggShop(); } });
            this._buildChip();
            /** @type {Record<string, () => any>} */
            this._openers = {
                upgrades: () => this.openUpgrades(), food: () => this.openFood(), gears: () => this.openGears(),
                track: () => this.openTrack(), sell: () => this.openSell(),
            };
            Game.events.on('stall:open', (e) => {
                const open = this._openers[e && e.id];
                if (!open) return;
                e.handled = true;
                open();
            });
            Game.events.on('egg:picked', (e) => {
                if (this.lock && e && e.egg && e.egg.uid === this.lock.egg.uid) this.endLock('picked');
            });
            Game.events.on('pet:hatched', () => { this.noteBest(); this._updateBadges(false); });
            Game.events.on('pet:aged', () => { this.noteBest(); });
            // косметика ранчо снята — возвращаем забор «базы» по числу перерождений
            Game.events.on('cosmetics:changed', (e) => { if (e && e.slot === 'ranch') this.applyRanchBase(true); });
        },
        onLoad() {
            this.endLock('reset', true);
            this._foodSel = null;
            this._idxTab = 'pets';
            this._baseApplied = -1;
            this._pendingAuto = this._initRestock();
            this.noteBest();
            this.applyRanchBase();
            this._updateBadges(true);
        },
        ready() {
            this.applyRanchBase();
            this._updateBadges(true);
            for (const b of this._pendingAuto) GameUI.toast(t('stl.gears.autoBought', { name: GameData.radarName(b.id), n: b.n }), 'good');
            this._pendingAuto = [];
        },
        update(dt) {
            this._tickRestock(dt);
            this._tickLock(dt);
            this._badgeT -= dt;
            if (this._badgeT <= 0) { this._badgeT = 0.5; this._updateBadges(false); }
        },
    };
})();

Game.register(Shops);
