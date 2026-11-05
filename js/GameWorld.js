// GameWorld.js — мир игры поверх движка: уровни графики, прореживание декора, смена дня и ночи (небо, туман, свет),
// вид погоды, зелёные стрелки-гид по земле, коллизии, вода и тип земли.
//
//   GameWorld.tier                 уровень графики: 0 низкий, 1 средний, 2 высокий (GameWorld.initTier — по железу и настройке)
//   Game.prepareMap(map) -> GameWorld.prepareMap(map)   прореживает деревья/кусты/траву/цветы карты (низкий −75%, средний −50%, высокий −30%)
//   GameWorld.isNight / clock / nightFactor / timeToChange()   сутки: DAY_SECONDS день + NIGHT_SECONDS ночь, плавный закат и рассвет
//   GameWorld.setWeatherLook(id | null)    thunder | bloodmoon | voidstorm | aurora — вид погоды (плавно)
//   Guide.set({ x, y } | null), Guide.toRanch()   зелёная цепочка стрелок по земле к цели (над рельефом)
//   GameWorld.colliders            Colliders: addCircle/addBox/addSegment/remove/removeTag/resolve; buildFromMap читает карту
//   GameWorld.addPropColliders(meta, x, y, rotDeg, scale, tag)  коллайдеры пропса из JSON метаданных (circle/box)
//   GameWorld.waterAt(x, y) -> уровень | null, groundType(x, y), groundH(x, y), fxScale (плотность частиц по уровню)
//   GameWorld.lightning(k)                 вспышка молнии: на миг подсвечивает мир (k 0..1)
//   GameWorld.mergeActors()                склейка цветов у наездников и шапок (Location3D.mergeColors, live): ~27 → 9 draw calls на наездника
//   GameWorld.farLimit() / cullFar()       продавцы хаба дальше PERF_PROP_DIST_* от игрока не рисуются (средний и низкий уровни)
//   applyTier()                            низкий уровень: кадр теней не шире PERF_SHADOW_RADIUS_LOW, тени каждый 2-й кадр, декор без теней
//   Небо: купол с закатным свечением у солнца, диск солнца (садится к закату), луна (красная на Кровавой луне), звёзды с
//   мерцанием и северное сияние (событие aurora); всё плавно по nightFactor и погоде.
// Террейн, вода и тип земли — из Location3D (waterAt/groundTypeAt — определяются через feature detect).

// --- Colliders: круги и повёрнутые прямоугольники на сетке ---------------------------------------
/** @satisfies {Record<string, any>} */
const Colliders = {
    cell: 400,
    /** @type {Map<number, any[]>} */
    grid: new Map(),
    /** @type {Map<number, any>} */
    list: new Map(),
    nextId: 1,
    _stamp: 1,

    _key(cx, cy) { return (cx + 4096) * 8192 + (cy + 4096); },

    _insert(c) {
        const cs = this.cell;
        const x0 = Math.floor(c.minX / cs), x1 = Math.floor(c.maxX / cs), y0 = Math.floor(c.minY / cs), y1 = Math.floor(c.maxY / cs);
        for (let cy = y0; cy <= y1; cy++) {
            for (let cx = x0; cx <= x1; cx++) {
                const k = this._key(cx, cy);
                let a = this.grid.get(k);
                if (!a) this.grid.set(k, a = []);
                a.push(c);
            }
        }
        c.cells = [x0, y0, x1, y1];
    },

    /** Круг (центр, радиус). Возвращает id. */
    addCircle(x, y, r, tag = '') {
        const c = { id: this.nextId++, type: 'c', x, y, r, tag, stamp: 0, minX: x - r, maxX: x + r, minY: y - r, maxY: y + r, cells: null };
        this.list.set(c.id, c);
        this._insert(c);
        return c.id;
    },
    /** Повёрнутый прямоугольник: центр, полуразмеры hx (вдоль rot) и hy (поперёк), rot — рад (направление оси hx на карте). */
    addBox(x, y, hx, hy, rot = 0, tag = '') {
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const ex = Math.abs(cs) * hx + Math.abs(sn) * hy, ey = Math.abs(sn) * hx + Math.abs(cs) * hy;
        const c = { id: this.nextId++, type: 'b', x, y, hx, hy, cs, sn, tag, stamp: 0, minX: x - ex, maxX: x + ex, minY: y - ey, maxY: y + ey, cells: null };
        this.list.set(c.id, c);
        this._insert(c);
        return c.id;
    },
    /** Отрезок (забор): от (x1, y1) до (x2, y2) толщиной thick. */
    addSegment(x1, y1, x2, y2, thick = 24, tag = '') {
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
        if (len < 1) return this.addCircle(x1, y1, thick / 2, tag);
        return this.addBox((x1 + x2) / 2, (y1 + y2) / 2, len / 2, thick / 2, Math.atan2(dy, dx), tag);
    },
    remove(id) {
        const c = this.list.get(id);
        if (!c) return;
        this.list.delete(id);
        const [x0, y0, x1, y1] = c.cells;
        for (let cy = y0; cy <= y1; cy++) {
            for (let cx = x0; cx <= x1; cx++) {
                const a = this.grid.get(this._key(cx, cy));
                if (!a) continue;
                const i = a.indexOf(c);
                if (i >= 0) a.splice(i, 1);
            }
        }
    },
    removeTag(tag) { for (const c of Array.from(this.list.values())) if (c.tag === tag) this.remove(c.id); },
    clear() { this.grid.clear(); this.list.clear(); },
    get count() { return this.list.size; },

    /**
     * Вытолкнуть круг радиуса r из пересечений. Возвращает { x, y, hit } — новая позиция.
     * @param {number} x @param {number} y @param {number} r
     */
    resolve(x, y, r) {
        let hit = false;
        for (let pass = 0; pass < 3; pass++) {
            let moved = false;
            const stamp = ++this._stamp;
            const cs = this.cell;
            const x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs), y0 = Math.floor((y - r) / cs), y1 = Math.floor((y + r) / cs);
            for (let cy = y0; cy <= y1; cy++) {
                for (let cx = x0; cx <= x1; cx++) {
                    const a = this.grid.get(this._key(cx, cy));
                    if (!a) continue;
                    for (let i = 0; i < a.length; i++) {
                        const c = a[i];
                        if (c.stamp === stamp) continue;
                        c.stamp = stamp;
                        if (x + r < c.minX || x - r > c.maxX || y + r < c.minY || y - r > c.maxY) continue;
                        if (c.type === 'c') {
                            const dx = x - c.x, dy = y - c.y, rr = r + c.r, d2 = dx * dx + dy * dy;
                            if (d2 >= rr * rr) continue;
                            const d = Math.sqrt(d2);
                            if (d < 1e-4) { x += rr; } else { const k = (rr - d) / d; x += dx * k; y += dy * k; }
                            moved = true;
                        } else {
                            // в локальные оси прямоугольника
                            const dx = x - c.x, dy = y - c.y;
                            const lx = dx * c.cs + dy * c.sn, ly = -dx * c.sn + dy * c.cs;
                            const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qy = Math.max(-c.hy, Math.min(c.hy, ly));
                            let ox = lx - qx, oy = ly - qy;
                            const d2 = ox * ox + oy * oy;
                            let nx, ny, push;
                            if (d2 > 1e-8) {
                                if (d2 >= r * r) continue;
                                const d = Math.sqrt(d2);
                                nx = ox / d; ny = oy / d; push = r - d;
                            } else {
                                // центр внутри: вытолкнуть по ближайшей грани
                                const px = c.hx - Math.abs(lx), py = c.hy - Math.abs(ly);
                                if (px < py) { nx = lx >= 0 ? 1 : -1; ny = 0; push = px + r; } else { nx = 0; ny = ly >= 0 ? 1 : -1; push = py + r; }
                            }
                            // назад в мировые оси
                            const wx = nx * c.cs - ny * c.sn, wy = nx * c.sn + ny * c.cs;
                            x += wx * push; y += wy * push;
                            moved = true;
                        }
                    }
                }
            }
            if (!moved) break;
            hit = true;
        }
        return { x, y, hit };
    },
};

