// Weather.js — погодные события, молнии и мутации питомцев и яиц (вид мутаций — PetView.js: MutationFX).
//
// События (GameData.WEATHER): Гроза (thunder), Кровавая луна (bloodmoon, только ночью), Буря пустоты (voidstorm, редко),
// Северное сияние (aurora, редко, только ночью). Раз в WEATHER_RULES.gapMin…gapMax секунд на durMin…durMax секунд (первое —
// через WEATHER_FIRST_DELAY после запуска). Пока идёт событие, молния бьёт раз в strikeMin…strikeMax секунд по случайной цели:
// питомцы на ранчо игрока, яйца в гнёздах, питомец под седлом, питомцы NPC-ранчо (только вид). Удар с шансом
// WEATHER_MUTATION_CHANCE даёт мутацию события (GameData.MUTATIONS): сильнее (rank) заменяет слабее, у питомца и яйца одна;
// яйцо передаёт мутацию вылупившемуся питомцу (Eggs). Мутации сохраняются в питомцах и яйцах (GameState).
//
//   Weather.active          { id, left, total, strikeIn } | null          Weather.next — секунд до следующего события
//   Weather.start(id, sec)  Weather.end()  Weather.strike(kind?)          запуск и остановка вручную (отладка, тесты)
//   Weather.pick(night, rng)  Weather.gap(first, rng)  Weather.mutationFor(id, rng)   чистая логика расписания и выбора
//   Weather.upgrade(rec, mutId) -> bool        мутация записи питомца или яйца с учётом rank
//   Weather.tick(dt)        расписание и удары по игровому времени (на паузе не идёт)
// События (Game.events): weather { id, on }, mutation { target: 'pet' | 'egg', uid, mutation }.
// Вид: GameWorld.setWeatherLook (небо, туман, свет), дождь частицами у камеры, молния — ломаные ArcBatch (PetView.arcs),
// вспышка света (GameWorld.lightning) и экрана, гром с задержкой по расстоянию, значок погоды у часов, баннеры.

const WEATHER_UI = {
    thunder: { color: '#9fd0ff', icon: 'storm', bolt: [0.62, 0.8, 1], flash: '#cfe3ff', rain: true },
    bloodmoon: { color: '#ff6a5a', icon: 'moon', bolt: [1, 0.2, 0.15], flash: '#ff4a3a', ash: true },
    voidstorm: { color: '#c08cff', icon: 'skull', bolt: [0.7, 0.32, 1], flash: '#9a5aff', motes: true },
    aurora: { color: '#7dffd9', icon: 'star', bolt: [0.5, 1, 0.82], flash: '#8affea' },
};

Lang.add({
    ru: {
        'weather.banner.thunder': 'Гроза!', 'weather.banner.bloodmoon': 'Кровавая луна!', 'weather.banner.voidstorm': 'Буря пустоты!', 'weather.banner.aurora': 'Северное сияние!',
        'weather.hint.thunder': 'Молнии могут мутировать питомцев и яйца', 'weather.hint.bloodmoon': 'Ярость охватывает питомцев и яйца',
        'weather.hint.voidstorm': 'Пустота ищет питомцев и яйца', 'weather.hint.aurora': 'Вечность касается питомцев и яиц',
        'weather.over': 'Событие закончилось: {name}',
        'weather.mut.pet': '{name}: мутация «{mut}»!', 'weather.mut.egg': 'Яйцо мутировало: «{mut}»!',
    },
    en: {
        'weather.banner.thunder': 'Thunderstorm!', 'weather.banner.bloodmoon': 'Blood Moon!', 'weather.banner.voidstorm': 'Void Storm!', 'weather.banner.aurora': 'Aurora!',
        'weather.hint.thunder': 'Lightning can mutate pets and eggs', 'weather.hint.bloodmoon': 'Rage grips pets and eggs',
        'weather.hint.voidstorm': 'The Void is hunting pets and eggs', 'weather.hint.aurora': 'Eternity touches pets and eggs',
        'weather.over': 'Event over: {name}',
        'weather.mut.pet': '{name} got the {mut} mutation!', 'weather.mut.egg': 'An egg mutated: {mut}!',
    },
});

