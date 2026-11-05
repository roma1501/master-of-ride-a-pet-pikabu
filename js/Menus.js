// Menus.js — титульный экран, меню паузы, настройки, рекорды, «Как играть», пауза платформы (Playables и др.).
//
//   Menus.titleOpen          true, пока открыт титульный экран (Daily Gift и прочие окна ждут: !Menus.titleOpen && !Tutorial.active)
//   Menus.showTitle() / play({ tutorial }) / onEscape(code)
//   Menus.showPause() / hidePause()           панель «Пауза»: Продолжить, Настройки, Как играть, Рекорды (GameUI.setPaused зовёт их сам)
//   Menus.openSettings() / openRecords()      панели с титульного экрана (в паузе — страницы той же панели)
//   Menus.buildSettings(el, rec, back) / buildRecords(el, rec, back)   содержимое страниц
//   Menus.recordsAvailable()                  есть ли таблица рекордов на этой платформе (Яндекс, Playgama in_game)
//   Menus.sfxOn() / musicOn() / setSetting(key, value) / setQuality(q)   настройки (state.settings.sfx | music | quality)
//   Menus.platformPaused                      true, пока висит пауза платформы (оверлей «Пауза», весь ввод заблокирован)
// События (Game.events): menu:title { open }, title:play { tutorial }, settings { key, value }, quality { tier }.
//
// Титульный экран — над живым миром: камера плавно облетает игрока (Player.cine), HUD спрятан, ввод игрока заблокирован
// (GameUI.lock). Показывается один раз за сеанс; Platform.gameplay(true) уходит платформе только по «Играть».
// Звук: «Звуковые эффекты» и «Музыка» — отдельные переключатели поверх Sound (Sound.play / Sound.music обёрнуты при загрузке
// файла); любой модуль зовёт Sound.music как раньше, Menus помнит желаемую дорожку и играет её, пока музыка включена.
// Пауза платформы (Pause 'platform'): видимый оверлей «Пауза» без кнопки продолжения, весь ввод (игра, HUD, меню) заблокирован
// до возобновления платформой.

/** Дорожка титульного экрана и запасная дорожка игры (если ни один модуль не запросил музыку). */
const MENU_MUSIC_URL = 'assets/sounds/music-menu.ogg';
const MENU_GAME_MUSIC_URL = 'assets/sounds/music-game.ogg';

Lang.add({
    ru: {
        'menu.play': 'Играть', 'menu.settings': 'Настройки', 'menu.records': 'Рекорды', 'menu.howto': 'Как играть',
        'menu.continue': 'Продолжить', 'menu.back': 'Назад',
        'settings.sfx': 'Звуковые эффекты', 'settings.music': 'Музыка', 'settings.on': 'Вкл', 'settings.off': 'Выкл',
        'settings.quality': 'Графика', 'settings.outline': 'Обводка',
        'settings.qualityNote': 'Часть изменений графики, например густота растительности, применится после перезапуска игры.',
        'quality.auto': 'Авто', 'quality.low': 'Низкая', 'quality.medium': 'Средняя', 'quality.high': 'Высокая',
        'records.title': 'Рекорды', 'records.top': 'Лучшие игроки', 'records.empty': 'Пока нет лучших игроков',
        'records.signin': 'Войдите в аккаунт', 'records.error': 'Не удалось загрузить рекорды', 'records.player': 'Игрок',
        'records.you': 'Вы',
    },
    en: {
        'menu.play': 'Play', 'menu.settings': 'Settings', 'menu.records': 'Records', 'menu.howto': 'How to play',
        'menu.continue': 'Continue', 'menu.back': 'Back',
        'settings.sfx': 'Sound effects', 'settings.music': 'Music', 'settings.on': 'On', 'settings.off': 'Off',
        'settings.quality': 'Graphics', 'settings.outline': 'Outlines',
        'settings.qualityNote': 'Some graphics changes, such as how dense the plants are, apply after the game is restarted.',
        'quality.auto': 'Auto', 'quality.low': 'Low', 'quality.medium': 'Medium', 'quality.high': 'High',
        'records.title': 'Records', 'records.top': 'Top players', 'records.empty': 'No top players yet',
        'records.signin': 'Sign in to your account', 'records.error': 'Could not load the records', 'records.player': 'Player',
        'records.you': 'You',
    },
});

// Числа Constants.js читаются через typeof с дефолтом (редактор патчит только литералы).
function menuCfg() {
    const U = 'undefined';
    return {
        orbitDeg: typeof TITLE_ORBIT_DEG !== U ? TITLE_ORBIT_DEG : 9,
        camDist: typeof TITLE_CAM_DIST !== U ? TITLE_CAM_DIST : 980,
        camPitch: (typeof TITLE_CAM_PITCH_DEG !== U ? TITLE_CAM_PITCH_DEG : 17) * Math.PI / 180,
        camLook: typeof TITLE_CAM_LOOK !== U ? TITLE_CAM_LOOK : 190,
        recordsCache: typeof RECORDS_CACHE_SECONDS !== U ? RECORDS_CACHE_SECONDS : 60,
    };
}