// Пары [подстрока имени файла природы, коэффициент радиуса от габарита]: деревья — только ствол, кусты и трава — без коллизий.
/** @type {[RegExp, number][]} */
const COLLIDER_RULES = [
    [/tree_palm/, 0.1], [/tree_/, 0.13], [/cliff_/, -1], [/rock_large|stone_large|rock_tall|stone_tall/, 0.62],
    [/rock_small|stone_small/, 0.5], [/cactus/, 0.4], [/mushroom/, 0.35], [/log_stack|log_large|log/, 0.45], [/stump/, 0.5],
    [/tent/, 0.5], [/campfire/, 0.4],
];

// Вид погоды: цель смешивания неба, тумана и света.
const WEATHER_LOOKS = {
    thunder: { zenith: 0x3e4756, horizon: 0x69737f, fogMul: 2.4, sunMul: 0.5, skyMul: 0.85, sunColor: 0xb8c4d8, skyLight: 0x9aa8bd, shadow: 0.7 },
    bloodmoon: { zenith: 0x2a060b, horizon: 0x5a1218, fogMul: 1.7, sunMul: 0.7, skyMul: 0.85, sunColor: 0xff5050, skyLight: 0xff7070, shadow: 0.9, night: 1 },
    voidstorm: { zenith: 0x180a30, horizon: 0x3a1c66, fogMul: 2.1, sunMul: 0.6, skyMul: 0.9, sunColor: 0xa070ff, skyLight: 0xb48aff, shadow: 0.9 },
    aurora: { zenith: 0x06243a, horizon: 0x145a62, fogMul: 1.15, sunMul: 0.9, skyMul: 1.05, sunColor: 0x9affea, skyLight: 0x86ffe0, shadow: 0.9, night: 1 },
};

