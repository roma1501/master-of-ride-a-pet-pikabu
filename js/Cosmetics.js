// Cosmetics.js — гардероб: каталог косметики, окно «Гардероб», примерка на наезднике и питомце.
//
// Шесть вкладок (около 35% предметов за лапки, около 65% за рекламу — 1…5 просмотров, прогресс «За рекламу 2/5» сохраняется):
//   outfit  — 30 нарядов (цвета пяти слотов наездника + причёска, Player.setLook) и 3 ЭКСКЛЮЗИВА Подарка дня (не продаются, на колесе не выпадают)
//   hat     — 30 шапок   (узлы C_hat_*  из assets/models/rider/cosmetics_a.glb, Player.wear('hat'))
//   face    — 20 лиц     (узлы C_face_* из cosmetics_a.glb,                       Player.wear('face'))
//   back    — 24 спины   (узлы C_back_* из assets/models/rider/cosmetics_b.glb, Player.wear('back'); крылья и плащ качаются)
//   saddle  — 24 седла   (процедурные меши из примитивов PetView, PetView.setSaddle; наездник приподнят на высоту седла)
//   trail   — 24 следа   (одна непрерывная система частиц app.fx за хвостом ездового питомца, только в движении)
// GLB косметики кладёт вершины в мировые координаты модели наездника (узел несёт сдвиг Head/Torso), а RiderView.attach ждёт вершины
// относительно сустава: build() переносит начало предмета в его pivot (узел C_*), крылья — в узлы-шарниры (Flap*).
//
// ПУБЛИЧНЫЙ API (Daily Gift и колесо — DailyWheel.js):
//   Cosmetics.CATALOG        массив { id, tab, key, name (ключ Lang), rarity, price (лапки) | ads (просмотры), exclusive? }
//   Cosmetics.EXCLUSIVE      ['outfit_golden_cowboy', 'outfit_shadow_ninja', 'outfit_cosmic_explorer'] — по кругам Подарка дня
//   Cosmetics.get(id) / itemName(id) / isOwned(id) / isEquipped(id) / equippedId(tab)
//   Cosmetics.grant(id) -> true, если выдан впервые (false: уже есть или нет такого id); не надевает
//   Cosmetics.equip(id) -> bool (только свои предметы), unequip(tab); примерка без покупки — Cosmetics.preview(id)
//   Cosmetics.buy(id) -> { ok, reason } (лапки), watchAd(id) -> Promise<{ ok, progress, need, unlocked }> (rewarded id 'shop-unlock')
//   Cosmetics.addAdView(id) -> { progress, need, unlocked } — один засчитанный просмотр (после подтверждения SDK)
//   Cosmetics.randomShopItem({ notOwned: true, maxRarity: 'epic', rng }) -> предмет | null (эксклюзивы — никогда)
//   Cosmetics.thumb(id, size?) -> Promise<dataURL> (кэш; в браузере — thenable <img>: await даёт dataURL, узел можно сразу вставить в DOM),
//   thumbSync(id) -> dataURL | null, thumbNode(id, size?) -> <img>, заполняется по готовности
//   Cosmetics.open(tab?) / close() / isOpen()  окно гардероба (кнопка «Гардероб» справа на HUD)
// Сохраняется: GameState.state.cosmetics { owned: { id: true }, equipped: { outfit, hat, face, back, saddle, trail, … }, adProgress: { id: n } }.
// События (Game.events): cosmetics:changed { slot, id, granted? }.
// Rewarded: id 'shop-unlock', кнопка GameUI.rewardButton «За рекламу a/b»; просмотры не раунды (Platform.ads.roundEnded не зовётся).