const MENU_CSS = `
/* титульный экран: поверх мира, ниже панелей (6); декор не перехватывает нажатия */
.ts{position:absolute;inset:0;z-index:5;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:space-between;
 padding:max(env(safe-area-inset-top),calc(var(--u)*14)) max(env(safe-area-inset-right),calc(var(--u)*14)) max(env(safe-area-inset-bottom),calc(var(--u)*16)) max(env(safe-area-inset-left),calc(var(--u)*14));transition:opacity .4s ease}
.ts::before{content:'';position:absolute;inset:0;background:linear-gradient(rgba(14,7,2,.55),rgba(14,7,2,0) 34%,rgba(14,7,2,0) 56%,rgba(14,7,2,.6));pointer-events:none}
.ts.out{opacity:0}
.ts.hidden{display:none}
.ts>*{position:relative}
.ts-logo{display:flex;flex-direction:column;align-items:center;padding:calc(var(--u)*10) calc(var(--u)*44) calc(var(--u)*12);animation:ts-drop .7s cubic-bezier(.2,1.5,.4,1) both;text-align:center;max-width:100%}
.ts-l1{font-size:max(15px,calc(var(--u)*27));font-weight:900;line-height:1.05;color:#ffd84a;letter-spacing:.04em}
.ts-l2{font-size:max(28px,calc(var(--u)*66));font-weight:900;line-height:1;margin-top:calc(var(--u)*2)}
.ts-egg{position:absolute;top:50%;width:calc(var(--u)*64);height:calc(var(--u)*64);margin-top:calc(var(--u)*-34);object-fit:contain;filter:drop-shadow(0 calc(var(--u)*4) 0 rgba(0,0,0,.5))}
.ts-egg.l{left:calc(var(--u)*-26);transform:rotate(-14deg);animation:ts-wob 2.4s ease-in-out infinite}
.ts-egg.r{right:calc(var(--u)*-26);transform:rotate(14deg);animation:ts-wob 2.4s ease-in-out -1.2s infinite}
@keyframes ts-drop{from{transform:translateY(-120%) scale(.9);opacity:0}to{transform:none;opacity:1}}
@keyframes ts-wob{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(-4deg) translateY(calc(var(--u)*-6))}}
.ts-bottom{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*14);animation:ts-rise .6s .15s cubic-bezier(.2,1.4,.4,1) both;max-width:100%}
@keyframes ts-rise{from{transform:translateY(60%);opacity:0}to{transform:none;opacity:1}}
.ts-play{font-size:max(22px,calc(var(--u)*38));padding:calc(var(--u)*12) calc(var(--u)*58);border-radius:calc(var(--u)*24);min-width:max(210px,calc(var(--u)*300));min-height:max(50px,calc(var(--u)*66))}
.ts-play .ico{width:1.1em;height:1.1em}
.ts-row{display:flex;gap:calc(var(--u)*12);justify-content:center;flex-wrap:wrap}
.ts-row .gb{font-size:max(14px,calc(var(--u)*20));padding:calc(var(--u)*8) calc(var(--u)*18);min-height:max(40px,calc(var(--u)*48))}
/* панели меню */
.mn-body{font-size:max(14px,calc(var(--u)*18))}
.mn-list{display:flex;flex-direction:column;gap:calc(var(--u)*12);align-items:stretch}
.mn-list .gb{font-size:max(16px,calc(var(--u)*24));padding:calc(var(--u)*11) calc(var(--u)*20);min-height:max(46px,calc(var(--u)*56))}
.mn-list .gb.big{font-size:max(18px,calc(var(--u)*30))}
.mn-row{display:flex;align-items:center;gap:calc(var(--u)*12);padding:calc(var(--u)*10) calc(var(--u)*4);border-bottom:calc(var(--u)*2) dashed rgba(120,80,40,.3);flex-wrap:wrap}
.mn-row:last-of-type{border-bottom:0}
.mn-row .ico{width:calc(var(--u)*36);height:calc(var(--u)*36)}
.mn-row .grow{flex:1;min-width:calc(var(--u)*120);font-size:max(15px,calc(var(--u)*21));font-weight:900;color:#5b3417}
.mn-tg{min-width:max(92px,calc(var(--u)*118));min-height:max(40px,calc(var(--u)*48));font-size:max(14px,calc(var(--u)*19));padding:calc(var(--u)*7) calc(var(--u)*14)}
.mn-seg{display:grid;grid-template-columns:repeat(auto-fit,minmax(max(64px,calc(var(--u)*84)),1fr));gap:calc(var(--u)*8);width:100%}
.mn-seg .gb{font-size:max(13px,calc(var(--u)*17));padding:calc(var(--u)*7) calc(var(--u)*6);min-height:max(40px,calc(var(--u)*48))}
.mn-note{margin:calc(var(--u)*4) calc(var(--u)*4) calc(var(--u)*6);font-size:max(12px,calc(var(--u)*15));font-weight:700;color:#7a5a38;line-height:1.25}
.mn-back{margin-top:calc(var(--u)*10);display:flex;justify-content:center}
.mn-back .gb{font-size:max(15px,calc(var(--u)*20));min-height:max(40px,calc(var(--u)*48))}
.mn-rec{display:flex;flex-direction:column;gap:calc(var(--u)*6)}
.mn-rec .hd{font-size:max(15px,calc(var(--u)*21));font-weight:900;color:#6b3a17;text-align:center;margin-bottom:calc(var(--u)*4)}
.mn-rr{display:flex;align-items:center;gap:calc(var(--u)*10);padding:calc(var(--u)*5) calc(var(--u)*10);border-radius:calc(var(--u)*12);background:rgba(120,80,40,.1)}
.mn-rr.me{background:rgba(255,205,60,.5);box-shadow:inset 0 0 0 calc(var(--u)*2.5) rgba(190,120,0,.7)}
.mn-rr .rk{min-width:calc(var(--u)*34);height:calc(var(--u)*34);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:max(13px,calc(var(--u)*18));font-weight:900;color:#fff;background:#8a6a44;-webkit-text-stroke:calc(var(--u)*3) #3a2410;paint-order:stroke fill}
.mn-rr .rk.r1{background:#e6a900}.mn-rr .rk.r2{background:#9aa4ae}.mn-rr .rk.r3{background:#c8742a}
.mn-av{width:calc(var(--u)*44);height:calc(var(--u)*44);border-radius:50%;object-fit:cover;background:#d9bd8a;border:calc(var(--u)*3) solid #3a2410;flex:none;display:flex;align-items:center;justify-content:center}
.mn-av .ico{width:calc(var(--u)*26);height:calc(var(--u)*26);margin:0}
.mn-rr .nm{flex:1;min-width:0;font-size:max(14px,calc(var(--u)*19));font-weight:900;color:#4a2a12;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mn-rr .sc{font-size:max(14px,calc(var(--u)*19));font-weight:900;color:#1f7a14;white-space:nowrap}
.mn-msg{text-align:center;font-size:max(15px,calc(var(--u)*20));font-weight:800;color:#7a5a38;padding:calc(var(--u)*18) calc(var(--u)*8)}
.mn-msg .gb{margin-top:calc(var(--u)*10);font-size:max(15px,calc(var(--u)*21))}
/* пауза платформы: оверлей вне #game-ui, размеры от экрана */
.plat-pause{position:fixed;inset:0;z-index:1100;background:rgba(18,9,3,.72);display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;font-family:RideFont,system-ui,sans-serif;font-weight:900}
.plat-pause .pp-sign{padding:clamp(8px,2vmin,18px) clamp(26px,8vmin,70px);font-size:clamp(24px,7vmin,56px);color:#fff;-webkit-text-stroke:clamp(4px,1vmin,9px) #0d0602;paint-order:stroke fill;text-shadow:0 clamp(2px,.5vmin,5px) 0 #0d0602;
 background:repeating-linear-gradient(92deg,rgba(0,0,0,.07) 0 4px,rgba(255,230,180,.05) 4px 11px,rgba(0,0,0,0) 11px 20px),linear-gradient(#92592a,#7b4a24 45%,#5b3417);border:clamp(3px,.7vmin,6px) solid #1c0f06;border-radius:clamp(10px,2vmin,18px);
 box-shadow:inset 0 3px 0 rgba(255,225,170,.4),inset 0 -5px 0 rgba(0,0,0,.3),0 6px 0 rgba(0,0,0,.45)}
`;

