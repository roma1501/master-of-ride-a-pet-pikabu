// GameData.js — данные и формулы игры «Master of Riding a Pet» (docs/DESIGN.md §3). Никакого DOM и 3D:
// чистая логика, её гоняют тесты (tests/game-core.test.mjs). Названия — ключами Lang (rarity.*, tier.*,
// pet.*, egg.*, mut.*, food.*, radar.*, weather.*, upg.*), в коде — GameData.petName(id) и т. п.
//
// Всё в одном неймспейсе GameData:
//   RARITY, RARITY_ORDER            редкости питомцев (common … secret): { id, rank, color }
//   PETS / PET_LIST / PET_BY_ID     30 питомцев: { id, chance, speed, income, gait, ability, baseKg, rarity }
//   TIERS                           тиры яиц (common, rare, epic, legendary, mythic, divine, ethereal)
//   EGGS / EGG_LIST / EGG_BY_ID     23 яйца: { id, luck, tier, hatch, break, zones, weight, night, kg }
//   UPGRADES, BASKET, FOODS, RADARS, MUTATIONS, WEATHER, REBIRTHS, PAWS_REWARDS
//   формулы: need, ageMult, moveSpeed, petSpeed, petIncome, petKg, sellValue, rarityOfChance,
//            roll (бросок питомца, rng подставляется), rollWeight, eggGrowth, rebirthMult, luckLevelMult,
//            upgradeCost, upgradeLevel, nextUpgradeCost, offlineEarnings, hatchResult (питомец + вес), nestState (яйцо в гнезде),
//            pickEggType (волна яиц)
// Числа баланса — стартовые (DESIGN §3); имена и поля менять только согласованно.
// Константы Constants.js (SPEED_*, SELL_SECONDS, OFFLINE_*) читаются через typeof с дефолтом.

/** @typedef {{ id: string, rank: number, color: string, rainbow?: boolean }} RarityDef */
/** @typedef {{ id: string, chance: number, speed: number, income: number, gait: string, ability: string | null, baseKg: number, rarity: string, icon: string }} PetDef */
/** @typedef {{ id: string, luck: number, tier: string, hatch: number, break: number, zones: string[], weight: number, night: boolean, kg: number }} EggDef */
/** @typedef {{ uid?: string, species: string, w?: number, kg0?: number, age?: number, exp?: number, mutation?: string | null }} PetRecord */