/** @satisfies {Record<string, any>} */
const GameWorld = {
    id: 'world',
    /** @type {LoryApp | null} */
    app: null,
    /** @type {Location3D | null} */
    location: null,
    /** @type {View3D | null} */
    view: null,
    tier: 1,
    fxScale: 1,
    colliders: Colliders,
    // сутки
    clock: 25,
    isNight: false,
    nightFactor: 0,
    weatherId: null,
    weatherK: 0,
    /** @type {any} */
    _wl: null,
    _lastKey: '',
    _hudT: 0,
    _decorInkOff: false,
    _decorShadowOff: false,
    _mergeT: 0,
    _farT: 0,
    /** Имена мешей, чьи цвета склеиваются (mergeActors): наездник, шапки продавцов и косметика. */
    MERGE_NAMES: /^(rider|vendor-hat|cos:)/,
    /** Прежний предел кадра теней, пока на низком уровне он сужен (applyTier). */
    _shadowR0: 0,
    _tierT: 0,
    /** @type {any} */
    sky: null,
    /** Небесные объекты (звёзды, луна, солнце, аврора) и параметры неба. @type {any} */
    _skyObj: null,
    /** @type {{ x: number, y: number, z: number }} */
    _sunDir: { x: 0, y: 1, z: 0 },
    _sunHX: 0,
    _sunHZ: 0,
    /** @type {Float32Array | null} */
    _skyCol: null,
    _skyI: 0,
    _sunI: 0,
    _flash: 0,
    _flashOn: false,
    stats: { thinned: 0, kept: 0 },

    get terrain() { return this.location ? this.location.terrain : null; },
    get cycle() { return (typeof DAY_SECONDS !== 'undefined' ? DAY_SECONDS : 240) + (typeof NIGHT_SECONDS !== 'undefined' ? NIGHT_SECONDS : 120); },

    // --- Уровень графики ------------------------------------------------------------------
    /** Определить и запомнить уровень графики: настройка игрока или авто (телефон/ПК, ядра, память, рендерер). */
    initTier() {
        const q = (GameState.state.settings || {}).quality;
        this.tier = this.detectTier(q);
        this.fxScale = [0.4, 0.7, 1][this.tier];
        return this.tier;
    },
    detectTier(quality) {
        if (quality === 'low') return 0;
        if (quality === 'medium') return 1;
        if (quality === 'high') return 2;
        const nav = /** @type {any} */ (navigator);
        const cores = nav.hardwareConcurrency || 4, mem = nav.deviceMemory || 4;
        let renderer = '';
        try {
            const eng = typeof World3D !== 'undefined' ? World3D.engine : null;
            const info = eng && typeof eng.getGlInfo === 'function' ? eng.getGlInfo() : null;
            renderer = info ? String(info.renderer || '') : '';
        } catch (e) { /* без рендерера */ }
        const soft = /swiftshader|llvmpipe|software|basic render|microsoft/i.test(renderer);
        if (IS_MOBILE) return (cores <= 4 || mem <= 3 || soft) ? 0 : 1;
        if (soft || cores <= 2 || mem <= 2) return 1;
        return 2;
    },
    /** Применить уровень к сцене: тени и обводка тоньше на низком. Вызывается и позже (появились новые слои обводки). */
    applyTier() {
        const view = this.view;
        if (!view || !view.scene) return;
        // Тени: shadowEnabled = false нельзя — шейдеры остаются с картой теней, и WebGL ругается на сэмплер. На низком
        // уровне карта теней обновляется реже, а декор (деревья, кусты) тени не отбрасывает.
        try { view.shadow.getShadowMap().refreshRate = this.tier === 0 ? 2 : 1; } catch (e) { /* без карты теней */ }
        // Низкий уровень: кадр теней уже, дальние кастеры в карту не попадают (меньше draw calls); предел — PERF_SHADOW_RADIUS_LOW.
        const lowR = typeof PERF_SHADOW_RADIUS_LOW !== 'undefined' ? PERF_SHADOW_RADIUS_LOW : 520;
        if (this.tier === 0 && lowR > 0 && view._shadowRadius > lowR) { this._shadowR0 = view._shadowRadius; view._shadowRadius = lowR; }
        else if (this.tier > 0 && this._shadowR0) { view._shadowRadius = this._shadowR0; this._shadowR0 = 0; }
        if (this.tier === 0 && !this._decorShadowOff && this.location && this.location.objects.length) {
            for (const m of view.scene.meshes) if (m.metadata && m.metadata.decor) view.removeShadowCaster(m);
            this._decorShadowOff = true;
        }
        const outlines = /** @type {any} */ (view)._outlines;
        if (outlines) for (const k of Object.keys(outlines)) { if (outlines[k] && outlines[k].hl) outlines[k].hl.isEnabled = this.tier > 0; }
        // Контур рёбер у батчей декора — только на высоком уровне (на каждый меш — лишний проход рисования).
        if (this.tier < 2 && !this._decorInkOff && this.location && this.location.objects.length) {
            for (const m of /** @type {any[]} */ (view.scene.meshes)) if (m.metadata && m.metadata.decor && m._edgesRenderer) m.disableEdgesRendering();
            this._decorInkOff = true;
        }
    },

    /**
     * Прореживание декора КОПИИ карты по уровню графики. Модели assets/models/nature/ с tree, bush, plant, grass, flower в имени
     * файла: низкий уровень убирает 75%, средний 50%, высокий 30% — детерминированно по порядковому номеру объекта.
     * @param {GameMap} map
     */
    prepareMap(map) {
        const frac = [0.75, 0.5, 0.3][this.tier] ?? 0.5;
        const re = /^assets\/models\/nature\/([^/]+)\.glb$/;
        const thin = /tree|bush|plant|grass|flower/i;
        let k = 0, removed = 0, kept = 0;
        const out = [];
        for (const d of map.objects || []) {
            const m = d.kind !== 'marker' && typeof d.model === 'string' ? re.exec(d.model) : null;
            if (m && thin.test(m[1])) {
                if (GameUtil.hash01(k++) < frac) { removed++; continue; }
                kept++;
            }
            out.push(d);
        }
        map.objects = out;
        this.stats = { thinned: removed, kept };
    },

    // --- Модуль -----------------------------------------------------------------------------
    init(app) {
        this.app = app;
        this.location = app.location;
        const view = this.view = app.location.view;
        view.camera.maxZ = 16000;
        this._fogDay = World3D.hexColor3(World3D.cfg().sky);
        this._buildSky();
        this._buildSkyObjects();
        this.applyTier();
        Guide.init(this);
        if (typeof PetView !== 'undefined' && Guide.mesh) PetView.exempt(Guide.mesh);   // стрелки по земле — не заслонка маски обводки питомцев
        this.applyLighting(true);
    },

    onLoad() { this.applyTier(); },

    async ready() {
        // Коллайдеры по объектам карты (после того, как модели загружены под экраном загрузки).
        await this.buildFromMap(this.location);
        this.mergeActors();
    },

    /**
     * Склейка цветов у наездников и шапок (Location3D.mergeColors, режим live): часть модели с тремя-шестью цветными материалами
     * рисуется одним draw call вместо стольких же — и в основном проходе, и в карте теней. Player.setLook и гардероб красят слоты
     * присваиванием diffuseColor — части перекрашиваются на месте. Берутся только меши по именам GameWorld.MERGE_NAMES (наездник
     * rider, шапки vendor-hat и cos:…); питомцы (pet:…) не трогаются: мутации красят их материалы по месту и светят
     * emissiveColor. Зовётся после загрузки и раз в 1.5 с (продавцы и шапки появляются позже). Возвращает число склеенных частей.
     */
    mergeActors() {
        const scene = this.view && this.view.scene;
        if (!scene || typeof Location3D === 'undefined' || !Location3D.mergeColors) return 0;
        let n = 0;
        for (const m of scene.meshes) {
            const mm = /** @type {any} */ (m.material);
            if (!mm || !mm.subMaterials || !GameWorld.MERGE_NAMES.test(m.name) || (m.metadata && m.metadata.mergeTried)) continue;
            if (Location3D.mergeColors(m, { live: true })) n++;
            else (m.metadata || (m.metadata = {})).mergeTried = true;   // материалы не подходят — повторно не проверять
        }
        this.stats.merged = (this.stats.merged || 0) + n;
        return n;
    },

    /** Дальность показа мелких статичных актёров (продавцы хаба) по уровню графики, px; 0 — без ограничения. */
    farLimit() {
        const U = 'undefined';
        if (this.tier === 0) return typeof PERF_PROP_DIST_LOW !== U ? PERF_PROP_DIST_LOW : 2600;
        if (this.tier === 1) return typeof PERF_PROP_DIST_MID !== U ? PERF_PROP_DIST_MID : 3400;
        return typeof PERF_PROP_DIST_HIGH !== U ? PERF_PROP_DIST_HIGH : 0;
    },

    /**
     * Продавцы хаба (Vendors.list) дальше farLimit() от игрока не рисуются: наездник — 9 draw calls, шапка — ещё один, а с ранчо
     * игрока (3800 px) хаб виден целиком. Гистерезис 8%. Возвращает число скрытых. Зовётся раз в 0.5 с.
     */
    cullFar() {
        const V = typeof Vendors !== 'undefined' ? /** @type {any} */ (Vendors) : null, P = typeof Player !== 'undefined' ? Player : null;
        if (!V || !P || !Array.isArray(V.list)) return 0;
        const lim = this.farLimit();
        let hidden = 0;
        for (const v of V.list) {
            if (!v.rider || typeof v.rider.setVisible !== 'function') continue;
            const on = !(lim > 0) || Math.hypot(v.x - P.x, v.y - P.y) < lim * (v.farHidden ? 0.92 : 1);
            if (on === !v.farHidden) { if (!on) hidden++; continue; }
            v.farHidden = !on;
            v.rider.setVisible(on);
            if (!on) hidden++;
        }
        return hidden;
    },

    // --- Сутки -------------------------------------------------------------------------------
    /** Секунд до смены дня/ночи. */
    timeToChange() {
        const day = typeof DAY_SECONDS !== 'undefined' ? DAY_SECONDS : 240;
        return this.clock < day ? day - this.clock : this.cycle - this.clock;
    },
    /** Установить время суток (с от начала дня) — отладка и тесты. */
    setClock(t) { this.clock = ((t % this.cycle) + this.cycle) % this.cycle; this._refreshDayState(); this.applyLighting(true); },
    _refreshDayState() {
        const day = typeof DAY_SECONDS !== 'undefined' ? DAY_SECONDS : 240;
        const tr = Math.max(1, typeof DAY_TRANSITION_SECONDS !== 'undefined' ? DAY_TRANSITION_SECONDS : 30);
        const c = this.clock, cyc = this.cycle;
        const night = c >= day;
        // ночной коэффициент: рампа вокруг границ день→ночь (day) и ночь→день (cyc/0)
        const sm = (v) => GameUtil.smoothstep(0, 1, v);
        let nf;
        if (c >= day - tr / 2 && c < day + tr / 2) nf = sm((c - (day - tr / 2)) / tr);
        else if (c >= day + tr / 2 && c < cyc - tr / 2) nf = 1;
        else if (c >= cyc - tr / 2) nf = 1 - sm((c - (cyc - tr / 2)) / tr);
        else if (c < tr / 2) nf = 1 - sm((c + tr / 2) / tr);
        else nf = 0;
        this.nightFactor = nf;
        if (night !== this.isNight) {
            this.isNight = night;
            Game.events.emit('daynight', { night });
        }
    },

    /** Вид погоды: id из WEATHER_LOOKS или null — ясно. Плавно (update). */
    setWeatherLook(id) {
        this.weatherId = id && WEATHER_LOOKS[id] ? id : null;
        if (this.weatherId) this._wl = WEATHER_LOOKS[this.weatherId];
    },

    _buildSky() {
        const scene = this.view.scene;
        const R = 15200;
        const dome = BABYLON.MeshBuilder.CreateSphere('skydome', { diameter: R * 2, segments: 14 }, scene);
        const pos = dome.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const n = pos.length / 3;
        dome.setVerticesData(BABYLON.VertexBuffer.ColorKind, new Float32Array(n * 4), true);
        const mat = new BABYLON.StandardMaterial('skydome-mat', scene);
        mat.disableLighting = true;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.backFaceCulling = false;
        mat.disableDepthWrite = true;
        mat.alpha = 0.9999;
        mat.fogEnabled = false;
        mat.metadata = { toon: false };
        dome.material = mat;
        dome.infiniteDistance = true;
        dome.isPickable = false;
        dome.applyFog = false;
        dome.alwaysSelectAsActiveMesh = true;
        dome.renderingGroupId = 0;
        dome.alphaIndex = 1;
        this.sky = { mesh: dome, y: new Float32Array(n), x: new Float32Array(n), z: new Float32Array(n), n };
        for (let i = 0; i < n; i++) { this.sky.y[i] = pos[i * 3 + 1] / R; this.sky.x[i] = pos[i * 3] / R; this.sky.z[i] = pos[i * 3 + 2] / R; }
        if (typeof PetView !== 'undefined') PetView.exempt(dome);
    },

    _tmpA: null,
    /** Покраска купола: горизонт -> зенит; glow (0..1) — тёплое свечение у горизонта в сторону солнца (закат, рассвет). */
    _paintSky(zen, hor, glow = 0) {
        const s = this.sky;
        if (!s) return;
        const col = this._skyCol && this._skyCol.length === s.n * 4 ? this._skyCol : (this._skyCol = new Float32Array(s.n * 4));
        const sx = this._sunHX || 0, sz = this._sunHZ || 0;
        for (let i = 0; i < s.n; i++) {
            const t = Math.pow(GameUtil.clamp((s.y[i] + 0.04) / 0.8, 0, 1), 0.62);
            let r = hor.r + (zen.r - hor.r) * t, g = hor.g + (zen.g - hor.g) * t, b = hor.b + (zen.b - hor.b) * t;
            if (glow > 0.01) {
                const hx = s.x[i], hz = s.z[i], hl = Math.hypot(hx, hz) || 1;
                const dot = (hx * sx + hz * sz) / hl;
                const band = dot > 0 ? Math.pow(dot, 3) * (1 - GameUtil.smoothstep(-0.05, 0.5, s.y[i])) : 0;
                const k = glow * band;
                r += (1 - r) * k * 0.75; g += (0.55 - g) * k * 0.6; b += (0.22 - b) * k * 0.6;
            }
            col[i * 4] = r; col[i * 4 + 1] = g; col[i * 4 + 2] = b; col[i * 4 + 3] = 1;
        }
        s.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, col);
    },

    // Свет, небо и туман по времени суток и погоде. Значения меняются на месте: никаких пересборок шейдеров.
    applyLighting(force) {
        const view = this.view;
        if (!view) return;
        const c = World3D.cfg();
        const nf = this.nightFactor, wk = this.weatherK, wl = this._wl;
        const key = nf.toFixed(3) + '|' + wk.toFixed(3) + '|' + (wl ? this.weatherId : '');
        if (!force && key === this._lastKey) return;
        this._lastKey = key;
        const H = (v) => World3D.hexColor3(v);
        const mix = (a, b, t) => a.scale(1 - t).add(b.scale(t));
        const dusk = 4 * nf * (1 - nf);            // 0 днём и ночью, 1 в середине заката
        // небо: день -> ночь, тёплый оттенок на закате
        const dayZen = H(0x5aa5f0), dayHor = H(c.sky);
        const nightZen = H(0x050b22), nightHor = H(0x17234d);
        let zen = mix(dayZen, nightZen, nf), hor = mix(dayHor, nightHor, nf);
        zen = mix(zen, H(0x6c5cb0), dusk * 0.5);
        hor = mix(hor, H(0xffa56a), dusk * 0.55);
        let skyI = GameUtil.lerp(c.skyIntensity, 0.62, nf), sunI = GameUtil.lerp(c.sunIntensity, 0.14, nf);
        let skyL = mix(H(c.skyLight), H(0x7f95ea), nf), sunC = mix(H(c.sunColor), H(0x9bb0ff), nf);
        sunC = mix(sunC, H(0xff9a55), dusk * 0.6);
        sunI *= 1 - 0.22 * dusk;
        let fog = c.fog * GameUtil.lerp(1, 1.5, nf);
        let shadow = GameUtil.lerp(c.shadowStrength, 0.3, nf);
        if (wl && wk > 0.001) {
            zen = mix(zen, H(wl.zenith), wk); hor = mix(hor, H(wl.horizon), wk);
            skyI *= GameUtil.lerp(1, wl.skyMul, wk); sunI *= GameUtil.lerp(1, wl.sunMul, wk);
            skyL = mix(skyL, H(wl.skyLight), wk * 0.6); sunC = mix(sunC, H(wl.sunColor), wk);
            fog *= GameUtil.lerp(1, wl.fogMul, wk);
            shadow = GameUtil.lerp(shadow, Math.min(shadow, wl.shadow * 0.45), wk);
        }
        const scene = view.scene;
        scene.clearColor.set(hor.r, hor.g, hor.b, 1);
        scene.fogColor.copyFrom(hor);
        scene.fogDensity = fog;
        view.hemi.intensity = skyI;
        view.hemi.diffuse.copyFrom(skyL);
        view.sun.intensity = sunI;
        view.sun.diffuse.copyFrom(sunC);
        const md = scene.metadata;
        if (md && md.lorySun) {
            md.lorySun.color.copyFromFloats(sunC.r * sunI, sunC.g * sunI, sunC.b * sunI);
            if (md.loryShadow) md.loryShadow.strength = shadow;
        }
        this._skyI = skyI; this._sunI = sunI;
        this._paintSky(zen, hor, dusk * (1 - 0.85 * (wl ? wk : 0)));
    },

    update(dt) {
        const cyc = this.cycle;
        this.clock = (this.clock + dt) % cyc;
        this._refreshDayState();
        // погода: плавное смешивание вида
        const goal = this.weatherId ? 1 : 0;
        if (Math.abs(this.weatherK - goal) > 0.001) this.weatherK = GameUtil.damp(this.weatherK, goal, 0.9, dt);
        else this.weatherK = goal;
        if (!this.weatherId && this.weatherK === 0) this._wl = null;
        this._hudT -= dt;
        if (this._hudT <= 0) {
            this._hudT = 0.25;
            GameUI.setDay(this.isNight, this.timeToChange());
            this.applyLighting(false);
        } else if (this._lastKey && Math.abs(this.weatherK - goal) > 0.001) {
            this.applyLighting(false);
        }
        this._updateSky(dt);
        this._tierT -= dt;
        if (this._tierT <= 0) { this._tierT = 2; this.applyTier(); }
        this._mergeT -= dt;
        if (this._mergeT <= 0) { this._mergeT = 1.5; this.mergeActors(); }
        this._farT -= dt;
        if (this._farT <= 0) { this._farT = 0.5; this.cullFar(); }
        if (typeof Player !== 'undefined') Guide.update(dt, Player.x, Player.y);
    },

    // --- Небо: звёзды, луна, солнце, северное сияние -------------------------------------------
    _skyTexture(name, draw, w = 128, h = 128) {
        const tex = new BABYLON.DynamicTexture(name, { width: w, height: h }, this.view.scene, true);   // с мипмапами: мелкие звёзды без мерцания от субпиксельного сдвига
        const g = tex.getContext();
        g.clearRect(0, 0, w, h);
        draw(g, w, h);
        tex.update();
        tex.hasAlpha = true;
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        return tex;
    },

    _skyMaterial(name, tex, additive) {
        const m = new BABYLON.StandardMaterial(name, this.view.scene);
        if (tex) { m.diffuseTexture = tex; m.useAlphaFromDiffuseTexture = true; }
        m.emissiveColor = new BABYLON.Color3(1, 1, 1);
        m.diffuseColor = new BABYLON.Color3(0, 0, 0);
        m.specularColor = new BABYLON.Color3(0, 0, 0);
        m.disableLighting = true; m.backFaceCulling = false; m.disableDepthWrite = true; m.fogEnabled = false;
        m.alphaMode = additive ? BABYLON.Engine.ALPHA_ADD : BABYLON.Engine.ALPHA_COMBINE;
        m.metadata = { toon: false };
        return m;
    },

    /** Общие свойства небесного меша: к камере, без тумана, порядок прозрачных, выключен до появления. */
    _skyMesh(mesh, alphaIndex) {
        mesh.infiniteDistance = true; mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true; mesh.applyFog = false;
        mesh.alphaIndex = alphaIndex; mesh.renderingGroupId = 0; mesh.visibility = 0;
        mesh.setEnabled(false);
        if (typeof PetView !== 'undefined') PetView.exempt(mesh);
        return mesh;
    },

    _buildSkyObjects() {
        const scene = this.view.scene, c = World3D.cfg();
        const az = c.sunAz * Math.PI / 180, el = c.sunEl * Math.PI / 180;
        // направление на солнце (в небе — против направления света), горизонтальная часть — для закатного свечения
        this._sunDir = { x: -Math.cos(az) * Math.cos(el), y: Math.sin(el), z: -Math.sin(az) * Math.cos(el) };
        const hl = Math.hypot(this._sunDir.x, this._sunDir.z) || 1;
        this._sunHX = this._sunDir.x / hl; this._sunHZ = this._sunDir.z / hl;
        const R = 14000;
        const obj = this._skyObj = { R, stars: null, moon: null, sun: null, aurora: null, starT: 0, auroraT: 0 };

        // Звёзды: квадраты по куполу, мерцание — альфой вершин (раз в 0.12 с)
        const N = Math.round((typeof GAME_STARS !== 'undefined' ? GAME_STARS : 360) * [0.35, 0.6, 1][this.tier]);
        if (N > 0) {
            const rnd = GameUtil.rng('game-stars');
            const pos = new Float32Array(N * 12), col = new Float32Array(N * 16), uv = new Float32Array(N * 8), nor = new Float32Array(N * 12), idx = new Uint16Array(N * 6);
            const base = new Float32Array(N), phase = new Float32Array(N);
            for (let i = 0; i < N; i++) {
                const y = 0.05 + 0.95 * rnd(), ph = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y);
                const dx = Math.cos(ph) * r, dy = y, dz = Math.sin(ph) * r;
                // правая и верхняя оси касательной плоскости
                let rx = -dz, rz = dx;
                const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
                const ux = dy * rz, uy = dz * rx - dx * rz, uz = -dy * rx;
                const size = (60 + Math.pow(rnd(), 3) * 150) * 0.5;
                const o = i * 12;
                const corners = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
                for (let k = 0; k < 4; k++) {
                    const a = corners[k][0] * size, b = corners[k][1] * size;
                    pos[o + k * 3] = dx * R + rx * a + ux * b; pos[o + k * 3 + 1] = dy * R + uy * b; pos[o + k * 3 + 2] = dz * R + rz * a + uz * b;
                    nor[o + k * 3 + 1] = 1;
                }
                const t = rnd();
                const tr = t < 0.2 ? 0.75 : 1, tg = t < 0.2 ? 0.85 : t > 0.9 ? 0.92 : 1, tb = t > 0.9 ? 0.7 : 1;
                base[i] = 0.4 + 0.6 * rnd(); phase[i] = rnd() * 6.283;
                for (let k = 0; k < 4; k++) { col[i * 16 + k * 4] = tr; col[i * 16 + k * 4 + 1] = tg; col[i * 16 + k * 4 + 2] = tb; col[i * 16 + k * 4 + 3] = base[i]; }
                uv.set([0, 0, 0, 1, 1, 0, 1, 1], i * 8);
                const v = i * 4, q = i * 6;
                idx[q] = v; idx[q + 1] = v + 1; idx[q + 2] = v + 2; idx[q + 3] = v + 2; idx[q + 4] = v + 1; idx[q + 5] = v + 3;
            }
            const mesh = new BABYLON.Mesh('skystars', scene);
            const vd = new BABYLON.VertexData();
            vd.positions = pos; vd.normals = nor; vd.colors = col; vd.uvs = uv; vd.indices = idx;
            vd.applyToMesh(mesh, true);
            mesh.hasVertexAlpha = true;
            const tex = this._skyTexture('stars-tex', (g, w, h) => {
                const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2 - 1);
                gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
                g.fillStyle = gr; g.fillRect(0, 0, w, h);
            }, 32, 32);
            mesh.material = this._skyMaterial('stars-mat', tex, true);
            this._skyMesh(mesh, 2);
            obj.stars = { mesh, col, base, phase, n: N };
        }

        // Аврора: занавес из вершин по дуге на севере, градиент зелёный -> бирюзовый -> фиолетовый
        {
            const cols = 72, rows = 8, nv = (cols + 1) * (rows + 1);
            const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 4), nor = new Float32Array(nv * 3), idx = [];
            for (let i = 0; i < nv; i++) nor[i * 3 + 1] = 1;
            for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
                const a = j * (cols + 1) + i, b = a + 1, c2 = a + cols + 1, d = c2 + 1;
                idx.push(a, c2, b, b, c2, d);
            }
            const mesh = new BABYLON.Mesh('skyaurora', scene);
            const vd = new BABYLON.VertexData();
            vd.positions = pos; vd.normals = nor; vd.colors = col; vd.indices = idx;
            vd.applyToMesh(mesh, true);
            mesh.hasVertexAlpha = true;
            mesh.material = this._skyMaterial('aurora-mat', null, true);
            this._skyMesh(mesh, 3);
            obj.aurora = { mesh, pos, col, cols, rows };
        }

        // Луна: диск с кратерами и ореолом
        {
            const tex = this._skyTexture('moon-tex', (g, w, h) => {
                const gr = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 2);
                gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
                g.fillStyle = gr; g.fillRect(0, 0, w, h);
                g.beginPath(); g.arc(w / 2, h / 2, 54, 0, Math.PI * 2); g.fillStyle = '#f6f3e4'; g.fill();
                g.fillStyle = 'rgba(150,150,140,0.45)';
                for (const q of [[108, 108, 13], [146, 118, 9], [122, 150, 15], [150, 94, 6], [100, 138, 7], [140, 150, 6], [118, 90, 5]]) { g.beginPath(); g.arc(q[0], q[1], q[2], 0, Math.PI * 2); g.fill(); }
            }, 256, 256);
            const mesh = BABYLON.MeshBuilder.CreatePlane('skymoon', { size: 1 }, scene);
            mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            const mat = this._skyMaterial('moon-mat', tex, false);
            mesh.material = mat;
            this._skyMesh(mesh, 4);
            obj.moon = { mesh, mat };
        }

        // Солнце: диск с горячим ореолом (аддитивно), садится к закату
        {
            const tex = this._skyTexture('sun-tex', (g, w, h) => {
                const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
                gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,250,225,1)'); gr.addColorStop(0.16, 'rgba(255,230,160,0.7)');
                gr.addColorStop(0.4, 'rgba(255,200,120,0.22)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
                g.fillStyle = gr; g.fillRect(0, 0, w, h);
            }, 256, 256);
            const mesh = BABYLON.MeshBuilder.CreatePlane('skysun', { size: 1 }, scene);
            mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            const mat = this._skyMaterial('sun-mat', tex, true);
            mesh.material = mat;
            this._skyMesh(mesh, 5);
            obj.sun = { mesh, mat };
        }
    },

    _updateSky(dt) {
        const S = this._skyObj;
        if (!S) return;
        const wk = this.weatherK, wid = this.weatherId, wl = this._wl;
        const t = S.t = (S.t || 0) + dt;
        const storm = wid === 'thunder' || wid === 'voidstorm' ? wk : 0;
        const blood = wid === 'bloodmoon' ? wk : 0;
        const auro = wid === 'aurora' ? wk : 0;
        const nf = Math.max(this.nightFactor, wl && wl.night ? wk : 0);
        const R = S.R, c = World3D.cfg();
        const up = (m, k, px, py, pz, size) => {
            const on = k > 0.012;
            if (m.isEnabled() !== on) m.setEnabled(on);
            if (!on) return;
            m.visibility = Math.min(1, k);
            m.position.set(px * R, py * R, pz * R);
            m.scaling.setAll(size);
        };
        // солнце: к закату опускается к горизонту и гаснет, красный-оранжевый тон
        if (S.sun) {
            const sd = this._sunDir, el = Math.asin(sd.y), el2 = el * (1 - nf * 0.93);
            const ce = Math.cos(el2), hx = this._sunHX, hz = this._sunHZ;
            const k = (1 - nf) * (1 - storm * 0.92);
            up(S.sun.mesh, k, hx * ce, Math.sin(el2), hz * ce, 3200 + 1500 * nf);
            S.sun.mat.emissiveColor.set(1, 1 - 0.38 * nf, 1 - 0.7 * nf);
        }
        // луна: дуга по небу за ночь; красная и крупнее на Кровавой луне; за тучами тускнеет
        if (S.moon) {
            const day = typeof DAY_SECONDS !== 'undefined' ? DAY_SECONDS : 240, night = typeof NIGHT_SECONDS !== 'undefined' ? NIGHT_SECONDS : 120;
            const ph = GameUtil.clamp((this.clock - day) / night, 0, 1);
            const mel = (14 + 50 * Math.sin(Math.PI * ph)) * Math.PI / 180;
            const maz = Math.atan2(-this._sunHZ, -this._sunHX) + 0.35;
            const ce = Math.cos(mel);
            const k = nf * (1 - storm * 0.85);
            up(S.moon.mesh, k, Math.cos(maz) * ce, Math.sin(mel), Math.sin(maz) * ce, 2300 * (1 + 0.5 * blood));
            S.moon.mat.emissiveColor.set(1, 1 - 0.68 * blood, 1 - 0.72 * blood);
        }
        // звёзды: мерцание раз в 0.12 с
        if (S.stars) {
            const k = nf * (1 - storm * 0.92);
            const on = k > 0.012;
            if (S.stars.mesh.isEnabled() !== on) S.stars.mesh.setEnabled(on);
            if (on) {
                S.stars.mesh.visibility = Math.min(1, k);
                S.starT -= dt;
                if (S.starT <= 0) {
                    S.starT = 0.12;
                    const { col, base, phase, n } = S.stars;
                    for (let i = 0; i < n; i++) {
                        const a = base[i] * (0.62 + 0.38 * Math.sin(t * (1.1 + (i % 5) * 0.37) + phase[i]));
                        col[i * 16 + 3] = col[i * 16 + 7] = col[i * 16 + 11] = col[i * 16 + 15] = a;
                    }
                    S.stars.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, col);
                }
            }
        }
        // аврора
        if (S.aurora) {
            const k = auro * Math.max(this.nightFactor, 0.6);
            const on = k > 0.012;
            if (S.aurora.mesh.isEnabled() !== on) S.aurora.mesh.setEnabled(on);
            if (on) {
                S.aurora.mesh.visibility = Math.min(1, k);
                S.auroraT -= dt;
                if (S.auroraT <= 0) { S.auroraT = 0.05; this._animateAurora(t); }
            }
        }
        // вспышка молнии: короткая подсветка света, затухает
        if (this._flash > 0.003) {
            this._flash = Math.max(0, this._flash - dt * 3.2);
            const v = this.view;
            if (v && this._skyI != null) { v.hemi.intensity = this._skyI + this._flash * 0.9; v.sun.intensity = (this._sunI || 0) + this._flash * 0.45; }
            this._flashOn = true;
        } else if (this._flashOn) {
            this._flashOn = false;
            const v = this.view;
            if (v && this._skyI != null) { v.hemi.intensity = this._skyI; v.sun.intensity = this._sunI || 0; }
        }
    },

    /** Занавес северного сияния: волны по высоте и бегущая яркость. */
    _animateAurora(t) {
        const A = this._skyObj.aurora, R = this._skyObj.R * 0.8;
        const { pos, col, cols, rows } = A;
        const span = 2.3, a0 = -Math.PI / 2 - span / 2;   // дуга на севере (−Z)
        for (let j = 0; j <= rows; j++) {
            const v = j / rows;
            for (let i = 0; i <= cols; i++) {
                const u = i / cols, a = a0 + u * span;
                const wave = Math.sin(a * 5 + t * 0.55 + v * 2.2) * 620 + Math.sin(a * 11 - t * 0.8) * 300;
                const idx = j * (cols + 1) + i;
                pos[idx * 3] = Math.cos(a) * R + wave * 0.4;
                pos[idx * 3 + 1] = R * (0.07 + v * 0.46) + Math.sin(a * 7 + t * 0.4) * 240 * v;
                pos[idx * 3 + 2] = Math.sin(a) * R + wave;
                const flow = 0.5 + 0.5 * Math.sin(u * 14 - t * 0.9 + Math.sin(u * 5 + t * 0.3) * 2);
                // вертикальные лучи занавеса: яркие полосы, плывущие вдоль дуги
                const ray = Math.sin(u * 86 + t * 0.9 + Math.sin(u * 9 + t * 0.5) * 2.4) * 0.5 + 0.5;
                const fade = Math.sin(Math.PI * u) * Math.pow(1 - v, 1.1) * (0.2 + 0.8 * Math.min(1, v * 5));
                const al = Math.min(1, flow * fade * (0.35 + 0.9 * ray * ray) * 1.25);
                const hue = v;   // зелёный внизу, к верху — бирюзовый и фиолетовый
                col[idx * 4] = 0.3 + 0.5 * hue * hue; col[idx * 4 + 1] = 1 - 0.5 * hue; col[idx * 4 + 2] = 0.5 + 0.5 * hue; col[idx * 4 + 3] = al;
            }
        }
        A.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, pos);
        A.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, col);
    },

    /** Вспышка молнии: мир на миг светлеет (k 0..1). */
    lightning(k = 1) { this._flash = Math.max(this._flash || 0, GameUtil.clamp(k, 0, 1)); },

    // --- Вода, земля -------------------------------------------------------------------------
    /** Высота земли в точке. */
    groundH(x, y) { const t = this.terrain; return t ? t.heightAt(x, y) : 0; },
    /** Уровень воды в точке или null (Location3D.waterAt есть не у всех версий — feature detect). */
    waterAt(x, y) {
        const loc = /** @type {any} */ (this.location);
        return loc && typeof loc.waterAt === 'function' ? loc.waterAt(x, y) : null;
    },
    /** Тип земли: grass, sand, snow, dirt, path, rock, dark, grass2, lava. */
    groundType(x, y) {
        const loc = /** @type {any} */ (this.location);
        return loc && typeof loc.groundTypeAt === 'function' ? loc.groundTypeAt(x, y) : 'grass';
    },
    /** Границы мира: { w, h } (px). */
    get size() { const l = this.location; return { w: l ? l.width : 0, h: l ? l.height : 0 }; },

    // --- Коллизии -----------------------------------------------------------------------------
    /**
     * Коллайдеры пропса из JSON метаданных: circle { x, z, r }, box { x, z, hx, hz, rot } в локальных координатах модели
     * (x вперёд, z вбок). Модель стоит в (x, y) карты с курсом rotDeg и масштабом scale. Возвращает список id.
     */
    addPropColliders(meta, x, y, rotDeg = 0, scale = 1, tag = '') {
        const ids = [];
        if (!meta || !Array.isArray(meta.colliders)) return ids;
        const th = rotDeg * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
        const sc = Array.isArray(scale) ? scale : [scale, scale, scale];
        for (const c of meta.colliders) {
            // локальная точка (x вперёд, z вбок) -> карта: вперёд = (cos, sin), вбок(+z) = (-sin, cos)
            const lx = (c.x || 0) * sc[0], lz = (c.z || 0) * sc[2];
            const wx = x + lx * cs - lz * sn, wy = y + lx * sn + lz * cs;
            if (c.type === 'circle') ids.push(this.colliders.addCircle(wx, wy, c.r * Math.max(sc[0], sc[2]), tag));
            else if (c.type === 'box') ids.push(this.colliders.addBox(wx, wy, c.hx * sc[0], c.hz * sc[2], th + (c.rot || 0) * Math.PI / 180, tag));
        }
        return ids;
    },

    /** Коллайдеры карты по её объектам: габарит модели × масштаб, мелкий декор пропускается, у пропсов — JSON метаданных. */
    async buildFromMap(location) {
        const C = this.colliders;
        C.removeTag('map');
        const objs = location.objects.slice();
        let n = 0;
        await Promise.all(objs.map(async (rec) => {
            const d = rec.def;
            if (!d || d.kind === 'marker' || !d.model) return;
            const sc = Array.isArray(d.scale) ? d.scale : [d.scale, d.scale, d.scale];
            const rot = (Array.isArray(d.rot) ? d.rot[1] : d.rot) || 0;
            const file = d.model.split('/').pop().replace(/\.[a-z]+$/i, '');
            // пропс с метаданными из реестра
            const prop = typeof PetModels !== 'undefined' ? PetModels.prop(d.model) : null;
            if (prop && prop.meta) {
                const meta = await PetModels.loadMeta(prop.meta);
                if (meta && meta.colliders) { n += this.addPropColliders(meta, d.x, d.y, rot, sc, 'map').length; return; }
            }
            let rule = null;
            for (const r of COLLIDER_RULES) if (r[0].test(file)) { rule = r[1]; break; }
            if (rule == null) {
                if (!/^assets\/models\/(props|town)\//.test(d.model)) return;   // кусты, трава, цветы — проходимы
                rule = 0.4;
            }
            let model;
            try { model = await Model3D.load(d.model); } catch (e) { return; }
            if (!model || !model.min) return;
            const w = (model.max[0] - model.min[0]) * (Number(sc[0]) || 1), dp = (model.max[2] - model.min[2]) * (Number(sc[2]) || 1);
            const th = rot * Math.PI / 180;
            if (rule < 0) {
                // скальные блоки гор: прямоугольник
                if (Math.max(w, dp) < 600) return;
                C.addBox(d.x, d.y, w / 2, dp / 2, th, 'map'); n++;
                return;
            }
            const r = Math.max(w, dp) / 2 * rule;
            if (r < 12 || Math.max(w, dp) < 40) return;   // мелочь
            C.addCircle(d.x, d.y, r, 'map'); n++;
        }));
        this.stats.colliders = n;
        return n;
    },

    /** Удержать точку внутри мира с отступом (за краем — кольцо гор). */
    clampToWorld(x, y, margin = 300) {
        const s = this.size;
        let cx = GameUtil.clamp(x, margin, s.w - margin), cy = GameUtil.clamp(y, margin, s.h - margin);
        // игровое поле — диск внутри квадрата карты: углы за кольцом гор недоступны
        const mx = s.w / 2, my = s.h / 2, R = Math.min(s.w, s.h) / 2 - margin * 3;
        const d = Math.hypot(cx - mx, cy - my);
        if (R > 0 && d > R) { cx = mx + (cx - mx) * R / d; cy = my + (cy - my) * R / d; }
        return { x: cx, y: cy };
    },
};

