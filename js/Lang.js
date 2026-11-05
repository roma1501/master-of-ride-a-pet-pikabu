// Lang.js — тексты интерфейса игры (I18N). Все видимые строки — ключами в
// LANG_STRINGS, в коде — Lang.t('ключ', { имя: значение }) с подстановкой {имя},
// в разметке — атрибуты data-t="ключ" (текст), data-t-title, data-t-placeholder
// (Lang.apply() проставляет их после init и смены языка).
//
// Язык — GAME_LANG (Constants.js): сборка ставит ru для Яндекса и en для Playables.
// Видимого переключателя языка нет. LANG_AUTO = 1 — язык платформы (Platform.lang),
// если он есть в словаре. Нет строки в языке — английская, нет и её — сам ключ.
// Новая строка = ключ в ОБОИХ словарях.

const LANG_STRINGS = {
    ru: {
        'loading': 'Загрузка…',
        'loadingScene': 'Готовим первый кадр…',
        'loadingReady': 'Готово',
        'loadingFailed': 'Не удалось загрузить. Попробуйте ещё раз.',
        'loadingRetry': 'Повторить',
        'no3d': 'Графика недоступна: браузер не поддерживает трёхмерную графику',
    },
    en: {
        'loading': 'Loading…',
        'loadingScene': 'Preparing the first frame…',
        'loadingReady': 'Ready',
        'loadingFailed': 'Loading failed. Please try again.',
        'loadingRetry': 'Retry',
        'no3d': '3D is unavailable: no WebGL in this browser',
    },
};

/** @satisfies {Record<string, any>} */
const Lang = {
    // Язык сборки известен сразу (Constants.js грузится первым): экран загрузки и тексты до Lang.init — уже на нём,
    // а не на русском по умолчанию. Lang.init потом уточняет язык по платформе (LANG_AUTO = 1 — Playgama).
    code: (typeof GAME_LANG !== 'undefined' && LANG_STRINGS[GAME_LANG]) ? GAME_LANG : 'ru',

    // platformLang — язык платформы (Platform.lang) или null.
    init(platformLang) {
        const def = typeof GAME_LANG !== 'undefined' ? GAME_LANG : 'ru';
        const auto = typeof LANG_AUTO !== 'undefined' ? LANG_AUTO : 0;
        const p = String(platformLang || '').toLowerCase().split(/[-_]/)[0];
        this.code = auto > 0 && p && LANG_STRINGS[p] ? p : (LANG_STRINGS[def] ? def : 'en');
        document.documentElement.lang = this.code;
    },

    // Добавить строки модуля: Lang.add({ ru: { ключ: 'текст' }, en: { ключ: 'text' } }). Сливается в
    // LANG_STRINGS; повторный ключ перезаписывается. Новая строка = ключ в ОБОИХ языках.
    add(dict) {
        for (const code of Object.keys(dict || {})) {
            if (!LANG_STRINGS[code]) LANG_STRINGS[code] = {};
            Object.assign(LANG_STRINGS[code], dict[code]);
        }
    },

    has(key) {
        return !!((LANG_STRINGS[this.code] || {})[key] || LANG_STRINGS.en[key]);
    },

    t(key, params) {
        const s = (LANG_STRINGS[this.code] || {})[key] || LANG_STRINGS.en[key] || key;
        return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;
    },

    // Разметка: data-t, data-t-title, data-t-placeholder внутри root.
    apply(root) {
        const r = root || document;
        for (const el of /** @type {NodeListOf<HTMLElement>} */ (r.querySelectorAll('[data-t]'))) el.textContent = this.t(el.dataset.t);
        for (const el of /** @type {NodeListOf<HTMLElement>} */ (r.querySelectorAll('[data-t-title]'))) el.title = this.t(el.dataset.tTitle);
        for (const el of /** @type {NodeListOf<HTMLInputElement>} */ (r.querySelectorAll('[data-t-placeholder]'))) el.placeholder = this.t(el.dataset.tPlaceholder);
    },
};

