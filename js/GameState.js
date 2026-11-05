// GameState.js — сохранение игры, экономика, бусты, статы питомцев (docs/DESIGN.md §5, «Сохранение»).
//
// Сохранение — ОДИН объект целиком через Platform.save (адаптеры Яндекса, Playables, Playgama, Store):
// дебаунс SAVE_DEBOUNCE_MS (1,5 с) после изменения, сразу — при round:end, покупках (saveNow), скрытии вкладки.
// Загрузка — Platform.load() с повторами; если она так и не удалась, игра идёт на пустом сохранении, но запись
// отключена (readOnly) — облачный прогресс нельзя затереть. Миграции: GameState.migrate(raw) (v → STATE_VERSION),
// пропущенные поля берутся из defaults(), мусор вычищается (sanitize).
//
// API (docs/DESIGN.md §5):
//   state                      живой объект сохранения
//   save() / saveNow()         отложенное (1,5 с) / немедленное сохранение; lastSeen проставляется сам
//   addCash(n, reason) / spendCash(n) -> bool       деньги ($); totalEarned растёт от addCash(n > 0)
//   addPaws(n, reason) / spendPaws(n) -> bool       лапки (🐾, косметика)
//   boostMult('cash' | 'luck'), addBoost(id, seconds), boostLeft(id), boostPercent()
//   petIncome(pet) / petSpeed(pet) / petWorldSpeed(pet) / petKg(pet), luckMult(), rebirthMult(), incomePerSec()
//   createPet(species, opts) -> pet (не добавляет), givePet(species, opts) -> { pet, isNew } (добавляет в state.pets)
//   findPet(uid), removePet(uid), addPetExp(pet, exp), discoverPet/discoverEgg, softDirty() — отложенная запись медленного состояния
//   claimOffline(mult)         забрать офлайн-доход (state.offlinePending)
// События (Game.events): cash {value, delta, reason}, paws {value, delta, reason}, boost {id, until}, boost:end {id},
//   pet:aged {pet, age}, state:saved.

const STATE_VERSION = 1;

/** huge — ОГРОМНЫЙ питомец из Гигантского яйца магазина за рекламу (поле есть только у таких; множители — GameData.petIncome/petKg). */
/** @typedef {{ uid: string, species: string, w: number, kg0: number, age: number, exp: number, mutation: string | null, huge?: boolean }} PetSave */
/** @typedef {{ uid: string, type: string, kg: number, mutation: string | null }} EggSave */
/** t — секунд в гнезде по игровому времени (пауза не считается); growth — множитель веса после готовности (1…3). */
/** @typedef {{ uid: string, type: string, kg: number, mutation: string | null, placedAt: number, growth: number, t: number }} NestEggSave */

/** Пустое сохранение новой игры: одна улитка под седлом. */
function defaultState() {
    const snailUid = GameUtil.uid();
    const snail = GameData.PETS.snail;
    return {
        v: STATE_VERSION,
        cash: 0, totalEarned: 0, paws: 0,
        luckLevel: 0, nests: GameData.UPGRADES.nests.start, slots: GameData.UPGRADES.slots.start,
        basketCap: GameData.BASKET.start, rebirths: 0,
        /** @type {PetSave[]} */
        pets: [{ uid: snailUid, species: 'snail', w: 1, kg0: snail.baseKg, age: 1, exp: 0, mutation: null }],
        /** @type {string[]} */
        ranchPets: [],
        /** @type {string | null} */
        riding: snailUid,
        /** @type {EggSave[]} */
        eggs: [],
        /** @type {(NestEggSave | null)[]} */
        nestEggs: [null],
        /** Деньги, накопленные над питомцами на ранчо: { uid: сумма }. @type {Record<string, number>} */
        ranchBank: {},
        /** @type {Record<string, number>} */
        radars: {},
        /** @type {Record<string, number>} */
        gearsStock: {},
        gearsRestockAt: 0,
        /** Автопокупка радаров при обновлении запаса Gears: { id радара: true }. @type {Record<string, boolean>} */
        radarAuto: {},
        /** Прогресс просмотров рекламы пакетов магазина яиц: { 'egg-dragon-3': 1 } (Shops.js). @type {Record<string, number>} */
        shopAds: {},
        /** Просмотры рекламы для «Пропустить» перерождение (rebirth-skip), 0…REBIRTH_SKIP_VIEWS − 1. */
        rebirthSkip: 0,
        /** index.bestKg — лучший вес в кг по виду за всё время (Индекс). */
        index: { pets: { snail: true }, claimed: { snail: true }, eggs: { white: true }, bestKg: {} },
        boosts: { cash2x: 0, luck2x: 0, super: 0 },
        lastSeen: 0, offlinePending: 0,
        tutorialDone: false,
        settings: { quality: 'auto', music: 1, sfx: 1 },
        cosmetics: {
            owned: {},
            equipped: { outfit: null, hat: null, face: null, back: null, saddle: null, trail: null, ranch: null, hatchfx: null },
            adProgress: {},
        },
        // Подарок дня: day — последний полученный день круга (0..7), lastClaimDate — дата получения (дата устройства, ГГГГ-ММ-ДД),
        // cycle — сколько кругов (седьмых дней) пройдено, offered — дата, когда окно подарка уже предлагалось само (DailyWheel.js).
        daily: { day: 0, lastClaimDate: '', cycle: 0, offered: '' },
        // Колесо: date — день счётчиков, freeUsed — бесплатное вращение потрачено, adSpins — вращений за рекламу, item — предмет сектора на этот день.
        wheel: { date: '', freeUsed: false, adSpins: 0, item: '' },
        stats: { hatched: 0, broken: 0, rounds: 0 },
    };
}

