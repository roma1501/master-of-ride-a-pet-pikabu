// Game.js — оркестратор игры «Master of Riding a Pet»: реестр модулей, порядок init/ready/update, события.
//
// ВАЖНО О ПОРЯДКЕ СКРИПТОВ. Этот файл подключается в index.html РАНЬШЕ остальных модулей игры — сразу после
// GameUtil.js: модули в конце своего файла зовут Game.register(...), поэтому Game должен уже существовать.
// В Game.js нет обращений к другим модулям на этапе загрузки (только внутри функций).
//
// Модуль — объект { id, init(app), onLoad(state), ready(), update(dt) } (все хуки необязательны):
//   const Weather = { id: 'weather', init(app) {}, onLoad(state) {}, ready() {}, update(dt) {} };
//   Game.register(Weather);          // в конце своего файла
// Порядок вызовов — порядок регистрации (= порядок <script> в index.html):
//   main.js -> Game.prepareMap(map)    до сборки мира: загрузка сохранения, уровень графики, прореживание декора
//   main.js -> Game.init(app)          под экраном загрузки: сначала init(app) у ВСЕХ модулей, затем onLoad(state)
//   main.js -> Game.ready()            ready() у всех модулей, затем Platform.gameplay(true)
//   main.js -> Game.update(dt)         каждый кадр вне паузы: update(dt) у всех модулей по порядку
// События — Game.events (on/off/once/emit), список имён — docs/DESIGN.md §5; игровые часы — Game.time.
// Ошибка в хуке модуля логируется и не роняет кадр.

/** @satisfies {Record<string, any>} */
const Game = {
    /** @type {LoryApp | null} */
    app: null,
    /** Шина событий: Game.events.on('pet:hatched', fn) -> функция отписки. */
    events: new GameUtil.Emitter(),
    /** @type {any[]} */
    modules: [],
    /** Игровое время (с), без пауз. */
    time: 0,
    inited: false,
    started: false,
    /** @type {Record<string, number>} */
    _errors: {},

    /** Зарегистрировать модуль (в конце файла модуля). Повторная регистрация того же объекта игнорируется. */
    register(mod) {
        if (!mod || typeof mod.id !== 'string') throw new Error('Game.register: у модуля нет id');
        if (this.modules.indexOf(mod) < 0) this.modules.push(mod);
        return mod;
    },

    /** Модуль по id. */
    get(id) { return this.modules.find(m => m.id === id) || null; },

    /** Сохранение игры (живой объект GameState.state). */
    get state() { return GameState.state; },

    _call(mod, hook, arg) {
        if (typeof mod[hook] !== 'function') return undefined;
        try { return mod[hook](arg); } catch (e) {
            const key = mod.id + '.' + hook;
            this._errors[key] = (this._errors[key] || 0) + 1;
            if (this._errors[key] <= 3) console.error('Game module ' + key + ':', e);
            return undefined;
        }
    },

    async _callAsync(mod, hook, arg) {
        if (typeof mod[hook] !== 'function') return;
        try { await mod[hook](arg); } catch (e) { console.error('Game module ' + mod.id + '.' + hook + ':', e); }
    },

    // Хук main.js до создания мира: сохранение, уровень графики, прореживание декора копии карты.
    async prepareMap(map) {
        await GameState.ensureLoaded();
        // Обводка по умолчанию выключена: задать до создания мира, чтобы слои обводки не создавались зря.
        if (GameState.state.settings.outline !== true) World3D.setOverrides(null, { outline: 0, ink: 0 });
        GameWorld.initTier();
        GameWorld.prepareMap(map);
    },

    async init(app) {
        this.app = app;
        await GameState.ensureLoaded();
        for (const mod of this.modules) await this._callAsync(mod, 'init', app);
        this.applyState();
        this.inited = true;
    },

    /** Применить загруженное состояние ко всем модулям (после загрузки; повторно — после сброса сохранения). */
    applyState() {
        // Настройка «Обводка» (по умолчанию выкл.; state.settings.outline === true — вкл.): обводка силуэтов и контур рёбер.
        const loc = this.app && this.app.location;
        if (loc) World3D.setOutlines(loc.view, GameState.state.settings.outline === true);
        for (const mod of this.modules) this._call(mod, 'onLoad', GameState.state);
        this.events.emit('state:loaded', { state: GameState.state });
    },

    async ready() {
        for (const mod of this.modules) await this._callAsync(mod, 'ready');
        this.started = true;
        // Офлайн-доход: окно «С возвращением» — Menus.showOffline (фаза 2, если есть), иначе Ranch.showOffline (Забрать / ×2 за рекламу),
        // иначе тост с автосбором.
        const s = GameState.state;
        if (s.offlinePending >= 1) {
            const menus = /** @type {any} */ (typeof Menus !== 'undefined' ? Menus : null);
            const ranch = /** @type {any} */ (typeof Ranch !== 'undefined' ? Ranch : null);
            if (menus && typeof menus.showOffline === 'function') menus.showOffline(s.offlinePending, GameState.offline.seconds);
            else if (ranch && typeof ranch.showOffline === 'function') ranch.showOffline(s.offlinePending, GameState.offline.seconds);
            else {
                const n = GameState.claimOffline(1);
                GameUI.toast(Lang.t('offline.toast', { n: GameUtil.fmt(n) }), 'good', 5200);
            }
        }
        // Игровой процесс идёт: Яндекс GameplayAPI start (на паузе движок шлёт stop сам).
        if (typeof Platform !== 'undefined') Platform.gameplay(true);
    },

    update(dt) {
        if (!this.inited) return;
        this.time += dt;
        for (const mod of this.modules) this._call(mod, 'update', dt);
    },
};
