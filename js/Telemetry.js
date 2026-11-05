// Telemetry.js — события игры и сэмпл производительности для аналитики платформы (Platform.analytics:
// на Playgama — bridge.analytics.send, в остальных сборках — ничего). Контракт — руководство Playgama
// по телеметрии: стабильные имена событий, ограниченные значения, без личных данных и без своих session_id.
//
// События (данные — только ограниченные словари и порядковые числа):
//   progression_started   { step_id: 'egg_run', egg_tier }     — подобрано первое яйцо в пустую корзину (началась вылазка)
//   progression_completed { step_id: 'egg_run', egg_tier, pet_rarity }   — яйцо вылупилось (раунд — успех)
//   progression_failed    { step_id: 'egg_run', egg_tier, reason: 'egg_broke' }  — яйцо разбилось (раунд — провал)
//   tutorial_completed    { skipped }                           — туториал пройден или пропущен
//   rebirth_completed     { rebirth, skip }                     — перерождение (номер 1…7)
//   performance_sample    { … }                                 — раз в ~30 с активной видимой игры (см. _flush)
// Системные события Bridge (game_ready, level_started/… , реклама, сессия) здесь не дублируются.

const TELEMETRY_TARGET_FPS = 60;
const TELEMETRY_WINDOW_MS = 30000;
const TELEMETRY_MAX_FRAMES = 4096;

/** @satisfies {Record<string, any>} */
const Telemetry = {
    id: 'telemetry',
    _frames: new Float32Array(TELEMETRY_MAX_FRAMES),
    _n: 0,
    _activeMs: 0,
    _windowStart: 0,
    _last: 0,
    _hiddenGap: false,
    _errors: 0,
    _rejections: 0,
    _contextLost: 0,
    _runTier: '',

    init(app) {
        const E = Game.events;
        E.on('egg:picked', (e) => {
            // Начало вылазки — первое яйцо в пустой корзине (Eggs.basket уже содержит его).
            const basket = typeof Eggs !== 'undefined' ? Eggs.basket : null;
            if (basket && basket.length === 1) {
                this._runTier = this._tier(e && e.egg && e.egg.type);
                Platform.analytics('progression_started', { step_id: 'egg_run', egg_tier: this._runTier });
            }
        });
        E.on('round:end', (e) => {
            const tier = this._tier(e && e.type) || this._runTier || 'unknown';
            if (e && e.success) {
                const def = e.species && GameData.PETS[e.species];
                Platform.analytics('progression_completed', { step_id: 'egg_run', egg_tier: tier, pet_rarity: def ? String(def.rarity) : 'unknown' });
            } else {
                Platform.analytics('progression_failed', { step_id: 'egg_run', egg_tier: tier, reason: 'egg_broke' });
            }
        });
        E.on('tutorial', (e) => {
            if (e && e.active === false && (e.reason === 'done' || e.reason === 'skip' || e.step === 'done')) {
                Platform.analytics('tutorial_completed', { skipped: e.reason === 'skip' });
            }
        });
        E.on('rebirth', (e) => {
            Platform.analytics('rebirth_completed', { rebirth: Math.max(0, Math.min(99, Number(e && e.n) || 0)), skip: !!(e && e.skip) });
        });
        // Ошибки окна — только счёт за окно, без текстов и адресов.
        window.addEventListener('error', () => { this._errors++; });
        window.addEventListener('unhandledrejection', () => { this._rejections++; });
        const canvas = document.getElementById('world3d');
        if (canvas) canvas.addEventListener('webglcontextlost', () => { this._contextLost++; });
        if (app && typeof app.onFrame === 'function') app.onFrame(() => this._frame());
    },

    // Тир яйца — ограниченный словарь (common … ethereal).
    _tier(type) {
        const def = type && GameData.EGGS[type];
        return def ? String(def.tier) : '';
    },

    // Идёт ли сейчас активная видимая игра: не загрузка, не пауза, не титульный экран, вкладка видна.
    _active() {
        if (document.visibilityState !== 'visible') return false;
        if (typeof Pause !== 'undefined' && Pause.active) return false;
        if (typeof Menus !== 'undefined' && Menus.titleOpen) return false;
        return !!(Game.started);
    },

    _frame() {
        const now = performance.now();
        const dt = this._last ? now - this._last : 0;
        this._last = now;
        if (!this._active()) { this._hiddenGap = true; return; }
        if (this._hiddenGap) { this._hiddenGap = false; return; }   // кадр после паузы/фона — не «застывший кадр»
        if (!(dt > 0) || dt > 5000) return;
        if (!this._windowStart) this._windowStart = now;
        if (this._n < TELEMETRY_MAX_FRAMES) this._frames[this._n++] = dt;
        this._activeMs += dt;
        if (now - this._windowStart >= TELEMETRY_WINDOW_MS && this._n >= 30) this._flush(now);
    },

    // Один агрегированный сэмпл за окно; счётчики — только за это окно.
    _flush(now) {
        const n = this._n;
        const ft = Array.from(this._frames.subarray(0, n)).sort((a, b) => a - b);
        const pct = (p) => ft[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))];
        const over = (ms) => { let c = 0; for (let i = n - 1; i >= 0 && ft[i] > ms; i--) c++; return c; };
        const r1 = (v) => Math.round(v * 10) / 10;
        /** @type {Record<string, string | number>} */
        const sample = {
            target_fps: TELEMETRY_TARGET_FPS,
            window_ms: Math.round(now - this._windowStart),
            active_ms: Math.round(this._activeMs),
            frame_count: n,
            fps_avg: r1(n / Math.max(0.001, this._activeMs / 1000)),
            fps_p10: r1(1000 / Math.max(0.001, pct(0.9))),
            frame_time_p50_ms: r1(pct(0.5)),
            frame_time_p95_ms: r1(pct(0.95)),
            frame_time_p99_ms: r1(pct(0.99)),
            frame_time_max_ms: r1(ft[n - 1]),
            frames_over_50ms: over(50),
            frames_over_100ms: over(100),
            frames_over_250ms: over(250),
            frames_over_500ms: over(500),
            frames_over_1000ms: over(1000),
            game_version: typeof GAME_VERSION !== 'undefined' ? String(GAME_VERSION) : '',
            js_error_count: this._errors,
            unhandled_rejection_count: this._rejections,
            webgl_context_loss_count: this._contextLost,
        };
        // Уровень графики назначается правилом GameWorld.initTier (устройство + настройка) — воспроизводимо.
        if (typeof GameWorld !== 'undefined' && GameWorld.tier != null) sample.device_tier = Number(GameWorld.tier);
        Platform.analytics('performance_sample', sample);
        this._n = 0; this._activeMs = 0; this._windowStart = now;
        this._errors = 0; this._rejections = 0; this._contextLost = 0;
    },
};

Game.register(Telemetry);