const Cosmetics = (() => {
    const U = 'undefined';
    const CFG = {
        pawsCommon: typeof COS_PAWS_COMMON !== U ? COS_PAWS_COMMON : 15,
        pawsUncommon: typeof COS_PAWS_UNCOMMON !== U ? COS_PAWS_UNCOMMON : 40,
        pawsRare: typeof COS_PAWS_RARE !== U ? COS_PAWS_RARE : 90,
        pawsEpic: typeof COS_PAWS_EPIC !== U ? COS_PAWS_EPIC : 200,
        pawsSkin: typeof COS_SKIN_PAWS !== U ? COS_SKIN_PAWS : 600,
        adsCommon: typeof COS_ADS_COMMON !== U ? COS_ADS_COMMON : 1,
        adsUncommon: typeof COS_ADS_UNCOMMON !== U ? COS_ADS_UNCOMMON : 2,
        adsRare: typeof COS_ADS_RARE !== U ? COS_ADS_RARE : 3,
        adsEpic: typeof COS_ADS_EPIC !== U ? COS_ADS_EPIC : 4,
        adsLegendary: typeof COS_ADS_LEGENDARY !== U ? COS_ADS_LEGENDARY : 5,
        trailRate: typeof COS_TRAIL_RATE !== U ? COS_TRAIL_RATE : 1,
        thumbPx: typeof COS_THUMB_PX !== U ? COS_THUMB_PX : 128,
        camDist: typeof COS_CAM_DIST !== U ? COS_CAM_DIST : 1,
    };
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

    // =============================================================================================
    // Тексты
    // =============================================================================================
    // Названия предметов: [ru, en]. Ключ Lang — 'cos.<вкладка>_<ключ>'.
    /** @type {Record<string, Record<string, [string, string]>>} */
    const NAMES = {
        outfit: {
            farmer: ['Фермер', 'Farmer'], gardener: ['Садовник', 'Gardener'], skater: ['Скейтер', 'Skater'], pajama: ['Пижама', 'Pajamas'],
            beach: ['Пляжник', 'Beachgoer'], sailor: ['Моряк', 'Sailor'], mechanic: ['Механик', 'Mechanic'], chef: ['Повар', 'Chef'],
            winter: ['Зимний наряд', 'Winter Coat'], detective: ['Детектив', 'Detective'], doctor: ['Доктор', 'Doctor'], cowboy: ['Ковбой', 'Cowboy'],
            racer: ['Гонщик', 'Racer'], artist: ['Художник', 'Artist'], firefighter: ['Пожарный', 'Firefighter'], explorer: ['Исследователь', 'Explorer'],
            pilot: ['Пилот', 'Pilot'], jungle: ['Рейнджер джунглей', 'Jungle Ranger'], scientist: ['Учёный', 'Scientist'], disco: ['Диско-звезда', 'Disco Star'],
            ninja: ['Ниндзя', 'Ninja'], pirate: ['Пират', 'Pirate'], samurai: ['Самурай', 'Samurai'], viking: ['Викинг', 'Viking'],
            hero: ['Супергерой', 'Superhero'], knight: ['Рыцарь', 'Knight'], wizard: ['Волшебник', 'Wizard'], royal: ['Король', 'Royal'],
            astronaut: ['Астронавт', 'Astronaut'], cyber: ['Киберраннер', 'Cyber Runner'],
            golden_cowboy: ['Золотой ковбой', 'Golden Cowboy'], shadow_ninja: ['Теневой ниндзя', 'Shadow Ninja'], cosmic_explorer: ['Космический исследователь', 'Cosmic Explorer'],
            // мифические скины на всё тело (RiderModel.SKIN_FILES)
            skin_croissanto: ['Круассанто Элефанто', 'Croissanto Elefanto'], skin_bananino: ['Пингвино Бананино', 'Pinguino Bananino'],
            skin_teiera: ['Тейера Риноцера', 'Teiera Rinocera'], skin_pizzagatto: ['Пиццагатто Воланте', 'Pizzagatto Volante'],
            skin_cactusso: ['Кактуссо Ламарино', 'Cactusso Lamarino'], skin_67: ['67', '67'],
        },
        hat: {
            astro: ['Шлем астронавта', 'Space Helmet'], beanie: ['Шапка-бини', 'Beanie'], bucket: ['Панама', 'Bucket Hat'], bunny: ['Заячьи уши', 'Bunny Ears'],
            cap: ['Кепка', 'Baseball Cap'], chef: ['Колпак повара', 'Chef Hat'], chicken: ['Шляпа-курица', 'Chicken Hat'], cowboy: ['Ковбойская шляпа', 'Cowboy Hat'],
            crown: ['Корона', 'Crown'], eggshell: ['Яичная скорлупа', 'Eggshell Helmet'], flower: ['Цветочный венок', 'Flower Crown'], frog: ['Шапка-лягушка', 'Frog Hat'],
            grad: ['Выпускная шапочка', 'Graduation Cap'], halo: ['Нимб', 'Halo'], headphones: ['Наушники', 'Headphones'], jester: ['Колпак шута', 'Jester Hat'],
            miner: ['Каска шахтёра', 'Miner Helmet'], mushroom: ['Грибная шляпка', 'Mushroom Cap'], nest: ['Гнездо на голове', 'Nest Hat'], ninja: ['Повязка ниндзя', 'Ninja Headband'],
            party: ['Праздничный колпак', 'Party Hat'], pirate: ['Пиратская треуголка', 'Pirate Hat'], propeller: ['Шапка с пропеллером', 'Propeller Cap'], sombrero: ['Сомбреро', 'Sombrero'],
            straw: ['Соломенная шляпа', 'Straw Hat'], top: ['Цилиндр', 'Top Hat'], ufo: ['Шляпа-НЛО', 'UFO Hat'], unicorn: ['Шапка-единорог', 'Unicorn Hat'],
            viking: ['Шлем викинга', 'Viking Helmet'], wizard: ['Шляпа волшебника', 'Wizard Hat'],
        },
        face: {
            aviator: ['Очки-авиаторы', 'Aviator Goggles'], beak: ['Клюв', 'Beak'], beard: ['Борода', 'Beard'], clown: ['Нос клоуна', 'Clown Nose'],
            cyber: ['Кибервизор', 'Cyber Visor'], diamond: ['Алмазные очки', 'Diamond Glasses'], glasses: ['Очки', 'Glasses'], heart: ['Очки-сердечки', 'Heart Glasses'],
            hero: ['Маска героя', 'Hero Mask'], masquerade: ['Карнавальная маска', 'Masquerade Mask'], monocle: ['Монокль', 'Monocle'], mustache: ['Усы', 'Mustache'],
            nerd: ['Очки умника', 'Nerd Glasses'], ninja: ['Маска ниндзя', 'Ninja Mask'], patch: ['Повязка на глаз', 'Eye Patch'], pixel: ['Пиксельные очки', 'Pixel Shades'],
            shades: ['Тёмные очки', 'Sunglasses'], ski: ['Лыжная маска', 'Ski Goggles'], snorkel: ['Маска для плавания', 'Snorkel Mask'], star: ['Звёздные очки', 'Star Glasses'],
        },
        back: {
            angel: ['Крылья ангела', 'Angel Wings'], backpack: ['Рюкзак', 'Backpack'], balloons: ['Воздушные шары', 'Balloons'], basket: ['Корзина', 'Basket'],
            bat: ['Крылья летучей мыши', 'Bat Wings'], butterfly: ['Крылья бабочки', 'Butterfly Wings'], cape: ['Плащ', 'Cape'], chest: ['Сундук с сокровищами', 'Treasure Chest'],
            chickpack: ['Рюкзак-курица', 'Chicken Pack'], fairy: ['Крылья феи', 'Fairy Wings'], goldegg: ['Золотое яйцо', 'Golden Egg'], guitar: ['Гитара', 'Guitar'],
            incubator: ['Инкубатор', 'Incubator'], jetpack: ['Реактивный ранец', 'Jetpack'], kite: ['Воздушный змей', 'Kite'], nest: ['Гнездо с яйцами', 'Nest Pack'],
            phoenix: ['Крылья феникса', 'Phoenix Wings'], quiver: ['Колчан', 'Quiver'], rocket: ['Ракета за спиной', 'Rocket Pack'], shield: ['Щит', 'Shield'],
            surf: ['Доска для сёрфинга', 'Surfboard'], sword: ['Меч', 'Sword'], teddy: ['Плюшевый мишка', 'Teddy Bear'], turtle: ['Панцирь черепахи', 'Turtle Shell'],
        },
        saddle: {
            leather: ['Кожаное седло', 'Leather Saddle'], blanket: ['Шерстяной плед', 'Wool Blanket'], hay: ['Тюк сена', 'Hay Bale'], pillow: ['Мягкая подушка', 'Cozy Pillow'],
            flower: ['Цветочное седло', 'Flower Saddle'], candy: ['Конфетное седло', 'Candy Saddle'], racing: ['Гоночное седло', 'Racing Saddle'], viking: ['Седло викинга', 'Viking Saddle'],
            mushroom: ['Грибное седло', 'Mushroom Saddle'], pumpkin: ['Тыквенное седло', 'Pumpkin Saddle'], cloud: ['Облачное седло', 'Cloud Saddle'], pirate: ['Пиратское седло', 'Pirate Saddle'],
            knight: ['Рыцарское седло', 'Knight Saddle'], bamboo: ['Бамбуковое кресло', 'Bamboo Seat'], ice: ['Ледяное седло', 'Ice Saddle'], royal: ['Королевское седло', 'Royal Saddle'],
            crystal: ['Хрустальное седло', 'Crystal Saddle'], lava: ['Лавовое седло', 'Lava Saddle'], rainbow: ['Радужное седло', 'Rainbow Saddle'], sakura: ['Седло цветущей сакуры', 'Cherry Blossom Saddle'],
            throne: ['Золотой трон', 'Golden Throne'], ufo: ['Космическая тарелка', 'Space Saucer'], dragon: ['Драконье седло', 'Dragon Saddle'], cyber: ['Неоновое седло', 'Neon Saddle'],
        },
        trail: {
            sparkle: ['Искорки', 'Sparkles'], dust: ['Облачка пыли', 'Dust Puffs'], leaves: ['Листопад', 'Falling Leaves'], bubbles: ['Пузырьки', 'Bubbles'],
            hearts: ['Сердечки', 'Hearts'], snow: ['Снежинки', 'Snowflakes'], petals: ['Лепестки', 'Petals'], stars: ['Звёзды', 'Stars'],
            confetti: ['Конфетти', 'Confetti'], notes: ['Ноты', 'Music Notes'], fireflies: ['Светлячки', 'Fireflies'], candy: ['Конфетки', 'Candy Drops'],
            fire: ['Огонь', 'Flames'], ice: ['Ледяные осколки', 'Ice Shards'], rainbow: ['Радуга', 'Rainbow'], coins: ['Золотые монеты', 'Gold Coins'],
            lightning: ['Молнии', 'Lightning'], galaxy: ['Галактика', 'Galaxy'], magic: ['Волшебные искры', 'Magic Sparks'], slime: ['Слизь', 'Slime'],
            aurora: ['Северное сияние', 'Aurora'], phoenix: ['Угли феникса', 'Phoenix Embers'], diamonds: ['Бриллианты', 'Diamonds'], comet: ['Комета', 'Comet'],
        },
    };
    /** @type {Record<string, string>} */
    const ruDict = {}, enDict = {};
    for (const tab of Object.keys(NAMES)) {
        for (const key of Object.keys(NAMES[tab])) {
            ruDict['cos.' + tab + '_' + key] = NAMES[tab][key][0];
            enDict['cos.' + tab + '_' + key] = NAMES[tab][key][1];
        }
    }
    Lang.add({
        ru: Object.assign(ruDict, {
            'cw.btn': 'Гардероб', 'cw.title': 'Гардероб',
            'cw.tab.outfit': 'Наряды', 'cw.tab.hat': 'Шапки', 'cw.tab.face': 'Лицо', 'cw.tab.back': 'Спина', 'cw.tab.saddle': 'Сёдла', 'cw.tab.trail': 'Следы',
            'cw.none.outfit': 'Стандартный', 'cw.none.item': 'Без предмета',
            'cw.owned': 'Куплено', 'cw.equipped': 'Надето', 'cw.exclusive': 'Подарок дня',
            'cw.equip': 'Надеть', 'cw.unequip': 'Снять', 'cw.buy': 'Купить', 'cw.try': 'Примерка',
            'cw.adsProgress': 'За рекламу {a}/{b}',
            'cw.adReward': 'Откроется после рекламы: {a} из {b}',
            'cw.adCounted': 'Просмотр засчитан: {a} из {b}',
            'cw.needPaws': 'Не хватает лапок: нужно {n}',
            'cw.bought': 'Куплено: {name}!', 'cw.unlocked': 'Открыто: {name}!', 'cw.wearing': 'Надето: {name}', 'cw.removed': 'Снято',
            'cw.collected': 'Собрано: {a} из {b}', 'cw.paws': 'Лапки',
            'cw.nowNone': 'Сейчас надето: ничего', 'cw.nowOutfit': 'Сейчас надет стандартный наряд',
            'cw.rotate': 'Потяните, чтобы повернуть',
            'cw.exclusiveHint': 'Достаётся только из Подарка дня',
        }),
        en: Object.assign(enDict, {
            'cw.btn': 'Wardrobe', 'cw.title': 'Wardrobe',
            'cw.tab.outfit': 'Outfits', 'cw.tab.hat': 'Hats', 'cw.tab.face': 'Face', 'cw.tab.back': 'Back', 'cw.tab.saddle': 'Saddles', 'cw.tab.trail': 'Trails',
            'cw.none.outfit': 'Default', 'cw.none.item': 'Nothing',
            'cw.owned': 'Owned', 'cw.equipped': 'Worn', 'cw.exclusive': 'Daily Gift',
            'cw.equip': 'Equip', 'cw.unequip': 'Take off', 'cw.buy': 'Buy', 'cw.try': 'Trying on',
            'cw.adsProgress': 'Watch ad {a}/{b}',
            'cw.adReward': 'Unlocks after ads: {a} of {b}',
            'cw.adCounted': 'Ad counted: {a} of {b}',
            'cw.needPaws': 'Not enough paws: need {n}',
            'cw.bought': 'Bought: {name}!', 'cw.unlocked': 'Unlocked: {name}!', 'cw.wearing': 'Now wearing: {name}', 'cw.removed': 'Taken off',
            'cw.collected': 'Collected: {a} of {b}', 'cw.paws': 'Paws',
            'cw.nowNone': 'Currently wearing nothing', 'cw.nowOutfit': 'Currently wearing the default outfit',
            'cw.rotate': 'Drag to rotate',
            'cw.exclusiveHint': 'Only comes from the Daily Gift',
        }),
    });

    // =============================================================================================
    // Каталог
    // =============================================================================================
    const TABS = ['outfit', 'hat', 'face', 'back', 'saddle', 'trail'];
    const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };
    // Строки таблицы: ключ:редкость(c u r e l):оплата(p — лапки, a — реклама). Порядок — порядок в сетке внутри редкости.
    /** @type {Record<string, string>} */
    const ROWS = {
        outfit: 'farmer:c:p gardener:c:p skater:c:p pajama:c:p beach:u:p sailor:u:p mechanic:u:p chef:u:p winter:r:p detective:r:p doctor:r:p ' +
            'cowboy:u:a racer:u:a artist:u:a firefighter:u:a explorer:r:a pilot:r:a jungle:r:a scientist:r:a disco:r:a ' +
            'ninja:e:a pirate:e:a samurai:e:a viking:e:a hero:e:a knight:l:a wizard:l:a royal:l:a astronaut:l:a cyber:l:a',
        hat: 'beanie:c:p cap:c:p bucket:c:p bunny:u:p straw:u:p chef:u:p miner:u:p cowboy:r:p headphones:r:p top:e:p ' +
            'grad:c:a chicken:c:a propeller:u:a party:u:a frog:u:a flower:u:a mushroom:r:a nest:r:a eggshell:r:a sombrero:r:a pirate:r:a ' +
            'ninja:e:a viking:e:a jester:e:a astro:e:a crown:l:a halo:l:a ufo:l:a unicorn:l:a wizard:l:a',
        face: 'glasses:c:p mustache:c:p nerd:c:p shades:u:p heart:u:p pixel:r:p patch:r:p ' +
            'beak:c:a clown:u:a beard:u:a ski:u:a hero:r:a monocle:r:a star:r:a snorkel:r:a ninja:e:a aviator:e:a masquerade:e:a cyber:l:a diamond:l:a',
        back: 'backpack:c:p basket:c:p kite:c:p turtle:u:p quiver:u:p teddy:u:p cape:r:p sword:r:p ' +
            'surf:u:a guitar:u:a chickpack:u:a shield:u:a butterfly:r:a bat:r:a balloons:r:a nest:r:a chest:e:a incubator:e:a angel:e:a fairy:e:a ' +
            'jetpack:l:a rocket:l:a phoenix:l:a goldegg:l:a',
        saddle: 'leather:c:p blanket:c:p hay:c:p pillow:u:p flower:u:p candy:u:p racing:r:p viking:r:p ' +
            'mushroom:u:a pumpkin:u:a cloud:u:a pirate:r:a knight:r:a bamboo:r:a ice:r:a royal:e:a crystal:e:a lava:e:a rainbow:e:a sakura:e:a ' +
            'throne:l:a ufo:l:a dragon:l:a cyber:l:a',
        trail: 'sparkle:c:p dust:c:p leaves:c:p bubbles:u:p hearts:u:p snow:u:p petals:r:p stars:r:p ' +
            'confetti:u:a notes:u:a fireflies:u:a candy:u:a fire:r:a ice:r:a rainbow:r:a coins:r:a lightning:e:a galaxy:e:a magic:e:a slime:e:a ' +
            'aurora:l:a phoenix:l:a diamonds:l:a comet:l:a',
    };
    const LETTER = { c: 'common', u: 'uncommon', r: 'rare', e: 'epic', l: 'legendary' };
    const PAWS_BY = { common: CFG.pawsCommon, uncommon: CFG.pawsUncommon, rare: CFG.pawsRare, epic: CFG.pawsEpic, legendary: CFG.pawsEpic };
    const ADS_BY = { common: CFG.adsCommon, uncommon: CFG.adsUncommon, rare: CFG.adsRare, epic: CFG.adsEpic, legendary: CFG.adsLegendary };
    // Эксклюзивы Подарка дня — порядок по кругам (1-й, 2-й, 3-й).
    const EXCLUSIVE_KEYS = ['golden_cowboy', 'shadow_ninja', 'cosmic_explorer'];

    /** @typedef {{ id: string, tab: string, key: string, name: string, rarity: string, price?: number, ads?: number, exclusive?: boolean, skin?: string, order: number }} CosItem */
    /** @type {CosItem[]} */
    const CATALOG = [];
    /** @type {Record<string, CosItem>} */
    const BY_ID = {};
    for (const tab of TABS) {
        let order = 0;
        for (const row of ROWS[tab].split(/\s+/)) {
            const [key, r, kind] = row.split(':');
            const rarity = LETTER[r];
            /** @type {CosItem} */
            const item = { id: tab + '_' + key, tab, key, name: 'cos.' + tab + '_' + key, rarity, order: order++ };
            if (kind === 'p') item.price = PAWS_BY[rarity]; else item.ads = ADS_BY[rarity];
            CATALOG.push(item);
            BY_ID[item.id] = item;
        }
    }
    for (const key of EXCLUSIVE_KEYS) {
        const item = { id: 'outfit_' + key, tab: 'outfit', key, name: 'cos.outfit_' + key, rarity: 'mythic', exclusive: true, order: 1000 };
        CATALOG.push(item);
        BY_ID[item.id] = item;
    }
    // Мифические скины на всё тело (вкладка «Наряды»): пять за рекламу — 3…7 просмотров, один («67») за лапки.
    // В каталог попадают только скины, у которых есть модель в RiderModel.SKIN_FILES.
    const SKIN_ROWS = [
        { key: 'skin_croissanto', ads: 3 }, { key: 'skin_bananino', ads: 4 }, { key: 'skin_teiera', ads: 5 },
        { key: 'skin_pizzagatto', ads: 6 }, { key: 'skin_cactusso', ads: 7 }, { key: 'skin_67', price: CFG.pawsSkin },
    ];
    SKIN_ROWS.forEach((r, i) => {
        if (typeof RiderModel === U || !RiderModel.SKIN_FILES || !RiderModel.SKIN_FILES[r.key]) return;
        /** @type {CosItem} */
        const item = { id: 'outfit_' + r.key, tab: 'outfit', key: r.key, name: 'cos.outfit_' + r.key, rarity: 'mythic', skin: r.key, order: 500 + i };
        if (r.price) item.price = r.price; else item.ads = r.ads;
        CATALOG.push(item);
        BY_ID[item.id] = item;
    });
    const EXCLUSIVE = EXCLUSIVE_KEYS.map(k => 'outfit_' + k);
    /**
     * Предметы вкладки в порядке сетки: сначала мифические скины (верхние ряды — видны сразу при открытии), дальше
     * редкость по возрастанию, за лапки раньше, чем за рекламу.
     */
    function tabItems(tab) {
        return CATALOG.filter(i => i.tab === tab && !i.exclusive).sort((a, b) =>
            (b.skin ? 1 : 0) - (a.skin ? 1 : 0) || (a.skin && b.skin ? a.order - b.order : 0) ||
            RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || (a.price ? 0 : 1) - (b.price ? 0 : 1) || a.order - b.order);
    }

    // =============================================================================================
    // Наряды: [куртка, брюки, волосы, кожа, футболка, причёска] — слоты tint1…tint5 наездника (RiderModel.setLook)
    // =============================================================================================
    // Оттенки кожи — от светлого до тёмного, поровну по разным нарядам; фантастических цветов кожи нет.
    const OUTFITS = {
        farmer: ['#c04a32', '#3e67a6', '#6b4a2b', '#e8b98a', '#f2e2b0', 'swept'],
        gardener: ['#5c9a46', '#7a5a3a', '#2b1d12', '#8d5a3b', '#fbe38a', 'bob'],
        skater: ['#f0b21e', '#33384a', '#1c1c22', '#f6cfa6', '#ffffff', 'spiky'],
        pajama: ['#8d86e0', '#6f69c9', '#8a5a2c', '#ffe2c6', '#cfc8ff', 'bob'],
        beach: ['#ff7a59', '#18a9c9', '#e8c070', '#d9a066', '#ffe14a', 'swept'],
        sailor: ['#f5f7fb', '#1e3a6a', '#3a2a1a', '#e8b98a', '#2d58a6', 'swept'],
        mechanic: ['#3c6fd8', '#34569c', '#15110f', '#6b4128', '#d9d9d9', 'swept'],
        chef: ['#fafafa', '#2e3138', '#7a4a22', '#f6cfa6', '#e8e8ee', 'bob'],
        winter: ['#d83a3a', '#37455f', '#e6e0d0', '#ffe2c6', '#3d86c8', 'long'],
        detective: ['#9b7653', '#4a4036', '#2a2018', '#b97a4a', '#efe6d2', 'swept'],
        doctor: ['#f4fbff', '#3aa0a8', '#241a14', '#e8b98a', '#3aa0a8', 'bob'],
        cowboy: ['#8a5a2a', '#3a5a96', '#4a2f18', '#d9a066', '#d84a3a', 'swept'],
        racer: ['#e4352b', '#23262e', '#1a1410', '#8d5a3b', '#fffffe', 'spiky'],
        artist: ['#7e4ea8', '#4a4a54', '#c1442e', '#f6cfa6', '#f6e9d0', 'long'],
        firefighter: ['#f2a21d', '#2a2f38', '#2b2018', '#b97a4a', '#d0342c', 'swept'],
        explorer: ['#b88a4a', '#6b5a3c', '#5a3a1e', '#e8b98a', '#f0e2b6', 'swept'],
        pilot: ['#3a4f6c', '#57606f', '#1c1814', '#f6cfa6', '#e8e2d4', 'swept'],
        jungle: ['#2f7d46', '#7a5a30', '#1a120d', '#6b4128', '#e4c24a', 'spiky'],
        scientist: ['#f2f5f7', '#3c4254', '#cfcbc0', '#ffe2c6', '#5ab0e0', 'bob'],
        disco: ['#b43cd9', '#f0f0f8', '#2a1710', '#4a2d1c', '#ffd23f', 'bob'],
        ninja: ['#1d1f2b', '#1d1f2b', '#14141a', '#f6cfa6', '#c0272d', 'spiky'],
        pirate: ['#8b1f2a', '#2a2a32', '#18110d', '#d9a066', '#f4ead2', 'long'],
        samurai: ['#b02a2a', '#2a2a46', '#101014', '#e8b98a', '#e8e2d2', 'spiky'],
        viking: ['#6b4a2a', '#4a3a28', '#d18a2a', '#ffe2c6', '#8d7a60', 'long'],
        hero: ['#2d5de0', '#d6272b', '#161410', '#b97a4a', '#ffd321', 'swept'],
        knight: ['#aab4c2', '#7d8796', '#6b4a2b', '#f6cfa6', '#6a7889', 'swept'],
        wizard: ['#3b2f8c', '#2a2266', '#e9e9ee', '#f6cfa6', '#7b5cd6', 'long'],
        royal: ['#7f1fa6', '#4b1a6b', '#4a2c1a', '#d9a066', '#f6d44a', 'swept'],
        astronaut: ['#f4f6fa', '#e5e9f0', '#222222', '#8d5a3b', '#ff7a29', 'swept'],
        cyber: ['#1c2230', '#12161f', '#19e6e0', '#e8b98a', '#18d2ff', 'spiky'],
        // эксклюзивы Подарка дня
        golden_cowboy: ['#f2b823', '#8a5a1e', '#5a3a14', '#d9a066', '#fff1a8', 'swept'],
        shadow_ninja: ['#17141f', '#17141f', '#0c0b10', '#e8b98a', '#7a2bd6', 'spiky'],
        cosmic_explorer: ['#3b2a8e', '#1a1448', '#5de2ff', '#b97a4a', '#ff5ec8', 'long'],
    };

    // =============================================================================================
    // Сёдла: процедурные меши из примитивов (один меш с вершинными цветами + необязательный светящийся меш)
    // =============================================================================================
    // Система координат седла — как у PetView.seat: x вперёд, y вверх, z вбок, начало — точка посадки (бёдра наездника на +4 px).
    // Размеры — в px для питомца шириной около 92 px; на других питомцах всё масштабируется (k). lift — на сколько приподнять наездника.
    // Детали: не копланарны (накладки выступают за основу ≥ 0.5 px), основа уходит под спину питомца — z-fighting нет.
    const PI = Math.PI;
    const B = (w, h, d, at, c, rot) => ({ k: 'box', a: [w, h, d], at, c, rot });
    const E = (sx, sy, sz, at, c, rot) => ({ k: 'ell', a: [sx, sy, sz], at, c, rot });
    const C = (h, dTop, dBot, at, c, rot) => ({ k: 'cyl', a: [h, dTop, dBot], at, c, rot });
    const K = (h, d, at, c, rot) => ({ k: 'cyl', a: [h, 0, d], at, c, rot });
    const sym = (fn) => [fn(1), fn(-1)];                         // зеркально по z
    const flat = (arrs) => [].concat(...arrs);

    /** @type {Record<string, () => { lift: number, main: any[], glow?: any[] }>} */
    const SADDLES = {
        leather: () => ({ lift: 7, main: [
            B(76, 12, 86, [0, 0, 0], '#7b4a26'), B(52, 2, 58, [2, 6.5, 0], '#a06836'),
            B(9, 22, 72, [-34, 9, 0], '#5a3418'), E(16, 15, 26, [34, 8, 0], '#5a3418'),
            ...flat(sym(s => [B(3, 26, 3, [2, -12, 45 * s], '#3a2412'), B(11, 3, 9, [2, -26, 45 * s], '#cfd4de'), B(6, 7, 2.5, [2, -2, 43.5 * s], '#f0c850')])),
        ] }),
        blanket: () => ({ lift: 6, main: [
            B(80, 10, 74, [0, 0, 0], '#d94a3a'),
            B(82, 2, 12, [0, 5.5, 0], '#f6e0a0'), B(82, 2, 5, [0, 5.5, -21], '#2d58a6'), B(82, 2, 5, [0, 5.5, 21], '#2d58a6'),
            ...flat(sym(s => [B(70, 24, 3, [0, -9, 38.5 * s], '#d94a3a'), B(72, 3, 4.6, [0, -3, 38.5 * s], '#f6e0a0'),
                ...[-28, -14, 0, 14, 28].map(x => B(5, 7, 2, [x, -24, 38.5 * s], '#f6e0a0'))])),
        ] }),
        hay: () => ({ lift: 11, main: [
            C(66, 32, 32, [0, -3, 0], '#e6c25a', [PI / 2, 0, 0]),
            C(8, 35, 35, [0, -3, -18], '#a67a2c', [PI / 2, 0, 0]), C(8, 35, 35, [0, -3, 18], '#a67a2c', [PI / 2, 0, 0]),
            K(12, 7, [0, -3, 36], '#f2d070', [PI / 2, 0, 0]), K(12, 7, [0, -3, -36], '#f2d070', [-PI / 2, 0, 0]),
            K(14, 6, [-8, 13, 14], '#f2d070', [0.5, 0, -0.4]), K(12, 6, [10, 12, -16], '#f2d070', [-0.4, 0, 0.5]),
        ] }),
        pillow: () => ({ lift: 9, main: [
            E(80, 24, 86, [0, 2, 0], '#ff9ec2'), E(14, 5, 14, [0, 13.8, 0], '#ffd7e6'),
            ...[[28, 30], [-28, 30], [28, -30], [-28, -30]].map(p => E(8, 8, 8, [p[0], 1, p[1]], '#ffe27a')),
        ] }),
        flower: () => {
            const bloom = (x, z, c) => [E(7, 7, 7, [x, 8.5, z], '#ffd93a'), E(9, 4, 9, [x + 7, 6.5, z], c), E(9, 4, 9, [x - 7, 6.5, z], c), E(9, 4, 9, [x, 6.5, z + 7], c), E(9, 4, 9, [x, 6.5, z - 7], c)];
            return { lift: 6, main: [
                B(74, 10, 82, [0, 0, 0], '#5fae4b'), E(30, 5, 18, [-22, 5, 0], '#7cc95c', [0, 0.5, 0]), E(30, 5, 18, [22, 5, 0], '#4f9a3f', [0, -0.5, 0]),
                ...bloom(-28, -27, '#ff7aa8'), ...bloom(-26, 27, '#ffffff'), ...bloom(14, -33, '#9b7bff'), ...bloom(14, 33, '#ff9a3c'), ...bloom(32, 0, '#ff7aa8'),
            ] };
        },
        candy: () => ({ lift: 6, main: [
            B(76, 12, 86, [0, 0, 0], '#ff5fa8'),
            ...[-30, -10, 10, 30].map(z => B(78, 15, 9, [0, 0, z], '#ffffff')),
            C(24, 4, 4, [-36, 16, -26], '#ffffff'), C(6, 24, 24, [-36, 34, -26], '#ff4f9a', [0, 0, PI / 2]), C(8, 11, 11, [-36, 34, -26], '#ffffff', [0, 0, PI / 2]),
            C(24, 4, 4, [-36, 16, 26], '#ffffff'), C(6, 24, 24, [-36, 34, 26], '#ffd23a', [0, 0, PI / 2]), C(8, 11, 11, [-36, 34, 26], '#ffffff', [0, 0, PI / 2]),
            E(12, 10, 12, [36, 5, 22], '#7be0ff'), E(12, 10, 12, [36, 5, -22], '#9bff7a'), E(10, 9, 10, [40, 4, 0], '#ffd23a'),
        ] }),
        racing: () => ({ lift: 5, main: [
            B(70, 8, 76, [0, -1, 0], '#23262e'), B(66, 2, 7, [0, 3.5, 12], '#ffffff'), B(66, 2, 7, [0, 3.5, -12], '#ffffff'),
            B(58, 12, 9, [0, 4, 34], '#e53935'), B(58, 12, 9, [0, 4, -34], '#e53935'),
            B(9, 28, 70, [-32, 12, 0], '#e53935'), B(2.4, 16, 16, [-37.6, 15, 0], '#ffffff'), B(2.8, 9, 9, [-38.4, 15, 0], '#23262e'),
            B(10, 4, 80, [34, -1, 0], '#e53935'),
        ] }),
        viking: () => ({ lift: 6, main: [
            B(72, 10, 78, [0, 0, 0], '#8a5a2c'), B(74, 2, 3, [0, 5.4, 18], '#5e3a1a'), B(74, 2, 3, [0, 5.4, -18], '#5e3a1a'), B(74, 2, 3, [0, 5.4, 0], '#5e3a1a'),
            ...flat(sym(s => [C(4, 32, 32, [2, -2, 42 * s], '#c0392b', [PI / 2, 0, 0]), C(5, 35, 35, [2, -2, 41 * s], '#d8b04a', [PI / 2, 0, 0]),
                E(11, 11, 5, [2, -2, 45.5 * s], '#e5e5e5'), K(18, 8, [-34, 10, 36 * s], '#f4ead2', [0, 0, 0.45 * s])])),
            B(8, 18, 62, [-33, 9, 0], '#6b4220'),
        ] }),
        mushroom: () => {
            const dome = (x, z) => 17 * Math.sqrt(Math.max(0.05, 1 - (x / 43) * (x / 43) - (z / 43) * (z / 43)));
            const spot = (x, z, d) => E(d, 4, d, [x, dome(x, z) - 0.2, z], '#fff6e0');
            return { lift: 14, main: [
                E(86, 34, 86, [0, 0, 0], '#e53935'),
                spot(-22, -18, 13), spot(-24, 16, 11), spot(16, -26, 12), spot(20, 24, 10), spot(-6, 30, 9), spot(30, -6, 8), spot(-8, -34, 8),
            ] };
        },
        pumpkin: () => ({ lift: 12, main: [
            E(72, 26, 38, [0, 2, -25], '#ff8a1f'), E(76, 28, 40, [0, 3, 0], '#ff9a33'), E(72, 26, 38, [0, 2, 25], '#ff8a1f'),
            C(11, 6, 9, [0, 19, 0], '#4a7a2a', [0.1, 0, 0.1]), E(16, 3, 9, [-8, 17, -6], '#5fae4b', [0, 0.5, 0.3]),
        ] }),
        cloud: () => ({ lift: 12, main: [
            E(54, 28, 56, [0, 2, 0], '#ffffff'), E(40, 22, 38, [-20, 0, 24], '#f2f7ff'), E(38, 22, 40, [16, 0, -26], '#ffffff'),
            E(34, 20, 34, [-14, 0, -28], '#e8f0ff'), E(30, 18, 30, [26, 0, 20], '#f2f7ff'), E(22, 14, 22, [-36, 4, 2], '#ffffff'), E(18, 12, 18, [34, 2, -4], '#e8f0ff'),
        ] }),
        pirate: () => ({ lift: 6, main: [
            B(76, 12, 84, [0, 0, 0], '#2b2b33'), B(78, 3, 86, [0, 5, 0], '#f2c13d'), B(60, 2, 70, [2, 6.4, 0], '#8b1f2a'),
            B(9, 26, 74, [-34, 11, 0], '#8b1f2a'), B(10, 3, 76, [-34, 25, 0], '#f2c13d'),
            E(11, 12, 2.4, [-39.4, 13, 0], '#f4ead2'), B(2.6, 3, 3, [-40.4, 14, -2.8], '#15151a'), B(2.6, 3, 3, [-40.4, 14, 2.8], '#15151a'),
            B(2.4, 3, 18, [-39.4, 6, 0], '#f4ead2', [0.6, 0, 0]), B(2.4, 3, 18, [-39.4, 6, 0], '#f4ead2', [-0.6, 0, 0]),
            ...flat(sym(s => [B(8, 14, 3, [24, -8, 42 * s], '#2b2b33'), E(6, 6, 6, [24, -17, 42 * s], '#f2c13d')])),
        ] }),
        knight: () => ({ lift: 7, main: [
            B(76, 12, 86, [0, 0, 0], '#aeb8c6'), B(54, 2, 62, [2, 6.5, 0], '#8794a6'),
            B(9, 26, 72, [-34, 10, 0], '#8794a6'), B(2.8, 14, 4, [-39.2, 12, 0], '#ffffff'), B(2.8, 4, 14, [-39.2, 14, 0], '#ffffff'),
            E(18, 16, 28, [34, 8, 0], '#c4ceda'),
            ...flat(sym(s => [B(66, 26, 3, [0, -8, 40 * s], '#2b5fc2'), B(14, 20, 3.8, [0, -8, 40 * s], '#ffffff'), B(4, 20, 4, [0, -8, 40 * s], '#2b5fc2')])),
            ...[-24, -8, 8, 24].map(z => E(4, 4, 4, [30, 12, z], '#e8eef6')),
        ] }),
        bamboo: () => ({ lift: 7, main: [
            ...[-30, -20, -10, 0, 10, 20, 30].map(x => C(84, 9, 9, [x, 0, 0], '#c3d160', [PI / 2, 0, 0])),
            C(5, 10.5, 10.5, [-30, 0, 20], '#7a5a2a', [PI / 2, 0, 0]), C(5, 10.5, 10.5, [30, 0, 20], '#7a5a2a', [PI / 2, 0, 0]),
            C(5, 10.5, 10.5, [-30, 0, -20], '#7a5a2a', [PI / 2, 0, 0]), C(5, 10.5, 10.5, [30, 0, -20], '#7a5a2a', [PI / 2, 0, 0]),
            ...[-34, -17, 0, 17, 34].map(z => C(30, 6, 6, [-38, 14, z], '#a9bd4a')), C(76, 5, 5, [-38, 24, 0], '#c3d160', [PI / 2, 0, 0]),
            K(16, 12, [-38, 34, -34], '#5fae4b'), K(16, 12, [-38, 34, 34], '#5fae4b'),
        ] }),
        ice: () => ({ lift: 7, main: [
            B(74, 12, 84, [0, 0, 0], '#a8e4ff'), B(52, 2, 60, [2, 6.5, 0], '#d4f4ff'),
            K(26, 12, [-34, 18, -26], '#d8f6ff'), K(34, 14, [-36, 22, 0], '#bfeeff'), K(24, 11, [-34, 17, 26], '#d8f6ff'),
            K(18, 9, [-20, 15, -38], '#e6faff'), K(18, 9, [-20, 15, 38], '#e6faff'),
            ...flat(sym(s => [K(16, 6, [20, -12, 41 * s], '#bfeeff', [PI, 0, 0]), K(22, 6, [4, -15, 41 * s], '#d8f6ff', [PI, 0, 0]), K(14, 5, [-12, -11, 41 * s], '#bfeeff', [PI, 0, 0])])),
        ] }),
        royal: () => ({ lift: 8, main: [
            B(78, 14, 88, [0, 0, 0], '#a3122a'), B(80, 3, 5, [0, 6.5, 41], '#f2c13d'), B(80, 3, 5, [0, 6.5, -41], '#f2c13d'),
            B(5, 3, 84, [37, 6.5, 0], '#f2c13d'), B(5, 3, 84, [-37, 6.5, 0], '#f2c13d'),
            B(9, 30, 74, [-34, 12, 0], '#a3122a'), B(10, 3, 76, [-34, 28, 0], '#f2c13d'), E(8, 8, 8, [-34, 33, 0], '#f2c13d'),
            ...flat([[39, 45], [-39, 45], [39, -45], [-39, -45]].map(p => [E(7, 7, 7, [p[0], 6, p[1]], '#f2c13d'), C(14, 5, 3, [p[0], -2, p[1]], '#f2c13d')])),
            ...[-28, -14, 0, 14, 28].map(z => E(3.4, 3.4, 3.4, [-38.6, 12, z], '#f2c13d')),
        ] }),
        crystal: () => ({ lift: 7,
            main: [
                B(74, 12, 84, [0, 0, 0], '#4a2a86'), B(54, 2, 60, [2, 6.5, 0], '#6a3ec0'),
                K(34, 14, [-34, 21, -22], '#b072ff'), K(26, 12, [-36, 17, 4], '#8a5cff'), K(22, 11, [-32, 15, 28], '#ff7ad9'),
                K(18, 9, [30, 14, -34], '#5ae6ff'), K(16, 8, [34, 13, 30], '#b072ff'), K(14, 7, [-6, 12, 40], '#5ae6ff'),
            ],
            glow: [ K(10, 5, [-34, 30, -22], '#e8d4ff'), K(8, 4, [-36, 24, 4], '#d8c8ff'), K(7, 4, [-32, 21, 28], '#ffd0f4') ] }),
        lava: () => ({ lift: 8,
            main: [
                B(76, 14, 86, [0, 0, 0], '#3a2a30'), E(30, 10, 34, [-24, 6, 0], '#2a1e24'), E(26, 9, 30, [26, 6, 8], '#46343b'),
                K(26, 16, [-36, 19, -26], '#2a1e24'), K(20, 13, [-36, 15, 26], '#3a2a30'),
            ],
            glow: [
                B(60, 1.6, 3, [2, 7.4, -8], '#ff7a1a'), B(3, 1.6, 40, [-14, 7.4, 4], '#ff9a2a'), B(30, 1.6, 3, [18, 7.4, 20], '#ff7a1a'),
                K(18, 8, [-36, 31, -26], '#ffb02a'), K(14, 7, [-36, 24, 26], '#ff7a1a'),
            ] }),
        rainbow: () => ({ lift: 6, main: [
            ...['#ff4d4d', '#ff9a3c', '#ffe04a', '#5fd35f', '#4aa8ff', '#9b6bff'].map((c, i) => B(76, 12, 14.4, [0, 0, -36 + i * 14.4 + 7.2], c)),
            E(26, 22, 26, [-36, 4, -34], '#ffffff'), E(22, 18, 22, [-38, 2, -22], '#f2f7ff'), E(26, 22, 26, [-36, 4, 34], '#ffffff'), E(22, 18, 22, [-38, 2, 22], '#f2f7ff'),
            E(22, 16, 22, [38, 2, -30], '#ffffff'), E(22, 16, 22, [38, 2, 30], '#f2f7ff'),
        ] }),
        sakura: () => {
            const bl = (x, y, z, s, c) => E(s, s * 0.55, s, [x, y, z], c);
            return { lift: 7, main: [
                B(74, 10, 82, [0, 0, 0], '#8b5a3c'), B(60, 4, 6, [0, 6, 20], '#6b4128', [0, 0.2, 0]), B(60, 4, 6, [0, 6, -20], '#6b4128', [0, -0.2, 0]),
                bl(-24, 8, -26, 26, '#ffb7d5'), bl(-26, 8, 24, 24, '#ff9ec7'), bl(16, 8, -34, 22, '#ffd0e4'), bl(18, 8, 34, 22, '#ffb7d5'), bl(34, 6, 0, 18, '#ff9ec7'),
                bl(-8, 13, -30, 12, '#ffffff'), bl(-10, 13, 30, 12, '#ffd0e4'), bl(-36, 12, 0, 14, '#ffffff'),
                E(5, 2.4, 5, [-24, 13, -26], '#ffe27a'), E(5, 2.4, 5, [-26, 12.6, 24], '#ffe27a'),
            ] };
        },
        throne: () => ({ lift: 8, main: [
            B(62, 12, 68, [0, 0, 0], '#f2c13d'), B(52, 5, 58, [3, 7.5, 0], '#c1121f'),
            B(9, 52, 68, [-30, 26, 0], '#f2c13d'), B(9.6, 40, 54, [-29.6, 26, 0], '#c1121f'), E(10, 22, 40, [-30, 54, 0], '#f2c13d'),
            ...flat(sym(s => [B(48, 8, 7, [2, 10, 47 * s], '#f2c13d'), B(7, 14, 7, [18, 4, 47 * s], '#d9a82a'), E(8, 8, 8, [26, 13, 47 * s], '#e8353f')])),
            E(7, 7, 7, [-35, 40, 0], '#5ae6ff'), E(6, 6, 6, [-35, 28, -16], '#5fd35f'), E(6, 6, 6, [-35, 28, 16], '#b072ff'),
        ] }),
        ufo: () => ({ lift: 6,
            main: [
                C(8, 84, 92, [0, -2, 0], '#c0c8d4'), C(5, 60, 80, [0, 4, 0], '#8a96a8'), E(34, 14, 34, [-26, 8, 0], '#7fe8ff'), C(3, 66, 66, [0, 7.4, 0], '#6b7586'),
            ],
            glow: [...Array(8)].map((_, i) => E(7, 5, 7, [Math.cos(i / 8 * PI * 2) * 42, -2, Math.sin(i / 8 * PI * 2) * 46], ['#ffe04a', '#5ae6ff', '#5fd35f', '#ff7ad9'][i % 4])) }),
        dragon: () => ({ lift: 7, main: [
            B(76, 12, 86, [0, 0, 0], '#2f7a3c'), B(54, 2, 62, [2, 6.5, 0], '#3f9a4c'),
            ...[-34, -26, -18].map((x, i) => K(24 - i * 4, 11, [x, 18 - i * 2, 0], '#c9e86a')),
            K(18, 9, [-32, 14, -30], '#c9e86a'), K(18, 9, [-32, 14, 30], '#c9e86a'),
            ...flat(sym(s => [B(32, 2, 26, [-20, 9, 52 * s], '#256a31', [0.4 * s, 0, 0]), K(10, 4, [-4, 8, 63 * s], '#ffd23a', [0, 0, 1.3 * s]), B(30, 2, 3, [-20, 10, 40 * s], '#1c4f25')])),
            ...[-24, -8, 8, 24].map(z => E(3.4, 3.4, 3.4, [37, 8, z], '#ffd23a')),
        ] }),
        cyber: () => ({ lift: 7,
            main: [
                B(76, 12, 86, [0, 0, 0], '#232a3a'), B(54, 2, 62, [2, 6.5, 0], '#1a2030'), B(9, 24, 70, [-34, 10, 0], '#232a3a'),
                B(12, 8, 30, [36, 3, 0], '#2f384c'), B(10, 14, 12, [-38, 12, -26], '#2f384c'), B(10, 14, 12, [-38, 12, 26], '#2f384c'),
            ],
            glow: [
                B(78, 1.6, 2.4, [0, 6.6, 42.4], '#18f0ff'), B(78, 1.6, 2.4, [0, 6.6, -42.4], '#18f0ff'), B(2.4, 1.6, 86, [38.4, 6.6, 0], '#ff3df0'),
                B(2, 16, 2.4, [-38.8, 12, -26], '#18f0ff'), B(2, 16, 2.4, [-38.8, 12, 26], '#18f0ff'), B(2, 2.4, 50, [-38.8, 22, 0], '#ff3df0'),
            ] }),
    };

    // =============================================================================================
    // Следы: формы частиц (рисуются на canvas один раз) и описания 24 следов
    // =============================================================================================
    /** '#rrggbb' -> 'rgba(r,g,b,a)'. */
    function rgba(hex, a) {
        let h = String(hex || '#ffffff').replace('#', '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        const n = parseInt(h, 16) || 0;
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    /**
     * Нарисовать форму частицы радиусом r в точке (cx, cy). col — цвет заливки (для текстур — белый, оттенок даёт система частиц),
     * dark — цвет прожилок и граней.
     */
    function paintShape(g, kind, cx, cy, r, col, dark) {
        g.save();
        g.translate(cx, cy);
        g.fillStyle = col; g.strokeStyle = col; g.lineJoin = 'round'; g.lineCap = 'round';
        const glow = (rad, a0) => {
            const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad);
            gr.addColorStop(0, rgba(col, a0)); gr.addColorStop(1, rgba(col, 0));
            g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rad, 0, PI * 2); g.fill(); g.fillStyle = col;
        };
        switch (kind) {
            case 'spark': {
                glow(r * 0.8, 0.55);
                g.beginPath();
                const pts = [[0, -1], [0.16, -0.16], [1, 0], [0.16, 0.16], [0, 1], [-0.16, 0.16], [-1, 0], [-0.16, -0.16]];
                pts.forEach((p, i) => { if (i) g.lineTo(p[0] * r, p[1] * r); else g.moveTo(p[0] * r, p[1] * r); });
                g.closePath(); g.fill();
                break;
            }
            case 'star': {
                g.beginPath();
                for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, rr = i % 2 ? r * 0.46 : r; if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
                g.closePath(); g.fill();
                break;
            }
            case 'heart': {
                g.beginPath(); g.moveTo(0, r * 0.85);
                g.bezierCurveTo(-r * 1.3, r * 0.05, -r * 0.85, -r * 0.95, 0, -r * 0.35);
                g.bezierCurveTo(r * 0.85, -r * 0.95, r * 1.3, r * 0.05, 0, r * 0.85);
                g.fill();
                break;
            }
            case 'leaf': {
                g.beginPath(); g.moveTo(0, -r); g.quadraticCurveTo(r * 1.0, -r * 0.2, 0, r); g.quadraticCurveTo(-r * 1.0, -r * 0.2, 0, -r); g.fill();
                g.strokeStyle = dark || 'rgba(120,120,120,1)'; g.lineWidth = r * 0.1;
                g.beginPath(); g.moveTo(0, -r * 0.85); g.lineTo(0, r * 0.9); g.stroke();
                break;
            }
            case 'petal': {
                g.beginPath(); g.moveTo(0, -r);
                g.bezierCurveTo(r * 1.0, -r * 0.3, r * 0.7, r * 0.95, 0, r * 0.95);
                g.bezierCurveTo(-r * 0.7, r * 0.95, -r * 1.0, -r * 0.3, 0, -r);
                g.fill();
                break;
            }
            case 'flake': {
                g.lineWidth = r * 0.17;
                for (let i = 0; i < 6; i++) {
                    g.save(); g.rotate(i * PI / 3);
                    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r);
                    g.moveTo(0, -r * 0.55); g.lineTo(r * 0.28, -r * 0.8); g.moveTo(0, -r * 0.55); g.lineTo(-r * 0.28, -r * 0.8);
                    g.stroke(); g.restore();
                }
                break;
            }
            case 'bubble': {
                g.fillStyle = rgba(col, 0.2); g.beginPath(); g.arc(0, 0, r * 0.84, 0, PI * 2); g.fill();
                g.strokeStyle = col; g.lineWidth = r * 0.15; g.beginPath(); g.arc(0, 0, r * 0.84, 0, PI * 2); g.stroke();
                g.fillStyle = col; g.beginPath(); g.ellipse(-r * 0.32, -r * 0.38, r * 0.2, r * 0.1, -0.7, 0, PI * 2); g.fill();
                break;
            }
            case 'bolt': {
                g.beginPath();
                [[0.25, -1], [-0.55, 0.1], [-0.02, 0.1], [-0.3, 1], [0.6, -0.25], [0.1, -0.25]].forEach((p, i) => { if (i) g.lineTo(p[0] * r, p[1] * r); else g.moveTo(p[0] * r, p[1] * r); });
                g.closePath(); g.fill();
                break;
            }
            case 'square': { g.fillRect(-r * 0.62, -r * 0.42, r * 1.24, r * 0.84); break; }
            case 'note': {
                g.beginPath(); g.ellipse(-r * 0.3, r * 0.62, r * 0.4, r * 0.29, -0.4, 0, PI * 2); g.fill();
                g.lineWidth = r * 0.17; g.beginPath(); g.moveTo(r * 0.06, r * 0.5); g.lineTo(r * 0.06, -r * 0.95); g.stroke();
                g.beginPath(); g.moveTo(r * 0.06, -r * 0.95); g.bezierCurveTo(r * 0.6, -r * 0.7, r * 0.7, -r * 0.2, r * 0.45, r * 0.05); g.lineWidth = r * 0.2; g.stroke();
                break;
            }
            case 'coin': {
                g.beginPath(); g.arc(0, 0, r * 0.92, 0, PI * 2); g.fill();
                g.strokeStyle = dark || 'rgba(150,150,150,1)'; g.lineWidth = r * 0.12; g.beginPath(); g.arc(0, 0, r * 0.62, 0, PI * 2); g.stroke();
                g.lineWidth = r * 0.14; g.beginPath(); g.moveTo(0, -r * 0.3); g.lineTo(0, r * 0.3); g.stroke();
                break;
            }
            case 'diamond': {
                g.beginPath();
                [[-0.6, -0.5], [0.6, -0.5], [1, -0.08], [0, 1], [-1, -0.08]].forEach((p, i) => { if (i) g.lineTo(p[0] * r, p[1] * r); else g.moveTo(p[0] * r, p[1] * r); });
                g.closePath(); g.fill();
                g.strokeStyle = dark || 'rgba(150,150,150,1)'; g.lineWidth = r * 0.07;
                g.beginPath(); g.moveTo(-1 * r, -0.08 * r); g.lineTo(r, -0.08 * r); g.moveTo(-0.6 * r, -0.5 * r); g.lineTo(-0.28 * r, -0.08 * r); g.lineTo(0, r);
                g.moveTo(0.6 * r, -0.5 * r); g.lineTo(0.28 * r, -0.08 * r); g.lineTo(0, r); g.stroke();
                break;
            }
            case 'cloud': {
                for (const p of [[0, 0, 0.7], [-0.4, 0.1, 0.5], [0.4, 0.1, 0.5], [0.05, -0.3, 0.45]]) {
                    g.save(); g.translate(p[0] * r, p[1] * r); glow(r * p[2], 0.9); g.restore();
                }
                break;
            }
            case 'flame': {
                g.beginPath(); g.moveTo(0, -r);
                g.bezierCurveTo(r * 0.5, -r * 0.35, r * 0.85, r * 0.2, r * 0.4, r * 0.75);
                g.quadraticCurveTo(0, r * 1.05, -r * 0.4, r * 0.75);
                g.bezierCurveTo(-r * 0.85, r * 0.2, -r * 0.5, -r * 0.35, 0, -r);
                g.fill();
                break;
            }
            case 'candyA': case 'candyB': case 'candyC': case 'candyD': {
                const cc = { candyA: '#ff5a9a', candyB: '#ffd23a', candyC: '#4ad8ff', candyD: '#7be85a' }[kind];
                g.fillStyle = cc; g.beginPath(); g.arc(0, 0, r * 0.88, 0, PI * 2); g.fill();
                g.save(); g.beginPath(); g.arc(0, 0, r * 0.88, 0, PI * 2); g.clip();
                g.fillStyle = '#ffffff'; g.save(); g.rotate(-0.7); g.fillRect(-r * 1.2, -r * 0.2, r * 2.4, r * 0.4); g.restore(); g.restore();
                g.strokeStyle = 'rgba(20,10,0,.55)'; g.lineWidth = r * 0.1; g.beginPath(); g.arc(0, 0, r * 0.88, 0, PI * 2); g.stroke();
                break;
            }
            case 'confA': case 'confB': case 'confC': case 'confD': case 'confE': {
                g.fillStyle = { confA: '#ff4d6d', confB: '#ffd23a', confC: '#4ad8ff', confD: '#7be85a', confE: '#b07aff' }[kind];
                g.save(); g.rotate(0.5); g.fillRect(-r * 0.6, -r * 0.4, r * 1.2, r * 0.8); g.restore();
                break;
            }
            default: glow(r, 1);     // dot
        }
        g.restore();
    }

    // Описания следов. shape — форма частицы; colors — [цвет, цвет2] (случайный оттенок между ними); blend — 'add' | 'std';
    // rate — частиц в секунду (умножается на COS_TRAIL_RATE и качество устройства); life, size, speed — диапазоны (px, с);
    // gravity — [x, y, z]; box — полуразмер области появления; dir — диапазон направлений; spin — вращение; sg/cg — градиенты размера и цвета;
    // atlas — набор форм-ячеек (мультицвет): частицы берут случайную ячейку.
    /** @type {Record<string, any>} */
    const TRAILS = {
        sparkle: { shape: 'spark', colors: ['#fff6a8', '#ffd84a'], blend: 'add', rate: 34, life: [0.5, 1.1], size: [8, 17], speed: [8, 28], gravity: [0, 14, 0], box: 22, spin: [-3, 3], sg: [[0, 0.2], [0.25, 1], [1, 0]] },
        dust: { shape: 'cloud', colors: ['#e0cfae', '#c9b58f'], blend: 'std', alpha: 0.6, rate: 24, life: [0.6, 1.2], size: [16, 32], speed: [6, 20], gravity: [0, 8, 0], box: 14, dir: [[-0.8, 0.1, -0.8], [0.3, 0.7, 0.8]], sg: [[0, 0.5], [1, 1.9]], cg: [[0, '#e0cfae', 0.7], [1, '#c9b58f', 0]] },
        leaves: { shape: 'leaf', colors: ['#6fcf4a', '#e8a032'], blend: 'std', rate: 14, life: [1.2, 2.2], size: [11, 20], speed: [10, 34], gravity: [0, -30, 0], box: 26, spin: [-4, 4], sg: [[0, 0.3], [0.2, 1], [0.85, 1], [1, 0.4]] },
        bubbles: { shape: 'bubble', colors: ['#bfe9ff', '#ffffff'], blend: 'add', rate: 16, life: [1.2, 2.4], size: [10, 24], speed: [5, 22], gravity: [0, 26, 0], box: 22, sg: [[0, 0.3], [0.2, 1], [1, 1.15]] },
        hearts: { shape: 'heart', colors: ['#ff5a9a', '#ff9ac0'], blend: 'std', rate: 9, life: [1.2, 2], size: [14, 24], speed: [14, 36], gravity: [0, 42, 0], box: 18, spin: [-1, 1], sg: [[0, 0.3], [0.2, 1], [1, 0.3]] },
        snow: { shape: 'flake', colors: ['#ffffff', '#cfe8ff'], blend: 'add', rate: 24, life: [1.2, 2.4], size: [8, 17], speed: [8, 24], gravity: [0, -22, 0], box: 28, spin: [-2, 2], sg: [[0, 0.3], [0.2, 1], [1, 0.6]] },
        petals: { shape: 'petal', colors: ['#ff9fc6', '#ffd3e6'], blend: 'std', rate: 16, life: [1.4, 2.4], size: [11, 19], speed: [10, 34], gravity: [0, -24, 0], box: 28, spin: [-4, 4], sg: [[0, 0.3], [0.2, 1], [0.85, 1], [1, 0.5]] },
        stars: { shape: 'star', colors: ['#ffe14a', '#fff3b0'], blend: 'add', rate: 12, life: [0.8, 1.5], size: [13, 24], speed: [20, 52], gravity: [0, 22, 0], box: 20, spin: [-3, 3], sg: [[0, 0.2], [0.25, 1], [1, 0]] },
        confetti: { shape: 'confA', atlas: ['confA', 'confB', 'confC', 'confD', 'confE'], colors: ['#ffffff', '#ffffff'], blend: 'std', rate: 28, life: [1, 1.8], size: [9, 16], speed: [30, 80], gravity: [0, -90, 0], box: 18, dir: [[-1, 0.5, -1], [1, 1.3, 1]], spin: [-8, 8] },
        notes: { shape: 'note', colors: ['#8be0ff', '#ffb0f0'], blend: 'std', rate: 8, life: [1.2, 2], size: [16, 26], speed: [16, 40], gravity: [0, 36, 0], box: 18, spin: [-1, 1], sg: [[0, 0.3], [0.2, 1], [1, 0.5]] },
        fireflies: { shape: 'dot', colors: ['#d8ff5a', '#9cff6a'], blend: 'add', rate: 10, life: [1.5, 3], size: [8, 14], speed: [6, 22], gravity: [0, 8, 0], box: 34, cg: [[0, '#d8ff5a', 0], [0.2, '#d8ff5a', 1], [0.5, '#9cff6a', 0.35], [0.7, '#d8ff5a', 1], [1, '#9cff6a', 0]] },
        candy: { shape: 'candyA', atlas: ['candyA', 'candyB', 'candyC', 'candyD'], colors: ['#ffffff', '#ffffff'], blend: 'std', rate: 12, life: [1, 1.7], size: [11, 18], speed: [24, 60], gravity: [0, -110, 0], box: 16, dir: [[-1, 0.6, -1], [1, 1.2, 1]], spin: [-4, 4] },
        fire: { shape: 'flame', colors: ['#ffb020', '#ff3d10'], blend: 'add', rate: 56, life: [0.35, 0.8], size: [15, 30], speed: [10, 36], gravity: [0, 70, 0], box: 14, sg: [[0, 0.6], [0.4, 1], [1, 0.1]], cg: [[0, '#fff2a0', 1], [0.3, '#ff9a1f', 0.95], [0.75, '#e0360c', 0.5], [1, '#601008', 0]] },
        ice: { shape: 'diamond', colors: ['#9fe8ff', '#dff8ff'], blend: 'add', rate: 22, life: [0.7, 1.4], size: [10, 18], speed: [12, 42], gravity: [0, -8, 0], box: 22, spin: [-3, 3], sg: [[0, 0.3], [0.2, 1], [1, 0.4]] },
        rainbow: { shape: 'dot', colors: ['#ffffff', '#ffffff'], blend: 'add', rate: 72, life: [0.85, 1], size: [16, 20], speed: [0, 3], gravity: [0, 0, 0], box: 6, sg: [[0, 1], [1, 0.7]],
            cg: [[0, '#ff4d4d', 1], [0.17, '#ff9a3c', 1], [0.34, '#ffe04a', 1], [0.5, '#5fd35f', 1], [0.67, '#4aa8ff', 1], [0.84, '#9b6bff', 0.8], [1, '#9b6bff', 0]] },
        coins: { shape: 'coin', colors: ['#ffd23a', '#ffe98a'], blend: 'std', rate: 8, life: [1, 1.6], size: [13, 21], speed: [34, 80], gravity: [0, -190, 0], box: 14, dir: [[-0.5, 1, -0.5], [0.5, 1.6, 0.5]], spin: [-6, 6] },
        lightning: { shape: 'bolt', colors: ['#d8f0ff', '#7ab8ff'], blend: 'add', rate: 11, life: [0.25, 0.5], size: [20, 36], speed: [0, 12], gravity: [0, 0, 0], box: 28, spin: [-2, 2], sg: [[0, 0.5], [0.3, 1.1], [1, 0.4]] },
        galaxy: { shape: 'spark', colors: ['#8a7aff', '#ff7ad9'], blend: 'add', rate: 40, life: [0.8, 1.6], size: [9, 19], speed: [8, 30], gravity: [0, 8, 0], box: 26, spin: [-2, 2], sg: [[0, 0.3], [0.3, 1], [1, 0]],
            cg: [[0, '#ffffff', 1], [0.3, '#8a7aff', 0.9], [0.7, '#c05cff', 0.6], [1, '#2a2a8a', 0]] },
        magic: { shape: 'star', colors: ['#b57aff', '#ff7ae6'], blend: 'add', rate: 30, life: [0.7, 1.3], size: [9, 18], speed: [28, 66], gravity: [0, 28, 0], box: 18, spin: [-5, 5], sg: [[0, 0.2], [0.3, 1], [1, 0]] },
        slime: { shape: 'bubble', colors: ['#7be85a', '#b6ff7a'], blend: 'std', alpha: 0.9, rate: 18, life: [1, 1.8], size: [10, 21], speed: [6, 24], gravity: [0, -44, 0], box: 20, sg: [[0, 0.4], [0.2, 1], [1, 0.7]] },
        aurora: { shape: 'dot', colors: ['#7affc8', '#b07aff'], blend: 'add', alpha: 0.5, rate: 24, life: [1.2, 2], size: [32, 58], speed: [4, 16], gravity: [0, 18, 0], box: 24, sg: [[0, 0.5], [0.5, 1], [1, 1.3]],
            cg: [[0, '#7affc8', 0], [0.25, '#7affc8', 0.55], [0.6, '#5ab8ff', 0.45], [1, '#b07aff', 0]] },
        phoenix: { shape: 'dot', colors: ['#ffd23a', '#ff6a1a'], blend: 'add', rate: 52, life: [0.8, 1.6], size: [8, 17], speed: [14, 46], gravity: [0, 76, 0], box: 18, sg: [[0, 0.5], [0.3, 1], [1, 0.1]],
            cg: [[0, '#fff2a0', 1], [0.3, '#ffb02a', 0.95], [0.7, '#ff4a12', 0.6], [1, '#8a1008', 0]] },
        diamonds: { shape: 'diamond', colors: ['#aef2ff', '#ffd6f5'], blend: 'add', rate: 16, life: [0.9, 1.7], size: [11, 20], speed: [10, 40], gravity: [0, 6, 0], box: 22, spin: [-4, 4], sg: [[0, 0.2], [0.25, 1], [1, 0.3]] },
        comet: { shape: 'dot', colors: ['#ffffff', '#7ad8ff'], blend: 'add', rate: 80, life: [0.5, 0.95], size: [18, 32], speed: [0, 8], gravity: [0, 0, 0], box: 5, sg: [[0, 1], [1, 0.1]],
            cg: [[0, '#ffffff', 1], [0.25, '#9ae8ff', 0.95], [0.7, '#4a7aff', 0.5], [1, '#2a2aa8', 0]] },
    };

    // =============================================================================================
    // Состояние: владение, надетое, прогресс рекламы
    // =============================================================================================
    function cs() {
        const s = GameState.state;
        /** @type {any} */
        const c = s.cosmetics && typeof s.cosmetics === 'object' ? s.cosmetics : (s.cosmetics = /** @type {any} */ ({ owned: {}, equipped: {}, adProgress: {} }));
        if (!c.owned || typeof c.owned !== 'object') c.owned = {};
        if (!c.equipped || typeof c.equipped !== 'object') c.equipped = {};
        if (!c.adProgress || typeof c.adProgress !== 'object') c.adProgress = {};
        return c;
    }
    const emit = (name, data) => { try { Game.events.emit(name, data); } catch (e) { console.error('Cosmetics emit:', e); } };
    const dirty = () => { try { GameState.markDirty(); } catch (e) { /* нет сохранения — игра идёт */ } };
    const saveNow = () => { try { GameState.saveNow(); } catch (e) { dirty(); } };

    /** Примерка без покупки: слот -> id | null (поверх надетого); живёт, пока открыто окно гардероба. */
    /** @type {Record<string, string | null>} */
    const preview = {};
    const effective = (slot) => (Object.prototype.hasOwnProperty.call(preview, slot) ? preview[slot] : (cs().equipped[slot] || null));
    const isOwned = (id) => !!BY_ID[id] && !!cs().owned[id];
    const adsNeeded = (id) => (BY_ID[id] && BY_ID[id].ads) || 0;
    const adProgress = (id) => Math.min(adsNeeded(id), Math.floor(Number(cs().adProgress[id]) || 0));

    function grant(id) {
        const item = BY_ID[id];
        if (!item || isOwned(id)) return false;
        const c = cs();
        c.owned[id] = true;
        delete c.adProgress[id];
        dirty();
        emit('cosmetics:changed', { slot: item.tab, id, granted: true });
        return true;
    }

    function equip(id) {
        const item = BY_ID[id];
        if (!item || !isOwned(id)) return false;
        cs().equipped[item.tab] = id;
        delete preview[item.tab];
        refreshSlot(item.tab);
        dirty();
        emit('cosmetics:changed', { slot: item.tab, id });
        return true;
    }

    function unequip(tab) {
        if (!TABS.includes(tab)) return false;
        cs().equipped[tab] = null;
        delete preview[tab];
        refreshSlot(tab);
        dirty();
        emit('cosmetics:changed', { slot: tab, id: null });
        return true;
    }

    /** Покупка за лапки. */
    function buy(id) {
        const item = BY_ID[id];
        if (!item || item.exclusive || !item.price) return { ok: false, reason: 'notForSale' };
        if (isOwned(id)) return { ok: false, reason: 'owned' };
        if (!GameState.spendPaws(item.price)) return { ok: false, reason: 'paws' };
        grant(id);
        saveNow();
        return { ok: true };
    }

    /** Один засчитанный просмотр рекламы (после подтверждения SDK). Предмет выдаётся ровно один раз — на последнем просмотре. */
    function addAdView(id) {
        const item = BY_ID[id];
        if (!item || !item.ads) return { progress: 0, need: 0, unlocked: false, owned: false };
        if (isOwned(id)) return { progress: item.ads, need: item.ads, unlocked: false, owned: true };
        const c = cs();
        const p = Math.min(item.ads, Math.floor(Number(c.adProgress[id]) || 0) + 1);
        if (p >= item.ads) {
            grant(id);
            saveNow();
            return { progress: item.ads, need: item.ads, unlocked: true, owned: true };
        }
        c.adProgress[id] = p;
        saveNow();
        return { progress: p, need: item.ads, unlocked: false, owned: false };
    }

    /** Просмотр рекламы за предмет: Platform.rewarded('shop-unlock') === true -> addAdView. */
    async function watchAd(id) {
        const item = BY_ID[id];
        if (!item || !item.ads || isOwned(id)) return { ok: false, progress: adProgress(id), need: adsNeeded(id), unlocked: false };
        let ok = false;
        try { ok = (await Platform.rewarded('shop-unlock')) === true; } catch (e) { ok = false; }
        if (!ok) return { ok: false, progress: adProgress(id), need: item.ads, unlocked: false };
        const r = addAdView(id);
        return { ok: true, progress: r.progress, need: r.need, unlocked: r.unlocked };
    }

    // Случайный предмет магазина для Подарка дня и колеса: эксклюзивы — никогда; чаще обычные, реже редкие.
    const RANDOM_WEIGHT = { common: 8, uncommon: 5, rare: 3, epic: 1.5, legendary: 0.6 };
    function randomShopItem(opts) {
        const o = opts || {};
        const maxRank = RARITY_RANK[o.maxRarity || 'epic'] != null ? RARITY_RANK[o.maxRarity || 'epic'] : RARITY_RANK.epic;
        const notOwned = o.notOwned !== false;
        const pool = CATALOG.filter(i => !i.exclusive && RARITY_RANK[i.rarity] <= maxRank && (!notOwned || !isOwned(i.id)));
        if (!pool.length) return null;
        const rng = typeof o.rng === 'function' ? o.rng : Math.random;
        let total = 0;
        for (const i of pool) total += RANDOM_WEIGHT[i.rarity] || 1;
        let r = rng() * total;
        for (const i of pool) { r -= RANDOM_WEIGHT[i.rarity] || 1; if (r <= 0) return i; }
        return pool[pool.length - 1];
    }

    // =============================================================================================
    // Мир: доступность, наряд, шапки/лицо/спина, седло, след
    // =============================================================================================
    const live = () => typeof Player !== U && !!Player.ready && !!Player.rider && !!Player.app && !!Player.app.location;
    const sceneOf = () => Player.app.location.view.scene;
    const viewOf = () => Player.app.location.view;
    /** Ожидающие применения (загрузка GLB): ready() дожидается их под экраном загрузки, чтобы шапка была на первом кадре. */
    /** @type {Promise<any>[]} */
    let pending = [];
    let booting = true;
    let time = 0;

    function refreshSlot(slot) {
        if (!live()) return;
        try {
            if (slot === 'outfit') applyOutfit(effective('outfit'));
            else if (slot === 'hat' || slot === 'face' || slot === 'back') { const pr = applyWorn(slot, effective(slot)); if (booting) pending.push(pr); }
            else if (slot === 'saddle') applySaddle();
            else if (slot === 'trail') applyTrail();
        } catch (e) { console.error('Cosmetics.refreshSlot ' + slot + ':', e); }
    }
    function refreshAll() { for (const t of TABS) refreshSlot(t); }

    // --- Наряд ---
    function applyOutfit(id) {
        const item = id ? BY_ID[id] : null;
        // скин на всё тело — своя модель; обычный наряд — цвета персонажа (скин снимается)
        if (typeof Player.setSkin === 'function') Player.setSkin(item && item.skin ? item.skin : null);
        if (item && item.skin) return;
        const def = item ? OUTFITS[item.key] : null;
        const D = typeof RiderModel !== U ? RiderModel.DEFAULT_TINTS : ['#1d2226', '#1d2f2a', '#a96716', '#ffe2c6', '#1495dc'];
        Player.setLook({ tints: def ? def.slice(0, 5) : D, hairStyle: def ? def[5] : 'swept' });
    }

    // --- Шапки, лицо, спина (GLB косметики) ---
    const GLB_A = 'assets/models/rider/cosmetics_a.glb';
    const GLB_B = 'assets/models/rider/cosmetics_b.glb';
    // Крылья и плащ — отдельные узлы-дети предмета в GLB; качаются вокруг своего сустава.
    /** @type {Record<string, string[]>} */
    const BACK_FLAPS = {
        angel: ['FlapL.003', 'FlapR.003'], bat: ['FlapL.001', 'FlapR.001'], butterfly: ['FlapL', 'FlapR'], cape: ['Flap'],
        fairy: ['FlapL.002', 'FlapR.002'], goldegg: ['FlapL.005', 'FlapR.005'], phoenix: ['FlapL.004', 'FlapR.004'],
    };
    /** @type {Record<string, Promise<any>>} */
    const glbPromises = {};
    function loadGlb(tab) {
        const url = tab === 'back' ? GLB_B : GLB_A;
        if (typeof Model3D === U) return Promise.resolve(null);
        if (!glbPromises[url]) {
            glbPromises[url] = Model3D.load(url).catch((e) => { console.warn('Cosmetics: модель ' + url + ' не загрузилась — ' + ((e && e.message) || e)); delete glbPromises[url]; return null; });
        }
        return glbPromises[url];
    }

    /**
     * Собрать предмет из GLB: корень (Mesh без геометрии) с вершинами относительно сустава (Head / Torso), крылья — в узлах-шарнирах.
     * abs = true — оставить вершины в мировых координатах модели наездника (превью на манекене).
     * @returns {{ root: any, flaps: { joint: any, side: number, phase: number, kind: string }[] } | null}
     */
    function buildItem(model, scene, tab, key, abs) {
        const prefix = tab === 'hat' ? 'C_hat_' : tab === 'face' ? 'C_face_' : 'C_back_';
        const main = model.parts.find(p => p.name === prefix + key);
        if (!main) return null;
        const flapParts = (tab === 'back' ? (BACK_FLAPS[key] || []) : []).map(n => model.parts.find(p => p.name === n)).filter(Boolean);
        const sub = { materials: model.materials, parts: [main].concat(flapParts), min: model.min, max: model.max };
        const root = Model3D.build(sub, scene, { name: 'cos:' + tab + ':' + key });
        const kids = root.getChildMeshes(true);
        const o = abs ? [0, 0, 0] : main.pivot;
        if (kids[0]) kids[0].position.set(-o[0], -o[1], -o[2]);
        const flaps = [];
        for (let i = 1; i < kids.length; i++) {
            const part = flapParts[i - 1];
            const joint = new BABYLON.TransformNode('cos:flap', scene);
            joint.parent = root;
            joint.position.set(part.pivot[0] - o[0], part.pivot[1] - o[1], part.pivot[2] - o[2]);
            kids[i].parent = joint;
            kids[i].position.set(-part.pivot[0], -part.pivot[1], -part.pivot[2]);
            flaps.push({ joint, side: /FlapL/.test(part.name) ? -1 : /FlapR/.test(part.name) ? 1 : 0, phase: i * 0.9, kind: part.name });
        }
        return { root, flaps };
    }

    /** Надето сейчас: слот -> { id, root, flaps }. */
    /** @type {Record<string, any>} */
    const worn = { hat: null, face: null, back: null };
    const wornSeq = { hat: 0, face: 0, back: 0 };

    function disposeBuilt(rec) {
        if (!rec || !rec.root) return;
        try { Model3D.dispose(viewOf(), rec.root); } catch (e) { console.warn('Cosmetics: не удалось убрать предмет —', e); }
    }

    async function applyWorn(slot, id) {
        const seq = ++wornSeq[slot];
        if (!live()) return;
        if ((worn[slot] && worn[slot].id) === (id || null) && worn[slot]) return;
        if (!id) {
            Player.wear(slot, null);
            const old = worn[slot]; worn[slot] = null;
            disposeBuilt(old);
            return;
        }
        const item = BY_ID[id];
        const model = item ? await loadGlb(slot) : null;
        if (seq !== wornSeq[slot] || !model || !live()) return;
        const built = buildItem(model, sceneOf(), slot, item.key, false);
        if (!built) return;
        World3D.addObject(viewOf(), built.root, 'actor');
        const old = worn[slot];
        worn[slot] = { id, root: built.root, flaps: built.flaps };
        Player.wear(slot, built.root);
        disposeBuilt(old);
    }

    // Покачивание крыльев и плаща: тише на месте, мощнее в движении.
    let moveK = 0;
    function animWorn(dt) {
        const w = worn.back;
        if (!w || !w.flaps.length) return;
        const sp = typeof Player !== U ? Math.hypot(Player.vx || 0, Player.vy || 0) : 0;
        moveK += (clamp(sp / 260, 0, 1) - moveK) * (1 - Math.exp(-6 * dt));
        for (const f of w.flaps) {
            if (f.side === 0) {
                f.joint.rotation.x = (0.06 + 0.5 * moveK) + Math.sin(time * (2 + moveK * 7)) * (0.04 + 0.08 * moveK);   // плащ отлетает назад (−Z), в покое — чуть колышется
            } else {
                f.joint.rotation.z = f.side * (0.1 + 0.22 * moveK + Math.sin(time * (2.4 + moveK * 5.5) + f.phase * 0.2) * (0.14 + 0.2 * moveK));
            }
        }
    }

    // --- Седло ---
    const ownMaterials = new WeakMap();
    function vcMaterial(scene, name, glow) {
        const m = new BABYLON.StandardMaterial(name, scene);
        m.diffuseColor = new BABYLON.Color3(glow ? 0 : 1, glow ? 0 : 1, glow ? 0 : 1);
        m.specularColor = new BABYLON.Color3(0, 0, 0);
        if (glow) { m.emissiveColor = new BABYLON.Color3(1, 1, 1); m.disableLighting = true; }
        return m;
    }
    function scaleSpecs(specs, k) {
        return specs.map(s => ({ k: s.k, a: s.a.map(v => v * k), at: s.at.map(v => v * k), c: s.c, rot: s.rot }));
    }
    // Масштаб седла по ширине питомца (мир, px).
    function saddleScale(view) {
        const w = view && view.size ? view.size.width : 92;
        return clamp(w / 92, 0.88, 1.6);
    }
    /**
     * Седло: корень TransformNode с мешами (основа и светящиеся детали). Нужен PetView.buildMesh (спецификации примитивов).
     * opts.thumb — для превью: без регистрации в мире.
     */
    function makeSaddle(scene, key, view, opts) {
        const mk = SADDLES[key];
        if (!mk || typeof PetView === U) return null;
        const d = mk();
        const k = saddleScale(view);
        const root = new BABYLON.TransformNode('cos:saddle:' + key, scene);
        const add = (specs, glow) => {
            const mesh = PetView.buildMesh(scene, 'cos:saddle:' + key + (glow ? ':glow' : ''), scaleSpecs(specs, k));
            mesh.material = vcMaterial(scene, 'cos:saddle-vc' + (glow ? '-glow' : ''), glow);
            mesh.parent = root;
            if (!opts || !opts.thumb) {
                if (PetView.view) World3D.addObject(PetView.view, mesh, 'actor', glow ? { ink: false, outline: false, castShadow: false, receiveShadows: false } : undefined);
            }
            return mesh;
        };
        add(d.main, false);
        if (d.glow && d.glow.length) add(d.glow, true);
        root.metadata = { lift: d.lift * k, k };
        return root;
    }
    function clearSaddle(v) {
        const s = v.saddle;
        if (!s) return;
        try {
            const mats = [];
            const meshes = s.getChildMeshes ? s.getChildMeshes(false) : [];
            for (const m of meshes) { if (m.material) mats.push(m.material); if (PetView.view) World3D.removeObject(PetView.view, m); }
            s.dispose(false, false);
            for (const m of mats) m.dispose(false, false);
        } catch (e) { console.warn('Cosmetics: седло не снялось —', e); }
        v.saddle = null;
    }
    let saddleLift = 0, saddleLiftTarget = 0;
    function applySaddle() {
        const v = typeof Player !== U ? Player.petView : null;
        if (!v || v.disposed) return;
        const id = effective('saddle');
        if (/** @type {any} */ (v)._cosSaddle === (id || null) && (!!v.saddle === !!id)) return;
        clearSaddle(v);
        /** @type {any} */ (v)._cosSaddle = id || null;
        saddleLiftTarget = 0;
        if (!id) return;
        const item = BY_ID[id];
        if (!item) return;
        v.setSaddle((scene, view) => makeSaddle(scene, item.key, view, null));
        saddleLiftTarget = v.saddle && v.saddle.metadata ? v.saddle.metadata.lift : 0;
    }
    // Наездник приподнят на высоту седла: Player._mount ставит его на седло без седла, поправка — каждый кадр (плавно).
    function updateLift(dt) {
        const R = Player.rider, v = Player.petView;
        saddleLift += (saddleLiftTarget - saddleLift) * (1 - Math.exp(-14 * dt));
        if (Math.abs(saddleLift - saddleLiftTarget) < 0.02) saddleLift = saddleLiftTarget;
        if (R && v && R.root && R.root.parent === v.seat) R.root.position.y = -(R.hipHeight - 4) + saddleLift;
    }

    // --- След ---
    /** @type {Map<string, any>} */
    const particleTextures = new Map();
    function particleTexture(scene, shape, atlas) {
        const key = scene.uid + '|' + (atlas ? atlas.join(',') : shape);
        let tex = particleTextures.get(key);
        if (tex) return tex;
        const size = 64, cells = atlas ? atlas.length : 1;
        const cv = document.createElement('canvas');
        cv.width = size * cells; cv.height = size;
        const g = cv.getContext('2d');
        (atlas || [shape]).forEach((kind, i) => paintShape(g, kind, i * size + size / 2, size / 2, 27, '#ffffff', 'rgba(130,130,130,1)'));
        tex = new BABYLON.DynamicTexture('cos-fx-' + shape, cv, scene, false);
        tex.hasAlpha = true;
        tex.update();
        particleTextures.set(key, tex);
        return tex;
    }
    /** @type {{ id: string, h: any, base: number, rate: number, pv: any } | null} */
    let trail = null;
    let trailRetry = 0;
    const trailPos = { x: 0, y: 0, z: 0 };
    let sweep = false;
    function stopTrail() {
        if (trail && trail.h) { try { trail.h.dispose(); } catch (e) { /* уже убрана */ } }
        trail = null;
    }
    function applyTrail() {
        const id = effective('trail');
        const pv = typeof Player !== U ? Player.petView : null;
        if (trail && trail.id === id && trail.pv === pv) return;
        stopTrail();
        if (!id || !pv) return;
        const item = BY_ID[id], def = item ? TRAILS[item.key] : null;
        const app = Player.app, fx = app && app.fx;
        if (!def || !fx) return;
        const k = clamp(Math.sqrt(Math.max(60, pv.size.length) * Math.max(60, pv.size.height)) / 150, 0.8, 2.2);
        const b = def.box * k;
        const base = def.rate * CFG.trailRate;
        const follow = () => {
            const cur = Player.petView;
            if (!cur || cur.disposed || !cur.trailAnchor) return null;
            const p = cur.trailAnchor.getAbsolutePosition();
            trailPos.x = p.x; trailPos.y = p.y + 8 * k; trailPos.z = p.z;
            if (sweep) {
                // примерка: эмиттер «едет» вперёд по курсу и быстро возвращается (без эмиссии), чтобы след тянулся за ним
                const ph = time % 1.8;
                const s = (ph < 1.4 ? -90 + 130 * ph : 92 - (ph - 1.4) / 0.4 * 182) * k;
                trailPos.x += Math.cos(Player.heading) * s; trailPos.z += Math.sin(Player.heading) * s;
            }
            return trailPos;
        };
        const h = fx.create({
            name: 'cos-trail', rate: 0, capacity: Math.ceil(base * def.life[1] * 1.3) + 10,
            life: def.life, size: [def.size[0] * k * 1.5, def.size[1] * k * 1.5], speed: [def.speed[0] * k, def.speed[1] * k],
            color: def.colors[0], color2: def.colors[1] || def.colors[0], alpha: def.alpha != null ? def.alpha : 1,
            blend: def.blend === 'std' ? 'standard' : 'additive', gravity: [def.gravity[0] * k, def.gravity[1] * k, def.gravity[2] * k],
            box: [[-b, -b * 0.4, -b], [b, b * 0.4, b]], direction: def.dir || [[-0.6, 0.15, -0.6], [0.6, 1, 0.6]],
            spin: def.spin, sizeGradient: def.sg, colorGradient: def.cg,
            sheet: def.atlas ? { width: 64, height: 64, start: 0, end: def.atlas.length - 1, speed: 0, randomStart: true } : undefined,
            follow, position: [0, 0, 0],
        });
        if (!h) { trailRetry = 1.5; return; }
        h.system.particleTexture = particleTexture(sceneOf(), def.shape, def.atlas);
        h.setRate(0);
        trail = { id, h, base, rate: 0, pv };
    }
    function updateTrail(dt, previewTrail) {
        if (!trail && effective('trail') && live()) {
            trailRetry -= dt;
            if (trailRetry <= 0) { trailRetry = 1.5; applyTrail(); }
        }
        const pv = Player.petView;
        if (trail && pv !== trail.pv) applyTrail();       // сменился питомец под седлом — след к новому
        if (!trail) return;
        let mv = 0;
        if (previewTrail) mv = (time % 1.8) < 1.4 ? 1 : 0;
        else if (Player.riding && pv) mv = clamp((Math.hypot(Player.vx || 0, Player.vy || 0) - 20) / 150, 0, 1);
        const want = mv > 0 ? trail.base * (0.3 + 0.7 * mv) : 0;
        if (Math.abs(want - trail.rate) > 0.01) { trail.rate = want; trail.h.setRate(want); }
    }

    // =============================================================================================
    // Превью предметов: рисуются один раз и кэшируются (dataURL).
    //   шапки, лицо, спина, наряды, сёдла — настоящие игровые модели в отдельной сцене на том же движке (RenderTargetTexture, без экрана);
    //   следы — чистый рисунок на canvas из тех же форм, что и частицы.
    // =============================================================================================
    /** @type {Map<string, string>} */
    const thumbs = new Map();
    /** @type {Map<string, Promise<string>>} */
    const thumbJobs = new Map();
    let thumbChain = Promise.resolve();
    /** @type {any} */
    let TS = null;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function thumbScene() {
        if (TS) return TS;
        if (typeof BABYLON === U || typeof World3D === U || !World3D.engine || typeof document === U) return null;
        const px = Math.round(clamp(CFG.thumbPx, 48, 256));
        const scene = new BABYLON.Scene(World3D.engine);
        scene.useRightHandedSystem = true;
        scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
        const hemi = new BABYLON.HemisphericLight('cos-h', new BABYLON.Vector3(0.2, 1, 0.4), scene);
        hemi.intensity = 0.55; hemi.groundColor = new BABYLON.Color3(0.62, 0.62, 0.68);
        const sun = new BABYLON.DirectionalLight('cos-s', new BABYLON.Vector3(-0.4, -0.8, -0.6), scene);
        sun.intensity = 0.8;
        const cam = new BABYLON.FreeCamera('cos-c', new BABYLON.Vector3(0, 0, 10), scene);
        cam.fov = 0.5; cam.minZ = 1; cam.maxZ = 30000;
        // Проекция квадратная, как у картинки превью: иначе камера берёт пропорции экрана игры и предметы вытягиваются (портрет) или сплющиваются
        cam.freezeProjectionMatrix(BABYLON.Matrix.PerspectiveFovRH(cam.fov, 1, cam.minZ, cam.maxZ, !!World3D.engine.isNDCHalfZRange));
        scene.activeCamera = cam;
        const rtt = new BABYLON.RenderTargetTexture('cos-thumb', px, scene, false, true, BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE, true, false);
        rtt.activeCamera = cam;
        rtt.clearColor = new BABYLON.Color4(0, 0, 0, 0);
        rtt.samples = 4;
        TS = { scene, cam, rtt, sun, px };
        return TS;
    }

    // Материалы превью — в тоне мира (блик группы actor), с обводкой рёбер, как у наездника в игре.
    function styleThumbMeshes(root) {
        const cfg = World3D.cfg();
        for (const m of root.getChildMeshes(false)) {
            const mat = m.material;
            for (const sm of (mat ? (mat.subMaterials || [mat]) : [])) {
                if (!sm) continue;
                sm.metadata = Object.assign({ toonGroup: 'actor' }, sm.metadata);
                World3D.applyMaterialConstants(sm, cfg);
            }
            if (m.getTotalVertices && m.getTotalVertices() > 0) World3D.inkMesh(m, 'actor', cfg);
        }
    }
    function tintRider(root, tints) {
        for (const m of root.getChildMeshes(false)) {
            const mat = m.material;
            for (const sm of (mat ? (mat.subMaterials || [mat]) : [])) {
                const hit = sm && /\/tint([1-5])$/.exec(sm.name || '');
                if (hit && tints[+hit[1] - 1]) sm.diffuseColor = BABYLON.Color3.FromHexString(tints[+hit[1] - 1]);
            }
        }
    }
    // Части наездника для превью: набор имён, остальные выключены; причёска — одна.
    function riderPreview(model, scene, parts, tints, hair) {
        const root = Model3D.build(model, scene, { name: 'cos:rider' });
        const keep = new Set(parts.concat(['Hair_' + hair]));
        for (const m of root.getChildMeshes(true)) {
            const nm = (m.metadata && m.metadata.part) || '';
            m.setEnabled(keep.has(nm));
        }
        tintRider(root, tints);
        return root;
    }
    function boundsOf(meshes) {
        let mn = null, mx = null;
        for (const m of meshes) {
            if (!m.getTotalVertices || m.getTotalVertices() <= 0 || !m.isEnabled()) continue;
            m.computeWorldMatrix(true);
            const bb = m.getBoundingInfo().boundingBox;
            const a = bb.minimumWorld, b = bb.maximumWorld;
            if (!mn) { mn = [a.x, a.y, a.z]; mx = [b.x, b.y, b.z]; continue; }
            mn = [Math.min(mn[0], a.x), Math.min(mn[1], a.y), Math.min(mn[2], a.z)];
            mx = [Math.max(mx[0], b.x), Math.max(mx[1], b.y), Math.max(mx[2], b.z)];
        }
        return mn ? { min: mn, max: mx } : null;
    }

    /** Содержимое превью предмета: { nodes, frame (меши для рамки кадра), dir (направление камеры), fit } или null. */
    async function buildThumb(item, ts) {
        const scene = ts.scene;
        const D = RiderModel.DEFAULT_TINTS;
        const nodes = [];
        let frame = null, dir = [0.5, 0.2, 1], fit = 1.2, lookAt = null;
        if (item.tab === 'outfit' && item.skin) {
            const model = await Model3D.load(RiderModel.SKIN_FILES[item.skin]);
            const r = Model3D.build(model, scene, { name: 'cos:skin' });
            nodes.push(r); frame = [r]; dir = [0.55, 0.14, 1]; fit = 1.12;
        } else if (item.tab === 'outfit') {
            const model = await Model3D.load(RiderModel.URL);
            const def = OUTFITS[item.key];
            const r = riderPreview(model, scene, ['Head', 'EyeL', 'EyeR', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Torso'], def.slice(0, 5), def[5]);
            nodes.push(r); frame = [r]; dir = [0.55, 0.14, 1]; fit = 1.12;
        } else if (item.tab === 'hat' || item.tab === 'face') {
            const [rm, cm] = await Promise.all([Model3D.load(RiderModel.URL), loadGlb(item.tab)]);
            if (!cm) return null;
            const r = riderPreview(rm, scene, ['Head', 'EyeL', 'EyeR'], D, 'swept');
            const it = buildItem(cm, scene, item.tab, item.key, true);
            if (!it) { r.dispose(false, true); return null; }
            nodes.push(r, it.root);
            frame = [r, it.root]; dir = item.tab === 'face' ? [0.42, 0.1, 1] : [0.55, 0.22, 1]; fit = item.tab === 'face' ? 1.12 : 1.25;
            if (item.tab === 'face') lookAt = 'head';
        } else if (item.tab === 'back') {
            const [rm, cm] = await Promise.all([Model3D.load(RiderModel.URL), loadGlb('back')]);
            if (!cm) return null;
            const r = riderPreview(rm, scene, ['Head', 'EyeL', 'EyeR', 'Torso', 'ArmL', 'ArmR'], ['#8fa3bd', '#566377', '#a96716', '#ffe2c6', '#e9e4d6'], 'swept');
            const it = buildItem(cm, scene, 'back', item.key, true);
            if (!it) { r.dispose(false, true); return null; }
            nodes.push(r, it.root);
            frame = [r, it.root]; dir = [-0.62, 0.22, -1]; fit = 1.2;
        } else if (item.tab === 'saddle') {
            if (typeof PetView === U) return null;
            const back = PetView.buildMesh(scene, 'cos:back', [E(190, 54, 108, [0, -29, 0], '#c9b38e'), E(80, 22, 70, [-2, -22, 0], '#b69e78')]);
            back.material = vcMaterial(scene, 'cos:back-vc', false);
            const s = makeSaddle(scene, item.key, { size: { width: 92 } }, { thumb: true });
            if (!s) { back.dispose(false, true); return null; }
            nodes.push(back, s); frame = [s]; dir = [0.78, 0.62, 0.95]; fit = 1.15;
        } else return null;
        for (const n of nodes) styleThumbMeshes(n);
        return { nodes, frame, dir, fit, lookAt };
    }

    async function renderThumb(item) {
        const ts = thumbScene();
        if (!ts) return '';
        const built = await buildThumb(item, ts);
        if (!built) return '';
        const { nodes } = built;
        let url = '';
        try {
            const meshes = [];
            for (const n of nodes) { if (n.getTotalVertices && n.getTotalVertices() > 0) meshes.push(n); for (const m of n.getChildMeshes(false)) meshes.push(m); }
            const draw = meshes.filter(m => m.isEnabled() && m.getTotalVertices && m.getTotalVertices() > 0);
            // камера по габариту (для лица — по голове, а не по очкам: чтобы не уезжать от мелкого предмета)
            let bnd = boundsOf(built.frame.flatMap(n => [n].concat(n.getChildMeshes(false))));
            if (!bnd) return '';
            if (built.lookAt === 'head') {
                const hb = boundsOf(nodes[0].getChildMeshes(true).filter(m => m.metadata && m.metadata.part === 'Head'));
                if (hb) bnd = hb;
            }
            const c = [(bnd.min[0] + bnd.max[0]) / 2, (bnd.min[1] + bnd.max[1]) / 2, (bnd.min[2] + bnd.max[2]) / 2];
            const size = Math.max(bnd.max[0] - bnd.min[0], bnd.max[1] - bnd.min[1], bnd.max[2] - bnd.min[2]);
            const r = size * 0.5 * built.fit;
            const d = built.dir, dl = Math.hypot(d[0], d[1], d[2]);
            const dist = r / Math.sin(ts.cam.fov / 2);
            const V = BABYLON.Vector3;
            ts.cam.position = new V(c[0] + d[0] / dl * dist, c[1] + d[1] / dl * dist, c[2] + d[2] / dl * dist);
            ts.cam.setTarget(new V(c[0], c[1], c[2]));
            const f = new V(-d[0] / dl, -d[1] / dl, -d[2] / dl);
            ts.sun.direction = new V(f.x * 0.5 + 0.3, -0.85, f.z * 0.5 - 0.1).normalize();
            // ждём шейдеры
            for (let i = 0; i < 100 && !draw.every(m => m.isReady(true)); i++) await sleep(20);
            ts.scene.incrementRenderId();
            ts.scene.resetCachedMaterial();
            ts.rtt.renderList = draw;
            ts.rtt.render(false, false);
            const px = await ts.rtt.readPixels();
            if (px) url = pixelsToOutlinedUrl(px, ts.px);
        } finally {
            for (const n of nodes) { try { n.dispose(false, true); } catch (e) { /* уже убрано */ } }
            ts.rtt.renderList = [];
        }
        return url;
    }

    // RGBA снизу вверх, альфа «премультиплицированная» (край антиалиасинга) -> PNG с тёмной обводкой по силуэту, как у объектов игры.
    function pixelsToOutlinedUrl(px, size) {
        const src = document.createElement('canvas');
        src.width = src.height = size;
        const g = src.getContext('2d');
        const img = g.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            const sy = (size - 1 - y) * size * 4, dy = y * size * 4;
            for (let x = 0; x < size; x++) {
                const s = sy + x * 4, d = dy + x * 4, a = px[s + 3];
                if (a > 0) {
                    const k = 255 / a;
                    img.data[d] = Math.min(255, px[s] * k); img.data[d + 1] = Math.min(255, px[s + 1] * k); img.data[d + 2] = Math.min(255, px[s + 2] * k);
                }
                img.data[d + 3] = a;
            }
        }
        g.putImageData(img, 0, 0);
        const out = document.createElement('canvas');
        out.width = out.height = size;
        const o = out.getContext('2d');
        const t = Math.max(1, size / 64);
        const ink = document.createElement('canvas');
        ink.width = ink.height = size;
        const ig = ink.getContext('2d');
        for (let a = 0; a < 12; a++) ig.drawImage(src, Math.cos(a * PI / 6) * t * 1.4, Math.sin(a * PI / 6) * t * 1.4);
        ig.globalCompositeOperation = 'source-in';
        ig.fillStyle = '#1c0f06';
        ig.fillRect(0, 0, size, size);
        o.drawImage(ink, 0, 0);
        o.drawImage(src, 0, 0);
        return out.toDataURL('image/png');
    }

    // Следы: рисунок частиц вдоль изгиба на тёмном фоне.
    function hexRgb(h) { const n = parseInt(String(h).replace('#', ''), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function mixHex(a, b, t) { const x = hexRgb(a), y = hexRgb(b); return '#' + [0, 1, 2].map(i => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0')).join(''); }
    function gradAt(cg, t) {
        for (let i = 1; i < cg.length; i++) if (t <= cg[i][0]) { const a = cg[i - 1], b = cg[i], k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]); return mixHex(a[1], b[1], clamp(k, 0, 1)); }
        return cg[cg.length - 1][1];
    }
    function trailThumb(item, size) {
        const def = TRAILS[item.key];
        if (!def || typeof document === U) return '';
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const g = cv.getContext('2d');
        const bg = g.createRadialGradient(size * 0.5, size * 0.55, size * 0.05, size * 0.5, size * 0.55, size * 0.75);
        bg.addColorStop(0, '#3c4f6e'); bg.addColorStop(1, '#161d2e');
        g.fillStyle = bg;
        g.beginPath(); g.roundRect ? g.roundRect(0, 0, size, size, size * 0.16) : g.rect(0, 0, size, size); g.fill();
        const rng = (() => { let s = 7; for (const ch of item.id) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
        const n = def.cg ? 26 : 20;
        const unit = size / 128;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const x = size * (0.1 + 0.8 * t) + (rng() - 0.5) * size * 0.1;
            const y = size * (0.74 - 0.42 * t + 0.07 * Math.sin(t * 7)) + (rng() - 0.5) * size * 0.14;
            const r = unit * (def.size[1] * (0.85 - 0.45 * t) + 2) * (def.shape === 'dot' && !def.cg ? 0.75 : 0.9);
            const col = def.cg ? gradAt(def.cg, clamp(1 - t + (rng() - 0.5) * 0.3, 0, 1)) : mixHex(def.colors[0], def.colors[1] || def.colors[0], rng());
            const kind = def.atlas ? def.atlas[i % def.atlas.length] : def.shape;
            g.save();
            g.globalAlpha = clamp(0.35 + 0.65 * t, 0.2, 1) * (def.alpha != null ? Math.max(0.6, def.alpha) : 1);
            g.globalCompositeOperation = def.blend === 'add' && def.shape !== 'flame' ? 'lighter' : 'source-over';
            g.translate(x, y); g.rotate((rng() - 0.5) * 1.6); g.translate(-x, -y);
            paintShape(g, kind, x, y, Math.min(r, size * 0.17), col, 'rgba(30,20,10,.6)');
            g.restore();
        }
        return cv.toDataURL('image/png');
    }

    function thumbPromise(id, size) {
        const item = BY_ID[id];
        if (!item) return Promise.resolve('');
        if (thumbs.has(id)) return Promise.resolve(/** @type {string} */ (thumbs.get(id)));
        let job = thumbJobs.get(id);
        if (!job) {
            job = new Promise((resolve) => {
                thumbChain = thumbChain.then(async () => {
                    let url = '';
                    try {
                        url = item.tab === 'trail' ? trailThumb(item, Math.round(clamp(size || CFG.thumbPx, 48, 256))) : await renderThumb(item);
                    } catch (e) { console.warn('Cosmetics: превью ' + id + ' не нарисовалось —', (e && e.message) || e); }
                    if (url) thumbs.set(id, url);
                    thumbJobs.delete(id);
                    resolve(url);
                }).catch(() => resolve(''));
            });
            thumbJobs.set(id, job);
        }
        return job;
    }
    const thumbSync = (id) => thumbs.get(id) || null;
    // Публичное thumb(id, size) -> Promise<dataURL>. Если есть DOM, это «thenable»-картинка: await / .then дают dataURL, а саму её можно
    // сразу вставить в страницу — src появится, когда превью нарисовано (так её берёт DailyWheel.thumbNode без правок).
    function thumb(id, size) {
        const p = thumbPromise(id, size);
        if (typeof document === U || typeof document.createElement !== 'function') return p;
        const img = /** @type {any} */ (document.createElement('img'));
        img.className = 'cw-ti'; img.alt = ''; img.draggable = false;
        const have = thumbSync(id);
        if (have) img.src = have; else p.then((u) => { if (u) img.src = u; });
        img.then = (res, rej) => p.then(res, rej);
        img.catch = (rej) => p.catch(rej);
        img.finally = (fn) => p.finally(fn);
        return img;
    }

    // =============================================================================================
    // Окно «Гардероб»
    // =============================================================================================
    // Деревянное окно прижато к правому краю (в портрете — к нижнему), слева (сверху) камера держит наездника на питомце: любой выбранный
    // предмет сразу примеряется, купленный — надевается. Перетаскивание по свободной части экрана вращает камеру.
    const CW_CSS = `
#game-ui .pl-dim.cw-dim{background:linear-gradient(90deg,rgba(18,9,3,0) 0%,rgba(18,9,3,0) 40%,rgba(18,9,3,.5) 100%);justify-content:flex-end;align-items:stretch;padding-top:calc(var(--u)*36);touch-action:none}
#game-ui.portrait .pl-dim.cw-dim{background:linear-gradient(180deg,rgba(18,9,3,0) 0%,rgba(18,9,3,0) 36%,rgba(18,9,3,.5) 100%);justify-content:center;align-items:flex-end;padding-top:calc(var(--u)*10)}
#game-ui .cw-panel{width:min(calc(var(--u)*560),56%);height:100%;max-height:none;margin:0}
#game-ui.portrait .cw-panel{width:100%;height:60%;max-height:100%}
#game-ui .cw-body{display:flex;flex-direction:column;gap:calc(var(--u)*6);padding:calc(var(--u)*8);overflow:hidden;touch-action:manipulation}
.cw-tabs{flex:1 1 auto;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:calc(var(--u)*4);min-width:0}
.cw-tab{position:relative;pointer-events:auto;appearance:none;border:calc(var(--u)*3) solid #1c0f06;border-radius:calc(var(--u)*11);background:linear-gradient(#b27a43,#7b4a24);color:#fff;font-weight:900;font-family:inherit;
 padding:calc(var(--u)*3) calc(var(--u)*2) calc(var(--u)*2);display:flex;flex-direction:column;align-items:center;gap:0;cursor:pointer;min-width:0;box-shadow:inset 0 calc(var(--u)*2) 0 rgba(255,230,180,.4),0 calc(var(--u)*3) 0 #1c0f06;touch-action:manipulation}
.cw-tab.on{background:linear-gradient(#fff067,#ffb21e);box-shadow:inset 0 calc(var(--u)*2) 0 rgba(255,255,255,.7),0 calc(var(--u)*3) 0 #1c0f06;transform:translateY(calc(var(--u)*-1))}
.cw-tab .cw-tw{width:calc(var(--u)*34);height:calc(var(--u)*34);display:flex;align-items:center;justify-content:center}
.cw-tab .cw-tw img{width:100%;height:100%;object-fit:contain}
.cw-tab .cw-tw .ico{width:70%;height:70%}
.cw-tab .cw-tl{font-size:max(10px,calc(var(--u)*12));line-height:1.1;-webkit-text-stroke:calc(var(--u)*3) #0d0602;paint-order:stroke fill;max-width:100%;overflow:hidden;text-overflow:clip;white-space:nowrap}
.cw-tab.on .cw-tl{-webkit-text-stroke:calc(var(--u)*3) #6b3a00}
.cw-tabs.nolabel .cw-tl{display:none}
.cw-tabs.nolabel .cw-tab .cw-tw{width:calc(var(--u)*40);height:calc(var(--u)*40)}
.cw-paws{flex:0 0 auto;display:flex;align-items:center;justify-content:center;padding:calc(var(--u)*2) calc(var(--u)*10) calc(var(--u)*2) calc(var(--u)*6);border-radius:999px;background:linear-gradient(#5b3417,#3b210f);border:calc(var(--u)*3) solid #1c0f06;color:#fff;font-size:max(12px,calc(var(--u)*18));line-height:1.05;min-width:calc(var(--u)*70)}
.cw-paws .ico{width:calc(var(--u)*24);height:calc(var(--u)*24)}
.cw-paws .cw-pn{display:flex;align-items:center;gap:calc(var(--u)*3)}
.cw-meta{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:calc(var(--u)*8);font-size:max(10px,calc(var(--u)*15));color:#6b3a17;font-weight:900;line-height:1.1;padding:0 calc(var(--u)*2)}
.cw-meta .cw-mt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cw-meta .cw-mt b{color:#c2570b}
.cw-grid{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;display:grid;grid-template-columns:repeat(auto-fill,minmax(max(78px,calc(var(--u)*92)),1fr));gap:calc(var(--u)*8);align-content:start;padding:calc(var(--u)*5) calc(var(--u)*3) calc(var(--u)*6);
 -webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y}
.cw-card{--rc:#8b5a2b;position:relative;pointer-events:auto;appearance:none;border:calc(var(--u)*3.5) solid var(--rc);border-radius:calc(var(--u)*12);background:linear-gradient(#fffbe9,#f2dca6);padding:calc(var(--u)*4) calc(var(--u)*3) calc(var(--u)*4);
 display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*2);cursor:pointer;font-family:inherit;color:#4a2a12;text-align:center;min-width:0;touch-action:manipulation;
 box-shadow:inset 0 0 0 calc(var(--u)*2) rgba(255,255,255,.6),0 calc(var(--u)*3) 0 rgba(28,15,6,.45)}
.cw-card:hover{filter:brightness(1.05)}
.cw-card.sel{transform:translateY(calc(var(--u)*-2));box-shadow:inset 0 0 0 calc(var(--u)*2) rgba(255,255,255,.6),0 0 0 calc(var(--u)*3) #fff,0 0 0 calc(var(--u)*6) #ff9d1c,0 calc(var(--u)*6) calc(var(--u)*8) rgba(0,0,0,.35);z-index:1}
.cw-card.r-legendary{background:linear-gradient(#fff6cf,#ffd978)}
.cw-card.r-mythic{background:linear-gradient(#ffe3ec,#ffb0c8)}
.cw-card.r-epic{background:linear-gradient(#f7ecff,#dcc2f6)}
.cw-card.r-rare{background:linear-gradient(#edf7ff,#c4def6)}
.cw-card.r-uncommon{background:linear-gradient(#f0fff0,#cdeccb)}
.cw-th{position:relative;width:100%;aspect-ratio:1;border-radius:calc(var(--u)*8);background:radial-gradient(circle at 50% 30%,rgba(255,255,255,.95),rgba(255,255,255,.35) 70%);display:flex;align-items:center;justify-content:center;overflow:hidden}
.cw-th img.cw-ti{width:100%;height:100%;object-fit:contain;pointer-events:none}
.cw-th .cw-ph{width:42%;height:42%;opacity:.35}
.cw-th .cw-none{width:56%;height:56%;opacity:.55}
.cw-card.locked .cw-th img.cw-ti{filter:brightness(.78) saturate(.85)}
.cw-lk{position:absolute;right:calc(var(--u)*3);top:calc(var(--u)*3);width:calc(var(--u)*22);height:calc(var(--u)*22);border-radius:50%;background:rgba(28,15,6,.72);display:flex;align-items:center;justify-content:center}
.cw-lk .ico{width:70%;height:70%}
.cw-eq{position:absolute;left:calc(var(--u)*3);top:calc(var(--u)*3);width:calc(var(--u)*24);height:calc(var(--u)*24);border-radius:50%;background:linear-gradient(#8bf070,#37b324);border:calc(var(--u)*2.5) solid #12390c;display:flex;align-items:center;justify-content:center}
.cw-eq .ico{width:70%;height:70%}
.cw-nm{font-size:max(10.5px,calc(var(--u)*12.5));line-height:1.06;font-weight:900;min-height:2.12em;display:flex;align-items:center;justify-content:center;width:100%;overflow:hidden;word-break:break-word}
.cw-ft{font-size:max(10.5px,calc(var(--u)*13));font-weight:900;display:flex;align-items:center;justify-content:center;gap:calc(var(--u)*3);line-height:1;min-height:calc(var(--u)*16)}
.cw-ft .ico{width:max(12px,calc(var(--u)*16));height:max(12px,calc(var(--u)*16))}
.cw-ft.own{color:#2b7a1f}
.cw-ft.eqd{color:#1d6a12}
.cw-ft.short{color:#b3261e}
.cw-bar{flex:0 0 auto;display:flex;align-items:center;gap:calc(var(--u)*10);padding:calc(var(--u)*8) calc(var(--u)*10);border-radius:calc(var(--u)*12);flex-wrap:wrap}
.cw-bi{flex:1 1 calc(var(--u)*150);min-width:0;display:flex;flex-direction:column;gap:calc(var(--u)*2)}
.cw-bn{font-size:max(14px,calc(var(--u)*20));line-height:1.05;font-weight:900}
.cw-bs{font-size:max(11px,calc(var(--u)*14));line-height:1.12;color:#ffe9a8;font-weight:800;-webkit-text-stroke:calc(var(--u)*3) #0d0602;paint-order:stroke fill}
.cw-bs .rar{font-weight:900}
.cw-bn2{font-size:max(11px,calc(var(--u)*13));color:#ffd0c8;line-height:1.1;-webkit-text-stroke:calc(var(--u)*3) #0d0602;paint-order:stroke fill}
.cw-ba{display:flex;gap:calc(var(--u)*8);align-items:center;flex:0 0 auto}
.cw-ba .gb{font-size:max(14px,calc(var(--u)*19));padding:calc(var(--u)*8) calc(var(--u)*16);min-width:calc(var(--u)*130)}
.cw-ba .gb .ico{width:calc(var(--u)*24);height:calc(var(--u)*24)}
.cw-hint{position:absolute;left:calc(var(--u)*14);top:calc(var(--u)*14);font-size:max(10px,calc(var(--u)*14));color:#fff;opacity:.85;pointer-events:none;-webkit-text-stroke:calc(var(--u)*4) #0d0602;paint-order:stroke fill;max-width:36%}
#game-ui.portrait .cw-hint{left:50%;transform:translateX(-50%);top:calc(var(--u)*14);text-align:center;max-width:80%}
#game-ui.portrait .cw-ba{width:100%}
#game-ui.portrait .cw-ba .gb{flex:1}
#game-ui.compact .cw-grid{grid-template-columns:repeat(auto-fill,minmax(max(76px,calc(var(--u)*86)),1fr));gap:calc(var(--u)*6)}
#game-ui.short .cw-bar{padding:calc(var(--u)*5) calc(var(--u)*8);gap:calc(var(--u)*6)}
#game-ui.short .cw-th{aspect-ratio:1.3}
#game-ui.short .cw-nm{min-height:2.1em}
#game-ui.short .cw-tab .cw-tw{width:calc(var(--u)*26);height:calc(var(--u)*26)}
.sbtn[data-id="wardrobe"] .lb{font-size:calc(var(--u)*12.5)}
`;

    /** @type {any} */
    let ui = null;       // состояние открытого окна: { tab, sel, rec, el, grid, bar, tabs, cards, pawsEl, cine, userAz, … }
    let lastTab = 'outfit';
    let hudTimer = 0;
    const el = (tag, props, ...kids) => GameUtil.el(tag, props, ...kids);
    const T = (key, p) => Lang.t(key, p);
    const nameOf = (item) => T(item.name);
    const rarCol = (r) => (typeof GameData !== U && GameData.rarityColor ? GameData.rarityColor(r) : '#c8d0d8');
    const REP = { outfit: 'outfit_cowboy', hat: 'hat_cowboy', face: 'face_shades', back: 'back_cape', saddle: 'saddle_royal', trail: 'trail_rainbow' };
    const TAB_ICON = { outfit: 'tag', hat: 'crown', face: 'magnifier', back: 'backpack', saddle: 'ranch', trail: 'star' };

    function tutorialActive() {
        const t = typeof Tutorial !== U ? /** @type {any} */ (Tutorial) : null;
        return !!t && (!!t.active || (typeof t.isActive === 'function' && !!t.isActive()));
    }
    function titleShown() {
        const m = typeof Menus !== U ? /** @type {any} */ (Menus) : null;
        return !!m && (!!m.titleShown || !!m.titleOpen || !!m.titleActive || (typeof m.isTitleOpen === 'function' && !!m.isTitleOpen()));
    }

    // Предметы вкладки в сетке: «ничего» + предметы + (для нарядов) полученные эксклюзивы.
    function gridIds(tab) {
        const ids = tabItems(tab).map(i => i.id);
        if (tab === 'outfit') for (const id of EXCLUSIVE) if (isOwned(id)) ids.push(id);
        return ids;
    }

    function setImg(card, url) {
        if (!card || !card.isConnected) return;
        const th = card.querySelector('.cw-th');
        if (!th) return;
        th.innerHTML = '';
        th.appendChild(el('img', { class: 'cw-ti', src: url, alt: '', draggable: 'false' }));
    }
    function tabIcon(tab) {
        const w = ui && ui.tabs[tab] && ui.tabs[tab].querySelector('.cw-tw');
        const url = thumbSync(REP[tab]);
        if (w && url) { w.innerHTML = ''; w.appendChild(el('img', { src: url, alt: '' })); }
    }

    function cardFooter(item) {
        if (!item) return '';
        if (isOwned(item.id)) return '<span class="cw-ft ' + (cs().equipped[item.tab] === item.id ? 'eqd' : 'own') + '">' + GameUtil.esc(cs().equipped[item.tab] === item.id ? T('cw.equipped') : T('cw.owned')) + '</span>';
        if (item.price) return '<span class="cw-ft' + (GameState.state.paws < item.price ? ' short' : '') + '">' + GameUI.icon('paw') + GameUtil.esc(String(item.price)) + '</span>';
        return '<span class="cw-ft">' + GameUI.icon('play') + adProgress(item.id) + '/' + item.ads + '</span>';
    }

    function makeCard(id) {
        const item = id ? BY_ID[id] : null;
        const rc = item ? rarCol(item.rarity) : '#8b5a2b';
        const card = el('button', { class: 'cw-card' + (item ? ' r-' + item.rarity : ''), type: 'button', 'data-id': id || '', style: { '--rc': rc } });
        card.appendChild(el('span', { class: 'cw-th', html: item ? GameUI.icon('star', 'cw-ph') : GameUI.icon('cross', 'cw-none') }));
        card.appendChild(el('span', { class: 'cw-nm', text: item ? nameOf(item) : T(ui.tab === 'outfit' ? 'cw.none.outfit' : 'cw.none.item') }));
        const ft = el('span', { class: 'cw-ftw', style: { display: 'contents' } });
        card.appendChild(ft);
        card.addEventListener('click', (e) => { e.stopPropagation(); GameUI.sfx('click', { volume: 0.5 }); select(id); card.blur(); });
        card.addEventListener('pointerdown', (e) => e.stopPropagation());
        return card;
    }

    function paintCard(id) {
        const card = ui.cards.get(id || '');
        if (!card) return;
        const item = id ? BY_ID[id] : null;
        const owned = !item || isOwned(id);
        const eqId = cs().equipped[ui.tab] || null;
        card.classList.toggle('sel', (ui.sel || null) === (id || null));
        card.classList.toggle('locked', !owned);
        const ftw = card.querySelector('.cw-ftw');
        if (ftw) ftw.innerHTML = item ? cardFooter(item) : '<span class="cw-ft ' + (!eqId ? 'eqd' : '') + '">' + GameUtil.esc(!eqId ? T('cw.equipped') : '') + '</span>';
        // значки: замок (закрыт) и галочка (надето)
        let lk = card.querySelector('.cw-lk'), eq = card.querySelector('.cw-eq');
        const worn = item ? eqId === id : !eqId;
        if (!owned && !lk) { lk = el('span', { class: 'cw-lk', html: GameUI.icon('lock') }); card.appendChild(lk); }
        if (owned && lk) lk.remove();
        if (worn && !eq) { eq = el('span', { class: 'cw-eq', html: GameUI.icon('check') }); card.appendChild(eq); }
        if (!worn && eq) eq.remove();
    }
    function paintAllCards() { for (const id of ui.cards.keys()) paintCard(id || null); }

    function buildGrid() {
        const g = ui.grid;
        GameUtil.clear(g);
        ui.cards = new Map();
        const ids = [null].concat(gridIds(ui.tab));
        for (const id of ids) {
            const card = makeCard(id);
            ui.cards.set(id || '', card);
            g.appendChild(card);
            paintCard(id);
            if (id) {
                const have = thumbSync(id);
                if (have) setImg(card, have); else thumbPromise(id).then(url => { if (url && ui && ui.cards.get(id) === card) setImg(card, url); });
            }
        }
        g.scrollTop = 0;
        updateMeta();
    }

    // Подробности выбранного предмета и кнопки: Надеть / Снять / Купить / За рекламу a/b.
    function renderBar() {
        const bar = ui.bar;
        if (ui.adBtn) { try { ui.adBtn.destroy(); } catch (e) { /* уже снята */ } ui.adBtn = null; }
        GameUtil.clear(bar);
        const tab = ui.tab, sel = ui.sel || null;
        const item = sel ? BY_ID[sel] : null;
        const eqId = cs().equipped[tab] || null;
        const info = el('div', { class: 'cw-bi' }), acts = el('div', { class: 'cw-ba' });
        bar.append(info, acts);
        const press = (btn, fn) => { btn.addEventListener('click', (e) => { e.stopPropagation(); if (btn.disabled) return; fn(); btn.blur(); }); btn.addEventListener('pointerdown', (e) => e.stopPropagation()); return btn; };
        if (!item) {
            info.appendChild(el('div', { class: 'cw-bn otx', text: T(tab === 'outfit' ? 'cw.none.outfit' : 'cw.none.item') }));
            info.appendChild(el('div', { class: 'cw-bs', text: T(!eqId ? (tab === 'outfit' ? 'cw.nowOutfit' : 'cw.nowNone') : 'cw.try') }));
            if (eqId) acts.appendChild(press(el('button', { class: 'gb green', type: 'button', text: T('cw.equip') }), () => doUnequip(tab)));
            return;
        }
        const owned = isOwned(item.id);
        info.appendChild(el('div', { class: 'cw-bn otx', text: nameOf(item) }));
        const rar = '<span class="rar" style="color:' + rarCol(item.rarity) + '">' + GameUtil.esc(T('rarity.' + item.rarity)) + '</span>';
        const sub = el('div', { class: 'cw-bs' });
        info.appendChild(sub);
        if (owned) {
            const worn = eqId === item.id;
            sub.innerHTML = rar + ' · ' + GameUtil.esc(T(worn ? 'cw.equipped' : 'cw.owned')) + (item.exclusive ? ' · ' + GameUtil.esc(T('cw.exclusive')) : '');
            if (worn) acts.appendChild(press(el('button', { class: 'gb red', type: 'button', text: T('cw.unequip') }), () => doUnequip(tab)));
            else acts.appendChild(press(el('button', { class: 'gb green', type: 'button', text: T('cw.equip') }), () => doEquip(item.id)));
        } else if (item.price) {
            const enough = GameState.state.paws >= item.price;
            sub.innerHTML = rar + ' · ' + GameUI.icon('paw') + GameUtil.esc(String(item.price)) + ' · ' + GameUtil.esc(T('cw.try'));
            const b = el('button', { class: 'gb yellow' + (enough ? '' : ' off'), type: 'button', html: GameUtil.esc(T('cw.buy')) + ' ' + GameUI.icon('paw') + GameUtil.esc(String(item.price)) });
            acts.appendChild(press(b, () => doBuy(item.id)));
            if (!enough) info.appendChild(el('div', { class: 'cw-bn2', text: T('cw.needPaws', { n: item.price }) }));
        } else if (item.ads) {
            const a = adProgress(item.id);
            sub.innerHTML = rar + ' · ' + GameUtil.esc(T('cw.adReward', { a, b: item.ads }));
            const b = el('button', { class: 'gb blue', type: 'button' });
            acts.appendChild(b);
            ui.adBtn = GameUI.rewardButton(b, { id: 'shop-unlock', cls: 'blue', label: T('cw.adsProgress', { a, b: item.ads }), onReward: () => onAdReward(item.id) });
            if (!GameUI.adsAvailable()) info.appendChild(el('div', { class: 'cw-bn2', text: T('ad.unavailable') }));
        } else {
            sub.innerHTML = rar + ' · ' + GameUtil.esc(T('cw.exclusiveHint'));
        }
    }

    function celebrate() { try { if (typeof Player !== U && Player.rider && Player.rider.celebrate) Player.rider.celebrate(1.4); } catch (e) { /* без радости */ } }

    function doEquip(id) {
        if (!equip(id)) return;
        GameUI.sfx('unlock', { volume: 0.5 });
        celebrate();
        ui.sel = id;
        paintAllCards(); renderBar();
    }
    function doUnequip(tab) {
        unequip(tab);
        GameUI.sfx('click');
        ui.sel = null;
        paintAllCards(); renderBar();
    }
    let busyBuy = false;
    function doBuy(id) {
        const item = BY_ID[id];
        if (!item || busyBuy) return;
        busyBuy = true;
        setTimeout(() => { busyBuy = false; }, 350);
        const r = buy(id);
        if (!r.ok) {
            if (r.reason === 'paws') { GameUI.toast(T('cw.needPaws', { n: item.price }), 'bad'); GameUI.sfx('error'); }
            return;
        }
        GameUI.sfx('buy');
        GameUI.toast(T('cw.bought', { name: nameOf(item) }), 'good');
        equip(id);
        celebrate();
        refreshWindow();
    }
    function onAdReward(id) {
        const item = BY_ID[id];
        const r = addAdView(id);
        if (!item) return;
        if (r.unlocked) {
            GameUI.sfx('unlock');
            GameUI.toast(T('cw.unlocked', { name: nameOf(item) }), 'good');
            equip(id);
            celebrate();
        } else if (!r.owned) {
            GameUI.toast(T('cw.adCounted', { a: r.progress, b: r.need }), 'info');
        }
        if (ui) refreshWindow();
    }
    function updateMeta() {
        if (!ui || !ui.metaA) return;
        const items = tabItems(ui.tab);
        ui.metaA.innerHTML = '<b>' + GameUtil.esc(T('cw.tab.' + ui.tab)) + '</b> · ' + GameUtil.esc(T('cw.collected', { a: items.filter(i => isOwned(i.id)).length, b: items.length }));
    }
    function updatePaws() {
        if (ui && ui.pawsEl) ui.pawsEl.textContent = GameUtil.fmt(GameState.state.paws);
    }
    function refreshWindow() {
        if (!ui) return;
        updatePaws();
        updateMeta();
        // эксклюзив мог только что появиться (Подарок дня при открытом окне) — перестроить сетку
        if (ui.cards.size !== gridIds(ui.tab).length + 1) buildGrid(); else paintAllCards();
        renderBar();
    }

    // Выбор карточки = примерка на персонаже (предмет не надет, пока не нажата «Надеть»).
    function select(id) {
        if (!ui) return;
        ui.sel = id || null;
        const tab = ui.tab;
        const eqId = cs().equipped[tab] || null;
        if ((id || null) === eqId) delete preview[tab]; else preview[tab] = id || null;
        refreshSlot(tab);
        ui.focusT = 0;
        paintAllCards(); renderBar();
    }

    function switchTab(tab) {
        if (!ui || ui.tab === tab) return;
        const prev = ui.tab;
        delete preview[prev];
        refreshSlot(prev);
        ui.tab = tab; lastTab = tab;
        ui.sel = cs().equipped[tab] || null;
        for (const t of TABS) ui.tabs[t].classList.toggle('on', t === tab);
        ui.focus = null;
        buildGrid(); renderBar();
        GameUI.sfx('click', { volume: 0.5 });
    }

    function buildWindow(body, rec) {
        ui = { tab: lastTab, sel: null, rec, el: body, cards: new Map(), tabs: {}, userAz: 0, adBtn: null, drag: null, shiftX: 0.5, shiftY: 0, shiftT: 0, focus: null, focusT: 0, adj: null, adjT: 0 };
        ui.sel = cs().equipped[ui.tab] || null;
        const tabs = el('div', { class: 'cw-tabs' });
        for (const t of TABS) {
            const b = el('button', { class: 'cw-tab' + (t === ui.tab ? ' on' : ''), type: 'button', 'data-tab': t });
            b.appendChild(el('span', { class: 'cw-tw', html: GameUI.icon(TAB_ICON[t]) }));
            b.appendChild(el('span', { class: 'cw-tl', text: T('cw.tab.' + t) }));
            b.addEventListener('click', (e) => { e.stopPropagation(); switchTab(t); b.blur(); });
            b.addEventListener('pointerdown', (e) => e.stopPropagation());
            ui.tabs[t] = b;
            tabs.appendChild(b);
        }
        ui.pawsEl = el('span', { class: 'otx', text: GameUtil.fmt(GameState.state.paws) });
        const paws = el('div', { class: 'cw-paws', title: T('cw.paws') }, el('div', { class: 'cw-pn', html: GameUI.icon('paw') }, ui.pawsEl));
        ui.metaA = el('span', { class: 'cw-mt' });
        const meta = el('div', { class: 'cw-meta' }, ui.metaA, paws);
        ui.tabsEl = tabs;
        ui.grid = el('div', { class: 'cw-grid' });
        ui.bar = el('div', { class: 'cw-bar wood otx' });
        body.append(tabs, meta, ui.grid, ui.bar);
        buildGrid();
        renderBar();
        // тап по вкладке-иконке: превью-представитель вкладки (рисуется первым, потом — сетка)
        for (const t of TABS) { if (thumbSync(REP[t])) tabIcon(t); else thumbPromise(REP[t]).then(() => { if (ui) tabIcon(t); }); }
        // вращение камеры: перетаскивание по свободной части экрана
        const dim = rec.root;
        dim.classList.add('cw-dim');
        rec.panelEl.classList.add('cw-panel');
        dim.appendChild(el('div', { class: 'cw-hint otx-s', text: T('cw.rotate') }));
        dim.addEventListener('click', (e) => { if (e.target === dim) e.stopImmediatePropagation(); }, true);
        dim.addEventListener('pointerdown', (e) => {
            if (e.target !== dim) return;
            ui.drag = { x: e.clientX, az: ui.userAz, id: e.pointerId };
            try { dim.setPointerCapture(e.pointerId); } catch (err) { /* без захвата */ }
        });
        dim.addEventListener('pointermove', (e) => { if (ui && ui.drag && ui.drag.id === e.pointerId) ui.userAz = ui.drag.az - (e.clientX - ui.drag.x) * 0.009; });
        const end = (e) => { if (ui && ui.drag && ui.drag.id === e.pointerId) ui.drag = null; };
        dim.addEventListener('pointerup', end);
        dim.addEventListener('pointercancel', end);
        // камера
        const g = stageGoal();
        ui.cine = { x: g.x, y: g.y, h: g.h, dist: g.dist, az: g.az, pitch: g.pitch };
        Player.cine = ui.cine;
        select(ui.sel);
    }

    function closeCleanup() {
        const was = ui;
        ui = null;
        sweep = false;
        if (was && typeof Player !== U && Player.cine === was.cine) Player.cine = null;
        for (const t of TABS) if (Object.prototype.hasOwnProperty.call(preview, t)) { delete preview[t]; refreshSlot(t); }
    }

    // --- Камера примерки ---
    // Кадр строится по габариту того, что показываем (голова с шапкой, торс со спиной, весь наездник, седло, хвост питомца),
    // расстояние подбирается так, чтобы габарит влез в свободную от окна часть экрана; наездник стоит в её центре.
    const worldBox = (mn, mx) => ({ min: mn, max: mx });
    function boundsOfNodes(list, pred) {
        let mn = null, mx = null;
        for (const n of list) {
            if (!n || !n.getHierarchyBoundingVectors) continue;
            let bb = null;
            try { bb = n.getHierarchyBoundingVectors(true, pred || ((m) => m.isEnabled() && m.getTotalVertices && m.getTotalVertices() > 0)); } catch (e) { bb = null; }
            // пустой набор: Babylon отдаёт min = +MAX_VALUE, max = −MAX_VALUE — числа конечные, камера улетала (скин «67»)
            if (!bb || !isFinite(bb.min.x) || !isFinite(bb.max.x) || bb.min.x > bb.max.x || bb.max.x - bb.min.x > 1e5) continue;
            if (!mn) { mn = bb.min.clone(); mx = bb.max.clone(); } else { mn.minimizeInPlace(bb.min); mx.maximizeInPlace(bb.max); }
        }
        return mn ? worldBox(mn, mx) : null;
    }
    function focusBox(tab) {
        const R = Player.rider, pv = Player.petView, P = R.parts || {};
        const sh = pv ? pv.seatHeight : 100, len = pv ? pv.size.length : 160, wid = pv ? pv.size.width : 90;
        const V = BABYLON.Vector3;
        const around = (cx, cy, cz, hx, hy, hz) => worldBox(new V(cx - hx, cy - hy, cz - hz), new V(cx + hx, cy + hy, cz + hz));
        let box = null;
        // скин на всё тело: кадр по нему (обычная модель скрыта)
        if (tab === 'outfit') box = boundsOfNodes([R.skinMesh || R.mesh]);
        else if (tab === 'hat') box = boundsOfNodes([P.Head]);
        else if (tab === 'face') {
            const hat = worn.hat && worn.hat.root;
            box = boundsOfNodes([P.Head], (m) => m.isEnabled() && m.getTotalVertices && m.getTotalVertices() > 0 && !(hat && m.isDescendantOf(hat)));
        } else if (tab === 'back') box = boundsOfNodes([P.Torso || R.skinMesh || R.mesh]);
        else if (tab === 'saddle') box = around(Player.x, Player.h + sh + 40, Player.y, len * 0.3, 92, Math.max(52, wid * 0.6));
        else if (tab === 'trail') box = around(Player.x - Math.cos(Player.heading) * len * 0.4, Player.h + sh * 0.45, Player.y - Math.sin(Player.heading) * len * 0.4, len * 0.78, sh * 0.55 + 20, len * 0.5);
        if (!box) box = around(Player.x, Player.h + sh + 60, Player.y, 70, 110, 70);
        return box;
    }
    function stageGoal(adj) {
        const tab = ui ? ui.tab : lastTab;
        const hd = Player.heading;
        const azOffs = { outfit: PI - 0.62, hat: PI - 0.5, face: PI - 0.3, back: 0.6, saddle: PI / 2 + 0.55, trail: PI / 2 + 0.5 };
        const pitches = { outfit: 0.16, hat: 0.1, face: 0.05, back: 0.18, saddle: 0.26, trail: 0.22 };
        if (ui && (!ui.focus || ui.focusT <= 0)) { ui.focus = focusBox(tab); ui.focusT = 0.25; }
        const box = ui && ui.focus ? ui.focus : focusBox(tab);
        const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, cz = (box.min.z + box.max.z) / 2;
        const H = box.max.y - box.min.y, bw = box.max.x - box.min.x, bd = box.max.z - box.min.z;
        const az = hd + (azOffs[tab] != null ? azOffs[tab] : azOffs.outfit) + (ui ? ui.userAz : 0) + (adj ? adj.az : 0);
        const view = Player.app.location.view;
        const vfov = view.camera.fov || 0.96;
        const aspect = (window.innerWidth || 1) / (window.innerHeight || 1);
        const portrait = !!(GameUI.root && GameUI.root.classList.contains('portrait'));
        const sx = ui ? ui.shiftX : 0.5, sy = ui ? ui.shiftY : 0;
        const tn = Math.tan(vfov / 2);
        const vFrac = portrait ? Math.max(0.3, 1 - sy) : 1, hFrac = portrait ? 1 : Math.max(0.3, 1 - sx);
        // ширина габарита на экране — проекция на «вправо» камеры, глубина — вдоль взгляда
        const Wd = Math.abs(bw * Math.sin(az)) + Math.abs(bd * Math.cos(az)), Dp = Math.abs(bw * Math.cos(az)) + Math.abs(bd * Math.sin(az));
        let dist = Math.max(H * 1.15 / (2 * tn * vFrac), Wd * 1.15 / (2 * tn * aspect * hFrac)) + Dp * 0.3;
        dist = clamp(dist * CFG.camDist * (adj ? adj.k : 1), 90, 1500);
        let x = cx, y = cz, h = cy;
        if (portrait) h -= tn * dist * sy;
        else { const half = tn * aspect * dist * sx; x += -Math.sin(az) * half; y += Math.cos(az) * half; }
        return { x, y, h, dist, az, pitch: pitches[tab] != null ? pitches[tab] : 0.16 };
    }
    // Камера не должна уходить в деревья и постройки (у ранчо и на площади их много): точки на луче от цели к камере проверяются по коллайдерам
    // мира; занято — чуть подвинуть азимут и приблизить.
    function viewFree(g) {
        if (typeof GameWorld === U || !GameWorld.colliders) return true;
        const cp = Math.cos(g.pitch), ca = Math.cos(g.az), sa = Math.sin(g.az);
        for (const f of [0.75, 1]) {
            const q = GameWorld.colliders.resolve(g.x - ca * cp * g.dist * f, g.y - sa * cp * g.dist * f, f === 1 ? 50 : 26);
            if (q.hit) return false;
        }
        return true;
    }
    function pickFreeView() {
        const adds = [0, 0.55, -0.55, 1.1, -1.1, 1.8, -1.8];
        for (const k of [1, 0.88, 0.76]) {
            for (const az of adds) {
                const a = { az, k };
                if (viewFree(stageGoal(a))) return a;
            }
        }
        return { az: 0, k: 0.76 };
    }
    // Положение окна: доля экрана, занятая окном (по ней — сдвиг цели и подпись вкладок только значками на узком окне).
    function measureLayout() {
        if (!ui || !ui.rec || !ui.rec.panelEl || !ui.rec.panelEl.getBoundingClientRect) return;
        const r = ui.rec.panelEl.getBoundingClientRect();
        const W = window.innerWidth || 1, H = window.innerHeight || 1;
        const portrait = !!(GameUI.root && GameUI.root.classList.contains('portrait'));
        if (portrait) { ui.shiftY = clamp((H - r.top) / H, 0, 0.8); ui.shiftX = 0; }
        else { ui.shiftX = clamp((W - r.left) / W, 0, 0.8); ui.shiftY = 0; }
        const tw = ui.tabs[TABS[0]] ? ui.tabs[TABS[0]].offsetWidth : 99;
        if (ui.tabsEl && tw > 0) ui.tabsEl.classList.toggle('nolabel', tw < 50);
    }
    function updateStage(dt) {
        if (!ui || !ui.cine) return;
        ui.shiftT -= dt; ui.focusT -= dt; ui.adjT -= dt;
        if (ui.shiftT <= 0) { ui.shiftT = 0.3; measureLayout(); }
        if (ui.adjT <= 0) { ui.adjT = 0.35; ui.adj = null; ui.adj = pickFreeView(); }
        const g = stageGoal(ui.adj), c = ui.cine, lam = 5;
        const d = GameUtil.damp;
        c.x = d(c.x, g.x, lam, dt); c.y = d(c.y, g.y, lam, dt); c.h = d(c.h, g.h, lam, dt);
        c.dist = d(c.dist, g.dist, lam, dt); c.pitch = d(c.pitch, g.pitch, lam, dt);
        c.az = GameUtil.dampAngle(c.az, g.az, lam, dt);
    }

    function open(tab) {
        if (!live() || tutorialActive() || titleShown()) return false;
        if (GameUI.blocking && !GameUI.isPanelOpen('wardrobe')) return false;
        if (tab && TABS.includes(tab)) lastTab = tab;
        // наездник на питомце: седло и след видны только так
        if (!Player.riding && GameState.ridingPet()) { try { Player.ride(); } catch (e) { /* остаёмся пешком */ } }
        GameUI.openPanel({ id: 'wardrobe', title: T('cw.title'), cls: 'cw-body', build: buildWindow, onClose: closeCleanup });
        return true;
    }
    function close() { if (ui) GameUI.closePanel('wardrobe'); }

    // =============================================================================================
    // Модуль и публичный API
    // =============================================================================================
    // Привести сохранение к каталогу: надето только своё и из своей вкладки; прогресс рекламы — только у закрытых предметов с рекламой.
    function sanitize() {
        const c = cs();
        for (const t of TABS) {
            const id = c.equipped[t];
            if (id && (!BY_ID[id] || BY_ID[id].tab !== t || !c.owned[id])) c.equipped[t] = null;
            if (c.equipped[t] === undefined) c.equipped[t] = null;
        }
        for (const id of Object.keys(c.adProgress)) {
            const it = BY_ID[id];
            if (!it || !it.ads || c.owned[id]) delete c.adProgress[id];
            else {
                const v = Math.min(it.ads - 1, Math.floor(Number(c.adProgress[id]) || 0));
                if (v >= 1) c.adProgress[id] = v; else delete c.adProgress[id];
            }
        }
    }

    let lastPv = null;
    function thumbNode(id, size) {
        const img = /** @type {HTMLImageElement} */ (el('img', { class: 'cw-ti', alt: '', draggable: 'false' }));
        const have = thumbSync(id);
        if (have) img.src = have; else thumbPromise(id, size).then((u) => { if (u) img.src = u; });
        return img;
    }

    const api = {
        id: 'cosmetics',
        TABS, CATALOG, BY_ID, EXCLUSIVE, RARITIES,
        /** Данные визуала (для тестов и редакторов): цвета нарядов, описания следов и седел, крылья спины. */
        DATA: { OUTFITS, TRAILS, SADDLES, BACK_FLAPS, GLB_A, GLB_B },
        /** Вид наряда: { tints: [куртка, брюки, волосы, кожа, футболка], hairStyle } или null. */
        look(id) { const it = BY_ID[id]; const d = it && it.tab === 'outfit' ? OUTFITS[it.key] : null; return d ? { tints: d.slice(0, 5), hairStyle: d[5] } : null; },
        /** Предмет каталога или null. */
        get(id) { return BY_ID[id] || null; },
        /** Название предмета на языке сборки. */
        itemName(id) { const it = BY_ID[id]; return it ? Lang.t(it.name) : String(id); },
        /** Предметы вкладки в порядке сетки (без эксклюзивов). */
        tabItems,
        isOwned,
        isEquipped(id) { const it = BY_ID[id]; return !!it && cs().equipped[it.tab] === id; },
        equippedId(tab) { return cs().equipped[tab] || null; },
        adProgress, adsNeeded,
        grant, equip, unequip, buy, addAdView, watchAd,
        randomShopItem,
        /** Примерка без покупки (до закрытия окна гардероба или нового выбора): id или null — снять. */
        preview(id) {
            const it = id ? BY_ID[id] : null;
            if (id && !it) return false;
            const tab = it ? it.tab : lastTab;
            if ((id || null) === (cs().equipped[tab] || null)) delete preview[tab]; else preview[tab] = id || null;
            refreshSlot(tab);
            return true;
        },
        clearPreview() { for (const t of TABS) if (Object.prototype.hasOwnProperty.call(preview, t)) { delete preview[t]; refreshSlot(t); } },
        thumb, thumbSync, thumbNode,
        open, close, isOpen() { return !!ui; },

        // --- Модуль Game ---
        async init(app) {
            GameUI.addCss('cosmetics', CW_CSS);
            GameUI.addSideButton({ id: 'wardrobe', side: 'right', icon: 'crown', label: Lang.t('cw.btn'), color: 'blue', onClick: () => { api.open(); } });
            Game.events.on('paws', () => {
                if (!ui) return;
                updatePaws();
                if (ui.adBtn && ui.adBtn.busy) return;
                paintAllCards(); renderBar();
            });
            try {
                sanitize();
                const c = cs();
                for (const t of ['hat', 'face', 'back']) if (c.equipped[t]) await loadGlb(t);
            } catch (e) { console.warn('Cosmetics.init:', e); }
        },
        onLoad() {
            sanitize();
            for (const t of TABS) delete preview[t];
            if (ui) close();
            lastPv = null;
            refreshAll();
        },
        async ready() {
            try { await Promise.all(pending); } catch (e) { console.warn('Cosmetics.ready:', e); }
            pending = [];
            booting = false;
            GameUI.showSideButton('wardrobe', !tutorialActive());
        },
        update(dt) {
            time += dt;
            if (!live()) return;
            const pv = Player.petView;
            if (pv !== lastPv) { lastPv = pv; if (pv) { applySaddle(); applyTrail(); } }
            sweep = !!ui && ui.tab === 'trail';
            updateLift(dt);
            animWorn(dt);
            updateTrail(dt, sweep);
            if (ui) updateStage(dt);
            hudTimer -= dt;
            if (hudTimer <= 0) { hudTimer = 0.4; GameUI.showSideButton('wardrobe', !tutorialActive()); }
        },
    };
    return api;
})();

Game.register(Cosmetics);
