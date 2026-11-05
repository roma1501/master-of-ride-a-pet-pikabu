// Platform.js — платформа игры: Яндекс Игры (YaGames), YouTube Playables (ytgame),
// Playgama (Bridge SDK: глобал bridge) или локальный запуск. Игра зовёт только Platform —
// SDK знает этот файл.
// SDK подключает сборка: build.bat yandex вписывает в index.html скрипт /sdk.js,
// build.bat playables — SDK Playables первым скриптом, build.bat playgama — Bridge первым
// скриптом (и playgama-bridge-config.json рядом с index.html). Без SDK (run.bat, web-сборка)
// работает локальный адаптер: сохранения — в Store, реклама — ничего (с ?mockads в
// адресе — заглушка-оверлей на секунду: проверить паузу, звук и выдачу награды).
//
// Playgama (name 'playgama'): bridge.initialize(), язык bridge.platform.language (запасной
// en), события паузы и звука платформы (пауза 'platform', Sound.setPlatformMuted), game_ready
// один раз, interstitial и rewarded через bridge.advertisement (награда — ТОЛЬКО по состоянию
// rewarded), сохранение одним ключом через bridge.storage (без localStorage, один set за раз, без
// повтора тех же данных; ошибка загрузки блокирует запись, как в Playables), рекорд —
// bridge.leaderboards.setScore, таблица — только
// при leaderboards.type = in_game. Bridge внутри сам работает на любой платформе-хозяине
// (Playgama, Яндекс, и др.) — игра видит один адаптер.
//
//   await Platform.init()        SDK, язык платформы, события паузы (main.js)
//   Platform.firstFrame()        экран загрузки на экране (Playables firstFrameReady; main.js)
//   Platform.ready()             игра готова к вводу: Яндекс LoadingAPI.ready, Playables gameReady (main.js)
//   Platform.gameplay(on)        идёт ли игровой процесс (Яндекс GameplayAPI start/stop);
//                                на паузе (Pause.js) движок сам шлёт stop, после — start
//   Platform.rewardedSupported() / interstitialSupported()  показывать ли кнопки рекламы (SDK умеет формат)
//   Platform.ads.roundEnded()    раунд завершён (победа или поражение) — ОДИН раз на раунд
//   Platform.ads.next(go)        переход по кнопке «Далее/Заново/Меню»: после двух
//                                результатов сначала interstitial, потом go(); защита от двойного клика
//   await Platform.rewarded(id)  true — ТОЛЬКО если SDK подтвердил просмотр
//   Platform.submitScore(n)      рекорд: Яндекс и Playgama — лидерборд 'Score' (не чаще раза в секунду), Playables — sendScore
//   await Platform.leaderboard() [{ rank, name, score, me }] или null (Яндекс, Playgama in_game)
//   await Platform.load()        сохранение игры (объект) или null
//   await Platform.save(obj)     записать сохранение (Яндекс — облако игрока + Store, Playables — saveData, Playgama — bridge.storage)
// На время рекламы игра и звук стоят (Pause 'ad'), после — прежнее состояние.