const WEATHER_CSS = `
.wx-chip{display:flex;align-items:center;gap:calc(var(--u)*8);padding:calc(var(--u)*5) calc(var(--u)*14);font-size:calc(var(--u)*18);line-height:1.1;white-space:nowrap;border-radius:calc(var(--u)*14)}
.wx-chip .ico{width:calc(var(--u)*28);height:calc(var(--u)*28)}
.wx-chip .tm{font-size:calc(var(--u)*16);color:#ffe9a8}
.wx-chip.on{animation:wxpop .5s ease-out}
@keyframes wxpop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}
#game-ui.short .wx-chip{font-size:calc(var(--u)*14);padding:calc(var(--u)*3) calc(var(--u)*10)}
#game-ui.short .wx-chip .ico{width:calc(var(--u)*21);height:calc(var(--u)*21)}
#game-ui.short .wx-chip .tm{font-size:calc(var(--u)*13)}
.wx-flash{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;opacity:0;background:#fff}
`;

/** @satisfies {Record<string, any>} */
const Weather = {
    id: 'weather',
    /** @type {LoryApp | null} */
    app: null,
    /** Идущее событие: { id, left, total, strikeIn } или null. @type {{ id: string, left: number, total: number, strikeIn: number } | null} */
    active: null,
    /** Секунд до следующего события. */
    next: 150,
    time: 0,
    /** @type {() => number} */
    rng: Math.random,
    /** @type {any} */
    _chip: null,
    /** @type {HTMLElement | null} */
    _flashEl: null,
    _flashK: 0,
    /** Дождь и фоновые частицы события. @type {any[]} */
    _fx: [],
    /** @type {any} */
    _streakTex: null,
    /** Отложенные действия по игровому времени: гром. @type {{ t: number, fn: () => void }[]} */
    _pending: [],
    /** Вспышки в точках ударов. @type {{ x: number, y: number, z: number, size: number, c: number[], t: number, life: number }[]} */
    _impacts: [],
    _chipT: 0,

    // =============================================================================================
    // Чистая логика расписания (без 3D) — её гоняют тесты
    // =============================================================================================
    cfg() {
        const U = 'undefined';
        const R = (typeof GameData !== U && GameData.WEATHER_RULES) || { gapMin: 240, gapMax: 420, durMin: 60, durMax: 90, strikeMin: 4, strikeMax: 8 };
        return {
            first: typeof WEATHER_FIRST_DELAY !== U ? WEATHER_FIRST_DELAY : 150,
            chance: typeof WEATHER_MUTATION_CHANCE !== U ? WEATHER_MUTATION_CHANCE : 0.6,
            rain: typeof WEATHER_RAIN_RATE !== U ? WEATHER_RAIN_RATE : 520,
            range: typeof WEATHER_STRIKE_RANGE !== U ? WEATHER_STRIKE_RANGE : 6500,
            ground: typeof WEATHER_GROUND_STRIKES !== U ? WEATHER_GROUND_STRIKES : 0.25,
            rules: R,
        };
    },

    /** Пауза до следующего события: первое — WEATHER_FIRST_DELAY, дальше gapMin…gapMax. */
    gap(first, rng) {
        rng = rng || this.rng;
        const c = this.cfg();
        if (first) return c.first;
        return c.rules.gapMin + rng() * (c.rules.gapMax - c.rules.gapMin);
    },

    /** Событие по весам: ночные (night: true) — только ночью, остальные — всегда. */
    pick(night, rng) {
        rng = rng || this.rng;
        const list = Object.values(GameData.WEATHER).filter(w => w.night == null || w.night === !!night);
        if (!list.length) return null;
        return GameUtil.weighted(list.map(w => [w.id, w.weight]), rng);
    },

    /** Мутация события по весам (GameData.WEATHER[id].mutations). */
    mutationFor(id, rng) {
        rng = rng || this.rng;
        const w = GameData.WEATHER[id];
        if (!w || !w.mutations || !w.mutations.length) return null;
        return GameUtil.weighted(w.mutations, rng);
    },

    /** Мутация записи питомца или яйца: сильнее (rank) заменяет слабее, одинаковая и слабее — нет. Возвращает true, если запись изменилась. */
    upgrade(rec, mutId) {
        const M = GameData.MUTATIONS;
        if (!rec || !M[mutId]) return false;
        const cur = rec.mutation && M[rec.mutation] ? M[rec.mutation].rank : 0;
        if (M[mutId].rank <= cur) return false;
        rec.mutation = mutId;
        return true;
    },

    /** Расписание и удары по игровому времени. */
    tick(dt) {
        this.time += dt;
        const a = this.active;
        if (a) {
            a.left -= dt;
            a.strikeIn -= dt;
            const N = typeof GameWorld !== 'undefined' ? GameWorld : null;
            const w = GameData.WEATHER[a.id];
            // ночное событие не переживает рассвет
            if (w && w.night && N && !N.isNight && N.nightFactor < 0.35) a.left = Math.min(a.left, 0);
            if (a.strikeIn <= 0) {
                const R = this.cfg().rules;
                a.strikeIn = R.strikeMin + this.rng() * (R.strikeMax - R.strikeMin);
                this.strike();
            }
            if (a.left <= 0) this.end();
        } else {
            this.next -= dt;
            if (this.next <= 0) {
                const night = typeof GameWorld !== 'undefined' ? GameWorld.isNight : false;
                const id = this.pick(night);
                const R = this.cfg().rules;
                if (id) this.start(id, R.durMin + this.rng() * (R.durMax - R.durMin));
                else this.next = this.gap(false);
            }
        }
    },

    // =============================================================================================
    // Модуль
    // =============================================================================================
    init(app) {
        this.app = app;
        GameUI.addCss('weather', WEATHER_CSS);
        this._buildHud();
        const fx = app.fx;
        if (fx) {
            fx.register('lightning-hit', [
                { burst: 34, capacity: 42, life: [0.25, 0.6], size: [12, 22], speed: [140, 460], color: '#ffffff', color2: '#9fd0ff', gravity: [0, -260, 0], direction: [[-1, 0.1, -1], [1, 1.4, 1]], sizeGradient: [[0, 1], [1, 0.1]] },
                { burst: 5, capacity: 8, life: [0.18, 0.34], size: [90, 150], speed: [0, 4], color: '#ffffff', color2: '#cfe3ff', sizeGradient: [[0, 0.4], [0.3, 1], [1, 0]] },
            ]);
        }
        this.next = this.gap(true);
    },

    /** Состояние загружено или сброшено: события нет, первое — через WEATHER_FIRST_DELAY. */
    onLoad() {
        if (this.active) this.end(true);
        this.next = this.gap(true);
    },

    ready() { this._refreshChip(); },

    update(dt) {
        this.tick(dt);
        // отложенные действия (гром)
        if (this._pending.length) {
            for (let i = this._pending.length - 1; i >= 0; i--) {
                const p = this._pending[i];
                p.t -= dt;
                if (p.t <= 0) { this._pending.splice(i, 1); try { p.fn(); } catch (e) { /* без звука */ } }
            }
        }
        // вспышка экрана
        if (this._flashK > 0.002) {
            this._flashK = Math.max(0, this._flashK - dt * 3.4);
            if (this._flashEl) this._flashEl.style.opacity = String(Math.min(0.6, this._flashK * 0.6));
        } else if (this._flashEl && this._flashEl.style.opacity !== '0') this._flashEl.style.opacity = '0';
        this._drawImpacts(dt);
        this._drawEggGlow();
        this._chipT -= dt;
        if (this._chipT <= 0) { this._chipT = 0.25; this._refreshChip(); }
    },

    // =============================================================================================
    // События
    // =============================================================================================
    /** Начать событие id на sec секунд: вид мира, дождь, баннер, значок. */
    start(id, sec) {
        const def = GameData.WEATHER[id];
        if (!def) return false;
        if (this.active) this.end(true);
        const R = this.cfg().rules;
        const total = sec > 0 ? sec : R.durMin;
        // первый удар скоро, чтобы событие сразу было видно
        this.active = { id, left: total, total, strikeIn: 1.8 + this.rng() * 2.2 };
        if (typeof GameWorld !== 'undefined') GameWorld.setWeatherLook(id);
        const ui = WEATHER_UI[id] || WEATHER_UI.thunder;
        GameUI.banner(Lang.t('weather.banner.' + id), 3800, { color: ui.color });
        window.setTimeout(() => { if (this.active && this.active.id === id) GameUI.toast(Lang.t('weather.hint.' + id), 'info', 4200); }, 900);
        this._startFx(id);
        this._thunder(0.45, 1.2);
        this._refreshChip();
        Game.events.emit('weather', { id, on: true });
        return true;
    },

    /** Закончить событие. silent — без баннера (сброс сохранения). */
    end(silent) {
        const a = this.active;
        if (!a) return;
        this.active = null;
        if (typeof GameWorld !== 'undefined') GameWorld.setWeatherLook(null);
        this._stopFx();
        if (!silent) GameUI.banner(Lang.t('weather.over', { name: GameData.weatherName(a.id) }), 3000, { color: (WEATHER_UI[a.id] || WEATHER_UI.thunder).color, sound: false });
        this.next = this.gap(false);
        this._refreshChip();
        Game.events.emit('weather', { id: a.id, on: false });
    },

    // --- Значок у часов ------------------------------------------------------------------------
    _buildHud() {
        const br = GameUI.hud && GameUI.hud.br;
        if (!br) return;
        const E = GameUtil.el;
        const icon = E('span', { class: 'wx-ic' });
        const name = E('span', { class: 'otx', text: '' });
        const time = E('span', { class: 'tm otx-s', text: '' });
        const root = E('div', { class: 'chip wood wx-chip' }, icon, name, time);
        root.style.display = 'none';
        br.insertBefore(root, br.firstChild);
        this._chip = { root, icon, name, time, id: '' };
        const layer = GameUI.root;
        if (layer) {
            const fl = E('div', { class: 'wx-flash' });
            layer.insertBefore(fl, layer.firstChild);
            this._flashEl = fl;
        }
    },

    _refreshChip() {
        const c = this._chip, a = this.active;
        if (!c) return;
        if (!a) { if (c.root.style.display !== 'none') { c.root.style.display = 'none'; c.id = ''; } return; }
        const ui = WEATHER_UI[a.id] || WEATHER_UI.thunder;
        if (c.id !== a.id) {
            c.id = a.id;
            c.icon.innerHTML = GameUI.icon(ui.icon);
            c.name.textContent = GameData.weatherName(a.id);
            c.name.style.color = ui.color;
            c.root.style.borderColor = ui.color;
            c.root.style.display = '';
            c.root.classList.remove('on'); void c.root.offsetWidth; c.root.classList.add('on');
        }
        const t = GameUtil.fmtClock(a.left);
        if (c.time.textContent !== t) c.time.textContent = t;
    },

    // --- Дождь и фоновые частицы -----------------------------------------------------------------
    _streak() {
        if (this._streakTex || !this.app || !this.app.location) return this._streakTex;
        const scene = this.app.location.view.scene;
        const tex = new BABYLON.DynamicTexture('rain-streak', { width: 16, height: 64 }, scene, true);
        const g = tex.getContext();
        g.clearRect(0, 0, 16, 64);
        for (let y = 0; y < 64; y++) {
            const a = Math.sin(Math.PI * (y + 0.5) / 64);
            for (let x = 0; x < 16; x++) {
                const d = Math.abs(x - 7.5) / 7.5;
                g.fillStyle = 'rgba(255,255,255,' + (Math.max(0, 1 - d * d) * a).toFixed(3) + ')';
                g.fillRect(x, y, 1, 1);
            }
        }
        tex.update();
        tex.hasAlpha = true;
        this._streakTex = tex;
        return tex;
    },

    _startFx(id) {
        this._stopFx();
        const app = this.app, fx = app && app.fx, view = app && app.location ? app.location.view : null;
        if (!fx || !view) return;
        const cam = view.camera;
        const scale = typeof GameWorld !== 'undefined' ? GameWorld.fxScale : 1;
        const ui = WEATHER_UI[id];
        const follow = () => cam.position;
        if (ui && ui.rain) {
            const rate = Math.round(this.cfg().rain * scale);
            if (rate >= 20) {
                const h = fx.create({
                    rate, capacity: Math.min(2000, Math.round(rate * 1.2)), life: [0.5, 0.7], size: [4.5, 6.5], speed: [1300, 1750],
                    color: '#e6f0ff', alpha: 0.75, blend: 'standard', box: [[-1150, 450, -1150], [1150, 900, 1150]],
                    direction: [[-0.06, -1, -0.05], [0.06, -1, 0.05]], follow, position: cam.position,
                });
                if (h) {
                    const ps = h.system;
                    ps.billboardMode = BABYLON.ParticleSystem.BILLBOARDMODE_STRETCHED;
                    ps.minScaleY = 8; ps.maxScaleY = 11;
                    const t = this._streak();
                    if (t) ps.particleTexture = t;
                    this._fx.push(h);
                }
            }
        }
        if (ui && ui.ash) {
            const h = fx.create({
                rate: Math.round(46 * scale), capacity: 160, life: [2, 3.6], size: [8, 15], speed: [10, 40], gravity: [0, 18, 0],
                color: '#ff8a5a', color2: '#ff3a2a', alpha: 0.7, box: [[-1500, -80, -1500], [1500, 520, 1500]],
                direction: [[-0.6, 0.2, -0.6], [0.6, 1, 0.6]], sizeGradient: [[0, 0.3], [0.3, 1], [1, 0]], follow, position: cam.position,
            });
            if (h) this._fx.push(h);
        }
        if (ui && ui.motes) {
            const h = fx.create({
                rate: Math.round(50 * scale), capacity: 180, life: [1.6, 3], size: [16, 30], speed: [20, 70], gravity: [0, 30, 0],
                color: '#b078ff', color2: '#6a2cc0', alpha: 0.6, box: [[-1500, -80, -1500], [1500, 480, 1500]],
                direction: [[-0.5, 0.4, -0.5], [0.5, 1.4, 0.5]], sizeGradient: [[0, 0.3], [0.4, 1], [1, 0]], follow, position: cam.position,
            });
            if (h) this._fx.push(h);
        }
    },

    _stopFx() {
        for (const h of this._fx) { try { h.stop(); } catch (e) { /* уже убрана */ } }
        this._fx.length = 0;
    },

    // =============================================================================================
    // Удары молнии
    // =============================================================================================
    /** Цели удара: { kind, x, y, top (высота макушки, мир), rec (запись питомца/яйца), view, weight }. */
    targets() {
        const out = [];
        const N = typeof NPC !== 'undefined' ? NPC : null;
        const P = /** @type {any} */ (typeof Player !== 'undefined' ? Player : null);
        const s = GameState.state;
        const R = typeof Ranch !== 'undefined' ? Ranch : null;
        if (R && R.pets) {
            for (const rec of R.pets) {
                const pet = GameState.findPet(rec.uid);
                if (!pet || !rec.view || !rec.view.ready) continue;
                out.push({ kind: 'pet', x: rec.x, y: rec.y, top: GameWorld.groundH(rec.x, rec.y) + rec.view.size.height, rec: pet, views: [rec.view], weight: 3 });
            }
        }
        const E = typeof Eggs !== 'undefined' ? Eggs : null;
        if (E && E.nestViews) {
            for (let i = 0; i < E.nestViews.length; i++) {
                const nv = E.nestViews[i], egg = s.nestEggs[i];
                if (!nv || !nv.view || !egg || (E.hatching && E.hatching.i === i)) continue;
                const p = nv.view.root.position;
                out.push({ kind: 'egg', x: p.x, y: p.z, top: p.y + 105, rec: egg, views: [nv.view], weight: 2 });
            }
        }
        if (P && P.petView && P.ready !== false) {
            const pet = GameState.findPet(P._petUid || P.riding);
            if (pet && (P.riding || Math.hypot(P.x - (P.park ? P.park.x : P.x), P.y - (P.park ? P.park.y : P.y)) < 2500)) {
                const v = P.petView;
                const px = P.riding ? P.x : (P.park ? P.park.x : P.x), py = P.riding ? P.y : (P.park ? P.park.y : P.y);
                out.push({ kind: 'rider', x: px, y: py, top: (P.riding ? P.h : GameWorld.groundH(px, py)) + v.size.height + (P.riding ? 170 : 0), rec: pet, views: [v], weight: 2 });
            }
        }
        if (N && N.strikeTargets && P) {
            for (const t of N.strikeTargets(this.cfg().range, P.x, P.y)) out.push({ kind: 'npc', x: t.x, y: t.y, top: t.top, rec: t.rec, views: [t.view], weight: 2 });
        }
        return out;
    },

    /** Один удар. kind — принудительно: 'pet' | 'egg' | 'rider' | 'npc' | 'ground'. Возвращает описание удара. */
    strike(kind) {
        const c = this.cfg();
        const a = this.active;
        const evId = a ? a.id : 'thunder';
        const P = /** @type {any} */ (typeof Player !== 'undefined' ? Player : { x: 12000, y: 12000 });
        const list = this.targets().filter(t => !kind || kind === 'ground' || t.kind === kind);
        let target = null;
        const ground = kind === 'ground' || (!kind && (!list.length || this.rng() < c.ground)) || (kind && !list.length);
        if (!ground) target = GameUtil.weighted(list.map(t => [t, t.weight]), this.rng);
        let x, y, top;
        if (target) { x = target.x; y = target.y; top = target.top; }
        else {
            // безобидный удар рядом с игроком: впереди по взгляду камеры, на 700…2400 px
            const az = (typeof P.camAz === 'number' ? P.camAz : 0) + (this.rng() - 0.5) * 1.6, d = 700 + this.rng() * 1700;
            x = P.x + Math.cos(az) * d; y = P.y + Math.sin(az) * d; top = GameWorld.groundH(x, y) + 40;
        }
        this._boltAt(x, y, top, evId);
        const res = { kind: target ? target.kind : 'ground', x, y, mutated: null };
        if (target && this.rng() < c.chance) {
            const mut = this.mutationFor(evId, this.rng);
            if (mut) res.mutated = this._mutate(target, mut) ? mut : null;
        }
        return res;
    },

    /** Применить мутацию к цели: запись, виды, событие, подпись. true — мутация сменилась. */
    _mutate(t, mutId) {
        const rec = t.rec;
        if (t.kind === 'npc') {
            if (!this.upgrade(rec, mutId)) return false;
            for (const v of t.views) v.setMutation(mutId);
            return true;
        }
        if (!this.upgrade(rec, mutId)) return false;
        for (const v of t.views) v.setMutation(mutId);
        GameState.markDirty();
        const mut = GameData.mutationName(mutId);
        if (t.kind === 'egg') {
            GameUI.toast(Lang.t('weather.mut.egg', { mut }), 'good', 3600);
            Game.events.emit('mutation', { target: 'egg', uid: rec.uid, mutation: mutId });
        } else {
            // питомец: если его показывает ещё и Player (под седлом) или ранчо — обновим все виды по uid
            this._syncPetViews(rec);
            GameUI.toast(Lang.t('weather.mut.pet', { name: GameData.petName(rec.species), mut }), 'good', 3600);
            Game.events.emit('mutation', { target: 'pet', uid: rec.uid, mutation: mutId });
        }
        GameUI.sfx('unlock', { volume: 0.55 });
        return true;
    },

    /** Все виды питомца uid получают его мутацию. */
    _syncPetViews(pet) {
        const R = typeof Ranch !== 'undefined' ? Ranch : null;
        if (R && R.pets) for (const rec of R.pets) if (rec.uid === pet.uid && rec.view && rec.view.mutation !== pet.mutation) rec.view.setMutation(pet.mutation);
        const P = /** @type {any} */ (typeof Player !== 'undefined' ? Player : null);
        if (P && P.petView && P._petUid === pet.uid && P.petView.mutation !== pet.mutation) P.petView.setMutation(pet.mutation);
    },

    /** Видимая молния: ломаная с небес до (x, y, top), ветки, вспышка света и экрана, искры, гром. */
    _boltAt(x, y, top, evId) {
        const arcs = typeof PetView !== 'undefined' ? PetView.arcs : null;
        const ui = WEATHER_UI[evId] || WEATHER_UI.thunder;
        const cam = this.app && this.app.location ? this.app.location.view.camera.position : null;
        const dist = cam ? Math.hypot(x - cam.x, y - cam.z) : 1500;
        if (arcs) {
            const sky = top + 3200 + this.rng() * 600;
            const ox = (this.rng() - 0.5) * 700, oz = (this.rng() - 0.5) * 700;
            const k = 1 + dist / 900;   // издали полоса шире, чтобы читалась
            const mk = (seg, jag, ax, ay, az, bx, by, bz) => ArcBatch.bolt(ax, ay, az, bx, by, bz, seg, jag);
            const main = mk(16, 150, x + ox, sky, y + oz, x, top, y);
            const life = 0.36 + this.rng() * 0.12;
            const [r, g, b] = ui.bolt;
            arcs.add({ pts: main, n: 17, node: null, w0: 50 * k, w1: 32 * k, r, g, b, a: 0.5, life: life * 1.15, flick: true });
            arcs.add({ pts: main, n: 17, node: null, w0: 22 * k, w1: 13 * k, r, g, b, a: 0.95, life, flick: true });
            arcs.add({ pts: main, n: 17, node: null, w0: 8 * k, w1: 5 * k, r: 1, g: 1, b: 1, a: 1, life: life * 0.9, flick: true });
            // ветки от середины молнии
            for (let i = 0; i < 2; i++) {
                const from = 4 + Math.floor(this.rng() * 8);
                const sx = main[from * 3], sy = main[from * 3 + 1], sz = main[from * 3 + 2];
                const ang = this.rng() * 6.28, len = 500 + this.rng() * 600;
                const br = mk(8, 90, sx, sy, sz, sx + Math.cos(ang) * len, sy - 500 - this.rng() * 600, sz + Math.sin(ang) * len);
                arcs.add({ pts: br, n: 9, node: null, w0: 14 * k, w1: 5 * k, r, g, b, a: 0.8, life: life * 0.8, flick: true });
                arcs.add({ pts: br, n: 9, node: null, w0: 5 * k, w1: 2 * k, r: 1, g: 1, b: 1, a: 0.95, life: life * 0.7, flick: true });
            }
            this._impacts.push({ x, y: top, z: y, size: 420 + 220 * this.rng(), c: ui.bolt, t: 0, life: 0.42 });
        }
        // искры в точке удара
        const fx = this.app && this.app.fx;
        if (fx) { try { fx.play('lightning-hit', [x, top, y]); } catch (e) { /* без частиц */ } }
        // вспышки: мир и экран — сильнее рядом
        const near = GameUtil.clamp(1.15 - dist / 7000, 0.12, 1);
        if (typeof GameWorld !== 'undefined') GameWorld.lightning(near);
        this._flashK = Math.max(this._flashK, near);
        if (this._flashEl) this._flashEl.style.background = ui.flash;
        // звук: удар виден раньше, гром доходит позже
        if (dist < 2400) { try { Sound.play('assets/sounds/zap.ogg', { volume: 0.55 * near, detune: 0.1 }); } catch (e) { /* без звука */ } }
        this._thunder(near, 0.15 + Math.min(1.9, dist / 5200));
    },

    /** Гром через delay секунд игрового времени. */
    _thunder(vol, delay) {
        this._pending.push({ t: delay, fn: () => { try { Sound.play('assets/sounds/thunder.ogg', { volume: 0.6 * vol, detune: 0.08 }); } catch (e) { /* без звука */ } } });
    },

    /** Свет в точках ударов: круглое пятно (ArcBatch) на 0.4 с. */
    _drawImpacts(dt) {
        const arcs = typeof PetView !== 'undefined' ? PetView.arcs : null;
        if (!arcs || !this._impacts.length) return;
        for (let i = this._impacts.length - 1; i >= 0; i--) {
            const im = this._impacts[i];
            im.t += dt;
            if (im.t >= im.life) { this._impacts.splice(i, 1); continue; }
            const k = 1 - im.t / im.life;
            arcs.sprite(im.x, im.y, im.z, im.size * (0.7 + 0.5 * (1 - k)), im.c[0], im.c[1], im.c[2], 0.8 * k * k);
        }
    },

    /** Ореол вокруг мутировавших яиц в гнёздах. */
    _drawEggGlow() {
        const E = typeof Eggs !== 'undefined' ? Eggs : null;
        const arcs = typeof PetView !== 'undefined' ? PetView.arcs : null;
        if (!E || !arcs || !E.nestViews || typeof MutationFX === 'undefined') return;
        const s = GameState.state, t = this.time;
        for (let i = 0; i < E.nestViews.length; i++) {
            const nv = E.nestViews[i], egg = s.nestEggs[i];
            if (!nv || !nv.view || !egg || !egg.mutation || nv.view.root.isDisposed()) continue;
            const p = nv.view.root.position;
            MutationFX.halo(p.x, p.y + 62, p.z, 230, egg.mutation, 0.75 + 0.25 * Math.sin(t * 2.4 + i));
        }
    },
};

Game.register(Weather);