/** @satisfies {Record<string, any>} */
const GameData = (() => {
    // --- Редкости питомцев ---------------------------------------------------------------
    /** @type {Record<string, RarityDef>} */
    const RARITY = {
        common: { id: 'common', rank: 0, color: '#c8d0d8' },
        uncommon: { id: 'uncommon', rank: 1, color: '#6fe07a' },
        rare: { id: 'rare', rank: 2, color: '#4aa8ff' },
        epic: { id: 'epic', rank: 3, color: '#b46cff' },
        legendary: { id: 'legendary', rank: 4, color: '#ffc53a' },
        mythic: { id: 'mythic', rank: 5, color: '#ff4f7a' },
        secret: { id: 'secret', rank: 6, color: '#ffffff', rainbow: true },
    };
    const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'secret'];
    // Верхние границы «1 из N» (строго меньше): <50 common, <1K uncommon, <100K rare, <10M epic, <10B legendary, <1e15 mythic.
    const RARITY_LIMITS = [50, 1e3, 1e5, 1e7, 1e10, 1e15];

    /** Редкость питомца по шансу «1 из N». */
    function rarityOfChance(chance) {
        const n = Number(chance) || 1;
        for (let i = 0; i < RARITY_LIMITS.length; i++) if (n < RARITY_LIMITS[i]) return RARITY_ORDER[i];
        return 'secret';
    }

    // --- Питомцы (30) -------------------------------------------------------------------
    // [id, chance, speed, income, gait, ability, baseKg]
    /** @type {[string, number, number, number, string, string | null, number][]} */
    const PET_ROWS = [
        ['snail', 2, 15, 3, 'slide', null, 0.3],
        ['turtle', 5, 50, 5, 'quad', 'swim', 12],
        ['sloth', 20, 90, 7, 'quad', null, 5],
        ['axolotl', 30, 165, 9, 'quad', 'swim', 0.3],
        ['koala', 50, 300, 12, 'quad', null, 9],
        ['capybara', 100, 407, 20, 'quad', 'swim', 50],
        ['chicken', 150, 553, 25, 'biped', 'glide', 3],
        ['pig', 200, 750, 30, 'quad', null, 120],
        ['elephant', 300, 1020, 35, 'quad', 'swim', 4000],
        ['panda', 1e3, 1380, 50, 'quad', null, 110],
        ['kangaroo', 3e3, 3050, 120, 'hop', 'jump', 60],
        ['deer', 9e3, 3250, 150, 'quad', 'jump', 90],
        ['spider', 2.5e4, 3690, 160, 'spider', 'jump', 0.5],
        ['crocodile', 7.5e4, 3940, 170, 'quad', 'swim', 400],
        ['gorilla', 1.5e5, 4480, 200, 'quad', 'jump', 180],
        ['snake', 1.8e5, 4780, 240, 'slither', 'swim', 25],
        ['horse', 5e5, 5340, 350, 'quad', 'jump', 500],
        ['wolf', 7e5, 5710, 375, 'quad', null, 40],
        ['shark', 1e6, 6100, 400, 'swim', 'swim', 300],
        ['lion', 1.2e6, 6520, 510, 'quad', null, 190],
        ['ostrich', 1.5e6, 6960, 750, 'biped', 'glide', 110],
        ['fox', 2.1e7, 19500, 1200, 'quad', 'jump', 7],
        ['giraffe', 3e8, 27400, 2200, 'quad', null, 1200],
        ['cheetah', 7e9, 38400, 3500, 'quad', null, 55],
        ['unicorn', 1e12, 137000, 30000, 'quad', 'glide', 600],
        ['trex', 1e13, 266000, 50000, 'biped', 'jump', 6000],
        ['phoenix', 3e13, 1e6, 1e5, 'fly', 'fly', 15],
        ['cerberus', 7e16, 1e8, 3e7, 'quad', 'jump', 700],
        ['kitsune', 1e18, 1e9, 9e7, 'quad', 'glide', 25],
        ['dragon', 5e18, 3e8, 3e8, 'fly', 'fly', 3000],
    ];
    /** @type {PetDef[]} */
    const PET_LIST = PET_ROWS.map(r => ({
        id: r[0], chance: r[1], speed: r[2], income: r[3], gait: r[4], ability: r[5], baseKg: r[6],
        rarity: rarityOfChance(r[1]), icon: r[0],
    }));
    /** @type {Record<string, PetDef>} */
    const PETS = {};
    for (const p of PET_LIST) PETS[p.id] = p;
    // Для броска: от самого редкого к частому.
    const PETS_RARE_FIRST = PET_LIST.slice().sort((a, b) => b.chance - a.chance);

    // --- Тиры и яйца (23) ---------------------------------------------------------------
    const TIERS = {
        common: { id: 'common', rank: 0, color: '#c8d0d8' },
        rare: { id: 'rare', rank: 1, color: '#4aa8ff' },
        epic: { id: 'epic', rank: 2, color: '#b46cff' },
        legendary: { id: 'legendary', rank: 3, color: '#ffc53a' },
        mythic: { id: 'mythic', rank: 4, color: '#ff4f7a' },
        divine: { id: 'divine', rank: 5, color: '#5ff0ff' },
        ethereal: { id: 'ethereal', rank: 6, color: '#fff1a8', glow: true },
    };
    const TIER_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic', 'divine', 'ethereal'];
    // [id, luck, tier, hatch, break, zones, weight, night, kg]; break — секунд до разбивания в корзине
    // (по просьбе пользователя 10.10.2026: чем ценнее яйцо, тем меньше времени довезти — обычные 13 с … эфирные 5.8 с;
    // за редкими яйцами нужен быстрый питомец; супер-награда даёт +75%)
    /** @type {[string, number, string, number, number, string[], number, boolean, number][]} */
    const EGG_ROWS = [
        ['white', 1, 'common', 5, 13, ['meadow', 'flower'], 100, false, 0.5],
        ['brown', 5, 'common', 8, 13, ['meadow', 'forest'], 70, false, 0.6],
        ['cracked', 30, 'rare', 15, 11.5, ['forest', 'rock'], 30, false, 0.8],
        ['easter', 50, 'rare', 20, 11.5, ['flower'], 25, false, 0.7],
        ['stone', 100, 'rare', 25, 11.5, ['rock'], 18, false, 1.4],
        ['leaf', 200, 'rare', 30, 11.5, ['forest'], 14, false, 0.9],
        ['mushroom', 500, 'epic', 40, 10, ['mushroom'], 9, false, 1.0],
        ['flower', 750, 'epic', 45, 10, ['flower'], 8, false, 0.9],
        ['slime', 1e3, 'epic', 50, 10, ['swamp'], 7, false, 1.2],
        ['ice', 3e3, 'epic', 60, 10, ['snow'], 5, false, 1.4],
        ['glass', 1e4, 'legendary', 75, 8.5, ['waterfall'], 3.5, false, 1.1],
        ['golden', 3e4, 'legendary', 90, 8.5, ['desert', 'pyramid'], 2.5, false, 1.6],
        ['diamond', 9e4, 'mythic', 105, 7.5, ['cave'], 1.5, false, 1.5],
        ['crystal', 1.5e5, 'mythic', 120, 7.5, ['peak', 'cave'], 1.2, false, 1.5],
        ['skull', 2.5e5, 'mythic', 135, 7.5, ['pyramid', 'desert'], 1, false, 1.8],
        ['asteroid', 5e5, 'mythic', 150, 7.5, ['crater'], 0.7, false, 2.4],
        ['flaming', 1e6, 'mythic', 165, 7.5, ['volcano'], 0.5, false, 2.0],
        ['soul', 7e6, 'mythic', 180, 7.5, ['secret'], 0.35, true, 1.2],
        ['aurora', 3e8, 'divine', 210, 6.5, ['peak'], 0.18, true, 1.6],
        ['galaxy', 1.5e9, 'divine', 240, 6.5, ['tree'], 0.12, false, 2.2],
        ['blackhole', 1e11, 'ethereal', 270, 5.8, ['cave'], 0.05, false, 3.0],
        ['solaris', 3e11, 'ethereal', 300, 5.8, ['cave'], 0.035, false, 3.0],
        ['volcanic', 2.5e12, 'ethereal', 330, 5.8, ['volcano'], 0.025, false, 3.4],
    ];
    /** @type {EggDef[]} */
    const EGG_LIST = EGG_ROWS.map(r => ({
        id: r[0], luck: r[1], tier: r[2], hatch: r[3], break: r[4], zones: r[5], weight: r[6], night: r[7], kg: r[8],
    }));
    /** @type {Record<string, EggDef>} */
    const EGGS = {};
    for (const e of EGG_LIST) EGGS[e.id] = e;

    // --- Улучшения ранчо, корзина --------------------------------------------------------
    const UPGRADES = {
        // удача вылупления ×(1+n); цена уровня n (n от 0): 25 · 1.6^n
        luck: { id: 'luck', start: 0, max: 60, cost: (n) => 25 * Math.pow(1.6, n) },
        // гнёзда: 1 в начале, макс 6
        nests: { id: 'nests', start: 1, max: 6, costs: [500, 25e3, 2e6, 200e6, 20e9] },
        // слоты питомцев на ранчо: 3 в начале; покупкой до 8, +1 за каждое перерождение
        slots: { id: 'slots', start: 3, max: 8, costs: [1e3, 50e3, 5e6, 500e6, 50e9] },
    };
    // Корзина: вместимость 1 в начале; цены следующих ёмкостей (2, 3, 4, 5, 6).
    const BASKET = { start: 1, max: 6, prices: [150, 10e3, 1e6, 100e6, 10e9] };

    // --- Еда, радары ----------------------------------------------------------------------
    const FOODS = [
        { id: 'grass', price: 10, exp: 100, icon: 'food-grass' },
        { id: 'carrot', price: 200, exp: 1500, icon: 'food-carrot' },
        { id: 'bone', price: 3e3, exp: 2e4, icon: 'food-bone' },
        { id: 'meat', price: 6e4, exp: 3e5, icon: 'food-meat' },
        { id: 'apple', price: 1.5e6, exp: 6e6, icon: 'food-apple' },
        { id: 'dragonfruit', price: 5e7, exp: 1.5e8, icon: 'food-dragonfruit' },
    ];
    // Радар указывает ближайшее живое яйцо своего тира. minLuck/maxLuck — границы удачи яйца (mythic делится на два).
    const RADARS = [
        { id: 'advanced', price: 50, tiers: ['common', 'rare'], stock: 6 },
        { id: 'jewel', price: 2500, tiers: ['epic'], stock: 4 },
        { id: 'royal', price: 20000, tiers: ['legendary'], stock: 3 },
        { id: 'magic', price: 3e5, tiers: ['mythic'], maxLuck: 1e6, stock: 3 },
        { id: 'angelic', price: 2.5e7, tiers: ['mythic'], minLuck: 1e6, stock: 2 },
        { id: 'eternal', price: 2e9, tiers: ['divine'], stock: 2 },
        { id: 'celestial', price: 2e11, tiers: ['ethereal'], stock: 1 },
    ];
    const RADAR_RESTOCK_SECONDS = 180;
    const RADAR_REFRESH_BASE = 3000;   // досрочное обновление: $3K · (1 + перерождения)

    // --- Мутации и погода -------------------------------------------------------------------
    const MUTATIONS = {
        shocked: { id: 'shocked', rank: 1, cash: 1.5, speed: 2, color: '#ffe14a', event: 'thunder' },
        volted: { id: 'volted', rank: 2, cash: 2.5, speed: 1.5, color: '#4fd0ff', event: 'thunder' },
        rage: { id: 'rage', rank: 3, cash: 4, speed: 1.25, color: '#ff3b3b', event: 'bloodmoon' },
        void: { id: 'void', rank: 4, cash: 8, speed: 2, color: '#a24dff', event: 'voidstorm' },
        eternal: { id: 'eternal', rank: 5, cash: 15, speed: 3, color: '#7dffd9', event: 'aurora' },
    };
    // Событие раз в 4–7 мин на 60–90 с, молния каждые 4–8 с. night: true — только ночью.
    const WEATHER = {
        thunder: { id: 'thunder', night: null, weight: 6, mutations: [['shocked', 85], ['volted', 15]] },
        bloodmoon: { id: 'bloodmoon', night: true, weight: 2, mutations: [['rage', 100]] },
        voidstorm: { id: 'voidstorm', night: null, weight: 1, mutations: [['void', 100]] },
        aurora: { id: 'aurora', night: true, weight: 1, mutations: [['eternal', 100]] },
    };
    const WEATHER_RULES = { gapMin: 240, gapMax: 420, durMin: 60, durMax: 90, strikeMin: 4, strikeMax: 8 };

    // --- Перерождения -----------------------------------------------------------------------
    const REBIRTHS = [
        { n: 1, cash: 1e6, pet: 'horse', mult: 2 },
        { n: 2, cash: 1e8, pet: 'fox', mult: 3 },
        { n: 3, cash: 1e10, pet: 'unicorn', mult: 4 },
        { n: 4, cash: 1e12, pet: 'phoenix', mult: 5 },
        { n: 5, cash: 1e14, pet: 'kitsune', mult: 6 },
        { n: 6, cash: 1e16, pet: 'kitsune', mult: 7 },
        { n: 7, cash: 1e18, pet: 'dragon', mult: 8 },
    ];

    // --- Лапки (🐾) --------------------------------------------------------------------------
    const PAWS_REWARDS = { common: 2, uncommon: 4, rare: 8, epic: 15, legendary: 30, mythic: 60, secret: 120, broken: 1 };

    // --- Формулы ----------------------------------------------------------------------------
    const U = 'undefined';
    const cfg = () => ({
        base: typeof SPEED_BASE_PX !== U ? SPEED_BASE_PX : 520,
        log: typeof SPEED_LOG_PX !== U ? SPEED_LOG_PX : 230,
        max: typeof SPEED_MAX_PX !== U ? SPEED_MAX_PX : 2600,
        sell: typeof SELL_SECONDS !== U ? SELL_SECONDS : 120,
        offMax: typeof OFFLINE_MAX_SECONDS !== U ? OFFLINE_MAX_SECONDS : 7200,
        offRate: typeof OFFLINE_RATE !== U ? OFFLINE_RATE : 0.5,
    });

    /** Опыт до следующего возраста: 150 + 200·a. */
    const need = (age) => 150 + 200 * Math.max(1, age);
    /** Множитель статов по возрасту: 1 + 0.02·(a − 1). */
    const ageMult = (age) => 1 + 0.02 * (Math.max(1, age) - 1);
    /** Реальная скорость px/с по показанной скорости S (⚡): clamp(520 + 230·log10(S), 520, 2600). */
    function moveSpeed(shown) {
        const c = cfg();
        const s = Math.max(1, Number(shown) || 1);
        return Math.min(c.max, Math.max(c.base, c.base + c.log * Math.log10(s)));
    }
    const mutationOf = (m) => (m && MUTATIONS[m]) || null;
    /** Показанная скорость (⚡) питомца: speed · ageMult · mutation.speed. */
    function petSpeed(pet) {
        const d = PETS[pet.species];
        if (!d) return 1;
        const mu = mutationOf(pet.mutation);
        return d.speed * ageMult(pet.age || 1) * (mu ? mu.speed : 1);
    }
    /** ОГРОМНЫЙ питомец (Гигантское яйцо магазина за рекламу, pet.huge): множители дохода, веса и вес-фактор (Constants.js). */
    const hugeCfg = () => ({
        income: typeof HUGE_PET_INCOME_MULT !== U ? HUGE_PET_INCOME_MULT : 3,
        kg: typeof HUGE_PET_KG_MULT !== U ? HUGE_PET_KG_MULT : 2,
        w: typeof HUGE_PET_WEIGHT !== U ? HUGE_PET_WEIGHT : 1.9,
    });
    /** Доход $/с: income · ageMult · w · mutation.cash · (huge ? ×HUGE_PET_INCOME_MULT) · rebirthMult · boosts. */
    function petIncome(pet, rebirthMultValue = 1, boosts = 1) {
        const d = PETS[pet.species];
        if (!d) return 0;
        const mu = mutationOf(pet.mutation);
        const w = pet.w > 0 ? pet.w : 1;
        return d.income * ageMult(pet.age || 1) * w * (mu ? mu.cash : 1) * (pet.huge ? hugeCfg().income : 1) * rebirthMultValue * boosts;
    }
    /** Вес, кг: kg0 · (1 + 0.03·(a − 1)) · (huge ? ×HUGE_PET_KG_MULT); kg0 = baseKg · w. */
    function petKg(pet) {
        const d = PETS[pet.species];
        const kg0 = pet.kg0 > 0 ? pet.kg0 : (d ? d.baseKg * (pet.w > 0 ? pet.w : 1) : 1);
        return kg0 * (1 + 0.03 * (Math.max(1, pet.age || 1) - 1)) * (pet.huge ? hugeCfg().kg : 1);
    }
    /** Цена продажи: доход/с (без перерождений и бустов) · SELL_SECONDS. */
    function sellValue(pet, rebirthMultValue = 1) {
        return Math.floor(petIncome(pet, rebirthMultValue, 1) * cfg().sell);
    }
    /** Множитель денег после n перерождений (×2, ×3, … — не накопительный). */
    const rebirthMult = (n) => (n > 0 ? REBIRTHS[Math.min(n, REBIRTHS.length) - 1].mult : 1);
    /** Множитель удачи вылупления по уровню удачи ранчо: 1 + n. */
    const luckLevelMult = (level) => 1 + Math.max(0, level | 0);
    /** Цена следующего уровня улучшения id при уровне/количестве n (n от 0); null — максимум. */
    function upgradeCost(id, n) {
        const u = UPGRADES[id];
        if (!u) return null;
        if (id === 'luck') return n >= u.max ? null : u.cost(n);
        return n >= u.costs.length ? null : u.costs[n];
    }
    /** Офлайн-доход: за не больше OFFLINE_MAX_SECONDS, доля OFFLINE_RATE; меньше минуты — ничего. */
    function offlineEarnings(incomePerSec, secondsAway) {
        const c = cfg();
        if (!(secondsAway >= 60) || !(incomePerSec > 0)) return 0;
        return Math.floor(incomePerSec * Math.min(secondsAway, c.offMax) * c.offRate);
    }
    /**
     * Рост веса яйца после готовности: ×1 → ×3 (за 600 с готовности).
     * @param {number} secondsReady
     */
    const eggGrowth = (secondsReady) => Math.min(3, 1 + Math.max(0, secondsReady) / 300);
    /**
     * Вес-фактор питомца при вылуплении: случайность 0.85…1.15 и рост яйца, итог 0.85…1.45.
     * @param {number} growth множитель роста яйца (1…3)
     * @param {() => number} rng
     */
    function rollWeight(growth = 1, rng = Math.random) {
        const r = 0.85 + 0.3 * ((rng() + rng()) / 2);
        const g = 1 + (Math.max(1, growth) - 1) * 0.2;
        return Math.max(0.85, Math.min(1.45, Math.round(r * g * 100) / 100));
    }
    /**
     * Бросок питомца. L = luck яйца · luckMult; от самого редкого к частому: rng() < L / chance → этот питомец,
     * иначе улитка (самая частая).
     * @param {string | EggDef} egg
     * @param {{ luckMult?: number, rng?: () => number }} [opts]
     * @returns {string} id питомца
     */
    function roll(egg, opts = {}) {
        const def = typeof egg === 'string' ? EGGS[egg] : egg;
        const rng = opts.rng || Math.random;
        const L = (def ? def.luck : 1) * (opts.luckMult > 0 ? opts.luckMult : 1);
        for (const p of PETS_RARE_FIRST) {
            if (p.id === 'snail') break;
            if (rng() < L / p.chance) return p.id;
        }
        return 'snail';
    }
    /**
     * Итог вылупления: вид питомца (бросок с удачей яйца × удача ранчо и бусты) и вес-фактор (случайность и рост яйца).
     * @param {string | EggDef} egg
     * @param {{ luckMult?: number, growth?: number, rng?: () => number }} [opts]
     * @returns {{ species: string, w: number }}
     */
    function hatchResult(egg, opts = {}) {
        const rng = opts.rng || Math.random;
        const species = roll(egg, { luckMult: opts.luckMult, rng });
        return { species, w: rollWeight(opts.growth || 1, rng) };
    }
    /**
     * Состояние яйца в гнезде по секундам в гнезде t: готовность, остаток инкубации, рост веса после готовности (до ×3), вес яйца.
     * @param {{ type: string, kg?: number, t?: number }} e
     */
    function nestState(e) {
        const d = EGGS[e.type];
        if (!d) return { ready: false, left: 0, frac: 0, growth: 1, kg: Number(e.kg) || 1, secondsReady: 0 };
        const t = Math.max(0, Number(e.t) || 0);
        const ready = t >= d.hatch;
        const secondsReady = ready ? t - d.hatch : 0;
        const growth = ready ? eggGrowth(secondsReady) : 1;
        return { ready, left: Math.max(0, d.hatch - t), frac: Math.min(1, t / d.hatch), growth, kg: (e.kg > 0 ? e.kg : d.kg) * growth, secondsReady };
    }
    /** Сколько раз куплено улучшение id (luck — уровень, nests — сверх первого, slots — сверх базовых и бонуса перерождений). */
    function upgradeLevel(id, s) {
        if (id === 'luck') return Math.max(0, s.luckLevel | 0);
        if (id === 'nests') return Math.max(0, (s.nests | 0) - UPGRADES.nests.start);
        if (id === 'slots') return Math.max(0, (s.slots | 0) - UPGRADES.slots.start - (s.rebirths | 0));
        return 0;
    }
    /** Цена следующей покупки улучшения id по сохранению; null — максимум. slots: всего слотов не больше UPGRADES.slots.max. */
    function nextUpgradeCost(id, s) {
        if (id === 'slots' && (s.slots | 0) >= UPGRADES.slots.max) return null;
        if (id === 'nests' && (s.nests | 0) >= UPGRADES.nests.max) return null;
        return upgradeCost(id, upgradeLevel(id, s));
    }
    /** Вероятность питомца id при броске (для окон «шанс»): с учётом перебора от редкого к частому. */
    function rollChance(eggType, petId, luckMult = 1) {
        const def = EGGS[eggType];
        const L = (def ? def.luck : 1) * luckMult;
        let none = 1;
        for (const p of PETS_RARE_FIRST) {
            const hit = p.id === 'snail' ? 1 : Math.min(1, L / p.chance);
            if (p.id === petId) return none * hit;
            none *= 1 - hit;
        }
        return 0;
    }
    /**
     * Какое яйцо появится в волне: по весам среди подходящих (ночные — только ночью).
     * @param {() => number} rng
     * @param {boolean} night
     * @param {string[]} [available] ограничение по id (иначе все)
     */
    function pickEggType(rng, night, available) {
        const list = EGG_LIST.filter(e => (night || !e.night) && (!available || available.includes(e.id)));
        let total = 0;
        for (const e of list) total += e.weight;
        let r = rng() * total;
        for (const e of list) { r -= e.weight; if (r <= 0) return e.id; }
        return list.length ? list[list.length - 1].id : 'white';
    }
    /** Подходит ли радар яйцу. */
    function radarMatches(radarId, eggType) {
        const r = RADARS.find(x => x.id === radarId), e = EGGS[eggType];
        if (!r || !e || !r.tiers.includes(e.tier)) return false;
        if (r.minLuck != null && e.luck < r.minLuck) return false;
        if (r.maxLuck != null && e.luck >= r.maxLuck) return false;
        return true;
    }
    /** Радар для яйца (какой нужен). */
    const radarFor = (eggType) => RADARS.find(r => radarMatches(r.id, eggType)) || null;
    /** Редкость питомца → лапки за вылупление. */
    const pawsFor = (petId) => PAWS_REWARDS[(PETS[petId] || PETS.snail).rarity] || 1;
    /** Редкое яйцо объявляется баннером: legendary и выше. */
    const eggAnnounced = (eggType) => { const e = EGGS[eggType]; return !!e && TIERS[e.tier].rank >= TIERS.legendary.rank; };

    // --- Магазин яиц за рекламу (Shops.js): Драконье и Гигантское яйцо, пакеты бросков за просмотры рекламы --------
    // bundles: rolls бросков за views просмотров (id награды egg-<яйцо>-<rolls>); odds — [питомец, вес] (в сумме 100 у Драконьего).
    const EGG_SHOP = {
        bundles: [{ rolls: 1, views: 1 }, { rolls: 3, views: 2 }, { rolls: 10, views: 5 }, { rolls: 50, views: 15 }],
        dragon: { id: 'dragon', huge: false, odds: [['crocodile', 50], ['fox', 30], ['trex', 15], ['phoenix', 4], ['dragon', 1]] },
        // ОГРОМНЫЙ питомец: случайный вид из пула ранних и средних питомцев (чем реже вид, тем меньше вес)
        giant: {
            id: 'giant', huge: true, odds: [['turtle', 14], ['sloth', 12], ['axolotl', 11], ['koala', 10], ['capybara', 9], ['chicken', 8],
                ['pig', 7], ['elephant', 6], ['panda', 5], ['kangaroo', 4], ['deer', 3.5], ['spider', 3], ['crocodile', 2.5], ['gorilla', 2],
                ['snake', 1.5], ['horse', 1], ['wolf', 0.8], ['shark', 0.6], ['lion', 0.5]],
        },
    };
    /** Шансы яйца магазина в процентах: [{ species, pct }] в порядке таблицы. */
    function shopOdds(kind) {
        const e = EGG_SHOP[kind];
        if (!e) return [];
        const total = e.odds.reduce((a, o) => a + o[1], 0);
        return e.odds.map(o => ({ species: o[0], pct: o[1] / total * 100 }));
    }
    /**
     * Бросок яйца магазина: вид по весам; ОГРОМНОЕ — вес-фактор HUGE_PET_WEIGHT и huge: true.
     * @param {string} kind dragon | giant
     * @param {() => number} [rng]
     * @returns {{ species: string, w: number, huge: boolean } | null}
     */
    function rollShopEgg(kind, rng = Math.random) {
        const e = EGG_SHOP[kind];
        if (!e) return null;
        const total = e.odds.reduce((a, o) => a + o[1], 0);
        let r = rng() * total, species = e.odds[e.odds.length - 1][0];
        for (const o of e.odds) { r -= o[1]; if (r <= 0) { species = o[0]; break; } }
        return { species, w: e.huge ? hugeCfg().w : rollWeight(1, rng), huge: !!e.huge };
    }

    // Имена — по ключам Lang (оба языка лежат в js/Lang.js).
    const tr = (key) => (typeof Lang !== U ? Lang.t(key) : key);

    return {
        RARITY, RARITY_ORDER, PETS, PET_LIST, PET_BY_ID: PETS, TIERS, TIER_ORDER, EGGS, EGG_LIST, EGG_BY_ID: EGGS,
        UPGRADES, BASKET, FOODS, RADARS, RADAR_RESTOCK_SECONDS, RADAR_REFRESH_BASE, MUTATIONS, WEATHER, WEATHER_RULES,
        REBIRTHS, PAWS_REWARDS,
        need, ageMult, moveSpeed, petSpeed, petIncome, petKg, sellValue, rarityOfChance, rebirthMult, luckLevelMult,
        upgradeCost, upgradeLevel, nextUpgradeCost, offlineEarnings, eggGrowth, rollWeight, roll, rollChance, hatchResult, nestState,
        pickEggType, radarMatches, radarFor,
        pawsFor, eggAnnounced,
        EGG_SHOP, shopOdds, rollShopEgg, hugeCfg,
        petName: (id) => tr('pet.' + id),
        eggName: (id) => tr('egg.' + id),
        rarityName: (id) => tr('rarity.' + id),
        tierName: (id) => tr('tier.' + id),
        mutationName: (id) => tr('mut.' + id),
        foodName: (id) => tr('food.' + id),
        radarName: (id) => tr('radar.' + id),
        weatherName: (id) => tr('weather.' + id),
        rarityColor: (id) => (RARITY[id] || RARITY.common).color,
        tierColor: (id) => (TIERS[id] || TIERS.common).color,
        /** Показанная скорость → реальная px/с (оставлено и как GameData.moveSpeed). */
        speedToWorld: moveSpeed,
    };
})();