// --- Guide: зелёная цепочка стрелок по земле ------------------------------------------------------
// Одна меш-стрелка и thin instances: до GUIDE_ARROWS штук через GUIDE_SPACING px от игрока к цели, над рельефом, волна
// бежит к цели. Не регистрируется в World3D.addObject (без теней и контура), туман действует.
/** @satisfies {Record<string, any>} */
const Guide = {
    /** @type {{ x: number, y: number } | null} */
    target: null,
    /** @type {any} */
    mesh: null,
    /** @type {Float32Array | null} */
    buf: null,
    count: 0,
    time: 0,
    /** @type {any} */
    world: null,

    init(world) {
        this.world = world;
        const scene = world.view.scene;
        // Полигон стрелки в плоскости XZ, нос вдоль +X: внешний тёмный контур (ниже) и светлая заливка (выше).
        const shape = (grow, y, col, out) => {
            const g = grow;
            const P = [
                // стержень и голова одним контуром (обход против часовой при взгляде сверху)
                [-62 - g, -17 - g], [8, -17 - g], [8, -50 - g * 1.6], [82 + g * 1.8, 0], [8, 50 + g * 1.6], [8, 17 + g], [-62 - g, 17 + g],
            ];
            const base = out.pos.length / 3;
            for (const p of P) { out.pos.push(p[0], y, p[1]); out.nor.push(0, 1, 0); out.col.push(col[0], col[1], col[2], 1); }
            // веер от вершины 0 разбивает невыпуклый контур неверно — делим на стержень и голову
            const tri = [[0, 1, 5], [0, 5, 6], [2, 3, 4]];
            for (const t of tri) out.idx.push(base + t[0], base + t[2], base + t[1], base + t[0], base + t[1], base + t[2]);
        };
        const out = { pos: [], nor: [], col: [], idx: [] };
        shape(8, 0.0, [0.07, 0.38, 0.12], out);
        shape(0, 2.2, [0.38, 0.95, 0.30], out);
        const mesh = new BABYLON.Mesh('guide-arrow', scene);
        const vd = new BABYLON.VertexData();
        vd.positions = out.pos; vd.normals = out.nor; vd.colors = out.col; vd.indices = out.idx;
        vd.applyToMesh(mesh);
        const mat = new BABYLON.StandardMaterial('guide-mat', scene);
        mat.disableLighting = true;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.backFaceCulling = false;
        mat.zOffset = -3;
        mat.metadata = { toon: false };
        mesh.material = mat;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.setEnabled(false);
        const n = typeof GUIDE_ARROWS !== 'undefined' ? GUIDE_ARROWS : 14;
        this.buf = new Float32Array(n * 16);
        mesh.thinInstanceSetBuffer('matrix', this.buf, 16, false);
        mesh.thinInstanceCount = 0;
        this.mesh = mesh;
        this.count = n;
    },

    /** Цель стрелок: { x, y } или null — убрать. */
    set(target) {
        this.target = target ? { x: target.x, y: target.y } : null;
        if (!this.target && this.mesh) this.mesh.setEnabled(false);
    },
    /** Стрелки к своему ранчо (Ranch.player, иначе первый маркер ranch). */
    toRanch() {
        const r = typeof Ranch !== 'undefined' ? Ranch : null;
        if (r && r.player) { this.set({ x: r.player.x, y: r.player.y }); return; }
        const loc = GameWorld.location;
        const m = loc ? loc.marker('ranch') : null;
        this.set(m ? { x: m.x, y: m.y } : null);
    },

    update(dt, px, py) {
        const mesh = this.mesh, tgt = this.target;
        if (!mesh) return;
        if (!tgt) { return; }
        this.time += dt;
        const dx = tgt.x - px, dy = tgt.y - py, dist = Math.hypot(dx, dy);
        const spacing = typeof GUIDE_SPACING !== 'undefined' ? GUIDE_SPACING : 130;
        const start = 260;
        if (dist < start + 60) { mesh.setEnabled(false); return; }
        mesh.setEnabled(true);
        const ux = dx / dist, uy = dy / dist;
        const heading = Math.atan2(uy, ux);
        const phase = (this.time * 0.85) % 1;
        const terrain = GameWorld.terrain;
        const buf = /** @type {Float32Array} */ (this.buf);
        const cy = Math.cos(-heading), sy = Math.sin(-heading);
        let shown = 0;
        for (let i = 0; i < this.count; i++) {
            const d = start + (i + phase) * spacing;
            if (d > dist - 40) break;
            // плавное появление у начала и исчезновение у конца цепочки
            let sc = 1;
            if (i === 0) sc = phase;
            else if (i === this.count - 1) sc = 1 - phase;
            const near = d - start;
            sc *= GameUtil.clamp(near / 60, 0, 1);
            sc *= GameUtil.clamp((dist - d) / 120, 0, 1);
            const x = px + ux * d, y = py + uy * d;
            const h0 = terrain ? terrain.heightAt(x, y) : 0;
            let pitch = 0;
            if (terrain) pitch = Math.atan2(terrain.heightAt(x + ux * 45, y + uy * 45) - terrain.heightAt(x - ux * 45, y - uy * 45), 90);
            const pulse = 1 + 0.16 * Math.sin((i + phase) * 0.9 - this.time * 4);
            const s = sc * pulse * 0.92;
            const cp = Math.cos(pitch), sp = Math.sin(pitch);
            // матрица: масштаб s, поворот по курсу (вокруг Y) и наклон по склону (вокруг Z), положение (x, h0 + 7, y)
            const o = shown * 16;
            // R = Ry(-heading) * Rz(pitch); строки Babylon (row-major, вектор-строка)
            buf[o] = cy * cp * s; buf[o + 1] = sp * s; buf[o + 2] = -sy * cp * s; buf[o + 3] = 0;
            buf[o + 4] = -cy * sp * s; buf[o + 5] = cp * s; buf[o + 6] = sy * sp * s; buf[o + 7] = 0;
            buf[o + 8] = sy * s; buf[o + 9] = 0; buf[o + 10] = cy * s; buf[o + 11] = 0;
            buf[o + 12] = x; buf[o + 13] = h0 + 7 + (sc > 0 ? 0 : 0); buf[o + 14] = y; buf[o + 15] = 1;
            shown++;
        }
        mesh.thinInstanceCount = shown;
        mesh.thinInstanceBufferUpdated('matrix');
        if (!shown) mesh.setEnabled(false);
    },
};

Game.register(GameWorld);