// --- Master of Riding a Pet: общие строки ядра (названия данных, HUD, кнопки). Строки модулей — Lang.add в их файлах. ---
Lang.add({
    ru: {
        'hud.objective': 'Вылупи редкое яйцо — получи питомца быстрее',
        'hud.eggs': 'Яйца', 'hud.pets': 'Питомцы', 'hud.boost': 'Буст +{n}%', 'hud.boostLuck': 'Удача ×2 {t}',
        'hud.ride': 'Сесть на питомца', 'hud.dismount': 'Слезть',
        'hud.wave': 'через {t}', 'hud.dayTimer': 'через {t}',
        'hud.jump': 'Прыжок', 'hud.down': 'Вниз',
        'pause.title': 'Пауза', 'pause.resume': 'Продолжить',
        'ui.close': 'Закрыть', 'ui.ok': 'Хорошо', 'ui.cancel': 'Отмена',
        'ui.loadFail': 'Не удалось загрузить сохранение. Прогресс не будет записан.',
        'ad.watch': 'За рекламу', 'ad.unavailable': 'Реклама сейчас недоступна', 'ad.fail': 'Награда не получена',
        'boost.title': 'Бусты', 'boost.cash': '×2 деньги', 'boost.cash.desc': 'Питомцы приносят в два раза больше денег',
        'boost.luck': '×2 удача', 'boost.luck.desc': 'Шанс редких питомцев при вылуплении выше в два раза',
        'boost.get': '+{n} мин', 'boost.on': 'Буст «{name}» включён!', 'boost.left': 'Осталось {t}',
        'key.space': 'Пробел', 'key.shift': 'Шифт', 'key.esc': 'Выход', 'key.enter': 'Ввод',
        'time.s': '{n}с', 'time.m': '{n}м', 'time.h': '{n}ч', 'time.d': '{n}д',
        'unit.kg': '{n} кг',
        'offline.toast': 'Пока вас не было, питомцы заработали ${n}',
        'pet.aged': '{name} подрос! Возраст {age}',
        'rarity.common': 'Обычный', 'rarity.uncommon': 'Необычный', 'rarity.rare': 'Редкий', 'rarity.epic': 'Эпический',
        'rarity.legendary': 'Легендарный', 'rarity.mythic': 'Мифический', 'rarity.secret': 'Секретный',
        'tier.common': 'Обычное', 'tier.rare': 'Редкое', 'tier.epic': 'Эпическое', 'tier.legendary': 'Легендарное',
        'tier.mythic': 'Мифическое', 'tier.divine': 'Божественное', 'tier.ethereal': 'Эфирное',
        'pet.snail': 'Улитка', 'pet.turtle': 'Черепаха', 'pet.sloth': 'Ленивец', 'pet.axolotl': 'Аксолотль', 'pet.koala': 'Коала',
        'pet.capybara': 'Капибара', 'pet.chicken': 'Курица', 'pet.pig': 'Свинка', 'pet.elephant': 'Слон', 'pet.panda': 'Панда',
        'pet.kangaroo': 'Кенгуру', 'pet.deer': 'Олень', 'pet.spider': 'Паук', 'pet.crocodile': 'Крокодил', 'pet.gorilla': 'Горилла',
        'pet.snake': 'Змея', 'pet.horse': 'Лошадь', 'pet.wolf': 'Волк', 'pet.shark': 'Акула', 'pet.lion': 'Лев',
        'pet.ostrich': 'Страус', 'pet.fox': 'Лиса', 'pet.giraffe': 'Жираф', 'pet.cheetah': 'Гепард', 'pet.unicorn': 'Единорог',
        'pet.trex': 'Тираннозавр', 'pet.phoenix': 'Феникс', 'pet.cerberus': 'Цербер', 'pet.kitsune': 'Кицунэ', 'pet.dragon': 'Дракон',
        'egg.white': 'Белое яйцо', 'egg.brown': 'Коричневое яйцо', 'egg.cracked': 'Треснувшее яйцо', 'egg.easter': 'Пасхальное яйцо',
        'egg.stone': 'Каменное яйцо', 'egg.leaf': 'Лиственное яйцо', 'egg.mushroom': 'Грибное яйцо', 'egg.flower': 'Цветочное яйцо',
        'egg.slime': 'Слизневое яйцо', 'egg.ice': 'Ледяное яйцо', 'egg.glass': 'Стеклянное яйцо', 'egg.golden': 'Золотое яйцо',
        'egg.diamond': 'Алмазное яйцо', 'egg.crystal': 'Кристальное яйцо', 'egg.skull': 'Яйцо-череп', 'egg.asteroid': 'Яйцо-астероид',
        'egg.flaming': 'Пылающее яйцо', 'egg.soul': 'Яйцо души', 'egg.aurora': 'Яйцо сияния', 'egg.galaxy': 'Галактическое яйцо',
        'egg.blackhole': 'Яйцо «Чёрная дыра»', 'egg.solaris': 'Солнечное яйцо', 'egg.volcanic': 'Вулканическое яйцо',
        'mut.shocked': 'Наэлектризован', 'mut.volted': 'Вольтовый', 'mut.rage': 'Ярость', 'mut.void': 'Пустота', 'mut.eternal': 'Вечность',
        'food.grass': 'Трава', 'food.carrot': 'Морковь', 'food.bone': 'Кость', 'food.meat': 'Мясо', 'food.apple': 'Волшебное яблоко',
        'food.dragonfruit': 'Драконий фрукт',
        'radar.advanced': 'Продвинутый радар', 'radar.jewel': 'Самоцветный радар', 'radar.royal': 'Королевский радар',
        'radar.magic': 'Магический радар', 'radar.angelic': 'Ангельский радар', 'radar.eternal': 'Вечный радар', 'radar.celestial': 'Небесный радар',
        'weather.thunder': 'Гроза', 'weather.bloodmoon': 'Кровавая луна', 'weather.voidstorm': 'Буря пустоты', 'weather.aurora': 'Северное сияние',
        'upg.luck': 'Удача', 'upg.nests': 'Гнёзда', 'upg.slots': 'Слоты питомцев',
    },
    en: {
        'hud.objective': 'Hatch a rare egg to get a faster pet',
        'hud.eggs': 'Eggs', 'hud.pets': 'Pets', 'hud.boost': 'Boost +{n}%', 'hud.boostLuck': 'Luck ×2 {t}',
        'hud.ride': 'Ride Pet', 'hud.dismount': 'Dismount',
        'hud.wave': 'in {t}', 'hud.dayTimer': 'in {t}',
        'hud.jump': 'Jump', 'hud.down': 'Down',
        'pause.title': 'Paused', 'pause.resume': 'Resume',
        'ui.close': 'Close', 'ui.ok': 'OK', 'ui.cancel': 'Cancel',
        'ui.loadFail': 'Could not load your save. Progress will not be written.',
        'ad.watch': 'Watch ad', 'ad.unavailable': 'Ads are not available right now', 'ad.fail': 'No reward received',
        'boost.title': 'Boosts', 'boost.cash': '×2 Cash', 'boost.cash.desc': 'Your pets earn twice as much money',
        'boost.luck': '×2 Luck', 'boost.luck.desc': 'Twice the chance of rare pets when hatching',
        'boost.get': '+{n} min', 'boost.on': '{name} boost is on!', 'boost.left': '{t} left',
        'key.space': 'Space', 'key.shift': 'Shift', 'key.esc': 'Esc', 'key.enter': 'Enter',
        'time.s': '{n}s', 'time.m': '{n}m', 'time.h': '{n}h', 'time.d': '{n}d',
        'unit.kg': '{n} kg',
        'offline.toast': 'While you were away, your pets earned ${n}',
        'pet.aged': '{name} grew up! Age {age}',
        'rarity.common': 'Common', 'rarity.uncommon': 'Uncommon', 'rarity.rare': 'Rare', 'rarity.epic': 'Epic',
        'rarity.legendary': 'Legendary', 'rarity.mythic': 'Mythic', 'rarity.secret': 'Secret',
        'tier.common': 'Common', 'tier.rare': 'Rare', 'tier.epic': 'Epic', 'tier.legendary': 'Legendary',
        'tier.mythic': 'Mythic', 'tier.divine': 'Divine', 'tier.ethereal': 'Ethereal',
        'pet.snail': 'Snail', 'pet.turtle': 'Turtle', 'pet.sloth': 'Sloth', 'pet.axolotl': 'Axolotl', 'pet.koala': 'Koala',
        'pet.capybara': 'Capybara', 'pet.chicken': 'Chicken', 'pet.pig': 'Pig', 'pet.elephant': 'Elephant', 'pet.panda': 'Panda',
        'pet.kangaroo': 'Kangaroo', 'pet.deer': 'Deer', 'pet.spider': 'Spider', 'pet.crocodile': 'Crocodile', 'pet.gorilla': 'Gorilla',
        'pet.snake': 'Snake', 'pet.horse': 'Horse', 'pet.wolf': 'Wolf', 'pet.shark': 'Shark', 'pet.lion': 'Lion',
        'pet.ostrich': 'Ostrich', 'pet.fox': 'Fox', 'pet.giraffe': 'Giraffe', 'pet.cheetah': 'Cheetah', 'pet.unicorn': 'Unicorn',
        'pet.trex': 'T-Rex', 'pet.phoenix': 'Phoenix', 'pet.cerberus': 'Cerberus', 'pet.kitsune': 'Kitsune', 'pet.dragon': 'Dragon',
        'egg.white': 'White Egg', 'egg.brown': 'Brown Egg', 'egg.cracked': 'Cracked Egg', 'egg.easter': 'Easter Egg',
        'egg.stone': 'Stone Egg', 'egg.leaf': 'Leaf Egg', 'egg.mushroom': 'Mushroom Egg', 'egg.flower': 'Flower Egg',
        'egg.slime': 'Slime Egg', 'egg.ice': 'Ice Egg', 'egg.glass': 'Glass Egg', 'egg.golden': 'Golden Egg',
        'egg.diamond': 'Diamond Egg', 'egg.crystal': 'Crystal Egg', 'egg.skull': 'Skull Egg', 'egg.asteroid': 'Asteroid Egg',
        'egg.flaming': 'Flaming Egg', 'egg.soul': 'Soul Egg', 'egg.aurora': 'Aurora Egg', 'egg.galaxy': 'Galaxy Egg',
        'egg.blackhole': 'Black Hole Egg', 'egg.solaris': 'Solaris Egg', 'egg.volcanic': 'Volcanic Egg',
        'mut.shocked': 'Shocked', 'mut.volted': 'Volted', 'mut.rage': 'Rage', 'mut.void': 'Void', 'mut.eternal': 'Eternal',
        'food.grass': 'Grass', 'food.carrot': 'Carrot', 'food.bone': 'Bone', 'food.meat': 'Meat', 'food.apple': 'Magic Apple',
        'food.dragonfruit': 'Dragon Fruit',
        'radar.advanced': 'Advanced Radar', 'radar.jewel': 'Jewel Radar', 'radar.royal': 'Royal Radar',
        'radar.magic': 'Magic Radar', 'radar.angelic': 'Angelic Radar', 'radar.eternal': 'Eternal Radar', 'radar.celestial': 'Celestial Radar',
        'weather.thunder': 'Thunderstorm', 'weather.bloodmoon': 'Blood Moon', 'weather.voidstorm': 'Void Storm', 'weather.aurora': 'Aurora',
        'upg.luck': 'Luck', 'upg.nests': 'Nests', 'upg.slots': 'Pet slots',
    },
});