/** @satisfies {Record<string, any>} */
const Menus = {
    id: 'menus',
    /** @type {LoryApp | null} */
    app: null,
    /** Титульный экран открыт. Для Daily Gift и прочих окон: не показывать поверх. */
    titleOpen: false,
    /** Пока true, Platform.gameplay(true) молчит (идёт титульный экран): игровой процесс начинается по «Играть». */
    holdGameplay: true,
    /** Пауза платформы сейчас. */
    platformPaused: false,
    /** @type {HTMLElement | null} */
    titleEl: null,
    /** @type {any} */
    _cine: null,
    _titleLock: false,
    _ownsCine: false,
    /** @type {any} панель паузы */
    _pauseRec: null,
    /** @type {HTMLElement | null} */
    _ppEl: null,
    /** Настройка качества менялась в этой сессии (показываем заметку о перезапуске). */
    qualityChanged: false,
    /** Желаемая музыка модулей: { url, opts } | null; _wantedSet — кто-то её уже просил. */
    _wanted: null,
    _wantedSet: false,
    /** @type {Function | null} исходный Sound.music */
    _origMusic: null,
    /** @type {{ t: number, data: any } | null} */
    _rec: null,
    _recBusy: false,
    _bound: false,
    _shown: false,

    // =============================================================================================
    // Модуль
    // =============================================================================================
    init(app) {
        this.app = app;
        GameUI.addCss('menus', MENU_CSS);
        this._bindPlatformPause();
        this._bindKeys();
    },

    /** Состояние загружено или сброшено: применить настройки. */
    onLoad() {
        // сброс сохранения во время игры; на старте дорожку выбирает Menus.ready (титульный экран), без лишней загрузки музыки игры
        if (this._shown) this._applyMusic();
    },

    ready() {
        // Титульный экран один раз за сеанс (и новичку, и вернувшемуся игроку).
        if (!this.titleOpen && !this._shown) {
            try { this.showTitle(); } catch (e) { console.error('Menus.showTitle:', e); }
            // Титульный экран не открылся — игра не должна зависнуть без игрового процесса.
            if (!this.titleOpen) {
                this.holdGameplay = false;
                if (typeof Platform !== 'undefined') Platform.gameplay(true);
                if (typeof Tutorial !== 'undefined') Tutorial.autoStart();
            }
        }
    },

    update(dt) {
        if (this.titleOpen) this._orbit(dt);
    },

    // =============================================================================================
    // Настройки и звук
    // =============================================================================================
    settings() { return GameState.state.settings; },
    sfxOn() { const v = this.settings().sfx; return v !== 0 && v !== false; },
    musicOn() { const v = this.settings().music; return v !== 0 && v !== false; },
    /** Обводка силуэтов и контур рёбер — по умолчанию выключена (state.settings.outline === true — вкл.). */
    outlineOn() { return this.settings().outline === true; },

    /** Сохранить настройку (sfx | music: 0/1, quality: auto|low|medium|high) и применить. */
    setSetting(key, value) {
        GameState.setSetting(key, value);
        if (key === 'music') this._applyMusic();
        if (key === 'outline' && window.app && window.app.location) World3D.setOutlines(window.app.location.view, value === true);
        Game.events.emit('settings', { key, value });
    },

    /** Качество графики: сохраняется в state.settings.quality; уровень и эффекты — сразу, густота декора — после перезапуска. */
    setQuality(q) {
        if (!['auto', 'low', 'medium', 'high'].includes(q)) return;
        this.setSetting('quality', q);
        this.qualityChanged = true;
        try {
            GameWorld.initTier();
            GameWorld.applyTier();
        } catch (e) { /* без мира (тесты) */ }
        Game.events.emit('quality', { tier: typeof GameWorld !== 'undefined' ? GameWorld.tier : 1 });
    },

    // Музыка: титульный экран — своя дорожка, дальше — то, что просили модули (или запасная дорожка игры); выключена — тишина.
    _applyMusic() {
        const fn = this._origMusic;
        if (!fn) return;
        let want = null;
        if (this.musicOn()) {
            if (this.titleOpen) want = { url: MENU_MUSIC_URL, opts: { volume: 0.7 } };
            else if (this._wantedSet) want = this._wanted;
            else want = { url: MENU_GAME_MUSIC_URL, opts: { volume: 0.6 } };
        }
        fn(want ? want.url : null, want ? want.opts : undefined);
    },

    // =============================================================================================
    // Титульный экран
    // =============================================================================================
    /** Открыть титульный экран над живым миром. */
    showTitle() {
        if (this.titleOpen) return;
        this._shown = true;
        const E = GameUtil.el;
        const parts = /^(.+?)\s+(Rid(?:e|ing)\b.*)$/i.exec(typeof GAME_TITLE !== 'undefined' ? GAME_TITLE : '');
        const title = typeof GAME_TITLE !== 'undefined' ? GAME_TITLE : '';
        const logo = E('div', { class: 'ts-logo wood' },
            E('img', { class: 'ts-egg l', src: GameUI.iconUrl('egg'), alt: '' }),
            E('img', { class: 'ts-egg r', src: GameUI.iconUrl('paw'), alt: '' }),
            parts ? E('div', { class: 'ts-l1 otx', text: parts[1] }) : null,
            E('div', { class: 'ts-l2 otx', text: parts ? parts[2] : title }));
        const btn = (cls, icon, key, fn) => {
            const b = E('button', { class: 'gb ' + cls, type: 'button', html: GameUI.icon(icon) + '<span>' + GameUtil.esc(Lang.t(key)) + '</span>' });
            GameUI._press(b, fn);
            return b;
        };
        const play = btn('big green ts-play', 'play', 'menu.play', () => this.play());
        const row = E('div', { class: 'ts-row' },
            btn('blue', 'settings', 'menu.settings', () => this.openSettings()),
            this.recordsAvailable() ? btn('orange', 'trophy', 'menu.records', () => this.openRecords()) : null,
            btn('pink', 'w-question', 'menu.howto', () => this.play({ tutorial: true })));
        const el = E('div', { class: 'ts' }, logo, E('div', { class: 'ts-bottom' }, play, row));
        this.titleEl = el;
        if (GameUI.root) { GameUI.root.appendChild(el); GameUI.root.classList.add('title-open'); }
        this.titleOpen = true;
        this.holdGameplay = true;
        if (!this._titleLock) { this._titleLock = true; GameUI.lock++; }
        this._initCine();
        this._applyMusic();
        Game.events.emit('menu:title', { open: true });
    },

    /** «Играть»: титульный экран уходит, игровой процесс начинается. opts.tutorial — сразу пройти обучение заново. */
    play(opts = {}) {
        if (!this.titleOpen) return;
        this.titleOpen = false;
        if (this._titleLock) { this._titleLock = false; GameUI.lock = Math.max(0, GameUI.lock - 1); }
        if (this._ownsCine && typeof Player !== 'undefined' && Player.cine === this._cine) Player.cine = null;
        this._cine = null; this._ownsCine = false;
        const el = this.titleEl;
        this.titleEl = null;
        if (GameUI.root) GameUI.root.classList.remove('title-open');
        if (el) { el.classList.add('out'); setTimeout(() => el.remove(), 420); }
        this.holdGameplay = false;
        if (typeof Platform !== 'undefined') Platform.gameplay(true);
        this._applyMusic();
        GameUI.sfx('click', { volume: 0.5 });
        Game.events.emit('menu:title', { open: false });
        Game.events.emit('title:play', { tutorial: !!opts.tutorial });
        if (typeof Tutorial !== 'undefined') {
            if (opts.tutorial) Tutorial.start({ replay: true });
            else Tutorial.autoStart();
        }
    },

    // Камера облёта: вокруг игрока, плавный вход и выход (Player.cine).
    _initCine() {
        if (typeof Player === 'undefined' || !Player.ready) return;
        const c = menuCfg();
        const h = GameWorld.groundH(Player.x, Player.y);
        this._cine = { x: Player.x, y: Player.y, h: h + c.camLook, dist: c.camDist, az: Player.camAz + Math.PI * 0.85, pitch: c.camPitch };
        Player.cine = this._cine;
        this._ownsCine = true;
    },

    _orbit(dt) {
        if (typeof Player === 'undefined' || !Player.ready) return;
        if (!this._cine) { this._initCine(); return; }
        const c = this._cine, cfg = menuCfg();
        c.az += cfg.orbitDeg * Math.PI / 180 * dt;
        c.x = Player.x; c.y = Player.y;
        c.h = GameWorld.groundH(Player.x, Player.y) + cfg.camLook;
        if (Player.cine !== c) Player.cine = c;
    },

    // =============================================================================================
    // Клавиши и Esc
    // =============================================================================================
    _bindKeys() {
        if (this._bound) return;
        this._bound = true;
        window.addEventListener('keydown', (e) => {
            if (!this.titleOpen || e.repeat || GameUtil.isField(e.target) || Pause.has('platform')) return;
            if (GameUI.panel || GameUI.modals.length) return;
            if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { e.preventDefault(); this.play(); }
        });
    },

    /** GameUI зовёт на Esc и P: true — клавиша обработана здесь (пауза платформы, титульный экран). */
    onEscape(code) {
        if (this.platformPaused || (typeof Pause !== 'undefined' && Pause.has('platform'))) return true;
        if (this.titleOpen && !GameUI.panel && GameUI.modals.length === 0) return true;
        return false;
    },

    // =============================================================================================
    // Меню паузы (Esc, P, кнопка паузы): панель с четырьмя пунктами
    // =============================================================================================
    showPause() {
        if (this._pauseRec) return;
        this._pauseRec = GameUI.openPanel({
            id: 'pause', title: Lang.t('pause.title'), width: 'min(calc(var(--u)*500),100%)', cls: 'mn-body',
            onClose: () => { this._pauseRec = null; if (GameUI.paused) GameUI.setPaused(false); },
            build: (el, rec) => this._pauseMain(el, rec),
        });
    },

    hidePause() {
        if (this._pauseRec) GameUI.closePanel('pause');
    },

    _menuButton(cls, icon, key, fn) {
        const b = GameUtil.el('button', { class: 'gb ' + cls, type: 'button', html: GameUI.icon(icon) + '<span>' + GameUtil.esc(Lang.t(key)) + '</span>' });
        GameUI._press(b, fn);
        return b;
    },

    _pauseMain(el, rec) {
        GameUtil.clear(el);
        rec.setTitle(Lang.t('pause.title'));
        const list = GameUtil.el('div', { class: 'mn-list' },
            this._menuButton('big green', 'play', 'menu.continue', () => GameUI.setPaused(false)),
            this._menuButton('blue', 'settings', 'menu.settings', () => this._pausePage(rec, 'settings')),
            this._menuButton('pink', 'w-question', 'menu.howto', () => {
                GameUI.setPaused(false);
                if (typeof Tutorial !== 'undefined') Tutorial.start({ replay: true });
            }),
            this.recordsAvailable() ? this._menuButton('orange', 'trophy', 'menu.records', () => this._pausePage(rec, 'records')) : null);
        el.appendChild(list);
    },

    _pausePage(rec, page) {
        const back = () => this._pauseMain(rec.el, rec);
        GameUtil.clear(rec.el);
        if (page === 'settings') { rec.setTitle(Lang.t('menu.settings')); this.buildSettings(rec.el, rec, back); }
        else { rec.setTitle(Lang.t('records.title')); this.buildRecords(rec.el, rec, back); }
        rec.el.scrollTop = 0;
    },

    // Панели с титульного экрана: титульный экран на это время скрыт (не рисуется под панелью).
    _openFromTitle(id, title, build) {
        const el = this.titleEl;
        if (el) el.classList.add('hidden');
        GameUI.openPanel({
            id, title, cls: 'mn-body', width: 'min(calc(var(--u)*560),100%)',
            onClose: () => { if (this.titleEl) this.titleEl.classList.remove('hidden'); },
            build: (body, rec) => build(body, rec),
        });
    },
    openSettings() { this._openFromTitle('settings', Lang.t('menu.settings'), (el, rec) => this.buildSettings(el, rec, null)); },
    openRecords() { this._openFromTitle('records', Lang.t('records.title'), (el, rec) => this.buildRecords(el, rec, null)); },

    _backButton(back) {
        if (!back) return null;
        const b = GameUtil.el('button', { class: 'gb orange', type: 'button', html: GameUI.icon('w-arrow-left') + '<span>' + GameUtil.esc(Lang.t('menu.back')) + '</span>' });
        GameUI._press(b, back);
        return GameUtil.el('div', { class: 'mn-back' }, b);
    },

    // =============================================================================================
    // Настройки
    // =============================================================================================
    /**
     * Страница настроек: звуковые эффекты, музыка (вкл/выкл), графика Авто / Низкая / Средняя / Высокая.
     * back — функция кнопки «Назад» (в паузе) или null (панель с титульного экрана закрывается крестиком).
     */
    _toggleOn(key) { return key === 'sfx' ? this.sfxOn() : key === 'music' ? this.musicOn() : this.outlineOn(); },

    buildSettings(el, rec, back) {
        const E = GameUtil.el;
        const toggle = (key, iconOn, iconOff, labelKey) => {
            const btn = E('button', { class: 'gb small mn-tg', type: 'button' });
            const render = () => {
                const on = this._toggleOn(key);
                btn.className = 'gb small mn-tg ' + (on ? 'green' : 'red');
                btn.innerHTML = GameUI.icon(on ? iconOn : iconOff) + '<span>' + GameUtil.esc(Lang.t(on ? 'settings.on' : 'settings.off')) + '</span>';
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            };
            GameUI._press(btn, () => {
                const on = this._toggleOn(key);
                this.setSetting(key, key === 'outline' ? !on : (on ? 0 : 1));
                render();
                if (key === 'sfx') GameUI.sfx('click', { volume: 0.6 });
            }, true);
            render();
            return E('div', { class: 'mn-row' }, E('span', { class: 'grow', text: Lang.t(labelKey) }), btn);
        };
        el.appendChild(toggle('sfx', 'w-sound-on', 'w-sound-off', 'settings.sfx'));
        el.appendChild(toggle('music', 'w-music', 'w-music-off', 'settings.music'));
        el.appendChild(toggle('outline', 'w-check', 'w-cross', 'settings.outline'));
        // графика: четыре кнопки, выбранная — зелёная
        const seg = E('div', { class: 'mn-seg' });
        const btns = {};
        const paint = () => {
            const cur = this.settings().quality;
            for (const q of Object.keys(btns)) btns[q].className = 'gb small ' + (q === cur ? 'green' : 'wood-b');
        };
        for (const q of ['auto', 'low', 'medium', 'high']) {
            const b = E('button', { class: 'gb small', type: 'button', text: Lang.t('quality.' + q) });
            btns[q] = b;
            GameUI._press(b, () => { this.setQuality(q); paint(); note.style.display = ''; });
            seg.appendChild(b);
        }
        const note = E('div', { class: 'mn-note', text: Lang.t('settings.qualityNote') });
        note.style.display = this.qualityChanged ? '' : 'none';
        paint();
        el.appendChild(E('div', { class: 'mn-row' }, E('span', { class: 'grow', text: Lang.t('settings.quality') }), seg));
        el.appendChild(note);
        const bk = this._backButton(back);
        if (bk) el.appendChild(bk);
    },

    // =============================================================================================
    // Рекорды
    // =============================================================================================
    /** Таблица рекордов есть: Яндекс (лидерборд Score) и Playgama с in_game таблицей. Playables показывает рекорд сам. */
    recordsAvailable() {
        if (typeof Platform === 'undefined') return false;
        if (Platform.name === 'yandex') return true;
        if (Platform.name === 'playgama') {
            try { return !!(Platform.sdk && Platform.sdk.leaderboards && Platform.sdk.leaderboards.type === 'in_game'); } catch (e) { return false; }
        }
        return false;
    },

    /** Игрок Яндекса вошёл в аккаунт (иначе — лёгкий профиль без имени и аватара). */
    isAuthorized() {
        const p = typeof Platform !== 'undefined' ? Platform.player : null;
        if (!p) return Platform.name !== 'yandex';
        try {
            if (typeof p.getMode === 'function') return p.getMode() !== 'lite';
            if (typeof p.isAuthorized === 'function') return !!p.isAuthorized();
        } catch (e) { /* считаем гостем */ }
        return false;
    },

    /**
     * Данные таблицы: { status: 'ok' | 'empty' | 'error', rows: [{ rank, name, score, avatar, me }], authorized }.
     * Яндекс — запрос со значком игрока (Platform.leaderboard отдаёт без аватаров); кэш RECORDS_CACHE_SECONDS: лимит запросов.
     */
    async fetchRecords(force) {
        const cfg = menuCfg();
        if (!force && this._rec && Date.now() - this._rec.t < cfg.recordsCache * 1000) return this._rec.data;
        const authorized = this.isAuthorized();
        let rows = null;
        const P = Platform;
        if (P.name === 'yandex' && P.sdk) {
            try {
                const lb = P.sdk.leaderboards;
                const o = { quantityTop: 10, includeUser: authorized, quantityAround: 3 };
                const res = lb && lb.getEntries ? await lb.getEntries(P.LEADERBOARD, o) : await (await P.sdk.getLeaderboards()).getLeaderboardEntries(P.LEADERBOARD, o);
                let myId = '';
                try { myId = P.player ? P.player.getUniqueID() : ''; } catch (e) { /* гость */ }
                rows = (res.entries || []).map((e) => {
                    const pl = e.player || {};
                    let avatar = '';
                    try { avatar = typeof pl.getAvatarSrc === 'function' ? pl.getAvatarSrc('small') : ''; } catch (err) { avatar = ''; }
                    return { rank: e.rank, score: e.score, name: pl.publicName || '', avatar: avatar || '', me: !!(myId && pl.uniqueID === myId) };
                });
            } catch (e) { rows = null; }
        }
        if (!rows) {
            const list = await P.leaderboard();
            if (list) rows = list.map((r) => ({ rank: r.rank, score: r.score, name: r.name || '', avatar: r.avatar || '', me: !!r.me }));
        }
        const data = rows ? { status: rows.length ? 'ok' : 'empty', rows, authorized } : { status: 'error', rows: [], authorized };
        if (data.status !== 'error') this._rec = { t: Date.now(), data };
        return data;
    },

    /** Вход в аккаунт Яндекса. После входа прогресс аккаунта подтягивается перезагрузкой (запись на время закрыта: облако не затереть). */
    async signIn() {
        const sdk = typeof Platform !== 'undefined' ? Platform.sdk : null;
        if (!sdk || !sdk.auth || typeof sdk.auth.openAuthDialog !== 'function') return false;
        try {
            await sdk.auth.openAuthDialog();
            Platform.player = await sdk.getPlayer({ scopes: false });
        } catch (e) { return false; }
        if (!this.isAuthorized()) return false;
        GameState.readOnly = true;
        this._rec = null;
        try { location.reload(); } catch (e) { /* без перезагрузки: запись остаётся закрытой */ }
        return true;
    },

    /** Страница «Рекорды»: строки с аватаром и ником; пустая таблица, ошибка с повтором, вход в аккаунт для гостя. */
    buildRecords(el, rec, back) {
        const E = GameUtil.el;
        const box = E('div', { class: 'mn-rec' });
        el.appendChild(box);
        const bk = this._backButton(back);
        if (bk) el.appendChild(bk);
        let gone = false;
        const closeHook = rec && rec.onClose;
        if (rec) rec.onClose = () => { gone = true; if (closeHook) closeHook(); };
        const msg = (text, extra) => {
            GameUtil.clear(box);
            const m = E('div', { class: 'mn-msg', text });
            if (extra) m.appendChild(extra);
            box.appendChild(m);
        };
        const load = async (force) => {
            msg(Lang.t('loading'));
            const data = await this.fetchRecords(force);
            if (gone || !box.isConnected) return;
            GameUtil.clear(box);
            box.appendChild(E('div', { class: 'hd', text: Lang.t('records.top') }));
            if (data.status === 'error') {
                const retry = E('button', { class: 'gb orange', type: 'button', text: Lang.t('loadingRetry') });
                GameUI._press(retry, () => load(true));
                msg(Lang.t('records.error'), retry);
            } else if (data.status === 'empty') {
                box.appendChild(E('div', { class: 'mn-msg', text: Lang.t('records.empty') }));
            } else {
                data.rows.forEach((r) => box.appendChild(this._recordRow(r)));
            }
            if (!data.authorized && Platform.name === 'yandex') {
                const b = E('button', { class: 'gb green', type: 'button', text: Lang.t('records.signin') });
                const btn = /** @type {HTMLButtonElement} */ (b);
                GameUI._press(btn, async () => { btn.disabled = true; const ok = await this.signIn(); if (!ok) btn.disabled = false; });
                box.appendChild(E('div', { class: 'mn-back' }, b));
            }
        };
        load(false);
    },

    _recordRow(r) {
        const E = GameUtil.el;
        const name = r.name || Lang.t('records.player');
        const ph = () => E('span', { class: 'mn-av', html: GameUI.icon('paw') });
        let av;
        if (r.avatar) {
            av = E('img', { class: 'mn-av', src: r.avatar, alt: '', referrerpolicy: 'no-referrer' });
            av.addEventListener('error', () => { if (av.parentNode) av.replaceWith(ph()); });
        } else av = ph();
        return E('div', { class: 'mn-rr' + (r.me ? ' me' : '') },
            E('span', { class: 'rk r' + r.rank, text: String(r.rank) }), av,
            E('span', { class: 'nm', text: name + (r.me ? ' (' + Lang.t('records.you') + ')' : '') }),
            E('span', { class: 'sc', text: GameUtil.fmtMoney(r.score) }));
    },

    // =============================================================================================
    // Пауза платформы: оверлей «Пауза» без кнопки продолжения, весь ввод заблокирован
    // =============================================================================================
    _bindPlatformPause() {
        if (typeof Pause === 'undefined') return;
        // Блок ввода: перехват на документе до обработчиков игры, HUD и меню (Esc не глушим preventDefault — требование Playables).
        const block = (e) => {
            if (!Pause.has('platform')) return;
            if (e.type === 'keydown' || e.type === 'keyup') { if (e.key !== 'Escape' && e.code !== 'Escape') e.preventDefault(); }
            else if (e.cancelable) e.preventDefault();
            e.stopImmediatePropagation();
        };
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click', 'dblclick', 'keydown', 'keyup', 'wheel', 'touchstart', 'touchmove', 'touchend']) {
            document.addEventListener(type, block, { capture: true, passive: false });
        }
        Pause.onChange(() => this._syncPlatformPause());
        this._syncPlatformPause();
    },

    // Оверлей виден, пока платформа держит паузу (реклама — отдельная причина 'ad', у неё свой экран).
    _syncPlatformPause() {
        const on = Pause.has('platform') && !Pause.has('ad');
        this.platformPaused = Pause.has('platform');
        if (on && !this._ppEl) {
            const el = GameUtil.el('div', { class: 'plat-pause', role: 'status', 'aria-live': 'polite' }, GameUtil.el('div', { class: 'pp-sign', text: Lang.t('pause.title') }));
            this._ppEl = el;
            document.body.appendChild(el);
        } else if (!on && this._ppEl) {
            this._ppEl.remove();
            this._ppEl = null;
        }
    },
};

// Обёртки Sound и Platform ставятся при загрузке файла — раньше init любого модуля, чтобы увидеть все вызовы Sound.music.
(function installMenuHooks() {
    const S = /** @type {any} */ (typeof Sound !== 'undefined' ? Sound : null);
    if (S && !S._menusPatched) {
        S._menusPatched = true;
        const play = S.play.bind(S);
        Menus._origMusic = S.music.bind(S);
        S.play = (url, opts) => (Menus.sfxOn() ? play(url, opts) : null);
        S.music = (url, opts) => {
            Menus._wanted = url ? { url, opts } : null;
            Menus._wantedSet = true;
            Menus._applyMusic();
        };
    }
    const P = /** @type {any} */ (typeof Platform !== 'undefined' ? Platform : null);
    if (P && !P._menusPatched) {
        P._menusPatched = true;
        const gameplay = P.gameplay.bind(P);
        // Игровой процесс не начинается, пока открыт титульный экран (Game.ready зовёт gameplay(true) сразу после готовности).
        P.gameplay = (on) => gameplay(!!on && !Menus.holdGameplay);
    }
})();

Game.register(Menus);
