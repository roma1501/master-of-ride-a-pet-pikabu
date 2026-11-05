// NPC.js — NPC-соседи: у пяти ранчо (Ranch.all, npc = true) есть хозяева — те же блочные наездники, что и у игрока
// (RiderModel), со своими нарядами, причёсками и именами (Lang npc.*), и 3…6 питомцев, бродящих по участку. Часть хозяев
// (2 / 3 / 5 по уровню графики) катается на питомцах по карте: выезжают из ворот, едут к живым яйцам и маркерам яиц, иногда
// подбирают обычное и редкое яйцо (epic и выше — редко), везут его домой, отдыхают на хабе. Остальные гуляют по своему ранчо.
//
//   NPC.owners  [{ plot, key, name, level, look, species[], rider? }]    NPC.pets   питомцы на ранчо { view, x, y, plot, mutation }
//   NPC.riders  наездники { owner, x, y, state, steed, rider, egg, … }    состояние: 'idle' | 'go' | 'carry' | 'walk'
//   NPC.eggAllowed(egg, ctx) -> bool    правила: никогда яйцо под слежением/радаром игрока (ctx.lock), не рядом с игроком, не
//                                       чужое (npcClaim), epic и выше — только если ctx.allowRare
//   NPC.planRoute(plot, fx, fy, tx, ty) -> [{ x, y, gate? }]   путевые точки через ворота и в обход участков (чистая логика)
//   NPC.pickEgg(r, eggs, ctx) -> egg | null     яйцо, до которого доедет и которое довезёт до разбивания; NPC.stats / NPC.debug / NPC.log
//   NPC.strikeTargets(range, px, py)    цели для молний (питомцы NPC, только вид): [{ x, y, top, view, rec }]
// NPC не ставят коллайдеров и не мешают игроку: он проходит сквозь них. Дальше NPC_FAR_DIST от игрока NPC не рисуются и
// обновляются редко (под-шагами ≤ 0.05 с, с теми же столкновениями). Время — игровое, на паузе всё стоит. Яйцо у NPC забирается из Eggs.live как при подборе.
//
// Навигация: маршрут — цепочка путевых точек (NPC.planRoute, чистая логика). Из ранчо: внутрь у ворот -> проём -> снаружи, домой — так же
// обратно; чужие и свой участки со стороны обходятся по углам с запасом (NPC_PLOT_MARGIN). В пути «усы» (_feel) ищут свободную сторону
// среди коллайдеров, воды и крутых подъёмов, сторону держат, после касания скользят вдоль преграды; к игроку и соседям — боковой уход.
// Застрял (NPC_STUCK_TIME без продвижения): отступить и другая сторона -> новый маршрут -> бросить цель -> «призрак» на виду
// или телепорт вдали от игрока (NPC.stats, NPC.debug + NPC.log — счётчики и журнал). Цели: яйцо — достижимое и такое, что довезут до
// ворот за долю таймера разбивания (NPC.pickEgg), иначе объезд своего ранчо, маркер яйца, хаб; завидев игрока, машет рукой.

const NPC_OWNERS = [
    { key: 'npc.1', level: 1, hair: 'bob', tints: ['#c8416e', '#3b4a7a', '#7a3a1c', '#ffd6b0', '#ffe27a'], species: ['snail', 'turtle', 'sloth', 'axolotl', 'koala', 'capybara'], steed: 'capybara' },
    { key: 'npc.2', level: 2, hair: 'spiky', tints: ['#2e8f5a', '#3a3a3a', '#1c1c1c', '#c98d5c', '#f2f2f2'], species: ['chicken', 'pig', 'panda', 'kangaroo', 'deer', 'elephant'], steed: 'deer' },
    { key: 'npc.3', level: 3, hair: 'swept', tints: ['#e0a02a', '#2c3f7a', '#e8c04a', '#f1b98a', '#c8392f'], species: ['spider', 'crocodile', 'gorilla', 'snake', 'horse', 'wolf'], steed: 'horse' },
    { key: 'npc.4', level: 4, hair: 'long', tints: ['#8a4fff', '#e8e8f0', '#5a2d82', '#8d5a3a', '#ff7ad9'], species: ['lion', 'ostrich', 'fox', 'giraffe', 'shark', 'cheetah'], steed: 'cheetah' },
    { key: 'npc.5', level: 5, hair: 'swept', tints: ['#1d1d28', '#7a1c1c', '#d8d8e8', '#ffe0c0', '#43c4ff'], species: ['unicorn', 'trex', 'phoenix', 'cerberus', 'kitsune', 'dragon'], steed: 'unicorn' },
];

Lang.add({
    ru: { 'npc.took': 'Яйцо «{egg}» увезли на ранчо: {name}', 'npc.hi1': 'Привет!', 'npc.hi2': 'Классный питомец!', 'npc.hi3': 'Удачи с яйцами!' },
    en: { 'npc.took': '{name} grabbed the {egg} egg!', 'npc.hi1': 'Hi there!', 'npc.hi2': 'Nice pet!', 'npc.hi3': 'Good luck with the eggs!' },
});

/** Фразы приветствия игроку (ключи Lang). */
const NPC_GREETINGS = ['npc.hi1', 'npc.hi2', 'npc.hi3'];

const NPC_CSS = `
.npc-bb{padding:calc(var(--u)*2) calc(var(--u)*12);font-size:calc(var(--u)*16);border-radius:999px;pointer-events:none}
.npc-say{padding:calc(var(--u)*2) calc(var(--u)*10);font-size:calc(var(--u)*14)}
`;

/** Числа Constants.js (typeof с дефолтом: в редакторе это свойства window). */
function npcCfg() {
    const U = 'undefined';
    // Дальность показа по уровню графики: на слабом железе NPC и их питомцы рисуются только рядом с игроком.
    const tier = typeof GameWorld !== U ? GameWorld.tier : 2;
    const k = tier === 0 ? (typeof PERF_NPC_DIST_LOW !== U ? PERF_NPC_DIST_LOW : 0.55)
        : tier === 1 ? (typeof PERF_NPC_DIST_MID !== U ? PERF_NPC_DIST_MID : 0.8) : 1;
    return {
        low: typeof NPC_RIDERS_LOW !== U ? NPC_RIDERS_LOW : 2,
        mid: typeof NPC_RIDERS_MID !== U ? NPC_RIDERS_MID : 3,
        high: typeof NPC_RIDERS_HIGH !== U ? NPC_RIDERS_HIGH : 5,
        speed: typeof NPC_SPEED_SCALE !== U ? NPC_SPEED_SCALE : 0.62,
        pickup: typeof NPC_PICKUP_CHANCE !== U ? NPC_PICKUP_CHANCE : 0.35,
        rare: typeof NPC_RARE_EGG_CHANCE !== U ? NPC_RARE_EGG_CHANCE : 0.06,
        far: (typeof NPC_FAR_DIST !== U ? NPC_FAR_DIST : 6000) * k,
        petDist: (typeof NPC_PET_DIST !== U ? NPC_PET_DIST : 2800) * k,
        grace: typeof NPC_EGG_GRACE !== U ? NPC_EGG_GRACE : 1400,
        petsMin: typeof NPC_PETS_MIN !== U ? NPC_PETS_MIN : 3,
        petsMax: typeof NPC_PETS_MAX !== U ? NPC_PETS_MAX : 6,
        stuckTime: typeof NPC_STUCK_TIME !== U ? NPC_STUCK_TIME : 1.5,
        look: typeof NPC_LOOKAHEAD !== U ? NPC_LOOKAHEAD : 420,
        sep: typeof NPC_SEPARATION !== U ? NPC_SEPARATION : 260,
        gateLead: typeof NPC_GATE_LEAD !== U ? NPC_GATE_LEAD : 320,
        plotMargin: typeof NPC_PLOT_MARGIN !== U ? NPC_PLOT_MARGIN : 260,
        timeSafety: typeof NPC_EGG_TIME_SAFETY !== U ? NPC_EGG_TIME_SAFETY : 0.8,
        maxTrip: typeof NPC_EGG_MAX_TRIP !== U ? NPC_EGG_MAX_TRIP : 45,
        homeChance: typeof NPC_HOME_CHANCE !== U ? NPC_HOME_CHANCE : 0.2,
        greetDist: typeof NPC_GREET_DIST !== U ? NPC_GREET_DIST : 900,
        greetCd: typeof NPC_GREET_COOLDOWN !== U ? NPC_GREET_COOLDOWN : 40,
        // самый крутой подъём — как у игрока; на трассе яйца допускается доля этого (средний подъём по отрезкам ~180 px)
        slope: typeof PLAYER_MAX_SLOPE !== U ? PLAYER_MAX_SLOPE : 1.2,
        slopeRoute: 0.7,
    };
}