// Миграции: MIGRATIONS[v] переводит сохранение версии v в v + 1. Пока схема одна — версия 1.
/** @type {Record<number, (s: any) => any>} */
const STATE_MIGRATIONS = {};

const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Слить сохранение с дефолтами: чужие (будущие) ключи остаются, пропущенные и битые по типу — из дефолта.
function mergeDefaults(def, raw) {
    const out = JSON.parse(JSON.stringify(raw));
    for (const k of Object.keys(def)) {
        const d = def[k], r = out[k];
        if (r === undefined || r === null && d !== null) out[k] = JSON.parse(JSON.stringify(d));
        else if (isPlain(d)) out[k] = isPlain(r) ? mergeDefaults(d, r) : JSON.parse(JSON.stringify(d));
        else if (Array.isArray(d)) { if (!Array.isArray(r)) out[k] = JSON.parse(JSON.stringify(d)); }
        else if (d !== null && typeof d !== typeof r) out[k] = d;
    }
    return out;
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Привести сохранение к допустимому виду: числа конечные, питомцы и яйца существующих видов, ссылки не висят.
function sanitizeState(s) {
    const D = GameData;
    s.v = STATE_VERSION;
    for (const k of ['cash', 'totalEarned', 'paws', 'offlinePending', 'lastSeen', 'gearsRestockAt']) s[k] = Math.max(0, num(s[k]));
    s.luckLevel = Math.max(0, Math.floor(num(s.luckLevel)));
    s.rebirths = GameUtil.clamp(Math.floor(num(s.rebirths)), 0, D.REBIRTHS.length);
    s.basketCap = GameUtil.clamp(Math.floor(num(s.basketCap, 1)), 1, D.BASKET.max);
    s.nests = GameUtil.clamp(Math.floor(num(s.nests, 1)), 1, D.UPGRADES.nests.max);
    s.slots = Math.max(D.UPGRADES.slots.start, Math.floor(num(s.slots, 3)));

    const seen = new Set();
    s.pets = (Array.isArray(s.pets) ? s.pets : []).filter(p => p && D.PETS[p.species]).map(p => {
        let uid = typeof p.uid === 'string' && p.uid && !seen.has(p.uid) ? p.uid : GameUtil.uid();
        seen.add(uid);
        const w = GameUtil.clamp(num(p.w, 1), 0.5, 2);
        return {
            uid, species: p.species, w,
            kg0: num(p.kg0) > 0 ? num(p.kg0) : Number((D.PETS[p.species].baseKg * w).toPrecision(4)),
            age: Math.max(1, Math.floor(num(p.age, 1))), exp: Math.max(0, num(p.exp)),
            mutation: p.mutation && D.MUTATIONS[p.mutation] ? p.mutation : null,
            ...(p.huge ? { huge: true } : {}),
        };
    });
    if (!s.pets.length) {
        const fresh = defaultState();
        s.pets = fresh.pets; s.riding = fresh.riding; s.ranchPets = [];
    }
    const uids = new Set(s.pets.map(p => p.uid));
    if (!s.riding || !uids.has(s.riding)) s.riding = s.pets[0].uid;
    s.ranchPets = [...new Set((Array.isArray(s.ranchPets) ? s.ranchPets : []).filter(u => uids.has(u) && u !== s.riding))];
    if (s.ranchPets.length > s.slots) s.ranchPets.length = s.slots;

    s.eggs = (Array.isArray(s.eggs) ? s.eggs : []).filter(e => e && D.EGGS[e.type]).map(e => ({
        uid: typeof e.uid === 'string' && e.uid ? e.uid : GameUtil.uid(), type: e.type,
        kg: num(e.kg) > 0 ? num(e.kg) : D.EGGS[e.type].kg, mutation: e.mutation && D.MUTATIONS[e.mutation] ? e.mutation : null,
    }));
    const nest = (Array.isArray(s.nestEggs) ? s.nestEggs : []).map(e => (e && D.EGGS[e.type] ? {
        uid: typeof e.uid === 'string' && e.uid ? e.uid : GameUtil.uid(), type: e.type,
        kg: num(e.kg) > 0 ? num(e.kg) : D.EGGS[e.type].kg, mutation: e.mutation && D.MUTATIONS[e.mutation] ? e.mutation : null,
        placedAt: num(e.placedAt, Date.now()), growth: Math.min(3, Math.max(1, num(e.growth, 1))), t: Math.max(0, num(e.t)),
    } : null));
    // Яйца в гнёздах не теряем: гнёзд не меньше, чем занятых позиций.
    let last = -1;
    nest.forEach((e, i) => { if (e) last = i; });
    s.nests = Math.max(s.nests, Math.min(D.UPGRADES.nests.max, last + 1));
    while (nest.length < s.nests) nest.push(null);
    s.nestEggs = nest.slice(0, D.UPGRADES.nests.max);

    // банк ранчо: только числа и только для питомцев, что стоят на ранчо (остальное выплачивает Ranch при синхронизации)
    const bankSrc = isPlain(s.ranchBank) ? s.ranchBank : {};
    s.ranchBank = {};
    for (const u of s.ranchPets) if (num(bankSrc[u]) > 0) s.ranchBank[u] = num(bankSrc[u]);

    for (const k of ['radars', 'gearsStock']) {
        const src = isPlain(s[k]) ? s[k] : {};
        s[k] = {};
        for (const id of Object.keys(src)) s[k][id] = Math.max(0, Math.floor(num(src[id])));
    }
    for (const k of ['pets', 'claimed', 'eggs', 'bestKg']) if (!isPlain(s.index[k])) s.index[k] = {};
    for (const k of Object.keys(s.index.bestKg)) { const v = num(s.index.bestKg[k]); if (D.PETS[k] && v > 0) s.index.bestKg[k] = v; else delete s.index.bestKg[k]; }
    // Shops.js: автопокупка радаров, прогресс рекламы магазина яиц и «Пропустить» перерождение
    const radarIds = D.RADARS.map(r => r.id);
    const auto = isPlain(s.radarAuto) ? s.radarAuto : {};
    s.radarAuto = {};
    for (const id of radarIds) if (auto[id]) s.radarAuto[id] = true;
    const ads = isPlain(s.shopAds) ? s.shopAds : {};
    s.shopAds = {};
    for (const id of Object.keys(ads)) if (/^egg-[a-z]+-\d+$/.test(id) && num(ads[id]) >= 1) s.shopAds[id] = Math.floor(num(ads[id]));
    s.rebirthSkip = Math.max(0, Math.floor(num(s.rebirthSkip)));
    // Cosmetics.js: владение (id -> true), надетое по слотам (id | null) и прогресс просмотров рекламы (id -> целое > 0); неизвестные id модуль чистит сам
    if (!isPlain(s.cosmetics)) s.cosmetics = defaultState().cosmetics;
    {
        const c = s.cosmetics;
        const own = isPlain(c.owned) ? c.owned : {};
        c.owned = {};
        for (const id of Object.keys(own)) if (own[id]) c.owned[id] = true;
        const eq = isPlain(c.equipped) ? c.equipped : {};
        c.equipped = Object.assign({}, defaultState().cosmetics.equipped, eq);
        for (const k of Object.keys(c.equipped)) if (typeof c.equipped[k] !== 'string' || !c.equipped[k]) c.equipped[k] = null;
        const ap = isPlain(c.adProgress) ? c.adProgress : {};
        c.adProgress = {};
        for (const id of Object.keys(ap)) if (num(ap[id]) >= 1) c.adProgress[id] = Math.floor(num(ap[id]));
    }
    for (const p of s.pets) s.index.pets[p.species] = true;
    s.boosts.cash2x = Math.max(0, num(s.boosts.cash2x));
    s.boosts.luck2x = Math.max(0, num(s.boosts.luck2x));
    s.boosts.super = Math.max(0, num(s.boosts.super));
    s.tutorialDone = !!s.tutorialDone;
    if (!['auto', 'low', 'medium', 'high'].includes(s.settings.quality)) s.settings.quality = 'auto';
    return s;
}

/** @satisfies {Record<string, any>} */
const GameState = {
    id: 'state',
    /** Живое сохранение (до загрузки — пустое). @type {ReturnType<typeof defaultState>} */
    state: defaultState(),
    loaded: false,
    /** Загрузка не удалась: игра идёт, запись отключена (не затираем облако). */
    readOnly: false,
    /** @type {any} */
    loadError: null,
    /** Офлайн-доход, найденный при загрузке: { seconds, amount }. */
    offline: { seconds: 0, amount: 0 },
    /** @type {Promise<any> | null} */
    _loading: null,
    _timer: 0,
    _dirty: false,
    _saving: false,
    _sinceSave: 0,
    _soft: false,
    _softT: 0,
    /** @type {Record<string, boolean>} */
    _boostOn: {},

    STATE_VERSION,
    defaults: defaultState,
    /** Часы (подменяются в тестах). */
    now() { return Date.now(); },

    /** Сохранение любой версии -> актуальное и допустимое. */
    migrate(raw) {
        if (!isPlain(raw)) return defaultState();
        let s = JSON.parse(JSON.stringify(raw));
        if (!(s.v >= 1)) s.v = 1;
        while (s.v < STATE_VERSION) {
            const fn = STATE_MIGRATIONS[s.v];
            if (fn) s = fn(s);
            s.v = (s.v | 0) + 1;
        }
        return sanitizeState(mergeDefaults(defaultState(), s));
    },

    // --- Загрузка и сохранение -----------------------------------------------------------

    /** Загрузить один раз (повторные вызовы — тот же промис). Зовёт Game.prepareMap и Game.init. */
    ensureLoaded() {
        if (!this._loading) this._loading = this.load();
        return this._loading;
    },

    async load() {
        let raw = null, err = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try { raw = await Platform.load(); err = null; break; } catch (e) {
                err = e;
                await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
            }
        }
        if (err) {
            console.error('GameState: не удалось загрузить сохранение —', err);
            this.readOnly = true;
            this.loadError = err;
            this.state = defaultState();
        } else {
            this.state = this.migrate(raw);
            // Playgama: загруженное уже лежит в storage — без изменений его не переписываем (_write)
            if (Platform.name === 'playgama' && raw) {
                const seen = this.state.lastSeen;
                this.state.lastSeen = 0;
                this._pgSavedKey = JSON.stringify(this.state);
                this.state.lastSeen = seen;
            }
        }
        this.loaded = true;
        this._boostOn = { cash2x: this.boostLeft('cash2x') > 0, luck2x: this.boostLeft('luck2x') > 0, super: this.boostLeft('super') > 0 };
        this.computeOffline();
        return this.state;
    },

    /** Офлайн-доход за время с lastSeen (до OFFLINE_MAX_SECONDS, доля OFFLINE_RATE); копится в offlinePending. */
    computeOffline() {
        const s = this.state, now = this.now();
        const secs = s.lastSeen > 0 ? (now - s.lastSeen) / 1000 : 0;
        const amount = GameData.offlineEarnings(this.incomePerSec(false), secs);
        this.offline = { seconds: Math.max(0, secs), amount };
        if (amount > 0) s.offlinePending += amount;
        s.lastSeen = now;
        this.markDirty();
    },

    /** Забрать офлайн-доход (mult = 2 — «x2 за рекламу»). Возвращает начисленное. */
    claimOffline(mult = 1) {
        const s = this.state, amount = Math.floor(s.offlinePending * (mult > 0 ? mult : 1));
        s.offlinePending = 0;
        if (amount > 0) this.addCash(amount, 'offline');
        this.markDirty();
        return amount;
    },

    markDirty() {
        this._dirty = true;
        if (this._timer || this.readOnly) return;
        const ms = typeof SAVE_DEBOUNCE_MS !== 'undefined' ? SAVE_DEBOUNCE_MS : 1500;
        this._timer = setTimeout(() => { this._timer = 0; this.saveNow(); }, ms);
    },

    /** Сохранить с задержкой (дебаунс). */
    save() { this.markDirty(); },

    /** Сохранить немедленно (покупки, конец раунда, скрытие вкладки). urgent — без склейки (скрытие, выгрузка). */
    saveNow(urgent) {
        if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
        if (this.readOnly || !this.loaded) return Promise.resolve(false);
        this._dirty = false;
        this._sinceSave = 0;
        if (Platform.name !== 'playgama') return this._write();
        // Playgama: одно действие — одна запись bridge.storage. Сохранения одного действия (покупка, затем
        // markDirty того же клика …) склеиваются за SAVE_PLAYGAMA_COALESCE_MS; скрытие вкладки и выгрузка пишут сразу.
        if (!this._pgFlush) this._pgFlush = new Promise(resolve => { this._pgFlushDone = resolve; });
        const p = this._pgFlush;
        clearTimeout(this._pgFlushT);
        const run = () => { this._pgFlush = null; this._pgFlushT = 0; this._pgFlushDone(this._write()); };
        if (urgent) run(); else this._pgFlushT = setTimeout(run, typeof SAVE_PLAYGAMA_COALESCE_MS !== 'undefined' ? SAVE_PLAYGAMA_COALESCE_MS : 400);
        return p;
    },

    _pgFlush: null,
    _pgFlushT: 0,
    _pgFlushDone: null,
    _pgSavedKey: '',

    // Запись состояния целиком. Playgama: если с прошлой записи изменилась только отметка lastSeen — не пишем
    // (повторные сохранения на скрытии вкладки, выгрузке и т. п. не дают лишних storage.set).
    _write() {
        const s = this.state;
        s.cash = Math.round(s.cash * 100) / 100;
        if (Platform.name === 'playgama') {
            const seen = s.lastSeen;
            s.lastSeen = 0;
            const key = JSON.stringify(s);
            s.lastSeen = seen;
            if (key === this._pgSavedKey) return Promise.resolve(true);
            this._pgSavedKey = key;
        }
        s.lastSeen = this.now();
        const p = Promise.resolve(Platform.save(s)).then(ok => {
            if (!ok) this._pgSavedKey = '';   // не записалось — следующая попытка пишет снова
            this.emit('state:saved', { ok });
            return ok;
        }).catch(() => false);
        return p;
    },

    /** Сбросить прогресс (меню «Сбросить»): пустое сохранение и запись. */
    reset() {
        this.state = defaultState();
        this.offline = { seconds: 0, amount: 0 };
        this._boostOn = { cash2x: false, luck2x: false, super: false };
        this.markDirty();
        if (typeof Game !== 'undefined' && Game.inited) Game.applyState();   // модули подхватывают пустое сохранение
        return this.saveNow();
    },

    emit(name, data) {
        if (typeof Game !== 'undefined' && Game.events) Game.events.emit(name, data);
    },

    // --- Деньги и лапки ------------------------------------------------------------------
    /** Начислить (n > 0) или списать без проверки (n < 0). reason: income, sell, offline, reward, daily, wheel, refund… */
    addCash(n, reason = 'income') {
        n = Number(n);
        if (!Number.isFinite(n) || n === 0) return 0;
        const s = this.state;
        s.cash = Math.max(0, s.cash + n);
        if (n > 0 && reason !== 'refund') s.totalEarned += n;
        this.emit('cash', { value: s.cash, delta: n, reason });
        this.markDirty();
        return n;
    },
    /** Потратить: false — не хватает денег (ничего не списано). */
    spendCash(n) {
        n = Number(n);
        const s = this.state;
        if (!(n >= 0) || !Number.isFinite(n) || s.cash + 1e-6 < n) return false;
        if (n === 0) return true;
        s.cash = Math.max(0, s.cash - n);
        this.emit('cash', { value: s.cash, delta: -n, reason: 'spend' });
        this.markDirty();
        return true;
    },
    canAfford(n) { return this.state.cash + 1e-6 >= n; },
    addPaws(n, reason = 'reward') {
        n = Math.floor(Number(n));
        if (n > 0 && reason === 'hatch') n = Math.floor(n * this.superMult('paws'));   // супер-награда: лапки ×2
        if (!Number.isFinite(n) || n === 0) return 0;
        const s = this.state;
        s.paws = Math.max(0, s.paws + n);
        this.emit('paws', { value: s.paws, delta: n, reason });
        this.markDirty();
        return n;
    },
    spendPaws(n) {
        n = Math.floor(Number(n));
        const s = this.state;
        if (!(n >= 0) || s.paws < n) return false;
        if (n === 0) return true;
        s.paws -= n;
        this.emit('paws', { value: s.paws, delta: -n, reason: 'spend' });
        this.markDirty();
        return true;
    },

    // --- Бусты ---------------------------------------------------------------------------
    /** Секунд до конца буста (cash2x | luck2x), 0 — не активен. */
    boostLeft(id) { return Math.max(0, ((this.state.boosts[id] || 0) - this.now()) / 1000); },
    boostActive(id) { return this.boostLeft(id) > 0; },
    /** Множитель буста: 'cash' — ×2 при cash2x, 'luck' — ×2 при luck2x; супер-награда умножает сверху (superMult). */
    boostMult(kind) {
        if (kind === 'cash') return (this.boostActive('cash2x') ? 2 : 1) * this.superMult('cash');
        if (kind === 'luck') return (this.boostActive('luck2x') ? 2 : 1) * this.superMult('luck');
        return 1;
    },
    /**
     * Супер-награда (буст 'super', 5 просмотров рекламы — SuperRewards.js): множитель по виду, 1 — не активна.
     * 'cash' | 'luck' — деньги и удача, 'speed' — скорость езды, 'eggTime' — время до разбивания яйца,
     * 'hatch' — скорость инкубации в гнезде, 'paws' — лапки за вылупление.
     */
    superMult(kind) {
        return this.boostActive('super') ? this.superMultValue(kind) : 1;
    },
    /** Настроенный множитель супер-награды по виду (для окна награды; действует — superMult). */
    superMultValue(kind) {
        const U = 'undefined';
        switch (kind) {
            case 'cash': return typeof SUPER_CASH_MULT !== U ? SUPER_CASH_MULT : 3;
            case 'luck': return typeof SUPER_LUCK_MULT !== U ? SUPER_LUCK_MULT : 3;
            case 'speed': return typeof SUPER_SPEED_MULT !== U ? SUPER_SPEED_MULT : 1.25;
            case 'eggTime': return typeof SUPER_EGG_TIME_MULT !== U ? SUPER_EGG_TIME_MULT : 1.75;
            case 'hatch': return typeof SUPER_HATCH_MULT !== U ? SUPER_HATCH_MULT : 2;
            case 'paws': return typeof SUPER_PAWS_MULT !== U ? SUPER_PAWS_MULT : 2;
        }
        return 1;
    },
    /** Для кнопки «Буст +N%»: прирост денег от активных бустов. */
    boostPercent() { return Math.round((this.boostMult('cash') - 1) * 100); },
    /** Продлить буст на seconds (с «сейчас» или с конца текущего). */
    addBoost(id, seconds) {
        const b = this.state.boosts;
        if (!(id in b)) b[id] = 0;
        const until = Math.max(this.now(), b[id] || 0) + Math.max(0, seconds) * 1000;
        b[id] = until;
        this._boostOn[id] = true;
        this.emit('boost', { id, until });
        this.markDirty();
        return until;
    },

    // --- Множители и статы ---------------------------------------------------------------
    /** Множитель удачи вылупления: (1 + уровень удачи ранчо) × буст. L яйца = egg.luck × luckMult(). */
    luckMult() { return GameData.luckLevelMult(this.state.luckLevel) * this.boostMult('luck'); },
    rebirthMult() { return GameData.rebirthMult(this.state.rebirths); },
    /** Доход питомца, $/с, с перерождениями и бустами. */
    petIncome(pet) { return GameData.petIncome(pet, this.rebirthMult(), this.boostMult('cash')); },
    /** Показанная скорость ⚡ питомца. */
    petSpeed(pet) { return GameData.petSpeed(pet); },
    /** Реальная скорость px/с. */
    petWorldSpeed(pet) { return GameData.moveSpeed(GameData.petSpeed(pet)); },
    petKg(pet) { return GameData.petKg(pet); },
    /** Суммарный доход питомцев на ранчо, $/с (boosts = false — без бустов, для офлайна). */
    incomePerSec(boosts = true) {
        let sum = 0;
        for (const uid of this.state.ranchPets) {
            const p = this.findPet(uid);
            if (p) sum += GameData.petIncome(p, this.rebirthMult(), boosts ? this.boostMult('cash') : 1);
        }
        return sum;
    },

    // --- Питомцы -------------------------------------------------------------------------
    /** @returns {PetSave | null} */
    findPet(uid) { return this.state.pets.find(p => p.uid === uid) || null; },
    ridingPet() { return this.findPet(this.state.riding) || this.state.pets[0] || null; },
    /** Новая запись питомца (в сохранение не кладёт). opts: { w, kg0, age, exp, mutation, uid }. */
    createPet(species, opts = {}) {
        const d = GameData.PETS[species];
        if (!d) throw new Error('GameState.createPet: нет питомца ' + species);
        const w = opts.w > 0 ? opts.w : 1;
        return {
            uid: opts.uid || GameUtil.uid(), species, w,
            kg0: opts.kg0 > 0 ? opts.kg0 : Number((d.baseKg * w).toPrecision(4)),
            age: Math.max(1, opts.age || 1), exp: Math.max(0, opts.exp || 0),
            mutation: opts.mutation && GameData.MUTATIONS[opts.mutation] ? opts.mutation : null,
            ...(opts.huge ? { huge: true } : {}),
        };
    },
    /** Создать питомца и положить в сохранение; isNew — вид открыт впервые (Индекс). */
    givePet(species, opts = {}) {
        const pet = this.createPet(species, opts);
        const s = this.state;
        s.pets.push(pet);
        const isNew = !s.index.pets[species];
        s.index.pets[species] = true;
        this.markDirty();
        return { pet, isNew };
    },
    /** Удалить питомца (продажа): нельзя последнего и того, что под седлом. */
    removePet(uid) {
        const s = this.state;
        if (s.pets.length <= 1 || s.riding === uid) return false;
        const i = s.pets.findIndex(p => p.uid === uid);
        if (i < 0) return false;
        s.pets.splice(i, 1);
        s.ranchPets = s.ranchPets.filter(u => u !== uid);
        this.markDirty();
        return true;
    },
    /**
     * Начислить опыт: повышает возраст (событие pet:aged). Возвращает число новых возрастов. Сохранение — отложенное
     * (softDirty: не чаще раза в 20 с), чтобы опыт от езды и ранчо не слал облаку запись каждую секунду; новый возраст — сразу.
     */
    addPetExp(pet, exp) {
        if (!pet || !(exp > 0)) return 0;
        pet.exp += exp;
        let aged = 0;
        while (pet.age < 999 && pet.exp >= GameData.need(pet.age)) { pet.exp -= GameData.need(pet.age); pet.age++; aged++; }
        if (aged) { this.emit('pet:aged', { pet, age: pet.age }); this.markDirty(); } else this.softDirty();
        return aged;
    },
    /** Медленно меняющееся состояние (опыт, рост яиц, банк ранчо): сохранится не позже чем через ~20 с, без дребезга записей. */
    softDirty() { this._soft = true; },
    discoverPet(species) {
        const idx = this.state.index.pets, isNew = !idx[species];
        idx[species] = true;
        if (isNew) this.markDirty();
        return isNew;
    },
    discoverEgg(type) {
        const idx = this.state.index.eggs, isNew = !idx[type];
        idx[type] = true;
        if (isNew) this.markDirty();
        return isNew;
    },
    setSetting(key, value) { this.state.settings[key] = value; this.markDirty(); },

    // --- Модуль Game ---------------------------------------------------------------------
    init() {
        // Скрытие вкладки и выгрузка страницы: сохранить немедленно.
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveNow(true); });
        window.addEventListener('pagehide', () => { this.saveNow(true); });
        Game.events.on('round:end', () => { this.saveNow(); });
    },

    update(dt) {
        // Окончание бустов — событие один раз; страховочное сохранение раз в 30 с, если есть несохранённое.
        for (const id of ['cash2x', 'luck2x', 'super']) {
            const on = this.boostLeft(id) > 0;
            if (this._boostOn[id] && !on) { this._boostOn[id] = false; this.emit('boost:end', { id }); }
        }
        this._sinceSave += dt;
        if (this._soft) {
            this._softT += dt;
            if (this._softT > 20) { this._softT = 0; this._soft = false; this.markDirty(); }
        }
        if (this._dirty && this._sinceSave > 30) this.saveNow();
    },
};
Game.register(GameState);