/** @satisfies {Record<string, any>} */
const Platform = {
    name: 'local',        // 'yandex' | 'playables' | 'playgama' | 'local'
    sdk: null,            // объект SDK Яндекса (ysdk) или Bridge Playgama (bridge)
    hostId: null,         // Playgama: id платформы-хозяина по Bridge (playgama, yandex, …)
    lang: null,           // язык платформы (BCP-47) или null
    player: null,         // игрок Яндекса
    LEADERBOARD: 'Score', // технический id лидерборда Яндекса и Playgama (в интерфейсе — «Рекорды»)
    SAVE_KEY: 'save',     // ключ bridge.storage: вся игра одним значением
    _pgWait: null,        // Playgama: ожидаемая реклама { kind, onState }
    _readySent: false,
    _firstFrameSent: false,
    _playing: false,
    _gameplaySent: false, // последнее, что ушло в GameplayAPI: stop без start не шлётся
    _adBusy: false,
    _loaded: null,        // Promise первого load() — Playables: saveData только после loadData
    _scoreAt: 0,
    _scoreTimer: 0,
    _scorePending: null,

    async init() {
        try {
            if (typeof YaGames !== 'undefined') await this._initYandex();
            else if (typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV) await this._initPlayables();
            else if (typeof bridge !== 'undefined' && bridge && typeof bridge.initialize === 'function') await this._initPlaygama();
        } catch (e) {
            // В Playables нельзя незаметно перейти на локальные сохранения или
            // потерять обязательные SDK-события. Загрузка покажет ошибку/повтор.
            if (typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV) throw e;
            console.warn('Platform: SDK не поднялся, играем локально — ' + ((e && e.message) || e));
            this.name = 'local';
            this.sdk = null;
        }
        Pause.onChange(() => this._syncGameplay());
        console.log('Platform: ' + this.name + (this.lang ? ', язык платформы ' + this.lang : ''));
        return this;
    },

    async _initYandex() {
        let timer = 0;
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('YaGames.init timeout')), 8000); });
        try { this.sdk = await Promise.race([YaGames.init(), timeout]); } finally { clearTimeout(timer); }
        this.name = 'yandex';
        try { this.lang = this.sdk.environment.i18n.lang || null; } catch (e) { /* язык по умолчанию */ }
        if (typeof this.sdk.on === 'function') {
            this.sdk.on('game_api_pause', () => Pause.set('platform', true));
            this.sdk.on('game_api_resume', () => Pause.set('platform', false));
        }
        try { this.player = await this.sdk.getPlayer({ scopes: false }); } catch (e) { this.player = null; }
    },

    async _initPlayables() {
        this.name = 'playables';
        const sys = ytgame.system;
        sys.onPause(() => Pause.set('platform', true));
        sys.onResume(() => Pause.set('platform', false));
        sys.onAudioEnabledChange((on) => Sound.setPlatformMuted(!on));
        Sound.setPlatformMuted(!sys.isAudioEnabled());
        try { this.lang = await sys.getLanguage(); } catch (e) { this.lang = null; }
    },

    // Playgama Bridge: initialize -> язык, пауза и звук платформы, события рекламы. Без
    // успешного initialize ни одного вызова bridge.* — при ошибке играем локально (init ловит).
    async _initPlaygama() {
        let timer = 0;
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('bridge.initialize timeout')), 10000); });
        try { await Promise.race([bridge.initialize(), timeout]); } finally { clearTimeout(timer); }
        this.name = 'playgama';
        this.sdk = bridge;
        const p = bridge.platform, ev = bridge.EVENT_NAME || {};
        try { this.hostId = p.id || null; } catch (e) { /* без id */ }
        let lang = null;
        try { lang = p.language; } catch (e) { /* язык по умолчанию */ }
        this.lang = (typeof lang === 'string' && lang) ? lang.toLowerCase() : 'en';
        // Пауза и звук приходят от платформы на всё: вкладка, окно, реклама. Подписаться ДО
        // чтения начального состояния; начальный звук событием не придёт — применить руками.
        p.on(ev.PAUSE_STATE_CHANGED || 'pause_state_changed', (paused) => { this._pgBridgePaused = !!paused; Pause.set('platform', !!paused); });
        p.on(ev.AUDIO_STATE_CHANGED || 'audio_state_changed', (on) => Sound.setPlatformMuted(!on));
        Sound.setPlatformMuted(p.isAudioEnabled === false);
        const adv = bridge.advertisement;
        if (adv && typeof adv.on === 'function') {
            adv.on(ev.INTERSTITIAL_STATE_CHANGED || 'interstitial_state_changed', (st) => this._pgAdState('interstitial', st));
            adv.on(ev.REWARDED_STATE_CHANGED || 'rewarded_state_changed', (st) => this._pgAdState('rewarded', st));
            if (adv.interstitialState === 'opened' || adv.rewardedState === 'opened') Pause.set('platform', true);
        }
        this._pgWakeOn();
    },

    // Playgama: Bridge ставит паузу на blur окна и снимает её только на focus. Клик по канвасу фокус iframe не
    // возвращает (pointerdown игры с preventDefault глушит mousedown), и игра стояла бы с замёрзшим кадром.
    // На жесте игрока окно забирает фокус само; если Bridge и после этого держит паузу без рекламы, а вкладка
    // видна и в фокусе — пауза снимается у нас (blur и скрытая вкладка дальше ставят свою паузу 'auto', Pause.js).
    _pgBridgePaused: false,
    _pgWakeTimer: 0,
    _pgWakeOn() {
        if (typeof window === 'undefined' || typeof document === 'undefined' || typeof window.addEventListener !== 'function') return;
        const check = (ms) => {
            clearTimeout(this._pgWakeTimer);
            if (!this._pgBridgePaused) return;
            this._pgWakeTimer = setTimeout(() => {
                if (!this._pgBridgePaused || document.hidden || !document.hasFocus() || this._pgAdOpen()) return;
                this._pgBridgePaused = false;
                Pause.set('platform', false);
            }, ms);
        };
        const gesture = () => {
            if (!document.hasFocus()) { try { window.focus(); } catch (e) { /* фокус не отдали */ } }
            check(300);
        };
        for (const type of ['pointerdown', 'touchstart', 'keydown']) window.addEventListener(type, gesture, { capture: true, passive: true });
        window.addEventListener('focus', () => check(600));
        document.addEventListener('visibilitychange', () => { if (!document.hidden) check(600); });
    },

    // Playgama: идёт реклама (ждём её состояний или Bridge говорит, что она открыта).
    _pgAdOpen() {
        const adv = this.sdk && this.sdk.advertisement;
        return !!this._pgWait || !!(adv && (adv.interstitialState === 'opened' || adv.rewardedState === 'opened' || adv.rewardedState === 'rewarded'));
    },

    // --- Жизненный цикл -------------------------------------------------------

    firstFrame() {
        if (!this._firstFrameSent && typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV) {
            ytgame.game.firstFrameReady();
            this._firstFrameSent = true;
        }
    },

    ready() {
        if (this._readySent) return;
        try {
            if (this.name === 'yandex') this.sdk.features.LoadingAPI && this.sdk.features.LoadingAPI.ready();
            else if (this.name === 'playables') {
                this.firstFrame();
                ytgame.game.gameReady();
            } else if (this.name === 'playgama') this._pgMessage('game_ready');
            this._readySent = true;
        } catch (e) {
            if (this.name === 'playables') throw e;
            console.warn('Platform.ready:', e);
        }
    },

    // on — игрок в игровом процессе (раунд идёт). Меню, экран результата, пауза — false.
    gameplay(on) {
        this._playing = !!on;
        this._syncGameplay();
    },

    _syncGameplay() {
        const want = this._playing && !Pause.active;
        if (this._gameplaySent === want) return;
        this._gameplaySent = want;
        try {
            if (this.name === 'yandex') {
                const api = this.sdk.features.GameplayAPI;
                if (api) { if (want) api.start(); else api.stop(); }
            } else if (this.name === 'playgama') {
                // level_started — раунд пошёл; level_paused / level_resumed — пауза платформы, меню или
                // реклама внутри раунда. Конец раунда (stop без паузы) сообщения не шлёт: итог игра не отдаёт.
                if (want) this._pgMessage(this._pgPaused ? 'level_resumed' : 'level_started');
                else if (this._playing) this._pgMessage('level_paused');
                this._pgPaused = !want && this._playing;
            }
        } catch (e) { /* SDK без GameplayAPI */ }
    },

    _pgPaused: false,     // Playgama: gameplay остановлен паузой посреди раунда

    // Сообщение платформе Bridge (game_ready, level_started…); ошибка не роняет игру.
    _pgMessage(name) {
        const p = this.sdk && this.sdk.platform;
        if (p && typeof p.sendMessage === 'function') p.sendMessage(name);
    },

    // --- Реклама ----------------------------------------------------------------

    // Interstitial. true — запрос успешен (Playables НЕ подтверждает факт показа).
    // Яндекс возвращает shown. Ошибка/нет API — false, переход всё равно продолжается.
    async interstitial() {
        if (this._adBusy) return false;
        this._adBusy = true;
        Pause.set('ad', true);
        try {
            if (this.name === 'yandex') {
                return await new Promise((resolve) => this.sdk.adv.showFullscreenAdv({ callbacks: {
                    onClose: (shown) => resolve(!!shown),
                    onError: () => resolve(false),
                    onOffline: () => resolve(false),
                } }));
            }
            if (this.name === 'playables') {
                if (!ytgame.ads || !ytgame.ads.requestInterstitialAd) return false;
                await ytgame.ads.requestInterstitialAd();
                return true;
            }
            if (this.name === 'playgama') return await this._pgAd('interstitial');
            return await this._mockAd(false);
        } catch (e) {
            return false;
        } finally {
            Pause.set('ad', false);
            this._adBusy = false;
        }
    },

    // Rewarded. id — стабильный id награды без данных игрока ('continue', 'coins-x2').
    // true — ТОЛЬКО по подтверждению SDK; закрытие и ошибка — false. Награду выдаёт
    // игра по true и один раз.
    async rewarded(id) {
        if (this._adBusy) return false;
        this._adBusy = true;
        Pause.set('ad', true);
        try {
            if (this.name === 'yandex') {
                return await new Promise((resolve) => {
                    let got = false;
                    this.sdk.adv.showRewardedVideo({ callbacks: {
                        onRewarded: () => { got = true; },
                        onClose: () => resolve(got),
                        onError: () => resolve(false),
                    } });
                });
            }
            if (this.name === 'playables') {
                if (!ytgame.ads || !ytgame.ads.requestRewardedAd) return false;
                return (await ytgame.ads.requestRewardedAd(String(id || 'reward'))) === true;
            }
            if (this.name === 'playgama') return await this._pgAd('rewarded');
            return await this._mockAd(true);
        } catch (e) {
            return false;
        } finally {
            Pause.set('ad', false);
            this._adBusy = false;
        }
    },

    // Показывать ли кнопки рекламы: SDK платформы умеет формат (иначе предложение прячут).
    rewardedSupported() {
        if (this.name === 'playgama') return !!(this.sdk.advertisement && this.sdk.advertisement.isRewardedSupported);
        if (this.name === 'playables') return !!(typeof ytgame !== 'undefined' && ytgame.ads && ytgame.ads.requestRewardedAd);
        return true;
    },

    // Событие игры в аналитику платформы: Playgama — bridge.analytics.send (Bridge 2.3+), остальные — ничего.
    // name — стабильное snake_case; data — плоский объект строк, чисел и логических значений (без личных данных).
    analytics(name, data) {
        if (this.name !== 'playgama' || !this.sdk || !this.sdk.analytics || typeof this.sdk.analytics.send !== 'function') return;
        try { this.sdk.analytics.send(String(name), data || undefined); } catch (e) { /* аналитика не мешает игре */ }
    },

    interstitialSupported() {
        if (this.name === 'playgama') return !!(this.sdk.advertisement && this.sdk.advertisement.isInterstitialSupported);
        if (this.name === 'playables') return !!(typeof ytgame !== 'undefined' && ytgame.ads && ytgame.ads.requestInterstitialAd);
        return true;
    },

    // Playgama: реклама Bridge — запрос, затем состояния (loading, opened, closed, rewarded, failed)
    // событиями. interstitial: true — реклама открылась и закрылась; rewarded: true — ТОЛЬКО если
    // было состояние rewarded (закрытие и ошибка — false). Нет ответа дольше 15 с (до opened) или
    // 3 мин (после) — false; награда после rewarded не ждёт закрытия дольше 4 с.
    _pgAd(kind) {
        const adv = this.sdk.advertisement;
        const supported = kind === 'rewarded' ? adv && adv.isRewardedSupported : adv && adv.isInterstitialSupported;
        if (!supported) return Promise.resolve(false);
        return new Promise((resolve) => {
            let opened = false, got = false, done = false, timer = 0;
            const finish = (ok) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (this._pgWait === wait) this._pgWait = null;
                resolve(!!ok);
            };
            const arm = (ms, ok) => { clearTimeout(timer); timer = setTimeout(() => finish(ok()), ms); };
            const wait = {
                kind,
                onState: (state) => {
                    if (state === 'opened') { opened = true; arm(180000, () => got); }
                    else if (state === 'rewarded') { got = true; arm(4000, () => true); }
                    else if (state === 'closed') finish(kind === 'rewarded' ? got : opened);
                    else if (state === 'failed') finish(kind === 'rewarded' ? got : false);
                },
            };
            this._pgWait = wait;
            arm(15000, () => false);
            try {
                const r = kind === 'rewarded' ? adv.showRewarded() : adv.showInterstitial();
                if (r && typeof r.catch === 'function') r.catch(() => finish(kind === 'rewarded' ? got : false));
            } catch (e) {
                finish(false);
            }
        });
    },

    _pgAdState(kind, state) {
        if (this._pgWait && this._pgWait.kind === kind) this._pgWait.onState(state);
    },

    // Локальная заглушка рекламы: только с ?mockads в адресе — оверлей на секунду,
    // rewarded засчитывается. Без флага — рекламы нет (false).
    _mockAd(reward) {
        if (!/[?&#]mockads\b/.test(location.search + location.hash)) return Promise.resolve(false);
        return new Promise((resolve) => {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
                'background:rgba(0,0,0,.85);color:#fff;font:bold 22px system-ui,sans-serif;text-align:center';
            el.textContent = (reward ? 'REWARDED' : 'INTERSTITIAL') + ' — local mock';
            document.body.appendChild(el);
            setTimeout(() => { el.remove(); resolve(true); }, 1000);
        });
    },

    // Счётчик interstitial по правилу игры: реклама — после каждых ДВУХ завершённых
    // раундов (любой исход), и только по кнопке перехода, не в момент результата.
    ads: {
        results: 0,
        busy: false,

        // Раунд завершён (победа или поражение) — звать ОДИН раз на раунд.
        roundEnded() { this.results++; },

        // Переход по кнопке: после двух результатов — сначала реклама, затем go().
        // Повторный клик, пока идёт переход, игнорируется. Реклама не пришла или
        // ошибка — переход без задержки, новый цикл из двух результатов.
        async next(go) {
            if (this.busy) return;
            this.busy = true;
            try {
                if (this.results >= 2) {
                    this.results = 0;
                    await Platform.interstitial();
                }
                if (go) await go();
            } finally {
                this.busy = false;
            }
        },
    },

    // --- Рекорды -------------------------------------------------------------------

    // Рекорд игрока. Яндекс: лидерборд 'Score', не чаще раза в секунду (лишнее — последним
    // значением через секунду). Playables: sendScore.
    submitScore(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return;
        const v = Math.max(0, Math.floor(number));
        if (!Number.isSafeInteger(v)) return;
        if (this.name === 'playables') {
            try { ytgame.engagement.sendScore({ value: v }).catch(() => {}); } catch (e) { /* SDK старый */ }
            return;
        }
        if (this.name !== 'yandex' && this.name !== 'playgama') return;
        this._scorePending = v;
        const wait = this._scoreAt + 1100 - Date.now();
        if (wait > 0) {
            if (!this._scoreTimer) this._scoreTimer = setTimeout(() => { this._scoreTimer = 0; this.submitScore(this._scorePending); }, wait);
            return;
        }
        this._scoreAt = Date.now();
        this._scorePending = null;
        if (this.name === 'playgama') {
            const board = this.sdk.leaderboards;
            if (!board || board.type === 'not_available') return;   // на этой платформе рекордов нет
            try { Promise.resolve(board.setScore(this.LEADERBOARD, v)).catch((e) => console.warn('Platform.submitScore:', (e && e.message) || e)); } catch (e) { /* SDK старый */ }
            return;
        }
        const lb = this.sdk.leaderboards;
        const p = lb && lb.setScore ? lb.setScore(this.LEADERBOARD, v)
            : this.sdk.getLeaderboards().then((old) => old.setLeaderboardScore(this.LEADERBOARD, v));
        Promise.resolve(p).catch((e) => console.warn('Platform.submitScore:', (e && e.message) || e));
    },

    // Таблица рекордов (Яндекс): [{ rank, name, score, me }] или null — нет SDK,
    // нет лидерборда или ошибка. Лимит Яндекса — 20 запросов за 5 минут: кэшировать в игре.
    async leaderboard(opts) {
        if (this.name === 'playgama') {
            // Таблицу рисует игра только при in_game; native и native_popup показывает сама платформа.
            const board = this.sdk.leaderboards;
            if (!board || board.type !== 'in_game') return null;
            try {
                const entries = await board.getEntries(this.LEADERBOARD);
                let myId = '';
                try { myId = String((this.sdk.player && this.sdk.player.id) || ''); } catch (e) { /* аноним */ }
                return (entries || []).map((e) => ({
                    rank: e.rank, score: e.score, name: e.name || '',
                    me: !!(myId && e.id != null && String(e.id) === myId),
                }));
            } catch (e) {
                return null;
            }
        }
        if (this.name !== 'yandex') return null;
        const o = Object.assign({ quantityTop: 10, includeUser: true, quantityAround: 3 }, opts || {});
        try {
            const lb = this.sdk.leaderboards;
            const res = lb && lb.getEntries ? await lb.getEntries(this.LEADERBOARD, o)
                : await (await this.sdk.getLeaderboards()).getLeaderboardEntries(this.LEADERBOARD, o);
            let myId = '';
            try { myId = this.player ? this.player.getUniqueID() : ''; } catch (e) { /* аноним */ }
            return (res.entries || []).map((e) => ({
                rank: e.rank, score: e.score,
                name: (e.player && e.player.publicName) || '',
                me: !!(myId && e.player && e.player.uniqueID === myId),
            }));
        } catch (e) {
            return null;
        }
    },

    // --- Сохранения ------------------------------------------------------------------

    _storeKey() { return (typeof GAME_ID !== 'undefined' ? GAME_ID : 'lory-game') + '.save'; },

    // Сборка Playgama: прогресс — только через bridge.storage (требование модерации), localStorage не трогается.
    _sdkOnly() { return typeof GAME_PLATFORM !== 'undefined' && String(GAME_PLATFORM) === 'playgama'; },

    // Playgama: одна запись bridge.storage за раз. Пока идёт set, новые сохранения копятся — пишется только
    // последнее; те же данные, что уже записаны, повторно не пишутся. true — последние данные записаны.
    _pgQueued: null,
    _pgChain: null,
    _pgLastData: null,
    _pgSet(data) {
        this._pgQueued = data;
        if (!this._pgChain) {
            // цепочка снимается асинхронно; пришедшее за это время сохранение запускает следующую
            this._pgChain = this._pgDrain().then((ok) => {
                this._pgChain = null;
                return this._pgQueued != null ? this._pgSet(this._pgQueued) : ok;
            });
        }
        return this._pgChain;
    },

    async _pgDrain() {
        try {
            while (this._pgQueued != null) {
                const d = this._pgQueued;
                this._pgQueued = null;
                if (d === this._pgLastData) continue;
                await this.sdk.storage.set([this.SAVE_KEY], [d]);
                this._pgLastData = d;
            }
            return true;
        } catch (e) {
            console.warn('Platform.save:', (e && e.message) || e);
            return false;
        }
    },

    // Сохранение игры: объект или null.
    load() {
        if (!this._loaded) this._loaded = this._load().catch((error) => {
            this._loaded = null; // ошибка сети/данных не означает пустое сохранение; возможен повтор
            throw error;
        });
        return this._loaded;
    },

    async _load() {
        if (this.name === 'playables') {
            // Только SDK. Успешный loadData обязателен ДО saveData; ошибку нельзя
            // превращать в null и затем перезаписывать облако новой игрой.
            const raw = await ytgame.game.loadData();
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object') throw new Error('Invalid Playables save data');
            return data;
        }
        if (this.name === 'playgama') {
            // Только bridge.storage, один вызов на все ключи. Ошибку нельзя превращать в null:
            // следом save затёр бы облако пустой игрой — load отклоняется, save ждёт успешного повтора.
            const got = await this.sdk.storage.get([this.SAVE_KEY]);
            let raw = Array.isArray(got) ? got[0] : (got && typeof got === 'object' ? got[this.SAVE_KEY] : got);
            if (raw == null || raw === '') return null;
            if (typeof raw === 'string') { this._pgLastData = raw; raw = JSON.parse(raw); }
            if (!raw || typeof raw !== 'object') throw new Error('Invalid Playgama save data');
            return raw;
        }
        if (this._sdkOnly()) return null;   // сборка Playgama без Bridge: localStorage не трогаем
        const local = Store.getJSON(this._storeKey(), null);
        try {
            if (this.name === 'yandex' && this.player) {
                const data = await this.player.getData(['save']);
                if (data && data.save && typeof data.save === 'object') return data.save;
            }
        } catch (e) {
            console.warn('Platform.load:', (e && e.message) || e);
        }
        return local;
    },

    // Записать JSON. Playables и Playgama: только SDK, после УСПЕШНОГО load; без localStorage.
    // До начала новой игры нужно await Platform.load() и применить загруженный
    // прогресс; rejected load следует показать как ошибку с повтором.
    async save(obj) {
        try {
            const data = JSON.stringify(obj);
            if (typeof data !== 'string') return false;
            if (this.name === 'playables') {
                // Консервативная проверка обоих представлений: < 3 MiB (MUST).
                // JSON.stringify экранирует непарные суррогаты: строка well-formed UTF-16.
                const bytes = Math.max(data.length * 2, new TextEncoder().encode(data).byteLength);
                if (bytes >= 3 * 1024 * 1024) throw new Error('Playables save must be smaller than 3 MiB');
                await this.load();
                await ytgame.game.saveData(data);
            } else if (this.name === 'playgama') {
                await this.load();   // запись только после успешной загрузки (см. _load)
                return await this._pgSet(data);
            } else if (this._sdkOnly()) {
                return false;        // сборка Playgama без поднятого Bridge: только память, без localStorage
            } else {
                const stored = Store.set(this._storeKey(), data);
                if (this.name === 'yandex' && this.player) await this.player.setData({ save: obj }, true);
                else if (!stored) return false;
            }
            return true;
        } catch (e) {
            console.warn('Platform.save:', (e && e.message) || e);
            return false;
        }
    },
};