/** @satisfies {Record<string, any>} */
const NPC = {
    id: 'npc',
    /** @type {LoryApp | null} */
    app: null,
    /** @type {any[]} */
    owners: [],
    /** @type {any[]} */
    pets: [],
    /** @type {any[]} */
    riders: [],
    ready_: false,
    time: 0,
    /** Ближе этого к игроку NPC не берёт яйцо (игрок, скорее всего, едет к нему сам), px (NPC_EGG_GRACE). */
    get GRACE() { return npcCfg().grace; },
    /** @type {() => number} */
    rng: Math.random,
    /** @type {{ x: number, y: number }[]} */
    hubSpots: [],
    /** @type {any[]} */
    _markers: [],
    /** Числа и положение игрока этого кадра (update). */
    /** @type {any} */
    cfg: null,
    _px: NaN,
    _py: NaN,
    _pvx: 0,
    _pvy: 0,
    /** Счётчики навигации: застревания, отступления, новые маршруты, брошенные цели, «призраки», телепорты, приветствия, разбитые яйца. */
    stats: { stuck: 0, backoff: 0, replan: 0, abandon: 0, ghost: 0, teleport: 0, greet: 0, broke: 0, delivered: 0, contacts: 0 },
    debug: false,
    /** @type {any[]} */
    log: [],

    // =============================================================================================
    // Чистая логика (тесты)
    // =============================================================================================
    /**
     * Можно ли NPC взять это живое яйцо. ctx: { lock (яйцо под слежением или радаром игрока), px, py (игрок), allowRare, by (NPC) }.
     * @param {any} egg @param {{ lock?: any, px?: number, py?: number, allowRare?: boolean, by?: any }} [ctx]
     */
    eggAllowed(egg, ctx = {}) {
        if (!egg || !egg.def) return false;
        const lock = ctx.lock;
        if (lock && (lock === egg || (lock.uid != null && lock.uid === egg.uid))) return false;
        if (egg.npcClaim && egg.npcClaim !== ctx.by) return false;
        if (Number.isFinite(ctx.px) && Number.isFinite(ctx.py) && Math.hypot(egg.x - Number(ctx.px), egg.y - Number(ctx.py)) < this.GRACE) return false;
        const tier = GameData.TIERS[egg.def.tier];
        if (tier && tier.rank >= GameData.TIERS.epic.rank && !ctx.allowRare) return false;
        return true;
    },

    /** Сколько наездников по уровню графики (0 низкий, 1 средний, 2 высокий). */
    riderCount(tier) {
        const c = npcCfg();
        return [c.low, c.mid, c.high][GameUtil.clamp(tier | 0, 0, 2)];
    },

    /** Питомцы ранчо хозяина: n видов из его пула без повторов (seeded rng — один состав на запуск). */
    petsFor(owner, rng) {
        const c = npcCfg();
        const n = Math.round(GameUtil.lerp(Math.min(c.petsMin, c.petsMax), Math.max(c.petsMin, c.petsMax), rng()));
        const pool = owner.species.slice();
        const out = [];
        while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length) % pool.length, 1)[0]);
        return out;
    },

    // =============================================================================================
    // Маршруты и выбор яйца (чистая логика, тесты)
    // =============================================================================================
    /** Числа Constants.js на этот кадр: update кладёт сюда npcCfg(); вне кадра (тесты) — свежие. */
    _cfg() { return this.cfg || npcCfg(); },

    /** Свободная полуширина проёма ворот, px: расстояние от оси до столба минус его радиус (метаданные ворот), иначе 178. */
    gateHalf() {
        const P = typeof Ranch !== 'undefined' ? /** @type {any} */ (Ranch)._P : null;
        const meta = P && P.ranch_gate ? P.ranch_gate.meta : null;
        let h = 178;
        if (meta && Array.isArray(meta.colliders)) for (const c of meta.colliders) if (c.type === 'circle') h = Math.min(h, Math.abs(c.z || 0) - (c.r || 0));
        return Math.max(60, h);
    },

    /** Где точка относительно забора участка: 'in' внутри, 'gate' на линии ворот (в проёме), 'out' снаружи. */
    plotZone(plot, x, y) {
        const l = plot.toLocal(x, y), hx = plot.w / 2 - 22, hy = plot.d / 2 - 22;
        if (Math.abs(l.lx) < hx - 20 && Math.abs(l.ly) < hy - 20) return 'in';
        if (Math.abs(l.ly) < this.gateHalf() && l.lx >= hx - 60 && l.lx <= hx + 60) return 'gate';
        return 'out';
    },

    /** Внутри забора любого участка (кроме except) с запасом m? Яйца и цели там не берём. */
    inAnyPlot(x, y, m, except) {
        const plots = typeof Ranch !== 'undefined' && Ranch.all ? Ranch.all : [];
        for (const p of plots) if (p !== except && p.inside(x, y, m)) return true;
        return false;
    },

    /** Точки прохода ворот участка (мир): inn — внутри, mid — в проёме, out — снаружи; lead — отступ от забора, px. */
    gatePoints(plot, lead) {
        const hx = plot.w / 2 - 22;
        return { inn: plot.toWorld(hx - lead * 0.9, 0), mid: plot.toWorld(hx, 0), out: plot.toWorld(hx + lead, 0) };
    },

    /** Отрезок A–B пересекает прямоугольник забора участка, раздутый на m px? Касание границы не считается. */
    segHitsPlot(plot, ax, ay, bx, by, m) {
        const hx = plot.w / 2 - 22 + m - 0.5, hy = plot.d / 2 - 22 + m - 0.5;
        const a = plot.toLocal(ax, ay), b = plot.toLocal(bx, by);
        let t0 = 0, t1 = 1;
        const dx = b.lx - a.lx, dy = b.ly - a.ly;
        for (let k = 0; k < 2; k++) {
            const p0 = k ? a.ly : a.lx, d = k ? dy : dx, h = k ? hy : hx;
            if (Math.abs(d) < 1e-9) { if (Math.abs(p0) >= h) return false; continue; }
            let ta = (-h - p0) / d, tb = (h - p0) / d;
            if (ta > tb) { const q = ta; ta = tb; tb = q; }
            if (ta > t0) t0 = ta;
            if (tb < t1) t1 = tb;
            if (t0 >= t1) return false;
        }
        return t0 < t1;
    },

    /**
     * Обход участка от A до B по углам раздутого на m забора (кратчайший путь по графу видимости): список промежуточных точек
     * ([] — прямо можно), null — A или B внутри раздутого прямоугольника.
     * @param {any} plot @param {{ x: number, y: number }} A @param {{ x: number, y: number }} B @param {number} m
     */
    detourPlot(plot, A, B, m) {
        if (!this.segHitsPlot(plot, A.x, A.y, B.x, B.y, m)) return [];
        const hx = plot.w / 2 - 22 + m, hy = plot.d / 2 - 22 + m;
        const la = plot.toLocal(A.x, A.y), lb = plot.toLocal(B.x, B.y);
        if ((Math.abs(la.lx) < hx - 1 && Math.abs(la.ly) < hy - 1) || (Math.abs(lb.lx) < hx - 1 && Math.abs(lb.ly) < hy - 1)) return null;
        const nodes = [A, plot.toWorld(hx, hy), plot.toWorld(-hx, hy), plot.toWorld(-hx, -hy), plot.toWorld(hx, -hy), B];
        const n = nodes.length;
        const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
        dist[0] = 0;
        for (let it = 0; it < n; it++) {
            let u = -1;
            for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
            if (u < 0 || dist[u] === Infinity) break;
            done[u] = true;
            for (let v = 0; v < n; v++) {
                if (done[v]) continue;
                const a = nodes[u], b = nodes[v];
                if (this.segHitsPlot(plot, a.x, a.y, b.x, b.y, m)) continue;
                const w = dist[u] + Math.hypot(a.x - b.x, a.y - b.y);
                if (w < dist[v]) { dist[v] = w; prev[v] = u; }
            }
        }
        if (dist[n - 1] === Infinity) return null;
        const out = [];
        for (let v = prev[n - 1]; v > 0; v = prev[v]) out.unshift({ x: nodes[v].x, y: nodes[v].y });
        return out;
    },

    /** Запас обхода участка: не больше base и не больше, чем A и B отстоят от забора (иначе точки окажутся «внутри» запаса). */
    _margin(plot, A, B, base) {
        const hx = plot.w / 2 - 22, hy = plot.d / 2 - 22;
        const dd = (p) => { const l = plot.toLocal(p.x, p.y); return Math.max(Math.abs(l.lx) - hx, Math.abs(l.ly) - hy); };
        return GameUtil.clamp(Math.min(dd(A), dd(B)) - 4, 30, base);
    },

    /**
     * Путь по открытой местности от A к B в обход всех участков (по углам с запасом NPC_PLOT_MARGIN): промежуточные точки.
     * @param {{ x: number, y: number }} A @param {{ x: number, y: number }} B
     */
    detourAll(A, B) {
        const base = this._cfg().plotMargin;
        const plots = typeof Ranch !== 'undefined' && Ranch.all ? Ranch.all : [];
        const pts = [A, B];
        for (let it = 0; it < 8; it++) {
            let changed = false;
            for (let i = 0; i < pts.length - 1 && !changed; i++) {
                for (const plot of plots) {
                    const m = this._margin(plot, pts[i], pts[i + 1], base);
                    if (!this.segHitsPlot(plot, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, m)) continue;
                    const d = this.detourPlot(plot, pts[i], pts[i + 1], m);
                    if (d && d.length) { pts.splice(i + 1, 0, ...d); changed = true; break; }
                }
            }
            if (!changed) break;
        }
        return pts.slice(1, -1);
    },

    /**
     * Цепочка путевых точек от (fx, fy) к (tx, ty) для хозяина участка plot (без самой конечной точки). Из ранчо: внутрь у ворот ->
     * проём -> снаружи; домой — наоборот; чужие и свой участки со стороны — по углам. Точки ворот помечены gate: true (точный проход).
     * @param {any} plot @param {{ lead?: number }} [opts] lead — отступ точек у ворот, px (по умолчанию NPC_GATE_LEAD)
     * @returns {{ x: number, y: number, gate?: boolean }[]}
     */
    planRoute(plot, fx, fy, tx, ty, opts) {
        const cfg = this._cfg();
        const lead = Math.max((opts && opts.lead) || cfg.gateLead, cfg.plotMargin + 40);
        const zf = this.plotZone(plot, fx, fy), zt = this.plotZone(plot, tx, ty);
        const G = this.gatePoints(plot, lead);
        const wps = [];
        const g = (p) => ({ x: p.x, y: p.y, gate: true });
        let start = { x: fx, y: fy };
        if (zf === 'in') {
            if (zt === 'in') return wps;
            const l = plot.toLocal(fx, fy), hx = plot.w / 2 - 22;
            if (!(l.lx > hx - lead && Math.abs(l.ly) < 110)) wps.push(g(G.inn));   // уже в створе ворот — внутренняя точка не нужна
            wps.push(g(G.mid), g(G.out));
            start = G.out;
        } else if (zf === 'gate') {
            if (zt === 'in') { wps.push(g(G.inn)); return wps; }
            wps.push(g(G.out));
            start = G.out;
        }
        if (zt === 'in') {
            for (const p of this.detourAll(start, G.out)) wps.push(p);
            wps.push(g(G.out), g(G.mid), g(G.inn));
        } else {
            for (const p of this.detourAll(start, { x: tx, y: ty })) wps.push(p);
        }
        return wps;
    },

    /** Время в пути (с) на d px: трасса длиннее прямой на 18%, средняя скорость ~72% от предельной (повороты, ворота, объезды; замерено по прогонам). */
    tripTime(r, d) { return d * 1.18 / Math.max(80, r.vmax * 0.72); },

    /** Точка у ворот своего участка снаружи: отсюда и сюда идут маршруты за яйцами. */
    homeOut(r) { return r.home ? r.home.out : { x: r.plot.x, y: r.plot.y }; },

    /** Откуда начинается трасса: из ранчо — от ворот снаружи, иначе — сам наездник. */
    routeStart(r) { return this.plotZone(r.plot, r.x, r.y) === 'out' ? r : this.homeOut(r); },

    /**
     * Грубая проверка трассы по прямой от (x0, y0) до (x1, y1): нет глубокой воды (кроме пловцов), подъёмов круче порога и стен
     * коллайдеров шире ~600 px и толще ~180 px (скальные блоки гор, пирамида). Деревья, камни и заборы не мешают — их огибают «усы».
     */
    routeOk(x0, y0, x1, y1, swim, rad) {
        const cfg = this._cfg();
        const L = Math.hypot(x1 - x0, y1 - y0);
        if (L < 1) return true;
        const n = GameUtil.clamp(Math.ceil(L / 180), 2, 70), seg = L / n;
        const nx = -(y1 - y0) / L * 300, ny = (x1 - x0) / L * 300;   // боковой щуп: попадание и по бокам на 300 px — это стена, а не дерево
        const C = typeof GameWorld !== 'undefined' ? GameWorld.colliders : null;
        let ph = GameWorld.groundH(x0, y0), wet = 0, wall = 0;
        for (let i = 1; i <= n; i++) {
            const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
            const gh = GameWorld.groundH(x, y);
            if ((gh - ph) / seg > cfg.slope * cfg.slopeRoute) return false;
            ph = gh;
            if (!swim && this._inWater(x, y)) { if (++wet >= 2) return false; } else wet = 0;
            if (C && C.resolve(x, y, rad).hit && C.resolve(x + nx, y + ny, rad).hit && C.resolve(x - nx, y - ny, rad).hit) { if (++wall >= 2) return false; } else wall = 0;
        }
        return true;
    },

    /**
     * Какое яйцо из eggs взять наезднику r (или null). Яйцо должно проходить eggAllowed (не под слежением или радаром игрока, не рядом с
     * игроком, не чужое, epic+ только по броску), быть достижимым (routeOk), не дальше NPC_EGG_MAX_TRIP по времени в пути и такое, чтобы
     * довезти до ворот за долю NPC_EGG_TIME_SAFETY от таймера разбивания (GameData.EGGS[тип].break). Ценнее и ближе — лучше.
     * @param {any} r @param {any[]} eggs @param {{ lock?: any, px?: number, py?: number, allowRare?: boolean, by?: any }} ctx
     */
    pickEgg(r, eggs, ctx) {
        const cfg = this._cfg(), home = this.homeOut(r), now = this.time;
        const list = [];
        for (const e of eggs) {
            if (!this.eggAllowed(e, ctx)) continue;
            if (r.skip && r.skip[e.uid] > now) continue;
            const tGo = this.tripTime(r, Math.hypot(e.x - r.x, e.y - r.y));
            if (tGo > cfg.maxTrip) continue;
            const tHome = this.tripTime(r, Math.hypot(e.x - home.x, e.y - home.y) + 700);
            if (tHome > e.def.break * cfg.timeSafety) continue;
            if (this.inAnyPlot(e.x, e.y, 40) || !this._inWorld(e.x, e.y)) continue;
            const tier = GameData.TIERS[e.def.tier];
            list.push({ e, score: (1 + (tier ? tier.rank : 0) * 0.35) / (tGo + tHome * 0.6 + 3) });
        }
        if (!list.length) return null;
        list.sort((a, b) => b.score - a.score);
        const s = this.routeStart(r), rad = this._radius(r) + 14, ok = [];
        for (let i = 0; i < list.length && ok.length < 3; i++) {
            const e = list[i].e;
            if (this.routeOk(s.x, s.y, e.x, e.y, r.swim, rad)) ok.push(e);
        }
        if (!ok.length) return null;
        const roll = this.rng();
        return ok[roll < 0.55 || ok.length === 1 ? 0 : roll < 0.85 || ok.length === 2 ? 1 : 2];
    },

    // =============================================================================================
    // Модуль
    // =============================================================================================
    init(app) {
        this.app = app;
        GameUI.addCss('npc', NPC_CSS);
    },

    onLoad() { /* NPC не сохраняются: состояние живёт, пока открыта страница */ },

    async ready() {
        const app = this.app;
        if (!app || !app.location || typeof Ranch === 'undefined') return;
        const plots = Ranch.all.filter(p => p.npc);
        const n = Math.min(plots.length, NPC_OWNERS.length);
        const scene = app.location.view.scene;
        const hub = app.location.marker('hub');
        const hx = hub ? Number(hub.x) : app.location.width / 2, hy = hub ? Number(hub.y) : app.location.height / 2;
        this.hubSpots = [];
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.4; this.hubSpots.push({ x: hx + Math.cos(a) * 1050, y: hy + Math.sin(a) * 1050 }); }
        this._markers = typeof Eggs !== 'undefined' && Eggs.markers ? Eggs.markers : [];
        const riders = this.riderCount(typeof GameWorld !== 'undefined' ? GameWorld.tier : 1);
        for (let i = 0; i < n; i++) {
            const def = NPC_OWNERS[i], plot = plots[i];
            const rnd = GameUtil.rng('npc-ranch-' + i);
            const owner = { plot, def, key: def.key, name: Lang.t(def.key), level: def.level, species: this.petsFor(def, rnd), rider: null, index: i };
            this.owners.push(owner);
            plot.name = Lang.t('ranch.of', { name: owner.name });
            if (plot.signBb) {
                const av = typeof ranchAvatar === 'function' ? ranchAvatar('npc' + plot.index) : '';
                plot.signBb.setHtml('<span class="rv-av"><img alt="" src="' + av + '"></span><span>' + GameUtil.esc(plot.name) + '</span>');
            }
            // питомцы на ранчо (дёшево: без контура рёбер)
            for (const sp of owner.species) this._addPet(scene, owner, sp, rnd);
            // хозяин — наездник на питомце или гуляет по ранчо
            await this._addOwnerRider(scene, owner, i < riders);
        }
        // модели питомцев подгружаются без остановки загрузки: до этого — запасные фигуры из примитивов
        const species = new Set();
        for (const o of this.owners) { for (const s of o.species) species.add(s); species.add(o.def.steed); }
        try { Promise.resolve(PetView.preload([...species])).catch(() => {}); } catch (e) { /* без моделей */ }
        this.ready_ = true;
    },

    // --- Создание ---------------------------------------------------------------------------------
    _addPet(scene, owner, species, rnd) {
        const plot = owner.plot, roam = Ranch._roam(plot);
        const view = PetView.create(scene, species, { w: 0.9 + rnd() * 0.4, ink: false });
        const l = { x: GameUtil.lerp(roam.x0, roam.x1, rnd()), y: GameUtil.lerp(roam.y0, roam.y1, rnd()) };
        const w = plot.toWorld(l.x, l.y);
        const rec = { view, x: w.x, y: w.y, heading: rnd() * 6.28, tx: w.x, ty: w.y, wait: rnd() * 3, plot, species, mutation: null, shown: true, acc: 0, lod: 0 };
        this._petTarget(rec);
        view.place(rec.x, GameWorld.groundH(rec.x, rec.y), rec.y, rec.heading, 0, 0);
        this.pets.push(rec);
        return rec;
    },

    _petTarget(rec) {
        const plot = rec.plot, r = Ranch._roam(plot);
        const l = plot.toWorld(GameUtil.lerp(r.x0, r.x1, this.rng()), GameUtil.lerp(r.y0, r.y1, this.rng()));
        rec.tx = l.x; rec.ty = l.y;
    },

    async _addOwnerRider(scene, owner, rides) {
        const def = owner.def, plot = owner.plot, view = this.app.location.view;
        let rider = null;
        try { rider = await RiderModel.create(view, { tints: def.tints, hairStyle: def.hair }); } catch (e) { console.warn('NPC: наездник не создан — ' + ((e && e.message) || e)); }
        // Цвета NPC заданы при создании и не меняются: части с несколькими материалами склеиваются в один (≈27 → 9 draw calls на наездника).
        if (rider && typeof Location3D !== 'undefined' && Location3D.mergeColors) for (const m of rider.mesh.getChildMeshes(false)) Location3D.mergeColors(m);
        const cfg = npcCfg();
        const d = GameData.PETS[def.steed];
        const r = {
            owner, plot, rider, name: owner.name, rides,
            x: 0, y: 0, h: 0, heading: plot.heading, speed: 0, vmax: 0, state: 'idle', wait: 2 + this.rng() * 6,
            /** @type {{ x: number, y: number, egg?: any, kind?: string } | null} */
            target: null, /** @type {{ x: number, y: number, gate?: boolean }[]} */ wps: [], /** @type {any} */ egg: null, eggView: null,
            index: owner.index, acc: 0, far: false, shown: true, bb: null, steed: null, swim: false,
            lod: 0, /** @type {any[] | null} */ riderMeshes: rider ? rider.mesh.getChildMeshes(false) : null,
        };
        if (rides) {
            r.steed = PetView.create(scene, def.steed, { w: 1, ink: true });
            r.vmax = GameData.moveSpeed(d ? d.speed : 100) * cfg.speed * (0.92 + this.rng() * 0.16);
            r.swim = !!(d && d.ability === 'swim');
            const gate = plot.toWorld(plot.w / 2 + 520 + this.rng() * 300, (this.rng() - 0.5) * 700);
            r.x = gate.x; r.y = gate.y; r.heading = plot.heading + (this.rng() - 0.5) * 1.2;
            if (rider) { rider.root.parent = r.steed.seat; rider.root.position.set(0, -(rider.hipHeight - 4), 0); rider.root.rotation.set(0, 0, 0); }
        } else {
            // хозяин пешком: бродит по своему ранчо
            r.state = 'walk';
            r.vmax = 150;
            const roam = Ranch._roam(plot);
            const l = plot.toWorld(GameUtil.lerp(roam.x0, roam.x1, this.rng()), GameUtil.lerp(roam.y0, roam.y1, this.rng()));
            r.x = l.x; r.y = l.y;
            if (rider) rider.root.position.set(r.x, GameWorld.groundH(r.x, r.y), r.y);
        }
        r.h = GameWorld.groundH(r.x, r.y);
        this._navInit(r);
        r.bb = Billboard.add({ x: r.x, y: r.y, h: r.h + 330, className: 'npc-bb wood otx', maxDist: 2800, html: '<span>' + GameUtil.esc(owner.name) + '</span>' });
        owner.rider = r;
        this.riders.push(r);
        this._setRiderLod(r, 2);
        this._pose(r, 0);
    },

    // =============================================================================================
    // Кадр
    // =============================================================================================
    update(dt) {
        if (!this.ready_) return;
        this.time += dt;
        const P = typeof Player !== 'undefined' ? Player : null;
        const px = P ? P.x : 0, py = P ? P.y : 0;
        const cfg = npcCfg();
        this.cfg = cfg; this._px = px; this._py = py;
        this._pvx = P ? P.vx || 0 : 0; this._pvy = P ? P.vy || 0 : 0;
        for (const r of this.riders) this._tickRider(r, dt, px, py, cfg);
        for (const p of this.pets) this._tickPet(p, dt, px, py, cfg);
    },

    // --- Питомцы на ранчо ---------------------------------------------------------------------------
    _tickPet(p, dt, px, py, cfg) {
        const d = Math.hypot(p.x - px, p.y - py);
        const far = d > Math.min(cfg.far, cfg.petDist);
        if (far === p.shown) { p.shown = !far; p.view.setEnabled(!far); }
        if (far) return;
        const lod = this._lodFor(d, p.lod, 1500, 1500);
        if (lod !== p.lod) { p.lod = lod; p.view.setLod(lod); }
        if (p.wait > 0) p.wait -= dt;
        let k = 0;
        if (p.wait <= 0) {
            const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy);
            if (dist < 50) { p.wait = 1.5 + this.rng() * 5; this._petTarget(p); }
            else {
                const v = p.view, sp = 70 + 0.25 * Math.min(180, v.size.length);
                p.heading = GameUtil.dampAngle(p.heading, Math.atan2(dy, dx), 4, dt);
                const turn = Math.abs(GameUtil.angleDiff(p.heading, Math.atan2(dy, dx)));
                const f = turn > 0.9 ? 0.15 : 1;
                const step = Math.min(sp * f * dt, dist);
                p.x += Math.cos(p.heading) * step; p.y += Math.sin(p.heading) * step;
                k = 0.22 * f;
            }
        }
        const gh = GameWorld.groundH(p.x, p.y);
        p.view.update(dt, k);
        p.view.place(p.x, gh, p.y, p.heading, 0, 0);
    },

    // --- Наездники -----------------------------------------------------------------------------------
    _tickRider(r, dt, px, py, cfg) {
        const d = Math.hypot(r.x - px, r.y - py);
        const far = d > cfg.far;
        if (far !== r.far) { r.far = far; this._show(r, !far); }
        if (far) {
            r.acc += dt;
            if (r.acc < 0.3) return;
            dt = r.acc; r.acc = 0;
        } else {
            const lod = this._lodFor(d, r.lod, 1300, 3000);
            if (lod !== r.lod) this._setRiderLod(r, lod);
        }
        this._think(r, dt, far);
        if (!far) { this._social(r, dt, d, cfg); this._pose(r, dt); }
    },

    /** Уровень детализации по расстоянию до игрока с гистерезисом: t0 — полный (контур рёбер, обводка, тень), t1 — только обводка, дальше — только меш. */
    _lodFor(d, cur, t0, t1) {
        if (d < t0 * (cur === 0 ? 1.15 : 1)) return 0;
        if (d < t1 * (cur <= 1 ? 1.15 : 1)) return 1;
        return 2;
    },

    _setRiderLod(r, lod) {
        r.lod = lod;
        if (r.steed) r.steed.setLod(lod);
        if (r.riderMeshes) setActorLod(r.riderMeshes, lod, true);
    },

    _show(r, on) {
        if (r.shown === on) return;
        r.shown = on;
        if (r.steed) r.steed.setEnabled(on);
        if (r.rider) r.rider.setVisible(on);
        if (r.eggView && r.eggView.root) r.eggView.root.setEnabled(on);
        if (r.bb) r.bb.setVisible(on);
        if (r.say) r.say.setVisible(on && r.sayT > 0);
    },

    /** Состояния: idle (стоит, ждёт), go (едет к цели), carry (везёт яйцо домой), walk (хозяин пешком по ранчо). */
    _think(r, dt, far) {
        if (r.holdT > 0) r.holdT -= dt;
        switch (r.state) {
            case 'idle':
                r.speed = GameUtil.damp(r.speed, 0, 6, dt);
                r.wait -= dt;
                if (r.wait <= 0) this._chooseGoal(r);
                break;
            case 'go': {
                // яйцо исчезло (подобрал игрок или другой NPC), стало запрещённым или игрок подъехал вплотную — новая цель
                if (r.target && r.target.egg && !this._eggWanted(r, dt)) break;
                if (this._steer(r, dt, far)) this._arrive(r);
                break;
            }
            case 'carry':
                this._carryTimer(r, dt, far);
                if (r.state === 'carry' && this._steer(r, dt, far)) this._deliver(r);
                break;
            case 'walk': {
                r.wait -= dt;
                if (r.wait > 0) { r.speed = GameUtil.damp(r.speed, 0, 6, dt); break; }
                if (!r.target) {
                    const roam = Ranch._roam(r.plot);
                    const t = r.plot.toWorld(GameUtil.lerp(roam.x0, roam.x1, this.rng()), GameUtil.lerp(roam.y0, roam.y1, this.rng()));
                    r.target = { x: t.x, y: t.y, kind: 'walk' };
                    r.pace = 1;
                    r.wps.length = 0;
                    this._wpChanged(r);
                }
                if (this._steer(r, dt, far)) { r.target = null; r.wait = 2 + this.rng() * 5; }
                break;
            }
        }
    },

    /** Яйцо ещё живо и допустимо для этого наездника. */
    _eggStillOk(r, egg) {
        if (typeof Eggs === 'undefined' || Eggs.live.indexOf(egg) < 0) return false;
        const lock = typeof Shops !== 'undefined' && Shops.lock ? Shops.lock.egg : null;
        if (lock && (lock === egg || lock.uid === egg.uid)) return false;
        return true;
    },

    /** Цель-яйцо ещё нужна: живо, не под слежением игрока, игрок не подъехал к нему вплотную. false — цель брошена (наездник ждёт новую). */
    _eggWanted(r, dt) {
        const egg = r.target.egg;
        let ok = this._eggStillOk(r, egg);
        if (ok && (r.chk -= dt) <= 0) {
            r.chk = 0.5;
            if (Number.isFinite(this._px) && Math.hypot(egg.x - this._px, egg.y - this._py) < this._cfg().grace * 0.7) { ok = false; this._skip(r, egg, 45); }
        }
        if (!ok) { this._release(r); r.state = 'idle'; r.wait = 0.4; }
        return ok;
    },

    /** Не ехать за этим яйцом ближайшие sec секунд (не вышло доехать или игрок рядом). */
    _skip(r, egg, sec) {
        const keys = Object.keys(r.skip);
        if (keys.length > 24) for (const k of keys) if (r.skip[k] < this.time) delete r.skip[k];
        r.skip[egg.uid] = this.time + sec;
    },

    _release(r) {
        const t = r.target;
        if (t && t.egg && t.egg.npcClaim === r) t.egg.npcClaim = null;
        r.target = null;
        r.wps.length = 0;
    },

    /** Яйцо в руках ломается по таймеру GameData.EGGS[тип].break, как у игрока; не довёз — оно разбилось. */
    _carryTimer(r, dt, far) {
        if (!r.egg) return;
        r.egg.left -= dt;
        if (r.egg.left > 0) return;
        if (r.eggView) { try { r.eggView.dispose(); } catch (e) { /* уже убран */ } r.eggView = null; }
        const app = this.app;
        if (app && app.fx && !far) { try { app.fx.play('egg-break', [r.x, r.h + 110, r.y]); } catch (e) { /* без частиц */ } }
        r.egg = null;
        this._release(r);
        r.state = 'idle';
        r.wait = 3 + this.rng() * 3;
        this.stats.broke++;
    },

    /** Выбрать новую цель: объезд своего ранчо, достижимое и успеваемое яйцо, маркер яйца или отдых на хабе. */
    _chooseGoal(r) {
        const cfg = this._cfg();
        const E = typeof Eggs !== 'undefined' ? Eggs : null;
        r.wps.length = 0;
        r.target = null;
        if (!r.rides) { r.state = 'walk'; r.wait = 1; return; }
        const inside = this.plotZone(r.plot, r.x, r.y) !== 'out';
        // 1. своё ранчо: объехать питомцев, собрать деньги
        if (this.rng() < cfg.homeChance * (inside ? 1.5 : 1)) { this._goRanch(r); return; }
        // 2. яйцо: только то, которое доедет и довезёт
        if (E && E.live.length && this.rng() < 0.75) {
            const lock = typeof Shops !== 'undefined' && Shops.lock ? Shops.lock.egg : null;
            const ctx = { lock, px: this._px, py: this._py, allowRare: this.rng() < cfg.rare, by: r };
            const egg = this.pickEgg(r, E.live, ctx);
            if (egg) { egg.npcClaim = r; this._beginGo(r, egg.x, egg.y, 'egg', egg); return; }
        }
        // 3. маркер яйца: проверить место, где они появляются
        if (this._markers.length && this.rng() < 0.45) {
            for (let k = 0; k < 4; k++) {
                const m = this._markers[Math.floor(this.rng() * this._markers.length) % this._markers.length];
                if (this._tripOk(r, m.x, m.y)) { this._beginGo(r, m.x, m.y, 'marker'); return; }
            }
        }
        // 4. хаб: постоять у площади
        for (let k = 0; k < 3 && this.hubSpots.length; k++) {
            const s = this.hubSpots[Math.floor(this.rng() * this.hubSpots.length) % this.hubSpots.length];
            const x = s.x + (this.rng() - 0.5) * 300, y = s.y + (this.rng() - 0.5) * 300;
            if (this._tripOk(r, x, y)) { this._beginGo(r, x, y, 'hub'); return; }
        }
        r.state = 'idle';
        r.wait = 3 + this.rng() * 3;
    },

    /** Точка внутри игрового поля (диск GameWorld.clampToWorld): за краем NPC не доедет — упрётся в невидимую стену. */
    _inWorld(x, y) {
        const c = GameWorld.clampToWorld(x, y, 600);
        return Math.hypot(c.x - x, c.y - y) < 60;
    },

    /** К этой точке недавно не доехали (цель брошена): ближайшие минуты не едем. */
    _skipPoint(r, x, y, sec) {
        if (r.skipPts.length > 10) r.skipPts.shift();
        r.skipPts.push({ x, y, until: this.time + sec });
    },

    /** Точка (x, y) достижима и не дальше NPC_EGG_MAX_TRIP по времени в пути. */
    _tripOk(r, x, y) {
        const cfg = this._cfg();
        if (this.tripTime(r, Math.hypot(x - r.x, y - r.y)) > cfg.maxTrip || this.inAnyPlot(x, y, 40) || !this._inWorld(x, y)) return false;
        for (const q of r.skipPts) if (q.until > this.time && Math.hypot(q.x - x, q.y - y) < 250) return false;
        const s = this.routeStart(r);
        return this.routeOk(s.x, s.y, x, y, r.swim, this._radius(r) + 14);
    },

    /** Выехать к цели: kind — 'egg' | 'marker' | 'hub' | 'ranch'; маршрут строится сразу. */
    _beginGo(r, x, y, kind, egg) {
        r.target = { x, y, kind, egg };
        r.pace = (kind === 'egg' ? 1 : kind === 'marker' ? 0.8 : kind === 'hub' ? 0.7 : 0.55) * r.temper;
        r.state = 'go';
        this._plan(r, 0);
    },

    /** Объехать своё ранчо: точка в зоне прогулок питомцев (у ворот выезда не стоять). */
    _goRanch(r) {
        const plot = r.plot, roam = Ranch._roam(plot);
        const t = plot.toWorld(GameUtil.lerp(roam.x0, roam.x1 - 230, this.rng()), GameUtil.lerp(roam.y0, roam.y1, this.rng()));
        this._beginGo(r, t.x, t.y, 'ranch');
    },

    /** Цепочка путевых точек к r.target; v — вариант: 0 обычный, 1–2 запасные (шире у ворот и с боковой точкой в другую сторону). */
    _plan(r, v) {
        const t = r.target, cfg = this._cfg();
        r.wps.length = 0;
        if (!t) return;
        const route = this.planRoute(r.plot, r.x, r.y, t.x, t.y, { lead: cfg.gateLead * (1 + 0.5 * v) });
        for (const p of route) r.wps.push(p);
        if (v > 0 && this.plotZone(r.plot, r.x, r.y) === 'out') this._viaPoint(r, v);
        this._wpChanged(r);
    },

    /** Боковая точка пути в сторону, обратную прежнему объезду: другой путь вокруг озера, леса, скалы. */
    _viaPoint(r, v) {
        const wp = r.wps.length ? r.wps[0] : r.target;
        if (!wp) return;
        const dx = wp.x - r.x, dy = wp.y - r.y, d = Math.hypot(dx, dy);
        if (d < 500) return;
        const px = -dy / d, py = dx / d, rad = this._radius(r) * 1.6;
        const first = r.side ? -r.side : (this.rng() < 0.5 ? 1 : -1);
        for (let k = 0; k < 2; k++) {
            const s = k ? -first : first, off = 380 * v * s;
            const x = r.x + dx * 0.45 + px * off, y = r.y + dy * 0.45 + py * off;
            if (this._freeAt(r, x, y, rad) && !this.inAnyPlot(x, y, 80)) { r.wps.unshift({ x, y }); return; }
        }
    },

    /** Новая точка маршрута: счётчики застревания и продвижения начинаются заново. */
    _wpChanged(r) {
        r.bestD = Infinity; r.noProgT = 0; r.wpPrev = Infinity; r.stuckT = 0;
        r.wT = 0; r.wExp = 0; r.wX = r.x; r.wY = r.y; r.anX = r.x; r.anY = r.y;
    },

    /** Приехал к цели: взять яйцо (с шансом) или постоять и ехать дальше. */
    _arrive(r) {
        const cfg = npcCfg();
        const t = r.target;
        r.target = null;
        r.wps.length = 0;
        if (t && t.egg) {
            const egg = t.egg;
            const lock = typeof Shops !== 'undefined' && Shops.lock ? Shops.lock.egg : null;
            const ok = this._eggStillOk(r, egg) && this.eggAllowed(egg, { lock, px: this._px, py: this._py, allowRare: true, by: r }) && this.rng() < cfg.pickup;
            if (ok) { this._take(r, egg); return; }
            if (egg.npcClaim === r) egg.npcClaim = null;
        }
        r.state = 'idle';
        if (t && t.kind === 'ranch') {
            r.wait = 3 + this.rng() * 4;
            if (r.rider && !r.far && this.rng() < 0.6) r.rider.celebrate(1.4);
        } else r.wait = 3 + this.rng() * 9;
    },

    /** NPC подобрал яйцо: оно уходит из мира, у наездника в руках, едет домой через ворота (таймер разбивания тикает как у игрока). */
    _take(r, egg) {
        const E = Eggs, app = this.app;
        const P = typeof Player !== 'undefined' ? Player : null;
        const near = P ? Math.hypot(egg.x - P.x, egg.y - P.y) : 99999;
        const tier = GameData.TIERS[egg.def.tier];
        const type = egg.type;
        E._removeLive(egg, 'npc');
        if (E._updateBadge) E._updateBadge();
        r.egg = { type, left: egg.def.break };
        try {
            if (typeof EggView !== 'undefined') {
                const v = new EggView(app.location.view.scene, type, { glow: false, scale: 0.55 });
                if (r.rider) { v.root.parent = r.rider.root; v.root.position.set(38, r.rider.hipHeight + 22, 0); }
                r.eggView = v;
            }
        } catch (e) { r.eggView = null; }
        if (app.fx) { try { app.fx.play('egg-pickup', [egg.x, egg.h + 60, egg.y]); } catch (e) { /* без частиц */ } }
        if ((near < 3200 && tier && tier.rank >= GameData.TIERS.rare.rank) || (tier && tier.rank >= GameData.TIERS.legendary.rank)) {
            GameUI.toast(Lang.t('npc.took', { egg: GameData.eggName(type), name: r.name }), 'info', 3000);
        }
        Game.events.emit('egg:npc', { egg, name: r.name });
        // домой: сразу за воротами, чтобы довезти до конца таймера
        const home = r.plot.toWorld(r.plot.w / 2 - 22 - 380, (this.rng() - 0.5) * 300);
        r.target = { x: home.x, y: home.y, kind: 'home' };
        r.pace = r.temper;
        r.state = 'carry';
        this._plan(r, 0);
    },

    _deliver(r) {
        const app = this.app;
        if (r.eggView) { try { r.eggView.dispose(); } catch (e) { /* уже убран */ } r.eggView = null; }
        r.egg = null;
        if (app && app.fx) { try { app.fx.play('egg-pickup', [r.x, r.h + 120, r.y]); } catch (e) { /* без частиц */ } }
        if (r.rider && !r.far) r.rider.celebrate(1.6);
        r.target = null;
        r.wps.length = 0;
        r.state = 'idle';
        r.wait = 5 + this.rng() * 7;
        this.stats.delivered++;
    },

    // =============================================================================================
    // Движение: «усы», объезд, проскальзывание, застревание
    // =============================================================================================
    /** Вода глубже поверхности земли (непроходима для не плавающих). */
    _inWater(x, y) {
        const w = GameWorld.waterAt(x, y);
        return w != null && w > GameWorld.groundH(x, y) + 25;
    },

    /** Радиус столкновений наездника по размеру скакуна. */
    _radius(r) { return r.steed ? Math.max(48, r.steed.size.width * 0.45) : 36; },

    /** Подъём (тангенс) от высоты gh0 к точке (x, y) на длине step. */
    _slope(x, y, gh0, step) { return (GameWorld.groundH(x, y) - gh0) / Math.max(1, step); },

    /** Место свободно для круга радиуса rad: нет коллайдера и глубокой воды (для не плавающих). */
    _freeAt(r, x, y, rad) { return !GameWorld.colliders.resolve(x, y, rad).hit && (r.swim || !this._inWater(x, y)); },

    /** Начальные поля навигации наездника (создание и тесты). */
    _navInit(r) {
        r.steerH = r.heading; r.feelT = 0; r.commitH = 0; r.commitT = 0; r.side = 0; r.sideT = 0; r.slowK = 1;
        r.holdT = 0; r.backT = 0; r.backH = 0; r.ghostT = 0; r.chk = 0.5;
        r.wT = 0; r.wX = r.x; r.wY = r.y; r.wExp = 0; r.stuckT = 0;
        r.bestD = Infinity; r.noProgT = 0; r.wpPrev = Infinity;
        r.recN = 0; r.recT = 99;
        r.pace = 1; r.temper = 0.94 + this.rng() * 0.1;
        r.greetCd = 3 + this.rng() * 8; r.sayT = 0; r.say = null;
        r.skip = {}; r.skipPts = [];
        r.anX = r.x; r.anY = r.y;
        r.home = r.plot ? this.gatePoints(r.plot, Math.max(this._cfg().gateLead, this._cfg().plotMargin + 40)) : null;
    },

    /** Шаг к ближайшей точке маршрута (wps, затем target), разбитый на под-шаги ≤ 0.05 с: забор тонкий, а скорость до 1100 px/с. true — дошёл до последней. */
    _steer(r, dt, far) {
        let left = dt;
        while (left > 1e-4) {
            const h = Math.min(left, 0.05);
            left -= h;
            if (this._step(r, h, far)) return true;
        }
        return false;
    },

    /** Свободная дистанция вдоль курса ang (px, не больше la): до первой помехи — коллайдера, глубокой воды (кроме пловцов) или крутого подъёма. */
    _clear(r, ang, la, rad) {
        const C = GameWorld.colliders, lim = this._cfg().slope * 0.85;
        const c = Math.cos(ang), s = Math.sin(ang);
        const n = Math.max(2, Math.ceil(la / 90)), ds = la / n;
        let ph = r.h;
        for (let i = 1; i <= n; i++) {
            const d = ds * i, x = r.x + c * d, y = r.y + s * d;
            if (C.resolve(x, y, rad).hit) return d - ds;
            if (!r.swim && this._inWater(x, y)) return d - ds;
            const gh = GameWorld.groundH(x, y);
            if ((gh - ph) / ds > lim) return d - ds;
            ph = gh;
        }
        return la;
    },

    /**
     * «Усы»: куда ехать (r.steerH) и насколько притормозить (r.slowK). Свободно к точке — прямо; помеха — берём ближайший свободный
     * курс слева или справа (сторону держим и обходим с запасом), после касания — вдоль поверхности. К игроку и соседям — боковой уход.
     */
    _feel(r, wp, dist, cfg, arriveR) {
        const rad = this._radius(r) + 4;   // чуть больше радиуса столкновений: вплотную к стене касательный луч ещё свободен
        const want = Math.atan2(wp.y - r.y, wp.x - r.x);
        const la = GameUtil.clamp(dist - arriveR * 0.6, 100, cfg.look);   // что внутри круга прибытия, не мешает: там остановимся

        if (r.ghostT > 0) { r.steerH = want; r.slowK = 0.85; return; }   // «призрак»: прямо сквозь помеху
        let steer = want, slow = 1;
        if (r.backT > 0) { steer = r.backH; slow = 0.6; }
        else {
            let committed = false;
            if (r.commitT > 0) {
                if (this._clear(r, r.commitH, la, rad) >= la * 0.85) { steer = r.commitH; slow = 0.85; committed = true; }
                else r.commitT = 0;
            }
            if (!committed) {
                const c0 = this._clear(r, want, la, rad);
                if (c0 < la - 1) {
                    // ближайший полностью свободный курс слева (+) и справа (−)
                    let fullL = Infinity, fullR = Infinity, partL = 0, partR = 0;
                    for (let i = 0; i < 5; i++) {
                        const o = 0.4 * (i + 1) + (i > 2 ? 0.1 * (i - 2) : 0);
                        if (fullL === Infinity) { const c = this._clear(r, want + o, la, rad); if (c >= la - 1) fullL = o; else if (c > partL) partL = c; }
                        if (fullR === Infinity) { const c = this._clear(r, want - o, la, rad); if (c >= la - 1) fullR = o; else if (c > partR) partR = c; }
                        if (fullL !== Infinity && fullR !== Infinity) break;
                    }
                    let s;
                    const lock = r.sideT > 0 ? r.side : 0;
                    if (lock && (lock > 0 ? fullL : fullR) !== Infinity) s = lock;
                    else if (fullL !== Infinity || fullR !== Infinity) s = fullL === fullR ? (GameUtil.angleDiff(want, r.heading) >= 0 ? 1 : -1) : fullL < fullR ? 1 : -1;
                    else s = partL >= partR ? 1 : -1;
                    const o = s > 0 ? fullL : fullR;
                    const off = o !== Infinity ? o : 1.6;
                    r.side = s;
                    r.sideT = 1.4 + this.rng() * 0.6;
                    r.commitH = want + s * off;
                    r.commitT = 0.45 + 0.35 * off;
                    steer = r.commitH;
                    slow = o !== Infinity ? GameUtil.clamp(0.45 + 0.6 * c0 / la, 0.45, 0.95) : 0.35;
                }
            }
        }
        // дистанция до игрока и соседей: по точке наибольшего сближения (за ~0.8 с) — боковой уход и торможение, если тот впереди
        if (cfg.sep > 0 && r.holdT <= 0) {
            let dev = 0;
            const hx = Math.cos(steer), hy = Math.sin(steer);
            const mvx = Math.cos(r.heading) * r.speed, mvy = Math.sin(r.heading) * r.speed;
            const rs = this.riders;
            for (let i = 0; i <= rs.length; i++) {
                let ox, oy, ovx, ovy, R;
                if (i < rs.length) { const o = rs[i]; if (o === r) continue; ox = o.x; oy = o.y; ovx = Math.cos(o.heading) * o.speed; ovy = Math.sin(o.heading) * o.speed; R = cfg.sep; }
                else if (Number.isFinite(this._px)) { ox = this._px; oy = this._py; ovx = this._pvx; ovy = this._pvy; R = cfg.sep * 1.25; }
                else break;
                const ddx = r.x - ox, ddy = r.y - oy, d2 = ddx * ddx + ddy * ddy;
                if (d2 < 4) continue;
                const vx = mvx - ovx, vy = mvy - ovy, v2 = vx * vx + vy * vy;
                const tc = v2 > 1 ? GameUtil.clamp(-(ddx * vx + ddy * vy) / v2, 0, 0.8) : 0;
                const cx = ddx + vx * tc, cy = ddy + vy * tc, dc2 = cx * cx + cy * cy;
                if (dc2 > R * R) continue;
                const k = 1 - Math.sqrt(dc2) / R, d = Math.sqrt(d2);
                const ahead = -(ddx * hx + ddy * hy) / d;       // > 0: тот впереди по курсу
                if (ahead < -0.2) continue;
                const lat = cx * -hy + cy * hx;                 // > 0: в точке сближения он справа от курса — уходим влево
                dev += (lat > 0 ? 1 : lat < 0 ? -1 : (r.index & 1 ? 1 : -1)) * k * (0.4 + ahead);
                if (ahead > 0.3) slow = Math.min(slow, 1 - 0.6 * k * Math.min(1, 600 / d));
            }
            steer += GameUtil.clamp(dev, -0.9, 0.9);
        }
        r.steerH = steer;
        r.slowK = slow;
    },

    /** Упёрся в препятствие: нормаль наружу (hx, hy) -> курс вдоль поверхности в сторону цели (сторону держим). */
    _slide(r, wp, hx, hy) {
        const l = Math.hypot(hx, hy);
        if (l < 0.3) return;
        this.stats.contacts++;
        const tx = -hy / l, ty = hx / l;
        const want = Math.atan2(wp.y - r.y, wp.x - r.x);
        const dot = tx * Math.cos(want) + ty * Math.sin(want);
        const a1 = Math.atan2(ty, tx), o1 = GameUtil.angleDiff(want, a1);
        let s = dot >= 0 ? 1 : -1;
        if (Math.abs(dot) < 0.25 && r.sideT > 0 && r.side) s = (o1 >= 0 ? 1 : -1) === r.side ? 1 : -1;
        const a = s > 0 ? a1 : a1 + Math.PI;
        r.commitH = a; r.commitT = 0.4; r.steerH = a;
        if (!(r.sideT > 0 && r.side)) { r.side = GameUtil.angleDiff(want, a) >= 0 ? 1 : -1; r.sideT = 1.2; }
    },

    /** Один под-шаг движения к ближайшей путевой точке. true — дошёл до последней. */
    _step(r, dt, far) {
        const cfg = this._cfg();
        const wp = r.wps.length ? r.wps[0] : r.target;
        if (!wp) return true;
        const dist = Math.hypot(wp.x - r.x, wp.y - r.y);
        const last = !r.wps.length;
        const arriveR = last ? (r.state === 'walk' ? 70 : r.target && r.target.kind === 'ranch' ? 110 : 200) : (wp.gate ? 90 : 140);
        // дошёл или проскочил мимо точки (поворот шире радиуса прибытия)
        if (dist < arriveR || (!last && dist < arriveR * 2.6 && r.wpPrev < arriveR * 2.6 && dist > r.wpPrev + 0.5)) {
            if (last) return true;
            r.wps.shift();
            this._wpChanged(r);
            return false;
        }
        r.wpPrev = dist;
        r.sideT -= dt; r.commitT -= dt; r.recT += dt;
        if (r.backT > 0) r.backT -= dt;
        r.feelT -= dt;
        if (r.feelT <= 0) { r.feelT = 0.07 + this.rng() * 0.03; this._feel(r, wp, dist, cfg, arriveR); }
        const hold = r.holdT > 0;
        if (hold && Number.isFinite(this._px)) r.steerH = Math.atan2(this._py - r.y, this._px - r.x);
        r.heading = GameUtil.dampAngle(r.heading, r.steerH, r.rides ? 4.8 : 6, dt);
        const turn = Math.abs(GameUtil.angleDiff(r.heading, r.steerH));
        const turnK = turn > 1.1 ? 0.25 : turn > 0.5 ? 0.6 : 1;
        let vT = hold ? 0 : r.vmax * r.pace * turnK * r.slowK;
        if (wp.gate) vT = Math.min(vT, r.vmax * 0.55);
        if (last) vT *= GameUtil.clamp(dist / 450, 0.4, 1);
        if (r.backT > 0) vT = Math.min(vT, r.vmax * 0.5);
        r.speed = GameUtil.damp(r.speed, vT, 3.2, dt);
        const ghost = r.ghostT > 0;
        if (ghost) r.ghostT -= dt;
        const step = Math.min(r.speed * dt, Math.max(0, dist - 5));
        let nx = r.x + Math.cos(r.heading) * step, ny = r.y + Math.sin(r.heading) * step;
        if (step > 0.01 && !ghost) {
            // крутой подъём — как у игрока: скольжение по оси или остановка
            const gh0 = r.h, lim = cfg.slope;
            if (this._slope(nx, ny, gh0, step) > lim) {
                if (this._slope(nx, r.y, gh0, step) <= lim) ny = r.y;
                else if (this._slope(r.x, ny, gh0, step) <= lim) nx = r.x;
                else { nx = r.x; ny = r.y; r.speed *= 0.5; }
            }
            if (!r.swim && this._inWater(nx, ny)) {
                if (!this._inWater(nx, r.y)) ny = r.y;
                else if (!this._inWater(r.x, ny)) nx = r.x;
                else { nx = r.x; ny = r.y; r.speed *= 0.5; }
            }
        }
        let hit = false, hx = 0, hy = 0;
        if (!ghost) {
            const res = GameWorld.colliders.resolve(nx, ny, this._radius(r));
            if (res.hit) { hit = true; hx = res.x - nx; hy = res.y - ny; nx = res.x; ny = res.y; }
        }
        const c = GameWorld.clampToWorld(nx, ny, 600);
        r.x = c.x; r.y = c.y;
        if (hit) this._slide(r, wp, hx, hy);
        // застревание: за окно 0.5 с проехал меньше четверти того, что должен; или 5 с без заметного сближения с точкой
        r.wT += dt; r.wExp += vT * dt;
        if (r.wT >= 0.5) {
            const moved = Math.hypot(r.x - r.wX, r.y - r.wY);
            if (r.wExp > 40 && moved < r.wExp * 0.25) r.stuckT += r.wT; else r.stuckT = Math.max(0, r.stuckT - r.wT * 2);
            if (dist < r.bestD - 30) { r.bestD = dist; r.noProgT = 0; r.anX = r.x; r.anY = r.y; } else r.noProgT += r.wT;
            // долго не сближается, но уехал далеко от прежнего места — это длинный объезд (хаб, озеро), а не застревание
            if (r.noProgT >= cfg.stuckTime * 3.5 && Math.hypot(r.x - r.anX, r.y - r.anY) > 1200) { r.noProgT = 0; r.bestD = dist; r.anX = r.x; r.anY = r.y; }
            r.wT = 0; r.wX = r.x; r.wY = r.y; r.wExp = 0;
            if (r.stuckT >= cfg.stuckTime || r.noProgT >= cfg.stuckTime * 3.5) this._unstick(r, far);
        }
        r.h = GameWorld.groundH(r.x, r.y);
        if (r.swim) { const wl = GameWorld.waterAt(r.x, r.y); if (wl != null && wl - 22 > r.h) r.h = wl - 22; }
        return false;
    },

    /**
     * Застрял. Лестница по числу срывов за ~10 с: 1 — отступить и взять другую сторону; 2 — новый маршрут (шире, с боковой точкой);
     * 3 — бросить цель (с яйцом в руках — ещё один новый маршрут); дальше — вдали от игрока телепорт к свободной точке,
     * на виду — «призрак»: 1.6…3 с без коллайдеров, рывок сквозь помеху.
     */
    _unstick(r, far) {
        const S = this.stats;
        r.stuckT = 0; r.noProgT = 0; r.bestD = Infinity;
        r.recN = r.recT > 10 ? 1 : r.recN + 1;
        r.recT = 0;
        const n = r.recN;
        S.stuck++;
        this._dbg(r, 'stuck' + n);
        if (n === 1) {
            S.backoff++;
            r.side = r.side ? -r.side : (this.rng() < 0.5 ? -1 : 1);
            r.sideT = 3; r.commitT = 0;
            r.backH = r.heading + Math.PI + r.side * 0.7; r.backT = 0.8;
        } else if (n === 2) {
            S.replan++;
            r.backT = 0; r.commitT = 0;
            this._plan(r, 1);
        } else if (n === 3) {
            r.backT = 0; r.commitT = 0;
            if (r.state === 'carry' || !r.target) { S.replan++; this._plan(r, 2); }
            else { S.abandon++; this._abandon(r); }
        } else if (far) this._warp(r);
        else {
            S.ghost++;
            r.ghostT = n >= 6 ? 3 : 1.6; r.backT = 0; r.commitT = 0;
            if (n >= 5 && r.state === 'go') this._abandon(r);
        }
    },

    /** Бросить цель: яйцо запоминается как неудачное на минуту, наездник ждёт и выбирает другое. */
    _abandon(r) {
        if (r.target && r.target.egg) this._skip(r, r.target.egg, 60);
        else if (r.target) this._skipPoint(r, r.target.x, r.target.y, 150);
        this._release(r);
        r.state = 'idle';
        r.wait = 0.3;
    },

    /** Телепорт к ближайшей свободной точке в сторону цели — только когда наездник не нарисован (вдали от игрока). */
    _warp(r) {
        const wp = r.wps.length ? r.wps[0] : r.target;
        const rad = this._radius(r) * 1.5;
        const base = wp ? Math.atan2(wp.y - r.y, wp.x - r.x) : r.heading;
        const zone = this.plotZone(r.plot, r.x, r.y);
        for (let ring = 1; ring <= 4; ring++) {
            const d = 260 * ring;
            for (let k = 0; k < 10; k++) {
                const a = base + ((k & 1) ? 1 : -1) * Math.ceil(k / 2) * 0.55;
                const x = r.x + Math.cos(a) * d, y = r.y + Math.sin(a) * d;
                if (!this._freeAt(r, x, y, rad) || this.inAnyPlot(x, y, 40, zone === 'in' ? r.plot : undefined)) continue;
                this._moveTo(r, x, y);
                return;
            }
        }
        // свободной точки рядом нет: к воротам своего участка снаружи, цель сброшена
        if (r.home) this._moveTo(r, r.home.out.x, r.home.out.y);
        this._release(r);
        if (r.state !== 'walk') { r.state = 'idle'; r.wait = 1; }
    },

    _moveTo(r, x, y) {
        r.x = x; r.y = y; r.h = GameWorld.groundH(x, y);
        r.speed = 0; r.commitT = 0; r.backT = 0; r.sideT = 0; r.side = 0;
        this.stats.teleport++;
        this._dbg(r, 'warp');
        if (r.target) this._plan(r, 0); else this._wpChanged(r);
    },

    /** Отладка: последние события навигации (NPC.debug = true). */
    _dbg(r, what) {
        if (!this.debug) return;
        this.log.push({ t: +this.time.toFixed(1), who: r.name, what, x: Math.round(r.x), y: Math.round(r.y), state: r.state });
        if (this.log.length > 60) this.log.shift();
    },

    /** Завидев игрока, NPC притормаживает, машет рукой и говорит короткую фразу; не чаще NPC_GREET_COOLDOWN. */
    _social(r, dt, d, cfg) {
        if (r.sayT > 0 && (r.sayT -= dt) <= 0 && r.say) r.say.setVisible(false);
        r.greetCd -= dt;
        if (r.greetCd > 0 || cfg.greetDist <= 0 || !r.rider || r.state === 'carry' || r.holdT > 0) return;
        if (d > cfg.greetDist || d < 260) return;
        if (this.rng() < 0.4) {
            r.greetCd = cfg.greetCd * (0.8 + this.rng() * 0.5);
            r.holdT = 1.3;
            r.rider.wave(1.7);
            this._say(r, Lang.t(NPC_GREETINGS[Math.floor(this.rng() * NPC_GREETINGS.length) % NPC_GREETINGS.length]), 2.4);
            this.stats.greet++;
        } else r.greetCd = 0.6;
    },

    /** Короткая реплика над головой (отдельная подпись, создаётся при первой). */
    _say(r, text, sec) {
        if (typeof Billboard === 'undefined') return;
        if (!r.say) r.say = Billboard.add({ x: r.x, y: r.y, h: r.h + 400, className: 'npc-bb npc-say wood otx', maxDist: 2200, html: '' });
        r.say.setHtml('<span>' + GameUtil.esc(text) + '</span>');
        r.say.setVisible(true);
        r.sayT = sec;
    },

    /** Положение и анимация вида (только вблизи игрока). */
    _pose(r, dt) {
        const moving = r.speed > 25;
        if (r.steed) {
            const v = r.steed, terr = GameWorld.terrain;
            let pitch = 0, roll = 0;
            if (terr) { const t = terr.tiltAt(r.x, r.y, r.heading, v.length * 0.3, v.width * 0.3); pitch = t.pitch; roll = t.roll; }
            v.update(dt, GameUtil.clamp(r.speed / Math.max(300, r.vmax / Math.max(0.3, npcCfg().speed)), 0, 1), false, 0);
            v.place(r.x, r.h, r.y, r.heading, pitch, roll);
            if (r.rider) r.rider.update(dt, { moving, speed: 1, grounded: true, riding: true, carry: !!r.egg });
            if (r.bb) r.bb.setPos(r.x, r.y, r.h + v.seatHeight + 235);
            if (r.say && r.sayT > 0) r.say.setPos(r.x, r.y, r.h + v.seatHeight + 300);
        } else if (r.rider) {
            r.rider.root.position.set(r.x, r.h, r.y);
            r.rider.root.rotation.set(0, -r.heading, 0);
            r.rider.update(dt, { moving, speed: 0.7, grounded: true, riding: false, carry: false });
            if (r.bb) r.bb.setPos(r.x, r.y, r.h + 255);
            if (r.say && r.sayT > 0) r.say.setPos(r.x, r.y, r.h + 320);
        }
    },

    // =============================================================================================
    // Для других модулей
    // =============================================================================================
    /** Цели для молний (питомцы NPC и их скакуны в радиусе range от точки): { x, y, top, view, rec }. */
    strikeTargets(range, px, py) {
        const out = [];
        for (const p of this.pets) {
            if (!p.shown || Math.hypot(p.x - px, p.y - py) > range) continue;
            out.push({ x: p.x, y: p.y, top: GameWorld.groundH(p.x, p.y) + p.view.size.height, view: p.view, rec: p });
        }
        for (const r of this.riders) {
            if (!r.steed || r.far || Math.hypot(r.x - px, r.y - py) > range) continue;
            out.push({ x: r.x, y: r.y, top: r.h + r.steed.size.height + 170, view: r.steed, rec: r.steedRec || (r.steedRec = { mutation: null }) });
        }
        return out;
    },
};

Game.register(NPC);
