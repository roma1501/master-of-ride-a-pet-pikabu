// PetView.js — 3D-вид питомца: модель из реестра PET_MODEL_FILES (Model3D.load + build) или, пока модели нет, запасная
// фигура из примитивов Babylon с теми же именами частей. Анимация — процедурная, трансформом частей по походке
// (gait из GameData.PETS): quad, biped, hop, slide, slither, spider, swim, fly + дыхание в покое.
//
//   const v = PetView.create(scene, species, { w, mutation })   w — вес-фактор (масштаб 0.85…1.45; ОГРОМНЫЙ питомец — до HUGE_PET_WEIGHT), mutation — id или null
//   v.root           TransformNode: положение и курс задаёт владелец (v.place(x, h, y, heading, pitch, roll))
//   v.seat           TransformNode для наездника (не масштабируется: единичный масштаб у детей); v.trailAnchor — точка следа
//   v.update(dt, speed01, flying, air)   speed01 = текущая скорость / максимальная (0..1), flying — в полёте, air — прыжок
//   v.setMutation(id) (хранит id; визуал — фаза 2, хук v.onMutation), v.setSaddle(factory) — factory(scene, view) -> узел,
//   v.setWeight(w), v.setEnabled(on) (дальний питомец — без анимации и отрисовки), v.dispose()
//   v.length / v.width / v.height (px, с масштабом), v.hover (парение у swim), v.gait, v.ability, v.ready (модель загружена)
//   PetView.preload(['snail', …])        загрузить модели реестра заранее (под экраном загрузки)
//   PetView.drawIcon(species, size)      нарисованная иконка питомца (dataURL) — пока нет иконок в реестре
// Части модели (docs/DESIGN.md, tools/blender): body, head, neck, head_l/head_r, shell, mane, tail, tail_N, leg_fl/fr/bl/br,
// leg_l/leg_r, leg_l1..4/leg_r1..4, arm_l/arm_r, wing_l/wing_r, fin_l/fin_r, seg_N. Начало части — её сустав (pivot);
// недостающие части пропускаются. Координаты модели: x вперёд, y вверх, z вбок (левый борт — −Z), ноги на y = 0.
// Метаданные JSON (seat, trail, head, length, width, height) — в точках модели; нет файла — берутся из габарита.

/** Внешний вид запасной фигуры. a — архетип по походке; размеры в px, цвета — hex. */
const PET_LOOKS = {
    snail: { a: 'slide', len: 130, h: 62, c1: '#f0c97e', c2: '#e0663a', c3: '#fff3d6' },
    turtle: { a: 'quad', len: 135, bh: 50, bw: 96, legH: 30, legT: 28, headR: 24, snout: 16, ears: 'none', tail: 'stub', shell: true, c1: '#62b04a', c2: '#8c5a2a', c3: '#f4e6a8' },
    sloth: { a: 'quad', len: 110, bh: 58, bw: 60, legH: 56, legT: 22, headR: 28, snout: 8, ears: 'none', tail: 'none', c1: '#a58b69', c2: '#ecdcc0', c3: '#4a3a2a', mask: true },
    axolotl: { a: 'quad', len: 140, bh: 38, bw: 58, legH: 20, legT: 14, headR: 32, snout: 4, ears: 'gills', tail: 'long', c1: '#ffb7cb', c2: '#ff7aa2', c3: '#ffe3ec' },
    koala: { a: 'quad', len: 95, bh: 68, bw: 62, legH: 46, legT: 20, headR: 32, snout: 8, ears: 'biground', tail: 'none', c1: '#a0a6af', c2: '#ececee', c3: '#2a2a30', bigNose: true },
    capybara: { a: 'quad', len: 170, bh: 72, bw: 74, legH: 40, legT: 20, headR: 31, snout: 26, ears: 'small', tail: 'none', c1: '#a8763f', c2: '#d4a76c', c3: '#3a2414', blocky: true },
    chicken: { a: 'biped', len: 100, bh: 82, bw: 70, legH: 44, neck: 14, headR: 22, beak: 'short', crest: true, wings: true, tailLen: 38, c1: '#fff7e8', c2: '#ffb21e', c3: '#e8392f' },
    pig: { a: 'quad', len: 150, bh: 84, bw: 86, legH: 36, legT: 21, headR: 34, snout: 14, ears: 'floppy', tail: 'curl', c1: '#ffa6bc', c2: '#ff7c9c', c3: '#d95c82', flatSnout: true },
    elephant: { a: 'quad', len: 270, bh: 150, bw: 140, legH: 120, legT: 58, headR: 56, snout: 0, ears: 'huge', tail: 'stub', trunk: true, c1: '#9fabb8', c2: '#7f8c9b', c3: '#f4f0e6', tusks: true },
    panda: { a: 'quad', len: 165, bh: 104, bw: 98, legH: 54, legT: 34, headR: 42, snout: 16, ears: 'round', tail: 'stub', c1: '#fbfbfb', c2: '#26262b', c3: '#26262b', patches: true },
    kangaroo: { a: 'hop', len: 120, bh: 130, bw: 80, legH: 70, headR: 28, ears: 'long', c1: '#d08a4a', c2: '#f0cf9c', c3: '#3a2414', tailLen: 150 },
    deer: { a: 'quad', hoof: '#2a1a10', len: 200, bh: 72, bw: 58, legH: 112, legT: 17, headR: 25, snout: 28, ears: 'point', tail: 'stub', antlers: true, c1: '#bb7a3e', c2: '#f3dfb8', c3: '#3a2414' },
    spider: { a: 'spider', len: 120, bh: 66, c1: '#3a2b4a', c2: '#e8392f', c3: '#7a5aa0' },
    crocodile: { a: 'quad', len: 300, bh: 62, bw: 96, legH: 36, legT: 26, headR: 34, snout: 82, ears: 'none', tail: 'long', c1: '#4fa84a', c2: '#d9e88a', c3: '#f5f0dc', ridges: true },
    gorilla: { a: 'quad', len: 170, bh: 120, bw: 120, legH: 78, legT: 38, headR: 38, snout: 14, ears: 'small', tail: 'none', c1: '#3b3b43', c2: '#6b6b74', c3: '#1c1c20', bigArms: true },
    snake: { a: 'slither', len: 380, r: 32, c1: '#58c04a', c2: '#e8d94a', c3: '#e8392f' },
    horse: { a: 'quad', hoof: '#2a1a10', len: 300, bh: 92, bw: 72, legH: 128, legT: 26, headR: 30, snout: 44, ears: 'point', tail: 'bushy', mane: true, c1: '#a5612d', c2: '#3a2414', c3: '#f4e6d0' },
    wolf: { a: 'quad', len: 220, bh: 70, bw: 58, legH: 72, legT: 22, headR: 28, snout: 36, ears: 'point', tail: 'bushy', c1: '#8d96a3', c2: '#e6eaf0', c3: '#262a30' },
    shark: { a: 'swim', len: 330, bh: 96, bw: 78, c1: '#6f8fb0', c2: '#e8f1f8', c3: '#1c2430' },
    lion: { a: 'quad', len: 250, bh: 86, bw: 78, legH: 82, legT: 30, headR: 34, snout: 22, ears: 'round', tail: 'tuft', mane: true, c1: '#e0a44a', c2: '#b8662a', c3: '#3a2414' },
    ostrich: { a: 'biped', len: 130, bh: 100, bw: 80, legH: 122, neck: 118, headR: 20, beak: 'flat', wings: true, tailLen: 50, c1: '#3a3438', c2: '#f1e0c0', c3: '#ffb21e' },
    fox: { a: 'quad', len: 190, bh: 60, bw: 52, legH: 64, legT: 20, headR: 26, snout: 30, ears: 'point', tail: 'bushy', c1: '#f08a2a', c2: '#fff4e4', c3: '#2a1a10', whiteTail: true },
    giraffe: { a: 'quad', hoof: '#3a2414', len: 250, bh: 100, bw: 72, legH: 170, legT: 28, headR: 26, snout: 22, ears: 'small', tail: 'tuft', neck: 160, horns: true, c1: '#f0c14a', c2: '#a8662a', c3: '#3a2414', spots: true },
    cheetah: { a: 'quad', len: 240, bh: 62, bw: 52, legH: 80, legT: 20, headR: 24, snout: 22, ears: 'round', tail: 'long', c1: '#f0cc6a', c2: '#fff1d0', c3: '#2a1a10', spots: true },
    unicorn: { a: 'quad', len: 290, bh: 90, bw: 70, legH: 120, legT: 25, headR: 30, snout: 40, ears: 'point', tail: 'bushy', mane: true, horn: true, c1: '#fdf6ff', c2: '#ff8ad8', c3: '#c88aff', rainbowMane: true },
    trex: { a: 'biped', len: 270, bh: 150, bw: 110, legH: 120, neck: 40, headR: 52, beak: 'jaw', arms: true, tailLen: 190, c1: '#5aa844', c2: '#d7e88a', c3: '#f5f0dc', ridges: true },
    phoenix: { a: 'fly', len: 190, bh: 72, bw: 66, wing: 190, headR: 24, c1: '#ff5a2a', c2: '#ffd21f', c3: '#fff3a8', tailLen: 220, crest: true },
    cerberus: { a: 'quad', len: 290, bh: 112, bw: 100, legH: 100, legT: 30, headR: 36, snout: 34, ears: 'point', tail: 'tuft', heads3: true, c1: '#2c2630', c2: '#e8392f', c3: '#ffb21e', fire: true },
    kitsune: { a: 'quad', len: 220, bh: 62, bw: 54, legH: 70, legT: 20, headR: 27, snout: 32, ears: 'point', tail: 'bushy', tails: 5, c1: '#fdfdfd', c2: '#e8392f', c3: '#7a8cff' },
    dragon: { a: 'fly', len: 300, bh: 110, bw: 100, wing: 320, headR: 38, c1: '#4fb05a', c2: '#d9e88a', c3: '#ffb21e', tailLen: 280, horns: true, dragon: true },
};

// --- Мини-конструктор частей: примитивы -> один меш с вершинными цветами --------------------------
// spec: { k: 'box'|'ell'|'cyl'|'cone', a: размеры, at: [x, y, z], rot?: [rx, ry, rz], c: '#hex' }
const PV = {
    box(w, h, d, at, c, rot) { return { k: 'box', a: [w, h, d], at, c, rot }; },
    ell(sx, sy, sz, at, c, rot) { return { k: 'ell', a: [sx, sy, sz], at, c, rot }; },
    cyl(h, dTop, dBot, at, c, rot) { return { k: 'cyl', a: [h, dTop, dBot], at, c, rot }; },
    cone(h, d, at, c, rot) { return { k: 'cyl', a: [h, 0, d], at, c, rot }; },
};
const PET_EYE = '#15151a', PET_WHITE = '#ffffff';

/**
 * Уровень детализации «актёра» (питомец, наездник): 0 — контур рёбер, обводка и тень; 1 — только обводка силуэта;
 * 2 — только сам меш (один draw call на деталь). Каждая деталь при полной отрисовке — до 4 проходов, поэтому дальние
 * NPC рисуются проще. Переключать с гистерезисом у владельца (обводка и тень добавляются и снимаются с меша). allowInk = false — контур
 * рёбер у этого объекта не включается и на уровне 0 (дешёвые питомцы NPC-ранчо).
 * @param {any[]} meshes @param {number} level @param {boolean} [allowInk]
 */
function setActorLod(meshes, level, allowInk = true) {
    const view = typeof PetView !== 'undefined' ? PetView.view : null;
    if (!view || typeof World3D === 'undefined') return;
    const c = World3D.cfg();
    for (const m of meshes) {
        if (!m || m.isDisposed() || !(m.getTotalVertices && m.getTotalVertices() > 0)) continue;
        const md = m.metadata || (m.metadata = {});
        if (md.lod === level) continue;
        const wantInk = level === 0 && allowInk, wantOutline = level <= 1, wantShadow = level === 0;
        // контур рёбер не разбираем, а выключаем флагом (дёшево и без пересборки при возврате; draw call исчезает)
        const er = m._edgesRenderer;
        if (wantInk) { if (er) er.isEnabled = true; else World3D.inkMesh(m, 'actor', c); } else if (er) er.isEnabled = false;
        if (wantOutline !== (md.lod == null || md.lod <= 1)) { if (wantOutline) World3D.outlineAdd(view, m, 'actor', c); else World3D.outlineRemove(view, m); }
        if (view.shadow) { try { if (wantShadow) view.shadow.addShadowCaster(m, false); else view.shadow.removeShadowCaster(m, false); } catch (e) { /* без теней */ } }
        md.lod = level;
    }
}

// --- ArcBatch: молнии, электрические дуги, лучи и свечения одним мешем ---------------------------------------------
// Все полосы и «капли света» мутаций и грозы рисует один меш (один draw call): камера-обращённые четырёхугольники в
// общем буфере, аддитивное смешивание без записи глубины, свой контур не нужен. Дуга хранится либо в мировых координатах,
// либо в локальных координатах узла (дуга по телу питомца ездит вместе с ним). Режим «сразу»: line()/sprite() в кадре
// владельца (буфер сбрасывается каждый flush); режим «хранимая дуга»: add() — живёт life секунд и гаснет.
// Текстура одна: левая половина — профиль полосы (яркая сердцевина, мягкий край), правая — круглое пятно света.
const ARC_CAP = 520;

class ArcBatch {
    /** @param {BABYLON.Scene} scene */
    constructor(scene) {
        this.scene = scene;
        const cap = this.cap = ARC_CAP;
        this.pos = new Float32Array(cap * 12);
        this.col = new Float32Array(cap * 16);
        this.uv = new Float32Array(cap * 8);
        const nor = new Float32Array(cap * 12), idx = new Uint16Array(cap * 6);
        for (let i = 0; i < cap; i++) {
            const v = i * 4, o = i * 6;
            idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v + 2; idx[o + 4] = v + 1; idx[o + 5] = v + 3;
            for (let k = 0; k < 4; k++) nor[i * 12 + k * 3 + 1] = 1;
        }
        /** @type {any[]} */
        this.arcs = [];
        this.s = 0;
        this._prev = 0;
        this._valid = false;
        this.cx = 0; this.cy = 0; this.cz = 0;
        this.rx = 1; this.ry = 0; this.rz = 0; this.ux = 0; this.uy = 1; this.uz = 0;
        this._tmp = new Float32Array(96 * 3);
        this._bmin = new BABYLON.Vector3(); this._bmax = new BABYLON.Vector3();
        const mesh = this.mesh = new BABYLON.Mesh('arc-batch', scene);
        const vd = new BABYLON.VertexData();
        vd.positions = this.pos; vd.normals = nor; vd.colors = this.col; vd.uvs = this.uv; vd.indices = idx;
        vd.applyToMesh(mesh, true);
        mesh.hasVertexAlpha = true;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.doNotSyncBoundingInfo = true;
        const tex = new BABYLON.DynamicTexture('arc-tex', { width: 128, height: 64 }, scene, true);
        const g = tex.getContext();
        g.clearRect(0, 0, 128, 64);
        // левая часть (x 0..55) — профиль полосы, зазор 56..63 прозрачный (иначе билинейный фильтр подмешивает полосу в пятно)
        for (let y = 0; y < 64; y++) {
            const d = (y - 31.5) / 31.5;
            const a = Math.min(1, Math.exp(-d * d * 14) * 1.1 + Math.exp(-d * d * 120) * 0.6) * (y === 0 || y === 63 ? 0 : 1);
            g.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
            g.fillRect(0, y, 56, 1);
        }
        // правая половина (x 64..127, квадрат 64×64) — круглое пятно света, радиус 31 — к краю прозрачность 0
        const gr = g.createRadialGradient(96, 32, 0, 96, 32, 31);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.5)'); gr.addColorStop(0.7, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(64, 0, 64, 64);
        tex.update();
        tex.hasAlpha = true;
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        const mat = new BABYLON.StandardMaterial('arc-mat', scene);
        mat.diffuseTexture = tex;
        mat.useAlphaFromDiffuseTexture = true;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.disableLighting = true;
        mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        mat.disableDepthWrite = true;
        mat.backFaceCulling = false;
        mat.fogEnabled = false;
        mat.zOffset = -3;
        mat.metadata = { toon: false };
        mesh.material = mat;
        mesh.setEnabled(false);
    }

    /** Камера-базис кадра (правая и верхняя оси камеры, положение). */
    _prep() {
        const cam = this.scene.activeCamera;
        if (!cam) return false;
        const m = cam.getViewMatrix().m, p = cam.position;
        this.cx = p.x; this.cy = p.y; this.cz = p.z;
        this.rx = m[0]; this.ry = m[4]; this.rz = m[8];
        this.ux = m[1]; this.uy = m[5]; this.uz = m[9];
        this._valid = true;
        return true;
    }

    /** Полоса от a до b шириной w0 → w1, цвет r, g, b (0..1), прозрачность a. */
    line(ax, ay, az, bx, by, bz, w0, w1, r, g, b, a) {
        if (this.s >= this.cap || a <= 0.004) return;
        if (!this._valid && !this._prep()) return;
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const mx = this.cx - (ax + bx) * 0.5, my = this.cy - (ay + by) * 0.5, mz = this.cz - (az + bz) * 0.5;
        let sx = dy * mz - dz * my, sy = dz * mx - dx * mz, sz = dx * my - dy * mx;
        const sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (sl < 1e-6) return;
        const k = 1 / sl;
        sx *= k; sy *= k; sz *= k;
        const i = this.s++, p = this.pos, o = i * 12, h0 = w0 * 0.5, h1 = w1 * 0.5;
        p[o] = ax - sx * h0; p[o + 1] = ay - sy * h0; p[o + 2] = az - sz * h0;
        p[o + 3] = ax + sx * h0; p[o + 4] = ay + sy * h0; p[o + 5] = az + sz * h0;
        p[o + 6] = bx - sx * h1; p[o + 7] = by - sy * h1; p[o + 8] = bz - sz * h1;
        p[o + 9] = bx + sx * h1; p[o + 10] = by + sy * h1; p[o + 11] = bz + sz * h1;
        const c = this.col, q = i * 16;
        for (let v = 0; v < 4; v++) { c[q + v * 4] = r; c[q + v * 4 + 1] = g; c[q + v * 4 + 2] = b; c[q + v * 4 + 3] = a; }
        const u = this.uv, t = i * 8;
        u[t] = 0.25; u[t + 1] = 0; u[t + 2] = 0.25; u[t + 3] = 1; u[t + 4] = 0.25; u[t + 5] = 0; u[t + 6] = 0.25; u[t + 7] = 1;
    }

    /** Круглое пятно света размером size (px мира) лицом к камере. */
    sprite(x, y, z, size, r, g, b, a) {
        if (this.s >= this.cap || a <= 0.004) return;
        if (!this._valid && !this._prep()) return;
        const i = this.s++, p = this.pos, o = i * 12, h = size * 0.5;
        const Rx = this.rx * h, Ry = this.ry * h, Rz = this.rz * h, Ux = this.ux * h, Uy = this.uy * h, Uz = this.uz * h;
        p[o] = x - Rx - Ux; p[o + 1] = y - Ry - Uy; p[o + 2] = z - Rz - Uz;
        p[o + 3] = x - Rx + Ux; p[o + 4] = y - Ry + Uy; p[o + 5] = z - Rz + Uz;
        p[o + 6] = x + Rx - Ux; p[o + 7] = y + Ry - Uy; p[o + 8] = z + Rz - Uz;
        p[o + 9] = x + Rx + Ux; p[o + 10] = y + Ry + Uy; p[o + 11] = z + Rz + Uz;
        const c = this.col, q = i * 16;
        for (let v = 0; v < 4; v++) { c[q + v * 4] = r; c[q + v * 4 + 1] = g; c[q + v * 4 + 2] = b; c[q + v * 4 + 3] = a; }
        const u = this.uv, t = i * 8;
        u[t] = 0.5; u[t + 1] = 0; u[t + 2] = 0.5; u[t + 3] = 1; u[t + 4] = 1; u[t + 5] = 0; u[t + 6] = 1; u[t + 7] = 1;
    }

    /**
     * Хранимая дуга: { pts: плоский массив x, y, z, n: число точек, node?: узел (точки в его локальных координатах), w0, w1, r, g, b, a,
     * life, delay?, flick? }.
     */
    add(arc) {
        arc.age = 0; arc.seed = Math.random() * 6.283;
        if (!(arc.life > 0)) arc.life = 0.15;
        if (this.arcs.length < 240) this.arcs.push(arc);
        return arc;
    }

    /** Конец кадра владельцев: хранимые дуги стареют и рисуются, буфер уходит на GPU. dt — игровое время кадра. */
    flush(dt) {
        if (!this._valid) this._prep();
        const arcs = this.arcs, tmp = this._tmp;
        for (let i = arcs.length - 1; i >= 0; i--) {
            const a = arcs[i];
            a.age += dt;
            const t = a.age - (a.delay || 0);
            if (t >= a.life || (a.node && a.node.isDisposed())) { arcs[i] = arcs[arcs.length - 1]; arcs.pop(); continue; }
            if (t < 0) continue;
            const k = 1 - t / a.life;
            let al = a.a * k;
            if (a.flick) { const f = 0.5 + 0.5 * Math.sin(t * 64 + a.seed); al *= 0.35 + 0.65 * f * (k + 0.35); }
            if (al <= 0.004) continue;
            const n = Math.min(a.n, 96);
            let P = a.pts;
            if (a.node) {
                const m = a.node.getWorldMatrix().m;
                for (let j = 0; j < n; j++) {
                    const x = a.pts[j * 3], y = a.pts[j * 3 + 1], z = a.pts[j * 3 + 2];
                    tmp[j * 3] = x * m[0] + y * m[4] + z * m[8] + m[12];
                    tmp[j * 3 + 1] = x * m[1] + y * m[5] + z * m[9] + m[13];
                    tmp[j * 3 + 2] = x * m[2] + y * m[6] + z * m[10] + m[14];
                }
                P = tmp;
            }
            for (let j = 0; j < n - 1; j++) {
                const f0 = j / (n - 1), f1 = (j + 1) / (n - 1);
                this.line(P[j * 3], P[j * 3 + 1], P[j * 3 + 2], P[j * 3 + 3], P[j * 3 + 4], P[j * 3 + 5],
                    a.w0 + (a.w1 - a.w0) * f0, a.w0 + (a.w1 - a.w0) * f1, a.r, a.g, a.b, al);
            }
        }
        const s = this.s, mesh = this.mesh;
        // сортировка прозрачных идёт по центру габарита меша: ставим его в точку камеры — дуги и свечения рисуются поверх воды и прочих прозрачных
        const cam = this.scene.activeCamera;
        if (cam && s > 0) {
            const p = cam.position, bb = mesh.getBoundingInfo();
            this._bmin.copyFromFloats(p.x - 1, p.y - 1, p.z - 1); this._bmax.copyFromFloats(p.x + 1, p.y + 1, p.z + 1);
            bb.reConstruct(this._bmin, this._bmax);
        }
        if (s > 0 || this._prev > 0) {
            // квадраты прошлого кадра, не занятые в этом, — в нулевой площади (число индексов меша не меняем: иначе подмеш теряет габарит)
            if (this._prev > s) this.pos.fill(0, s * 12, this._prev * 12);
            mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, this.pos);
            if (s > 0) {
                mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this.col);
                mesh.updateVerticesData(BABYLON.VertexBuffer.UVKind, this.uv);
            }
            if (!mesh.isEnabled()) mesh.setEnabled(true);
        } else if (mesh.isEnabled()) mesh.setEnabled(false);
        this._prev = s;
        this.s = 0;
        this._valid = false;
    }

    /**
     * Ломаная молнии от a до b: seg отрезков, смещение поперёк до jag px (затухает к концам). Плоский массив x, y, z.
     * @param {number} ax @param {number} ay @param {number} az @param {number} bx @param {number} by @param {number} bz
     * @param {number} seg @param {number} jag
     */
    static bolt(ax, ay, az, bx, by, bz, seg, jag) {
        const out = new Float32Array((seg + 1) * 3);
        for (let i = 0; i <= seg; i++) {
            const t = i / seg, e = Math.sin(Math.PI * t) * jag;
            out[i * 3] = ax + (bx - ax) * t + (Math.random() * 2 - 1) * e * (i && i < seg ? 1 : 0);
            out[i * 3 + 1] = ay + (by - ay) * t;
            out[i * 3 + 2] = az + (bz - az) * t + (Math.random() * 2 - 1) * e * (i && i < seg ? 1 : 0);
        }
        return out;
    }
}

// --- MutationFX: вид мутаций питомцев и яиц -------------------------------------------------------------------------
// Дёшево: частицы — по ОДНОЙ общей системе на мутацию (ParticleFX, точка рождения выбирается среди ближних носителей через
// startPositionFunction), дуги и свечение — общий ArcBatch, оттенок — материалы самого питомца. Носитель (owner) — любой объект
// с полями mutation, node() — TransformNode тела, enabled(), shape() — эллипсоид тела { cy, ax, ay, az, size } в локальных
// координатах узла; подключается attach(owner), снимается detach(handle).
// Цвета — по замыслу: Наэлектризован (shocked) — голубые искры, Вольтовый (volted) — жёлтые дуги, Ярость (rage) — красная
// аура и угольки, Пустота (void) — тёмно-фиолетовые завитки, Вечность (eternal) — золотое свечение и лучи.
const MUT_LOOK = {
    shocked: { c: [0.35, 0.85, 1], c2: [0.9, 0.99, 1], tint: [0.8, 0.95, 1.2], em: [0.08, 0.22, 0.42], arcs: 4, arcN: 7, arcW: 6, arcEvery: [0.03, 0.08], glow: 0.55, flash: 0.45 },
    volted: { c: [1, 0.8, 0.12], c2: [1, 0.98, 0.72], tint: [1.15, 1.05, 0.7], em: [0.4, 0.3, 0.02], arcs: 5, arcN: 9, arcW: 7.4, arcEvery: [0.03, 0.07], glow: 0.6, flash: 0.5 },
    rage: { c: [1, 0.18, 0.08], c2: [1, 0.6, 0.2], tint: [1.15, 0.75, 0.7], em: [0.45, 0.04, 0.02], arcs: 0, glow: 0.8, pulse: 4 },
    void: { c: [0.55, 0.2, 1], c2: [0.85, 0.65, 1], tint: [0.55, 0.42, 0.8], em: [0.16, 0.04, 0.3], arcs: 0, glow: 0.55, pulse: 2 },
    eternal: { c: [1, 0.8, 0.25], c2: [1, 0.96, 0.75], tint: [1.15, 1.08, 0.9], em: [0.42, 0.32, 0.08], arcs: 0, glow: 0.7, rays: 9, pulse: 2.2 },
};
// Слои общих систем частиц: rate — на одного ближнего носителя.
const MUT_PARTICLES = {
    shocked: [{ rate: 70, capacity: 140, life: [0.14, 0.38], size: [9, 16], speed: [0, 36], color: '#f2fdff', color2: '#4fd0ff', direction: [[-1, -0.4, -1], [1, 1.2, 1]], sizeGradient: [[0, 1], [1, 0.1]] }],
    volted: [{ rate: 74, capacity: 150, life: [0.14, 0.4], size: [10, 18], speed: [0, 40], color: '#fffbd0', color2: '#ffc61f', direction: [[-1, -0.4, -1], [1, 1.2, 1]], sizeGradient: [[0, 1], [1, 0.1]] }],
    rage: [
        { rate: 44, capacity: 150, life: [0.8, 1.7], size: [12, 22], speed: [30, 90], gravity: [0, 80, 0], direction: [[-0.5, 0.5, -0.5], [0.5, 1.5, 0.5]], sizeGradient: [[0, 0.8], [0.4, 1], [1, 0.15]], colorGradient: [[0, '#fff0a0', 1], [0.3, '#ff7a1a', 0.95], [1, '#8a0a0a', 0]] },
        { rate: 7, capacity: 40, life: [1.1, 1.9], size: [40, 66], speed: [10, 30], gravity: [0, 45, 0], blend: 'standard', direction: [[-0.3, 0.7, -0.3], [0.3, 1.2, 0.3]], sizeGradient: [[0, 0.4], [1, 1.5]], colorGradient: [[0, '#4a0c0a', 0.55], [1, '#1a0606', 0]] },
    ],
    void: [
        { rate: 18, capacity: 90, life: [1.2, 2.2], size: [44, 74], speed: [10, 36], gravity: [0, 36, 0], blend: 'standard', direction: [[-0.5, 0.4, -0.5], [0.5, 1.3, 0.5]], sizeGradient: [[0, 0.4], [0.5, 1], [1, 1.5]], colorGradient: [[0, '#6a22c0', 0], [0.25, '#3a1070', 0.75], [1, '#14052a', 0]] },
        { rate: 22, capacity: 90, life: [0.7, 1.4], size: [9, 16], speed: [8, 30], gravity: [0, 45, 0], direction: [[-0.5, 0.3, -0.5], [0.5, 1.2, 0.5]], color: '#e2b8ff', color2: '#a24dff', sizeGradient: [[0, 0.3], [0.3, 1], [1, 0]] },
    ],
    eternal: [{ rate: 30, capacity: 130, life: [1, 2], size: [10, 18], speed: [14, 46], gravity: [0, 55, 0], direction: [[-0.5, 0.3, -0.5], [0.5, 1.4, 0.5]], color: '#fff6c8', color2: '#ffd04a', sizeGradient: [[0, 0.2], [0.3, 1], [1, 0]] }],
};

/** @satisfies {Record<string, any>} */
const MutationFX = {
    LOOK: MUT_LOOK,
    /** @type {any[]} */
    targets: [],
    /** @type {Record<string, any[]>} */
    near: {},
    /** @type {Record<string, { handle: any, base: number }[]>} */
    sys: {},
    t: 0,
    _rr: 0,
    /** Когда повторить создание общей системы частиц мутации, если бюджет частиц был исчерпан (id -> t). @type {Record<string, number>} */
    _failT: {},

    attach(owner) {
        const h = { owner, arcT: Math.random() * 0.2, phase: Math.random() * 6.28, sh: null, mx: null, mats: null, seed: Math.random() };
        this.targets.push(h);
        return h;
    },
    detach(h) {
        if (!h || h.dead) return;
        h.dead = true;
        const i = this.targets.indexOf(h);
        if (i >= 0) { this.targets[i] = this.targets[this.targets.length - 1]; this.targets.pop(); }
    },

    /** Случайная точка на поверхности эллипсоида тела носителя (мировые координаты) -> pos. */
    _surface(h, pos, k) {
        const sh = h.sh, m = h.mx;
        const z = Math.random() * 2 - 1, a = Math.random() * 6.2832, r = Math.sqrt(1 - z * z);
        const lx = r * Math.cos(a) * sh.ax * k, ly = sh.cy + z * sh.ay * k, lz = r * Math.sin(a) * sh.az * k;
        pos.x = lx * m[0] + ly * m[4] + lz * m[8] + m[12];
        pos.y = lx * m[1] + ly * m[5] + lz * m[9] + m[13];
        pos.z = lx * m[2] + ly * m[6] + lz * m[10] + m[14];
    },

    _ensureSys(id) {
        let list = this.sys[id];
        if (list) return list;
        if (this._failT[id] > this.t) return null;
        const app = typeof Game !== 'undefined' ? Game.app : null;
        const fx = app && app.fx;
        const layers = MUT_PARTICLES[id];
        if (!fx || !layers) return null;
        list = [];
        for (const L of layers) {
            const handle = fx.create(Object.assign({}, L, { position: [0, -50000, 0], rate: 0.001 }));
            if (!handle) continue;
            handle.system.startPositionFunction = (wm, pos) => {
                const near = this.near[id], n = near ? near.length : 0;
                if (!n) { pos.x = 0; pos.y = -50000; pos.z = 0; return; }
                this._surface(near[(this._rr++) % n], pos, 1.04);
            };
            list.push({ handle, base: L.rate });
        }
        if (!list.length) { this._failT[id] = this.t + 3; return null; }
        this.sys[id] = list;
        return list;
    },

    _spawnArc(h, L) {
        const sh = h.sh, n = L.arcN + (Math.random() * 3 | 0);
        const pts = new Float32Array(n * 3);
        // дуги чаще на стороне, обращённой к камере (h.cl — направление на камеру в локальных осях тела): иначе их закрывает само тело
        const cl = h.cl || [0, 1, 0];
        let ux = cl[0] * 1.2 + Math.random() * 1.6 - 0.8, uy = cl[1] * 1.2 + Math.random() * 1.6 - 0.8, uz = cl[2] * 1.2 + Math.random() * 1.6 - 0.8;
        for (let j = 0; j < n; j++) {
            ux += (Math.random() - 0.5) * 0.95 + cl[0] * 0.14; uy += (Math.random() - 0.5) * 0.95 + cl[1] * 0.14; uz += (Math.random() - 0.5) * 0.95 + cl[2] * 0.14;
            const l = Math.hypot(ux, uy, uz) || 1;
            ux /= l; uy /= l; uz /= l;
            const e = 1.22 + (Math.random() - 0.5) * 0.2;
            pts[j * 3] = ux * sh.ax * e; pts[j * 3 + 1] = sh.cy + uy * sh.ay * e; pts[j * 3 + 2] = uz * sh.az * e;
        }
        const node = h.owner.node(), life = 0.1 + Math.random() * 0.14;
        PetView.arcs.add({ pts, n, node, w0: L.arcW * 1.9, w1: L.arcW * 1.2, r: L.c[0], g: L.c[1], b: L.c[2], a: 0.9, life, flick: true });
        PetView.arcs.add({ pts, n, node, w0: L.arcW * 0.7, w1: L.arcW * 0.45, r: L.c2[0], g: L.c2[1], b: L.c2[2], a: 1, life: life * 0.9, flick: true });
    },

    /** Ореол мутации id вокруг точки мира: пятно света позади объекта (от камеры), вокруг силуэта виден цветной ореол. k — яркость 0..1. */
    halo(cx, cy, cz, size, id, k) {
        const L = MUT_LOOK[id], arcs = PetView.arcs, view = PetView.view;
        if (!L || !arcs || !view || !view.scene.activeCamera) return;
        const cp = view.scene.activeCamera.position;
        const vx = cx - cp.x, vy = cy - cp.y, vz = cz - cp.z, vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1, f = size * 0.3 / vl;
        arcs.sprite(cx + vx * f, cy + vy * f, cz + vz * f, size, L.c[0], L.c[1], L.c[2], L.glow * k);
    },

    /** Материалы носителя: оттенок и подсветка (в update — пульс). */
    _tint(h, id) {
        const ow = h.owner;
        if (!ow.mats) return;
        const mats = ow.mats();
        const L = MUT_LOOK[id];
        for (const m of mats) {
            const md = m.metadata || (m.metadata = {});
            if (!md.pvBase) md.pvBase = m.diffuseColor.clone();
            if (id && L) m.diffuseColor.copyFromFloats(md.pvBase.r * L.tint[0], md.pvBase.g * L.tint[1], md.pvBase.b * L.tint[2]);
            else { m.diffuseColor.copyFrom(md.pvBase); m.emissiveColor.copyFromFloats(0, 0, 0); }
        }
        h.mats = mats;
    },

    update(dt) {
        const targets = this.targets;
        const view = PetView.view, arcs = PetView.arcs;
        if (!view || !arcs) return;
        this.t += dt;
        const cam = view.scene.activeCamera;
        if (!cam) return;
        const cp = cam.position;
        const maxD = typeof MUTATION_FX_DIST !== 'undefined' ? MUTATION_FX_DIST : 3200, max2 = maxD * maxD;
        for (const id in this.near) this.near[id].length = 0;
        const scale = typeof GameWorld !== 'undefined' ? GameWorld.fxScale : 1;
        for (let i = targets.length - 1; i >= 0; i--) {
            const h = targets[i], ow = h.owner;
            const node = ow.node();
            if (!node || node.isDisposed()) { this.detach(h); continue; }
            const id = ow.mutation, L = MUT_LOOK[id];
            if (h.id !== id) { h.id = id; this._tint(h, id); }
            if (!L || !ow.enabled()) continue;
            const wp = node.getAbsolutePosition();
            const dx = wp.x - cp.x, dy = wp.y - cp.y, dz = wp.z - cp.z;
            if (dx * dx + dy * dy + dz * dz > max2) continue;
            const m = h.mx = node.getWorldMatrix().m;
            h.sh = ow.shape();
            if (L.arcs) {   // направление на камеру в локальных осях тела
                const s2 = (m[0] * m[0] + m[1] * m[1] + m[2] * m[2]) || 1, vx = cp.x - wp.x, vy = cp.y - wp.y, vz = cp.z - wp.z;
                const lx = (vx * m[0] + vy * m[1] + vz * m[2]) / s2, ly = (vx * m[4] + vy * m[5] + vz * m[6]) / s2, lz = (vx * m[8] + vy * m[9] + vz * m[10]) / s2;
                const ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
                h.cl = h.cl || [0, 1, 0];
                h.cl[0] = lx / ll; h.cl[1] = ly / ll; h.cl[2] = lz / ll;
            }
            (this.near[id] || (this.near[id] = [])).push(h);
            const sc = Math.hypot(m[0], m[1], m[2]) || 1;
            // подсветка материалов: пульс (ярость, вечность, пустота), вспышки (электричество)
            let k;
            if (L.pulse) k = 0.55 + 0.45 * Math.sin(this.t * L.pulse + h.phase);
            else k = 0.6 + (Math.random() < 0.12 ? 1.4 : 0) * (L.flash || 0.3);
            if (h.mats) for (const mt of h.mats) mt.emissiveColor.copyFromFloats(L.em[0] * k, L.em[1] * k, L.em[2] * k);
            // дуги по телу
            if (L.arcs && (h.arcT -= dt) <= 0) {
                h.arcT = L.arcEvery[0] + Math.random() * (L.arcEvery[1] - L.arcEvery[0]);
                for (let a = 0; a < L.arcs; a++) if (Math.random() < 0.75 * Math.min(1, scale + 0.3)) this._spawnArc(h, L);
            }
            // свечение вокруг тела и лучи
            let cx = m[4] * h.sh.cy + m[12], cy = m[5] * h.sh.cy + m[13], cz = m[6] * h.sh.cy + m[14];
            const size = h.sh.size * sc;
            {   // сдвиг от камеры: тело закрывает середину пятна, вокруг силуэта остаётся ореол
                const vx = cx - cp.x, vy = cy - cp.y, vz = cz - cp.z, vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1, k = size * 0.42 / vl;
                cx += vx * k; cy += vy * k; cz += vz * k;
            }
            // вблизи камеры ореол слабее: иначе большой питомец у самого объектива заливает экран
            const camK = GameUtil.clamp((Math.sqrt(dx * dx + dy * dy + dz * dz) - size * 0.5) / (size * 2.4), 0.18, 1);
            const ga = camK * L.glow * (L.pulse ? 0.6 + 0.4 * Math.sin(this.t * L.pulse + h.phase) : 0.7 + 0.3 * Math.random());
            arcs.sprite(cx, cy, cz, size * 1.7, L.c[0], L.c[1], L.c[2], ga);
            if (L.rays) {
                const R = size * 1.25, a0 = this.t * 0.55 + h.phase, pr = 0.7 + 0.3 * Math.sin(this.t * 2.2 + h.phase);
                if (!arcs._valid) arcs._prep();
                for (let r = 0; r < L.rays; r++) {
                    const ang = a0 + r * 6.2832 / L.rays, ca = Math.cos(ang), sa = Math.sin(ang);
                    const ex = arcs.rx * ca + arcs.ux * sa, ey = arcs.ry * ca + arcs.uy * sa, ez = arcs.rz * ca + arcs.uz * sa;
                    const len = R * (r % 2 ? 0.7 : 1);
                    arcs.line(cx + ex * R * 0.28, cy + ey * R * 0.28, cz + ez * R * 0.28, cx + ex * len, cy + ey * len, cz + ez * len, size * 0.12, size * 0.015, L.c2[0], L.c2[1], L.c2[2], 0.7 * pr * camK);
                }
            }
        }
        // общие системы частиц: скорость рождения — по числу ближних носителей
        for (const id in this.near) {
            const n = this.near[id].length;
            let list = this.sys[id];
            if (!list && n) list = this._ensureSys(id);
            if (!list) continue;
            const r = Math.min(n, 5) * scale;
            for (const s of list) s.handle.setRate(n ? s.base * r : 0.001);
        }
    },
};

/** @satisfies {Record<string, any>} */
const PetView = {
    id: 'petview',
    /** @type {View3D | null} */
    view: null,
    /** @type {Map<string, Promise<any>>} */
    _models: new Map(),
    /** @type {Record<string, any>} */
    _ready: {},
    LOOKS: PET_LOOKS,
    /** @type {WeakMap<object, any>} */
    _mats: new WeakMap(),
    DEFAULT_SCALE: 1,
    /** Контур рёбер у питомцев (false — только обводка силуэта, дешевле при создании). */
    ink: true,

    /** Общий пакет дуг, молний и свечений (ArcBatch): Weather.js и мутации рисуют в него. @type {ArcBatch | null} */
    arcs: null,

    /** Меши-эффекты (аддитивные дуги, ореолы, лучи): слои обводки считают чужие меши заслонкой маски и чертят вокруг них чёрную линию. @type {any[]} */
    _exempt: [],
    _layerCount: -1,

    /** Исключить меш-эффект из слоёв обводки (HighlightLayer): без этого аддитивные квады поверх питомца рисуются с чёрным контуром. */
    exempt(mesh) {
        if (!mesh) return;
        if (this._exempt.indexOf(mesh) < 0) this._exempt.push(mesh);
        this._syncLayers(true);
    },

    /** Применить исключения ко всем слоям сцены (слои появляются лениво — при первой обводке группы). */
    _syncLayers(force) {
        const view = this.view;
        if (!view) return;
        const layers = /** @type {any[]} */ (view.scene.effectLayers || []);
        if (!force && layers.length === this._layerCount) return;
        this._layerCount = layers.length;
        this._exempt = this._exempt.filter(m => !m.isDisposed());
        for (const l of layers) {
            if (typeof l.addExcludedMesh !== 'function') continue;
            for (const m of this._exempt) { try { l.addExcludedMesh(m); } catch (e) { /* слой без списка исключений */ } }
        }
    },

    init(app) {
        this.view = app.location ? app.location.view : null;
        if (this.view && !this.arcs) {
            this.arcs = new ArcBatch(this.view.scene);
            this.exempt(this.arcs.mesh);
            // после всех модулей: хранимые дуги стареют по игровому времени, буфер уходит на GPU
            if (typeof app.onUpdate === 'function') app.onUpdate((dt) => { if (this.arcs) this.arcs.flush(dt); });
        }
    },

    /** Кадр: вид мутаций (частицы, дуги, свечение). */
    update(dt) { this._syncLayers(false); MutationFX.update(dt); },

    look(species) { return PET_LOOKS[species] || PET_LOOKS.snail; },

    /** Предел масштаба питомца: 1.6 для обычных, вес-фактор ОГРОМНОГО питомца (GameData.hugeCfg().w), если он больше. */
    maxScale() {
        const huge = typeof GameData !== 'undefined' && typeof GameData.hugeCfg === 'function' ? Number(GameData.hugeCfg().w) : 0;
        return Math.max(1.6, huge > 0 ? Math.min(3, huge) : 0);
    },

    /** Материал с вершинными цветами (один на сцену). */
    _material(scene) {
        let m = this._mats.get(scene);
        if (!m) {
            m = new BABYLON.StandardMaterial('pet-vc', scene);
            m.diffuseColor = new BABYLON.Color3(1, 1, 1);
            m.specularColor = new BABYLON.Color3(0, 0, 0);
            this._mats.set(scene, m);
        }
        return m;
    },

    /**
     * Один меш из примитивов (спецификации PV.*) с вершинными цветами и общим материалом — части питомцев, наездник.
     * @param {BABYLON.Scene} scene
     * @param {string} name
     * @param {any[]} specs
     */
    buildMesh(scene, name, specs) {
        const B = BABYLON.MeshBuilder;
        const meshes = [];
        for (const s of specs) {
            let m;
            if (s.k === 'box') m = B.CreateBox('b', { width: s.a[0], height: s.a[1], depth: s.a[2] }, scene);
            else if (s.k === 'ell') { m = B.CreateSphere('e', { diameter: 1, segments: 7 }, scene); m.scaling.set(s.a[0], s.a[1], s.a[2]); }
            else m = B.CreateCylinder('c', { height: s.a[0], diameterTop: s.a[1], diameterBottom: s.a[2], tessellation: 9, subdivisions: 1 }, scene);
            m.position.set(s.at[0], s.at[1], s.at[2]);
            if (s.rot) m.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
            const n = m.getTotalVertices();
            const col = BABYLON.Color3.FromHexString(s.c || '#cccccc');
            const arr = new Float32Array(n * 4);
            for (let i = 0; i < n; i++) { arr[i * 4] = col.r; arr[i * 4 + 1] = col.g; arr[i * 4 + 2] = col.b; arr[i * 4 + 3] = 1; }
            m.setVerticesData(BABYLON.VertexBuffer.ColorKind, arr);
            meshes.push(m);
        }
        const merged = meshes.length > 1 ? BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, false) : meshes[0];
        merged.name = name;
        merged.material = this._material(scene);
        merged.isPickable = false;
        return merged;
    },

    /** Загрузить модели реестра заранее (Promise; нет записи или ошибка — тихо пропускается). */
    preload(list) {
        return Promise.all((list || []).map(sp => this.loadModel(sp)));
    },

    /** Модель и метаданные питомца из реестра: Promise<{ model, meta } | null>; результат кэшируется. */
    loadModel(species) {
        const f = PetModels.pet(species);
        if (!f || !f.model) return Promise.resolve(null);
        let p = this._models.get(species);
        if (!p) {
            p = Promise.all([Model3D.load(f.model), PetModels.petMeta(species)]).then(([model, meta]) => {
                const rec = { model, meta };
                this._ready[species] = rec;
                return rec;
            }).catch((e) => { console.warn('PetView: модель ' + species + ' не загрузилась —', (e && e.message) || e); return null; });
            this._models.set(species, p);
        }
        return p;
    },

    /**
     * Создать вид питомца. Модель из реестра, если она загружена (иначе — запасная фигура, а модель подменит её сама).
     * @param {BABYLON.Scene} scene
     * @param {string} species
     * @param {{ w?: number, mutation?: string | null, ink?: boolean }} [opts]
     */
    create(scene, species, opts = {}) {
        return new PetViewInstance(scene, species, opts);
    },

    // --- Иконка питомца (canvas) -----------------------------------------------------------
    /** Нарисованная иконка-«мордочка» питомца: dataURL PNG с прозрачным фоном. */
    drawIcon(species, size = 128) {
        if (typeof document === 'undefined') return '';
        const L = this.look(species);
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const g = cv.getContext('2d');
        const S = size / 128;
        g.scale(S, S);
        g.lineJoin = 'round';
        const ink = '#17110c';
        const blob = (x, y, rx, ry, fill, w = 5) => {
            g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.lineWidth = w; g.strokeStyle = ink; g.stroke();
        };
        const tri = (x1, y1, x2, y2, x3, y3, fill) => {
            g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 5; g.strokeStyle = ink; g.stroke();
        };
        const a = L.a;
        const ears = L.ears;
        if (a === 'slide') {
            blob(64, 92, 52, 22, L.c1); blob(52, 56, 34, 32, L.c2); blob(52, 56, 18, 17, '#f4a070', 4); blob(100, 70, 17, 17, L.c1);
        } else if (a === 'slither') {
            blob(64, 98, 48, 18, L.c1); blob(64, 78, 36, 20, L.c1); blob(80, 52, 30, 28, L.c1); blob(88, 44, 7, 7, '#fff', 3);
        } else if (a === 'fly') {
            tri(10, 60, 62, 30, 56, 78, L.c2); tri(118, 60, 66, 30, 72, 78, L.c2); blob(64, 76, 34, 34, L.c1);
        } else if (a === 'swim') {
            tri(64, 14, 40, 52, 90, 52, L.c1); blob(64, 78, 52, 30, L.c1); blob(64, 92, 38, 14, L.c2, 3);
        } else if (a === 'spider') {
            for (let i = 0; i < 4; i++) { g.lineWidth = 7; g.strokeStyle = ink; g.beginPath(); g.moveTo(40, 70 + i * 8); g.lineTo(8, 52 + i * 18); g.moveTo(88, 70 + i * 8); g.lineTo(120, 52 + i * 18); g.stroke(); }
            blob(64, 78, 36, 32, L.c1);
        } else {
            if (ears === 'point') { tri(26, 50, 34, 8, 62, 34, L.c1); tri(102, 50, 94, 8, 66, 34, L.c1); }
            else if (ears === 'round' || ears === 'biground') { const r = ears === 'biground' ? 22 : 15; blob(28, 36, r, r, L.c1); blob(100, 36, r, r, L.c1); }
            else if (ears === 'floppy') { tri(24, 34, 34, 70, 52, 28, L.c2); tri(104, 34, 94, 70, 76, 28, L.c2); }
            else if (ears === 'huge') { blob(18, 66, 24, 36, L.c2); blob(110, 66, 24, 36, L.c2); }
            else if (ears === 'long') { blob(44, 22, 11, 26, L.c1); blob(84, 22, 11, 26, L.c1); }
            else if (ears === 'small') { blob(32, 38, 10, 10, L.c1); blob(96, 38, 10, 10, L.c1); }
            if (a === 'biped') blob(64, 66, 42, 44, L.c1); else blob(64, 70, 46, 42, L.c1);
            if (L.patches) { blob(40, 62, 12, 15, L.c2, 3); blob(88, 62, 12, 15, L.c2, 3); }
            if (L.snout > 18 && a !== 'biped') blob(64, 92, 24, 17, L.c2); else if (a !== 'biped') blob(64, 90, 20, 14, L.c2);
            if (a === 'biped') { tri(56, 80, 72, 80, 64, 100, L.c2 || '#ffb21e'); if (L.crest) blob(64, 24, 9, 11, L.c3, 3); }
            if (L.horn) tri(58, 26, 70, 26, 64, -2, '#ffe9a0');
            if (L.mane) { blob(64, 28, 30, 14, L.c2, 4); }
            blob(64, 84, 6.5, 5, L.bigNose ? '#2a2a30' : '#2a1d18', 3);
            if (L.trunk) { blob(64, 100, 11, 24, L.c1); }
        }
        blob(46, 62, 8, 9.5, '#fff', 4); blob(82, 62, 8, 9.5, '#fff', 4);
        g.fillStyle = ink; g.beginPath(); g.arc(48, 64, 4.6, 0, Math.PI * 2); g.arc(84, 64, 4.6, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(50, 61.5, 1.7, 0, Math.PI * 2); g.arc(86, 61.5, 1.7, 0, Math.PI * 2); g.fill();
        return cv.toDataURL('image/png');
    },
};

// --- Запасные фигуры: описание частей по архетипу ---------------------------------------------------
// Возвращает { parts: { имя: { pivot: [x, y, z], specs: [...] } }, seat, trail, head, length, width, height }.
function petBuild(L) {
    const P = PV;
    const parts = {};
    const part = (name, pivot, specs) => { parts[name] = { pivot, specs }; };
    // Части, у которых размеры заданы в координатах модели: переводим в координаты сустава.
    const partAbs = (name, pivot, specs) => part(name, pivot, specs.map(s => Object.assign({}, s, { at: [s.at[0] - pivot[0], s.at[1] - pivot[1], s.at[2] - pivot[2]] })));
    const eyes = (specs, hx, hy, hz, r) => {
        for (const s of [-1, 1]) {
            specs.push(P.ell(r * 1.1, r * 1.3, r * 0.9, [hx, hy, s * hz], PET_WHITE));
            specs.push(P.ell(r * 0.7, r * 0.95, r * 0.7, [hx + r * 0.32, hy - r * 0.05, s * hz], PET_EYE));
        }
    };
    const a = L.a;
    let seat = [0, 100, 0], trail = [-60, 20, 0], head = [60, 100, 0], length = 200, width = 80, height = 120;

    if (a === 'quad') {
        const len = L.len, bh = L.bh || len * 0.4, bw = L.bw || len * 0.38, lh = L.legH != null ? L.legH : len * 0.32, lt = L.legT || len * 0.09;
        const hr = L.headR || len * 0.17, sn = L.snout != null ? L.snout : hr * 0.8;
        const by = lh + bh * 0.5;
        const neck = L.neck || 0;
        const sp = [];
        sp.push(P.ell(len, bh, bw, [0, by, 0], L.c1));
        if (L.c2 && !L.patches && !L.shell) sp.push(P.ell(len * 0.78, bh * 0.55, bw * 0.84, [0, by - bh * 0.28, 0], L.c2));
        if (L.patches) { sp.push(P.ell(len * 0.32, bh * 0.6, bw * 1.04, [-len * 0.08, by, 0], L.c2)); }
        if (L.shell) {
            sp.length = 0;
            sp.push(P.ell(len * 0.82, bh * 0.58, bw * 0.78, [0, lh + bh * 0.2, 0], L.c3));
            sp.push(P.ell(len * 0.96, bh * 1.0, bw * 1.0, [0, lh + bh * 0.62, 0], L.c2));
            sp.push(P.ell(len * 0.5, bh * 0.45, bw * 0.55, [-len * 0.04, lh + bh * 0.95, 0], '#a8703a'));
        }
        if (L.spots) for (let i = 0; i < 7; i++) sp.push(P.ell(len * 0.08, bh * 0.2, bw * 1.02, [(-0.34 + i * 0.115) * len, by + (i % 2 ? 0.14 : -0.12) * bh, 0], L.c3 === '#3a2414' ? L.c2 : L.c3));
        if (L.ridges) for (let i = 0; i < 6; i++) sp.push(P.cone(bh * 0.28, bh * 0.22, [(-0.36 + i * 0.13) * len, by + bh * 0.52, 0], L.c3));
        if (L.bigArms) { /* плечи гориллы — часть тела */ sp.push(P.ell(len * 0.4, bh * 0.7, bw * 1.22, [len * 0.22, by + bh * 0.12, 0], L.c1)); }
        partAbs('body', [0, by, 0], sp);
        // голова
        const hx = len * 0.5 + hr * 0.25, hy = by + bh * 0.28 + neck * 0.9 + (L.shell ? -bh * 0.2 : 0);
        const hs = [];
        if (neck) hs.push(P.cyl(neck * 1.1, hr * 0.55, hr * 0.75, [-hr * 0.2, -neck * 0.5, 0], L.c1, [0, 0, -0.3]));
        hs.push(P.ell(hr * 2, hr * 1.9, hr * 1.9, [0, 0, 0], L.c1));
        const snx = hr * 0.8 + sn * 0.35;
        if (sn > 0) hs.push(P.ell(sn + hr * 0.7, hr * (L.flatSnout ? 1.0 : 0.82), hr * (L.flatSnout ? 1.1 : 0.9), [snx, -hr * 0.2, 0], L.c2 && !L.mask ? L.c2 : L.c1));
        if (L.mask) hs.push(P.ell(hr * 1.1, hr * 0.8, hr * 1.5, [hr * 0.35, hr * 0.05, 0], L.c2));
        hs.push(P.ell(hr * 0.42, hr * 0.32, hr * 0.5, [snx + sn * 0.5 + hr * 0.35, -hr * 0.05, 0], L.bigNose ? '#2a2a30' : L.c3 && L.c3 !== L.c1 ? '#2a1d18' : '#2a1d18'));
        eyes(hs, hr * 0.62, hr * 0.28, hr * 0.62, Math.max(4, hr * 0.2));
        const E = L.ears;
        for (const s of [-1, 1]) {
            if (E === 'point') hs.push(P.cone(hr * 1.1, hr * 0.7, [-hr * 0.1, hr * 1.05, s * hr * 0.58], L.c1, [s * 0.3, 0, 0]));
            else if (E === 'round') hs.push(P.ell(hr * 0.7, hr * 0.7, hr * 0.28, [-hr * 0.1, hr * 0.95, s * hr * 0.7], L.c1 === '#fbfbfb' ? L.c2 : L.c1));
            else if (E === 'biground') hs.push(P.ell(hr * 0.95, hr * 0.95, hr * 0.32, [-hr * 0.15, hr * 0.9, s * hr * 0.95], L.c1));
            else if (E === 'small') hs.push(P.ell(hr * 0.4, hr * 0.5, hr * 0.28, [-hr * 0.2, hr * 0.9, s * hr * 0.7], L.c1));
            else if (E === 'floppy') hs.push(P.ell(hr * 0.5, hr * 0.8, hr * 0.28, [-hr * 0.1, hr * 0.7, s * hr * 0.85], L.c2, [s * 0.5, 0, 0]));
            else if (E === 'huge') hs.push(P.ell(hr * 0.3, hr * 1.7, hr * 1.5, [-hr * 0.35, hr * 0.1, s * hr * 1.5], L.c2));
            else if (E === 'long') hs.push(P.ell(hr * 0.3, hr * 1.7, hr * 0.4, [-hr * 0.2, hr * 1.45, s * hr * 0.4], L.c1));
            else if (E === 'gills') for (let i = 0; i < 3; i++) hs.push(P.cone(hr * 0.8, hr * 0.28, [-hr * 0.3, hr * (0.4 + i * 0.32), s * hr * (0.95 + i * 0.12)], L.c2, [s * (1.1 + i * 0.1), 0, 0]));
        }
        if (L.antlers) for (const s of [-1, 1]) {
            hs.push(P.cyl(hr * 1.6, hr * 0.12, hr * 0.18, [-hr * 0.2, hr * 1.5, s * hr * 0.5], '#e8d4a0', [s * 0.3, 0, 0]));
            hs.push(P.cyl(hr * 0.9, hr * 0.1, hr * 0.14, [hr * 0.2, hr * 1.9, s * hr * 0.7], '#e8d4a0', [s * 0.8, 0, -0.5]));
        }
        if (L.horn) hs.push(P.cone(hr * 2.1, hr * 0.4, [hr * 0.35, hr * 1.9, 0], '#fff0b0', [0, 0, -0.45]));
        if (L.horns) for (const s of [-1, 1]) { hs.push(P.cyl(hr * 0.9, hr * 0.25, hr * 0.3, [-hr * 0.1, hr * 1.25, s * hr * 0.35], '#8a5a2a')); hs.push(P.ell(hr * 0.4, hr * 0.4, hr * 0.4, [-hr * 0.1, hr * 1.75, s * hr * 0.35], '#3a2414')); }
        if (L.tusks) for (const s of [-1, 1]) hs.push(P.cone(hr * 1.4, hr * 0.24, [hr * 1.1, -hr * 0.75, s * hr * 0.55], L.c3, [0, 0, -1.9]));
        if (L.trunk) {
            hs.push(P.cyl(hr * 2.1, hr * 0.38, hr * 0.7, [hr * 1.2, -hr * 0.9, 0], L.c1, [0, 0, 0.5]));
            hs.push(P.cyl(hr * 0.9, hr * 0.34, hr * 0.38, [hr * 1.65, -hr * 1.82, 0], L.c1, [0, 0, -0.2]));
        }
        if (L.mane) for (let i = 0; i < 4; i++) hs.push(P.ell(hr * 0.55, hr * 0.8, hr * 0.5, [-hr * (0.5 + i * 0.5), hr * (0.75 - i * 0.2) + (neck ? 0 : 0), 0], L.rainbowMane ? ['#ff8ad8', '#8ad8ff', '#fff08a', '#b88aff'][i] : L.c2));
        if (L.mane && L.c2 === '#b8662a') hs.push(P.ell(hr * 1.1, hr * 2.6, hr * 2.7, [-hr * 0.5, 0, 0], L.c2));
        if (L.fire) hs.push(P.cone(hr * 0.8, hr * 0.5, [-hr * 0.2, hr * 1.2, 0], L.c3));
        part('head', [hx - hr * 0.5, hy, 0], hs.map(s => Object.assign({}, s, { at: [s.at[0] + hr * 0.5, s.at[1], s.at[2]] })));
        parts.head.pivot = [hx - hr * 0.5, hy, 0];
        // доп. головы церберa
        if (L.heads3) for (const s of [-1, 1]) {
            const hs2 = [P.ell(hr * 1.7, hr * 1.6, hr * 1.6, [0, 0, 0], L.c1), P.ell(sn + hr * 0.5, hr * 0.7, hr * 0.8, [hr * 1.0, -hr * 0.2, 0], L.c1), P.cone(hr * 0.9, hr * 0.6, [-hr * 0.1, hr * 0.95, s * hr * 0.4], L.c1)];
            eyes(hs2, hr * 0.5, hr * 0.25, hr * 0.5, hr * 0.17);
            part(s < 0 ? 'head_l' : 'head_r', [hx - hr * 0.7, hy + hr * 0.1, s * hr * 1.9], hs2.map(q => Object.assign({}, q, { at: [q.at[0] + hr * 0.2, q.at[1], q.at[2]] })));
        }
        // ноги: сустав — бедро
        const legAt = [[len * 0.3, -bw * 0.34, 'leg_fl'], [len * 0.3, bw * 0.34, 'leg_fr'], [-len * 0.3, -bw * 0.34, 'leg_bl'], [-len * 0.3, bw * 0.34, 'leg_br']];
        for (const [lx, lz, nm] of legAt) {
            const legC = L.patches ? L.c2 : L.c1;
            const footC = L.hoof || (L.patches ? L.c2 : (L.bigArms ? L.c3 : L.c1));
            const tall = lh > len * 0.3;
            const ls = [
                P.cyl(lh + 4, lt * 1.1, lt * 0.74, [0, -lh / 2, 0], legC),
                P.ell(lt * 1.9, Math.min(lh * 0.7, lt * 3.2) + lt * 0.8, lt * 1.7, [lt * 0.05, -lh * 0.16, 0], legC),
                P.ell(lt * 1.5, lt * (tall ? 0.7 : 0.55), lt * 1.2, [lt * 0.3, -lh + lt * 0.25, 0], footC),
            ];
            part(nm, [lx, lh + (L.shell ? 4 : 0), lz], ls);
        }
        // хвост(ы)
        const tailBase = [-len * 0.5 + 2, by + bh * 0.18, 0];
        const mkTail = (suffix, oz, rotY) => {
            const t = L.tail, ts = [];
            const tl = t === 'long' ? len * 0.5 : t === 'bushy' ? len * 0.34 : t === 'tuft' ? len * 0.36 : len * 0.12;
            if (t === 'long') ts.push(P.cyl(tl, lt * 0.35, lt * 0.9, [-tl / 2, 0, 0], L.c1, [0, 0, Math.PI / 2 - 0.2]));
            else if (t === 'bushy') { ts.push(P.ell(tl, lt * 1.7, lt * 1.7, [-tl * 0.5, -lt * 0.2, 0], L.c1, [0, 0, 0.35])); ts.push(P.ell(tl * 0.45, lt * 1.4, lt * 1.4, [-tl * 0.95, -lt * 0.5, 0], L.whiteTail ? '#ffffff' : (L.c2 || L.c1), [0, 0, 0.35])); }
            else if (t === 'tuft') { ts.push(P.cyl(tl, lt * 0.3, lt * 0.5, [-tl / 2, 0, 0], L.c1, [0, 0, Math.PI / 2 - 0.3])); ts.push(P.ell(lt * 1.4, lt * 1.6, lt * 1.4, [-tl, -tl * 0.28, 0], L.c2 !== L.c1 ? L.c2 : L.c3)); }
            else if (t === 'curl') { ts.push(P.cyl(tl * 1.6, lt * 0.3, lt * 0.4, [-tl * 0.5, tl * 0.2, 0], L.c2, [0, 0, 1.0])); ts.push(P.ell(lt * 0.9, lt * 0.9, lt * 0.5, [-tl * 1.0, tl * 0.65, 0], L.c2)); }
            else if (t === 'stub') ts.push(P.ell(tl * 1.4, tl * 1.2, tl * 1.2, [-tl * 0.4, 0, 0], L.c1));
            else return;
            part('tail' + suffix, [tailBase[0], tailBase[1], oz], ts.map(s => Object.assign({}, s, { rot: s.rot ? [s.rot[0], s.rot[1] + rotY, s.rot[2]] : [0, rotY, 0] })));
        };
        if (L.tails) { for (let i = 0; i < L.tails; i++) mkTail(i === 0 ? '' : '_' + (i + 1), 0, (i - (L.tails - 1) / 2) * 0.42); }
        else mkTail('', 0, 0);
        seat = [-len * 0.04, by + bh * 0.5 + 2, 0];
        trail = [-len * 0.5, 14, 0];
        head = [hx, hy, 0];
        length = len + sn * 0.5 + hr * 1.5; width = Math.max(bw, lt * 3); height = by + bh * 0.5 + neck + hr * 1.5;
    } else if (a === 'biped') {
        const len = L.len, bh = L.bh, bw = L.bw, lh = L.legH, nk = L.neck || 14, hr = L.headR;
        const by = lh + bh * 0.5;
        const sp = [P.ell(len, bh, bw, [0, by, 0], L.c1)];
        if (L.arms) sp.push(P.ell(len * 0.7, bh * 0.5, bw * 0.8, [len * 0.1, by - bh * 0.28, 0], L.c2));
        if (L.ridges) for (let i = 0; i < 6; i++) sp.push(P.cone(bh * 0.22, bh * 0.2, [(-0.36 + i * 0.13) * len, by + bh * 0.5, 0], L.c3));
        partAbs('body', [0, by, 0], sp);
        const hx = len * 0.38 + hr * 0.35, hy = by + bh * 0.28 + nk;
        const hs = [];
        if (nk > 20) hs.push(P.cyl(nk * 1.15, hr * 0.62, hr * 0.9, [-hr * 0.55, -nk * 0.55, 0], L.c1, [0, 0, -0.2]));
        hs.push(P.ell(hr * 2, hr * 1.9, hr * 1.7, [0, 0, 0], L.c1));
        if (L.beak === 'short') hs.push(P.cone(hr * 0.9, hr * 0.8, [hr * 1.15, -hr * 0.1, 0], L.c2, [0, 0, -Math.PI / 2]));
        else if (L.beak === 'flat') hs.push(P.ell(hr * 1.3, hr * 0.5, hr * 0.8, [hr * 1.0, -hr * 0.2, 0], L.c3));
        else if (L.beak === 'jaw') {
            hs.push(P.ell(hr * 2.4, hr * 0.9, hr * 1.2, [hr * 1.4, hr * 0.1, 0], L.c1));
            hs.push(P.ell(hr * 2.2, hr * 0.55, hr * 1.1, [hr * 1.3, -hr * 0.55, 0], L.c2));
            for (let i = 0; i < 4; i++) for (const s of [-1, 1]) hs.push(P.cone(hr * 0.3, hr * 0.16, [hr * (0.8 + i * 0.4), -hr * 0.22, s * hr * 0.52], '#ffffff', [Math.PI, 0, 0]));
        }
        if (L.crest) { hs.push(P.ell(hr * 0.5, hr * 0.8, hr * 0.3, [0, hr * 1.05, 0], L.c3)); hs.push(P.ell(hr * 0.3, hr * 0.55, hr * 0.28, [hr * 0.4, hr * 0.95, 0], L.c3)); hs.push(P.ell(hr * 0.25, hr * 0.6, hr * 0.25, [hr * 0.9, -hr * 0.65, 0], L.c3)); }
        eyes(hs, hr * 0.62, hr * 0.28, hr * 0.62, Math.max(3.5, hr * 0.17));
        part('head', [hx, hy, 0], hs);
        for (const s of [-1, 1]) {
            const ls = [P.cyl(lh + 6, 9, 13, [0, -lh / 2, 0], L.c2 !== L.c1 && L.beak !== 'jaw' ? L.c2 : L.c1), P.ell(34, 8, 34, [14, -lh + 3, 0], L.c2 !== L.c1 && L.beak !== 'jaw' ? L.c2 : L.c1)];
            if (L.beak === 'jaw') { ls[0] = P.cyl(lh + 6, 24, 38, [0, -lh / 2, 0], L.c1); ls[1] = P.ell(70, 16, 50, [28, -lh + 6, 0], L.c1); }
            part(s < 0 ? 'leg_l' : 'leg_r', [0, lh + 3, s * bw * 0.28], ls);
        }
        if (L.wings) for (const s of [-1, 1]) part(s < 0 ? 'wing_l' : 'wing_r', [0, by + bh * 0.1, s * bw * 0.45], [P.ell(len * 0.5, bh * 0.58, 10, [-len * 0.04, -bh * 0.18, s * 4], L.c1 === '#fff7e8' ? '#f3e2c0' : L.c3 === '#ffb21e' ? '#2a2428' : L.c2)]);
        if (L.arms) for (const s of [-1, 1]) part(s < 0 ? 'arm_l' : 'arm_r', [len * 0.34, by - bh * 0.1, s * bw * 0.32], [P.cyl(bh * 0.4, 9, 14, [8, -bh * 0.18, 0], L.c1, [0, 0, 0.5]), P.ell(18, 8, 8, [18, -bh * 0.38, 0], L.c1)]);
        const tl = L.tailLen;
        const ts = L.beak === 'jaw' || L.tailLen > 100
            ? [P.cyl(tl, 12, bw * 0.55, [-tl / 2, 0, 0], L.c1, [0, 0, Math.PI / 2 - 0.12])]
            : [P.cone(tl, 24, [-tl * 0.5, 4, 0], L.c1, [0, 0, Math.PI / 2 + 0.5]), P.cone(tl * 0.9, 20, [-tl * 0.45, 8, 10], L.c3 === '#e8392f' ? L.c3 : L.c1, [0.4, 0, Math.PI / 2 + 0.7]), P.cone(tl * 0.9, 20, [-tl * 0.45, 8, -10], L.c3 === '#e8392f' ? L.c3 : L.c1, [-0.4, 0, Math.PI / 2 + 0.7])];
        part('tail', [-len * 0.46, by + bh * 0.1, 0], ts);
        seat = [-len * 0.02, by + bh * 0.46, 0];
        trail = [-len * 0.5, 14, 0];
        head = [hx, hy, 0];
        length = len + tl * 0.6 + hr * 1.5; width = bw; height = hy + hr * 1.2;
    } else if (a === 'hop') {
        const len = L.len, bh = L.bh, bw = L.bw, lh = L.legH, hr = L.headR;
        const by = lh + bh * 0.46;
        partAbs('body', [0, by, 0], [P.ell(len, bh, bw, [0, by, 0], L.c1, [0, 0, 0.18]), P.ell(len * 0.7, bh * 0.6, bw * 0.8, [len * 0.12, by - bh * 0.1, 0], L.c2, [0, 0, 0.18])]);
        const hx = len * 0.34, hy = by + bh * 0.52;
        const hs = [P.ell(hr * 1.9, hr * 1.9, hr * 1.7, [0, 0, 0], L.c1), P.ell(hr * 1.4, hr * 0.9, hr * 1.0, [hr * 0.9, -hr * 0.2, 0], L.c1), P.ell(hr * 0.4, hr * 0.3, hr * 0.5, [hr * 1.5, -hr * 0.05, 0], '#2a1d18')];
        eyes(hs, hr * 0.62, hr * 0.28, hr * 0.62, hr * 0.2);
        for (const s of [-1, 1]) hs.push(P.ell(hr * 0.35, hr * 1.7, hr * 0.42, [-hr * 0.15, hr * 1.35, s * hr * 0.42], L.c1, [s * 0.15, 0, 0]));
        part('head', [hx, hy, 0], hs);
        for (const s of [-1, 1]) {
            part(s < 0 ? 'leg_l' : 'leg_r', [-len * 0.14, lh + 12, s * bw * 0.4], [P.ell(len * 0.6, lh * 0.9, bw * 0.28, [10, -lh * 0.42, 0], L.c1, [0, 0, -0.4]), P.ell(len * 0.85, 14, bw * 0.26, [len * 0.22, -lh + 4, 0], L.c1)]);
            part(s < 0 ? 'arm_l' : 'arm_r', [len * 0.32, by + bh * 0.1, s * bw * 0.34], [P.cyl(bh * 0.4, 8, 12, [8, -bh * 0.18, 0], L.c1, [0, 0, 0.6])]);
        }
        part('tail', [-len * 0.46, by - bh * 0.28, 0], [P.cyl(L.tailLen, 10, 36, [-L.tailLen / 2, -L.tailLen * 0.12, 0], L.c1, [0, 0, Math.PI / 2 - 0.3])]);
        seat = [-len * 0.1, by + bh * 0.46, 0];
        trail = [-len * 0.6, 14, 0];
        head = [hx, hy, 0];
        length = len + L.tailLen * 0.8; width = bw; height = hy + hr * 2.5;
    } else if (a === 'slide') {
        const len = L.len, h = L.h;
        part('body', [0, 0, 0], [P.ell(len, h * 0.34, h * 0.78, [-len * 0.02, h * 0.2, 0], L.c1), P.ell(len * 0.9, h * 0.1, h * 0.7, [0, h * 0.06, 0], L.c3)]);
        const hs = [P.ell(h * 0.52, h * 0.48, h * 0.55, [0, 0, 0], L.c1)];
        for (const s of [-1, 1]) {
            hs.push(P.cyl(h * 0.46, h * 0.07, h * 0.09, [h * 0.06, h * 0.4, s * h * 0.17], L.c1));
            hs.push(P.ell(h * 0.14, h * 0.14, h * 0.14, [h * 0.06, h * 0.68, s * h * 0.17], L.c1));
            hs.push(P.ell(h * 0.07, h * 0.1, h * 0.07, [h * 0.14, h * 0.7, s * h * 0.17], PET_EYE));
        }
        hs.push(P.ell(h * 0.1, h * 0.06, h * 0.1, [h * 0.28, -h * 0.02, 0], '#e87a6a'));
        part('head', [len * 0.36, h * 0.3, 0], hs.map(q => Object.assign({}, q, { at: [q.at[0], q.at[1], q.at[2]] })));
        part('shell', [-len * 0.1, h * 0.36, 0], [P.ell(h * 0.88, h * 0.88, h * 0.82, [0, h * 0.28, 0], L.c2), P.ell(h * 0.62, h * 0.62, h * 0.88, [0, h * 0.3, 0], '#f08a52'), P.ell(h * 0.34, h * 0.34, h * 0.9, [0, h * 0.32, 0], L.c2), P.ell(h * 0.12, h * 0.12, h * 0.92, [0, h * 0.32, 0], '#f4b27a')]);
        seat = [-len * 0.1, h * 0.92, 0];
        trail = [-len * 0.52, 3, 0];
        head = [len * 0.4, h * 0.5, 0];
        length = len * 1.05; width = h * 0.8; height = h * 1.3;
    } else if (a === 'slither') {
        const r = L.r, len = L.len, n = 5;
        const hs = [P.ell(r * 2.3, r * 1.5, r * 1.8, [0, 0, 0], L.c1), P.ell(r * 1.7, r * 0.6, r * 1.3, [r * 0.15, -r * 0.55, 0], L.c2), P.cone(r * 1.3, r * 0.14, [r * 1.6, -r * 0.5, 0], '#e8392f', [0, 0, -Math.PI / 2])];
        eyes(hs, r * 0.7, r * 0.45, r * 0.65, r * 0.34);
        part('head', [len * 0.42, r * 0.8, 0], hs);
        const step = len / (n + 0.5);
        for (let i = 1; i <= n; i++) {
            const t = 1 - (i - 1) / (n + 0.5) * 0.45;
            part('seg_' + i, [len * 0.42 - i * step * 0.95, r * 0.9 * t, 0], [P.ell(step * 1.5 * t, r * 1.7 * t, r * 1.7 * t, [0, 0, 0], i % 2 ? L.c1 : L.c3 === '#e8392f' ? '#4aa83e' : L.c1), P.ell(step * 1.2 * t, r * 0.8 * t, r * 1.6 * t, [0, -r * 0.5 * t, 0], L.c2)]);
        }
        seat = [len * 0.42 - 2 * step * 0.95, r * 2.2, 0];
        trail = [-len * 0.5, 8, 0];
        head = [len * 0.42, r * 1.2, 0];
        length = len; width = r * 2; height = r * 3.2;
    } else if (a === 'spider') {
        const len = L.len, bh = L.bh;
        const by = bh * 0.9;
        partAbs('body', [0, by, 0], [P.ell(len * 0.8, bh, bh * 1.1, [-len * 0.18, by, 0], L.c1), P.ell(len * 0.4, bh * 0.4, bh * 0.5, [-len * 0.28, by + bh * 0.46, 0], L.c2)]);
        const hs = [P.ell(len * 0.42, bh * 0.7, bh * 0.8, [0, 0, 0], L.c1)];
        for (const s of [-1, 1]) { hs.push(P.ell(bh * 0.2, bh * 0.2, bh * 0.2, [len * 0.17, bh * 0.16, s * bh * 0.2], '#ff4a4a')); hs.push(P.ell(bh * 0.28, bh * 0.28, bh * 0.28, [len * 0.12, bh * 0.2, s * bh * 0.32], PET_WHITE)); hs.push(P.ell(bh * 0.16, bh * 0.16, bh * 0.16, [len * 0.2, bh * 0.2, s * bh * 0.32], PET_EYE)); hs.push(P.cone(bh * 0.4, bh * 0.1, [len * 0.2, -bh * 0.3, s * bh * 0.14], '#e8e0f0', [Math.PI, 0, 0])); }
        part('head', [len * 0.2, by + bh * 0.1, 0], hs);
        // Лапа — два звена между точками (сустав — у тела): вверх и в сторону к «колену», затем вниз и в сторону к земле.
        const limb = (p0, p1, d0, d1, c) => {
            const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], l = Math.hypot(dx, dy, dz);
            const tz = -Math.asin(GameUtil.clamp(dx / l, -1, 1)), tx = Math.atan2(dz, dy);
            return P.cyl(l, d1, d0, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], c, [tx, 0, tz]);
        };
        for (const s of [-1, 1]) for (let i = 1; i <= 4; i++) {
            const px = len * (0.16 - (i - 1) * 0.15);
            const fan = (2.5 - i) * len * 0.16;
            const knee = [fan * 0.5, bh * 0.75, s * len * 0.5], foot = [fan, -by, s * len * 0.95];
            part((s < 0 ? 'leg_l' : 'leg_r') + i, [px, by, s * bh * 0.35], [
                limb([0, 0, 0], knee, 15, 11, L.c3),
                limb(knee, foot, 11, 7, L.c1),
                P.ell(13, 13, 13, knee, L.c3),
            ]);
        }
        seat = [-len * 0.18, by + bh * 0.55, 0];
        trail = [-len * 0.6, 12, 0];
        head = [len * 0.3, by, 0];
        length = len * 1.2; width = len * 1.1; height = by + bh * 0.8;
    } else if (a === 'swim') {
        const len = L.len, bh = L.bh, bw = L.bw;
        const by = bh * 0.7 + 22;
        const sp = [P.ell(len * 0.78, bh, bw, [0, by, 0], L.c1), P.ell(len * 0.62, bh * 0.5, bw * 0.9, [len * 0.02, by - bh * 0.3, 0], L.c2), P.cone(len * 0.22, bw * 0.64, [len * 0.43, by - bh * 0.02, 0], L.c1, [0, 0, -Math.PI / 2]), P.cone(bh * 0.9, bh * 0.62, [-len * 0.04, by + bh * 0.82, 0], L.c1, [0, 0, 0.35])];
        eyes(sp, len * 0.3, by + bh * 0.16, bw * 0.4, 8);
        for (let i = 0; i < 5; i++) for (const s of [-1, 1]) sp.push(P.box(5, 12, 4, [len * (0.4 + i * 0.012), by - bh * 0.34, s * bw * 0.28], '#ffffff', [0, 0, 0]));
        partAbs('body', [0, by, 0], sp);
        part('tail', [-len * 0.38, by, 0], [P.cone(len * 0.3, bh * 0.4, [-len * 0.14, 0, 0], L.c1, [0, 0, Math.PI / 2 - 0.05]), P.cone(bh * 1.1, bh * 0.4, [-len * 0.28, bh * 0.38, 0], L.c1, [0, 0, 0.3]), P.cone(bh * 0.7, bh * 0.3, [-len * 0.25, -bh * 0.3, 0], L.c1, [0, 0, Math.PI - 0.5])]);
        for (const s of [-1, 1]) part(s < 0 ? 'fin_l' : 'fin_r', [len * 0.08, by - bh * 0.28, s * bw * 0.42], [P.cone(bh * 0.95, bh * 0.4, [-len * 0.04, -bh * 0.2, s * bh * 0.3], L.c1, [s * 1.0, 0, 0.55])]);
        seat = [-len * 0.08, by + bh * 0.48, 0];
        trail = [-len * 0.5, by - 10, 0];
        head = [len * 0.35, by, 0];
        length = len; width = bw; height = by + bh * 1.2;
    } else if (a === 'fly') {
        const len = L.len, bh = L.bh, bw = L.bw, wl = L.wing, hr = L.headR;
        const by = bh * 0.8 + 18;
        const dr = !!L.dragon;
        const sp = [P.ell(len, bh, bw, [0, by, 0], L.c1), P.ell(len * 0.8, bh * 0.5, bw * 0.84, [0, by - bh * 0.3, 0], L.c2)];
        if (dr) for (let i = 0; i < 6; i++) sp.push(P.cone(bh * 0.3, bh * 0.2, [(-0.34 + i * 0.13) * len, by + bh * 0.54, 0], L.c3));
        partAbs('body', [0, by, 0], sp);
        const hx = len * 0.5 + hr * 0.2, hy = by + bh * 0.42;
        const hs = [P.cyl(hr * 2.2, hr * 0.7, hr * 1.0, [-hr * 0.7, -hr * 0.5, 0], L.c1, [0, 0, -0.7]), P.ell(hr * 2, hr * 1.7, hr * 1.7, [0, 0, 0], L.c1)];
        hs.push(P.ell(hr * (dr ? 1.7 : 1.1), hr * (dr ? 0.8 : 0.5), hr * (dr ? 1.1 : 0.6), [hr * (dr ? 1.3 : 1.05), -hr * 0.2, 0], dr ? L.c1 : L.c3));
        if (!dr) hs.push(P.cone(hr * 0.9, hr * 0.62, [hr * 1.5, -hr * 0.18, 0], L.c3, [0, 0, -Math.PI / 2]));
        eyes(hs, hr * 0.55, hr * 0.3, hr * 0.62, hr * 0.2);
        if (L.crest) for (let i = 0; i < 3; i++) hs.push(P.cone(hr * 1.4, hr * 0.38, [-hr * (0.1 + i * 0.4), hr * 1.0, 0], i % 2 ? L.c2 : L.c1, [0, 0, 0.5]));
        if (L.horns) for (const s of [-1, 1]) hs.push(P.cone(hr * 1.4, hr * 0.38, [-hr * 0.2, hr * 1.1, s * hr * 0.5], L.c3, [s * 0.3, 0, 0.7]));
        part('head', [hx - hr * 0.6, hy, 0], hs.map(q => Object.assign({}, q, { at: [q.at[0] + hr * 0.6, q.at[1], q.at[2]] })));
        for (const s of [-1, 1]) {
            const ws = [P.ell(wl * 0.55, 8, wl * 0.34, [-len * 0.05, 0, s * wl * 0.2], dr ? L.c1 : L.c2), P.ell(wl * 0.5, 7, wl * 0.3, [-len * 0.18, 0, s * wl * 0.52], dr ? L.c2 : L.c1), P.ell(wl * 0.3, 6, wl * 0.2, [-len * 0.3, 0, s * wl * 0.74], dr ? L.c3 : L.c3)];
            part(s < 0 ? 'wing_l' : 'wing_r', [-len * 0.02, by + bh * 0.3, s * bw * 0.34], ws.map(q => Object.assign({}, q, { at: [q.at[0], q.at[1], q.at[2] * (s < 0 ? 1 : 1)] })));
        }
        for (const s of [-1, 1]) part(s < 0 ? 'leg_l' : 'leg_r', [len * 0.1, by - bh * 0.3, s * bw * 0.3], [P.cyl(bh * 0.5, 9, 13, [0, -bh * 0.24, 0], L.c2, [0, 0, 0.4])]);
        const tl = L.tailLen;
        part('tail', [-len * 0.48, by - bh * 0.05, 0], dr
            ? [P.cyl(tl, 10, bw * 0.55, [-tl / 2, 0, 0], L.c1, [0, 0, Math.PI / 2 - 0.14]), P.cone(bh * 0.5, bh * 0.4, [-tl * 1.02, -tl * 0.14, 0], L.c3, [0, 0, Math.PI / 2 + 0.2])]
            : [P.cone(tl, 36, [-tl * 0.5, -6, 0], L.c1, [0, 0, Math.PI / 2 + 0.14]), P.cone(tl * 0.85, 30, [-tl * 0.45, -2, 14], L.c2, [0.3, 0, Math.PI / 2 + 0.18]), P.cone(tl * 0.85, 30, [-tl * 0.45, -2, -14], L.c2, [-0.3, 0, Math.PI / 2 + 0.18]), P.cone(tl * 0.6, 22, [-tl * 0.35, 0, 0], L.c3, [0, 0, Math.PI / 2 + 0.1])]);
        seat = [len * 0.04, by + bh * 0.5, 0];
        trail = [-len * 0.5, by - 8, 0];
        head = [hx, hy, 0];
        length = len + tl * 0.6; width = wl * 1.4; height = by + bh * 0.8;
    }
    return { parts, seat, trail, head, length, width, height };
}

// --- Экземпляр вида ------------------------------------------------------------------------------
class PetViewInstance {
    constructor(scene, species, opts) {
        this.scene = scene;
        this.species = GameData.PETS[species] ? species : 'snail';
        this.def = GameData.PETS[this.species];
        this.gait = this.def.gait;
        this.ability = this.def.ability;
        this.look = PetView.look(this.species);
        this.mutation = opts.mutation || null;
        this.onMutation = null;
        /** Контур рёбер: по умолчанию общий PetView.ink (у дальних NPC-питомцев можно выключить). */
        this.ink = opts.ink != null ? !!opts.ink : PetView.ink !== false;
        /** @type {any} */
        this._mfx = null;
        /** Хвост — цепочка tail -> tail_2 -> tail_3 (только у моделей без отдельных хвостов tail_1…). */
        this._tailChain = [];
        this._shape = { cy: 60, ax: 60, ay: 50, az: 40, size: 160 };
        /** Уровень детализации (setLod): 0 — всё. */
        this._lod = 0;
        this.weight = 1;
        this.scale = 1;
        this.enabled = true;
        this.disposed = false;
        this.ready = false;
        this.hover = this.gait === 'swim' ? 24 : 0;
        this.time = Math.random() * 10;
        this.phase = Math.random() * 6;
        this.k = 0;
        this.air = false;
        /** @type {Record<string, { joint: BABYLON.TransformNode, mesh: BABYLON.Mesh | null }>} */
        this.parts = {};
        this._fromModel = false;
        /** @type {BABYLON.Material[]} */
        this._ownMats = [];
        /** @type {BABYLON.Node | null} */
        this.saddle = null;
        this.root = new BABYLON.TransformNode('pet:' + this.species, scene);
        this.seat = new BABYLON.TransformNode('pet-seat', scene);
        this.trailAnchor = new BABYLON.TransformNode('pet-trail', scene);
        this.bodyRoot = null;
        this.length = 200; this.width = 80; this.height = 120;
        this._seatLocal = [0, 100, 0];
        this._trailLocal = [-60, 20, 0];
        this._build(null, null);
        this.setWeight(opts.w > 0 ? opts.w : 1);
        if (this.mutation) this.setMutation(this.mutation);
        // модель из реестра: если уже загружена — сразу, иначе подменит запасную фигуру по готовности
        if (PetModels.has(this.species)) {
            const rec = PetView._ready[this.species];
            if (rec) this._build(rec.model, rec.meta);
            else PetView.loadModel(this.species).then(r => { if (r && !this.disposed) this._build(r.model, r.meta); });
        }
    }

    // Пересобрать содержимое: модель (model != null) или запасная фигура.
    _build(model, meta) {
        const scene = this.scene, view3d = PetView.view;
        if (this.bodyRoot) {
            const old = this.bodyRoot;
            this.seat.parent = null; this.trailAnchor.parent = null;
            if (view3d) World3D.removeObject(view3d, old); else old.dispose(false, false);
            for (const m of this._ownMats) m.dispose(false, false);
            this._ownMats = [];
            this._tintMat = null;
            this.parts = {};
        }
        const body = new BABYLON.Mesh('pet-body:' + this.species, scene);
        body.parent = this.root;
        this.bodyRoot = body;
        let seat, trail;
        if (model) {
            this._fromModel = true;
            const mroot = Model3D.build(model, scene, { name: 'pet:' + this.species });
            for (const m of mroot.getChildMeshes(true)) {
                const md = m.metadata || {};
                const name = md.part || m.name;
                const pv = md.pivot || [0, 0, 0];
                const joint = new BABYLON.TransformNode('j:' + name, scene);
                joint.parent = body;
                joint.position.set(pv[0], pv[1], pv[2]);
                m.parent = joint;
                m.position.set(-pv[0], -pv[1], -pv[2]);
                this.parts[name] = { joint, mesh: /** @type {any} */ (m) };
                const mats = m.material ? (/** @type {any} */ (m.material).subMaterials || [m.material]) : [];
                for (const mm of mats) if (mm) this._ownMats.push(mm);
            }
            mroot.dispose(true, false);
            const mt = meta || {};
            seat = mt.seat || null;
            trail = mt.trail || null;
            this.length = mt.length || this.length; this.width = mt.width || this.width; this.height = mt.height || this.height;
            if (!seat) { seat = [0, (mt.height || (model.max[1])) * 0.8, 0]; }
            if (!trail) trail = [model.min[0], 10, 0];
            if (!mt.length) { this.length = model.max[0] - model.min[0]; this.width = model.max[2] - model.min[2]; this.height = model.max[1]; }
        } else {
            this._fromModel = false;
            const b = petBuild(this.look);
            const mat = PetView._material(scene);
            for (const name of Object.keys(b.parts)) {
                const p = b.parts[name];
                const mesh = this._makePartMesh(name, p.specs, mat);
                const joint = new BABYLON.TransformNode('j:' + name, scene);
                joint.parent = body;
                joint.position.set(p.pivot[0], p.pivot[1], p.pivot[2]);
                mesh.parent = joint;
                this.parts[name] = { joint, mesh };
            }
            seat = b.seat; trail = b.trail;
            this.length = b.length; this.width = b.width; this.height = b.height;
        }
        // Хвост-цепочка: у моделей части — плоские «братья» с абсолютными суставами; tail_2 и tail_3 вешаем на предыдущее звено,
        // иначе при качании хвоста между звеньями раскрывается щель.
        this._tailChain = [];
        if (this._fromModel && !this.parts.tail_1) {
            const names = ['tail', 'tail_2', 'tail_3'].filter(n => this.parts[n]);
            if (names.length > 1 && names[0] === 'tail') {
                // Исходные суставы — относительно тела (до перепривязки). Звено считается от ИСХОДНОГО сустава предыдущего:
                // предыдущее к этому моменту уже перепривязано и хранит позицию относительно своего родителя — вычитание
                // её давало сдвиг третьего звена (tail_3 феникса, дракона, тираннозавра лежал отдельно на земле).
                const orig = names.map(n => this.parts[n].joint.position.clone());
                for (let i = 1; i < names.length; i++) {
                    const p = this.parts[names[i - 1]].joint, c = this.parts[names[i]].joint;
                    c.parent = p;
                    c.position.copyFrom(orig[i].subtract(orig[i - 1]));
                }
                this._tailChain = names;
            }
        }
        this._seatLocal = seat; this._trailLocal = trail;
        this.seat.parent = body; this.trailAnchor.parent = body;
        this.seat.position.set(seat[0], seat[1], seat[2]);
        this.trailAnchor.position.set(trail[0], trail[1], trail[2]);
        this.ready = true;
        if (view3d) World3D.addObject(view3d, body, 'actor', { ink: this.ink });
        this._applyScale();
        body.setEnabled(this.enabled);
        if (this.mutation) this._mutTintRefresh();
        if (this._lod) setActorLod(this._petMeshes(), this._lod, this.ink);
    }

    /** Меши самого питомца (без наездника и седла, висящих на якорях). */
    _petMeshes() {
        const out = [];
        for (const n in this.parts) { const m = this.parts[n].mesh; if (m) out.push(m); }
        return out;
    }

    /** Уровень детализации (см. setActorLod): 0 — как у питомца игрока, 1 — только обводка, 2 — только меш. */
    setLod(level) {
        if (this._lod === level) return;
        this._lod = level;
        if (this.ready) setActorLod(this._petMeshes(), level, this.ink);
    }

    // --- Мутации ---------------------------------------------------------------------------------------------------
    /** Эллипсоид тела в локальных координатах узла тела (для дуг и частиц). */
    _mutShape() {
        const s = this._shape;
        const L = this.length, W = Math.min(this.width, this.height * 1.25), H = this.height;
        s.cy = H * 0.48; s.ax = L * 0.4; s.ay = H * 0.46; s.az = Math.max(24, W * 0.42);
        s.size = Math.max(L, H) * 1.05;
        return s;
    }

    /** Материалы вида (для оттенка мутации). У запасной фигуры общий материал клонируется — оттенок только у этого питомца. */
    _mutMaterials() {
        const out = [];
        const shared = PetView._material(this.scene);
        for (const n in this.parts) {
            const mesh = this.parts[n].mesh;
            if (!mesh || !mesh.material) continue;
            if (mesh.material === shared) {
                if (!this._tintMat) { this._tintMat = shared.clone('pet-vc-mut'); this._ownMats.push(this._tintMat); }
                mesh.material = this._tintMat;
            }
            const mats = /** @type {any} */ (mesh.material).subMaterials || [mesh.material];
            for (const m of mats) if (m && out.indexOf(m) < 0) out.push(m);
        }
        return out;
    }

    _mutTintRefresh() {
        if (this._mfx) { this._mfx.id = undefined; }   // update снова наложит оттенок на новые материалы
    }

    setMutation(id) {
        id = id && MUT_LOOK[id] ? id : null;
        this.mutation = id;
        if (this.bodyRoot) /** @type {any} */ (this.bodyRoot).metadata = Object.assign({}, this.bodyRoot.metadata, { mutation: this.mutation });
        const view = this;
        if (id && !this._mfx) {
            this._mfx = MutationFX.attach({
                get mutation() { return view.mutation; },
                node: () => (view.disposed ? null : view.bodyRoot),
                enabled: () => view.enabled && view.ready && !view.disposed,
                shape: () => view._mutShape(),
                mats: () => view._mutMaterials(),
            });
        } else if (!id && this._mfx) {
            // снять оттенок: на ближайшем кадре update увидит id = null и вернёт базовые цвета; сам носитель снимаем сразу
            const h = this._mfx;
            MutationFX._tint(h, null);
            MutationFX.detach(h);
            this._mfx = null;
        } else if (this._mfx) this._mfx.id = undefined;
        if (typeof this.onMutation === 'function') this.onMutation(this.mutation);
    }

    // Меш части из примитивов (вершинные цвета, один меш на часть).
    _makePartMesh(name, specs, mat) {
        const merged = PetView.buildMesh(this.scene, 'pet:' + this.species + '/' + name, specs);
        merged.metadata = { part: name };
        return merged;
    }

    _applyScale() {
        const s = this.scale;
        if (this.bodyRoot) this.bodyRoot.scaling.set(s, s, s);
        const inv = 1 / s;
        this.seat.scaling.set(inv, inv, inv);
    }

    /**
     * Вес-фактор: масштаб питомца. Обычные питомцы — 0.85…1.45 (предел 1.6); ОГРОМНЫЙ питомец Гигантского яйца
     * (w = HUGE_PET_WEIGHT, GameData.hugeCfg().w) рисуется в полный вес-фактор — заметно крупнее самого большого обычного.
     * Седло, размеры (size, seatHeight) и камера считаются от масштаба, наездник на седле остаётся единичного размера.
     */
    setWeight(w) {
        this.weight = GameUtil.clamp(Number(w) || 1, 0.7, PetView.maxScale());
        this.scale = this.weight;
        this._applyScale();
    }

    /** Размеры с учётом масштаба. */
    get size() { return { length: this.length * this.scale, width: this.width * this.scale, height: this.height * this.scale }; }
    /** Высота точки седла над землёй (px, с учётом масштаба и парения). */
    get seatHeight() { return this._seatLocal[1] * this.scale + this.hover; }

    /** Положение и ориентация корня: карта (x, y), высота h над уровнем, курс heading (рад), тангаж и крен. */
    place(x, h, y, heading, pitch = 0, roll = 0) {
        const r = this.root;
        r.position.set(x, h, y);
        r.rotation.set(roll, -heading, pitch);
    }

    /** Поза хвоста-цепочки: y — общий мах, z — наклон; false, если хвост не цепочка. */
    _tailPose(y, z) {
        const ch = this._tailChain, P = this.parts;
        if (!ch.length) return false;
        for (let i = 0; i < ch.length; i++) P[ch[i]].joint.rotation.set(0, y * (i ? 0.4 : 0.5) + Math.sin(this.time * 4 - i * 1.1) * 0.05, z * 0.7);
        return true;
    }

    /** Седло: factory(scene, view) -> узел; крепится к седлу питомца (единичный масштаб). null — снять. */
    setSaddle(factory) {
        if (this.saddle) { this.saddle.dispose(false, true); this.saddle = null; }
        if (!factory) return;
        const node = factory(this.scene, this);
        if (!node) return;
        node.parent = this.seat;
        this.saddle = node;
    }

    setEnabled(on) {
        this.enabled = !!on;
        if (this.bodyRoot) this.bodyRoot.setEnabled(this.enabled);
    }

    /**
     * Кадр анимации.
     * @param {number} dt
     * @param {number} speed01 текущая скорость / максимальная (0..1)
     * @param {boolean} [flying] в полёте
     * @param {boolean} [air] в воздухе (прыжок)
     */
    update(dt, speed01, flying = false, air = false) {
        if (this.disposed || !this.enabled || !this.bodyRoot) return;
        this.time += dt;
        this.air = air;
        const k = this.k = GameUtil.damp(this.k, GameUtil.clamp(speed01, 0, 1), 9, dt);
        const P = this.parts, t = this.time;
        const body = this.bodyRoot;
        let bob = 0, pitch = 0;
        // сбросить позы частей
        for (const n in P) { const j = P[n].joint; j.rotation.set(0, 0, 0); }
        const R = (name, x, y, z) => { const p = P[name]; if (p) p.joint.rotation.set(x, y, z); };
        const breathe = Math.sin(t * 2.3) * 0.018 * (1 - k);
        if (P.body) P.body.joint.scaling.set(1 - breathe * 0.4, 1 + breathe, 1 - breathe * 0.4);
        const idleTail = Math.sin(t * 1.7) * 0.18 * (1 - k * 0.6);
        const g = this.gait;
        if (g === 'quad') {
            const rate = GameUtil.lerp(1.7, 3.6, k);
            this.phase += dt * rate * Math.PI * 2 * (k > 0.04 ? 1 : 0);
            const ph = this.phase, a = k > 0.04 ? 0.28 + 0.62 * k : 0;
            if (air) {
                R('leg_fl', 0.9, 0, 0); R('leg_fr', 0.9, 0, 0); R('leg_bl', -0.8, 0, 0); R('leg_br', -0.8, 0, 0);
            } else if (k < 0.62) {
                R('leg_fl', 0, 0, Math.sin(ph) * a); R('leg_br', 0, 0, Math.sin(ph) * a);
                R('leg_fr', 0, 0, Math.sin(ph + Math.PI) * a); R('leg_bl', 0, 0, Math.sin(ph + Math.PI) * a);
                bob = Math.abs(Math.sin(ph)) * 5 * k;
                pitch = Math.sin(ph * 2) * 0.02 * k;
            } else {
                const f = Math.sin(ph) * a * 1.15, h2 = Math.sin(ph + 1.0) * a * 1.15;
                R('leg_fl', 0, 0, f); R('leg_fr', 0, 0, f * 0.92); R('leg_bl', 0, 0, h2); R('leg_br', 0, 0, h2 * 0.92);
                bob = Math.abs(Math.sin(ph + 0.5)) * 14 * k;
                pitch = Math.sin(ph + 0.4) * 0.07 * k;
            }
            R('head', 0, 0, Math.sin(ph * 2 + 1) * 0.07 * k + Math.sin(t * 1.3) * 0.02);
            const wag = Math.sin(ph * 1.0 + 2) * 0.45 * k + idleTail;
            if (!this._tailPose(wag, Math.sin(ph + 0.6) * 0.12 * k)) {
                for (const n in P) {
                    const tm = /^tail(?:_(\d))?$/.exec(n);
                    if (tm) { const ti = Number(tm[1] || 0); R(n, 0, wag * (0.8 + 0.12 * ti), Math.sin(ph + 0.6 + ti) * 0.12 * k); }
                }
            }
            R('head_l', 0, 0, Math.sin(ph * 2 + 2) * 0.1 * k); R('head_r', 0, 0, Math.sin(ph * 2 + 3.3) * 0.1 * k);
        } else if (g === 'biped') {
            const rate = GameUtil.lerp(1.9, 4.2, k);
            this.phase += dt * rate * Math.PI * 2 * (k > 0.04 ? 1 : 0);
            const ph = this.phase, a = 0.95 * k;
            if (air) { R('leg_l', 0.5, 0, 0.7); R('leg_r', 0.5, 0, -0.7); }
            else { R('leg_l', 0, 0, Math.sin(ph) * a); R('leg_r', 0, 0, Math.sin(ph + Math.PI) * a); }
            bob = Math.abs(Math.sin(ph)) * 7 * k;
            R('head', 0, 0, Math.sin(ph * 2) * 0.1 * k - 0.04 * k);
            const wing = air ? 0.9 + Math.sin(t * 18) * 0.5 : Math.sin(t * 1.4) * 0.05 + 0.08 * k;
            R('wing_l', wing, 0, 0); R('wing_r', -wing, 0, 0);
            R('arm_l', 0, 0, Math.sin(ph) * 0.4 * k); R('arm_r', 0, 0, Math.sin(ph + Math.PI) * 0.4 * k);
            R('tail', 0, Math.sin(ph) * 0.3 * k + idleTail, 0.1 * k);
            pitch = 0.04 * k;
        } else if (g === 'hop') {
            const rate = GameUtil.lerp(1.2, 2.6, k);
            this.phase += dt * rate * Math.PI * 2 * (k > 0.04 ? 1 : 0);
            const ph = this.phase, s = Math.sin(ph), up = Math.max(0, s);
            bob = up * 34 * k;
            const crouch = k > 0.04 ? (s < 0 ? -s : 0) : 0;
            R('leg_l', 0, 0, -0.15 - crouch * 0.5 * k + up * 0.5 * k); R('leg_r', 0, 0, -0.15 - crouch * 0.5 * k + up * 0.5 * k);
            R('arm_l', 0, 0, 0.3 - up * 0.4 * k); R('arm_r', 0, 0, 0.3 - up * 0.4 * k);
            R('tail', 0, 0, -up * 0.4 * k + 0.05); R('head', 0, 0, -up * 0.1 * k);
            pitch = (s > 0 ? -1 : 1) * 0.1 * k * Math.abs(s);
            if (air) { R('leg_l', 0, 0, 0.5); R('leg_r', 0, 0, 0.5); bob = 0; }
        } else if (g === 'slide') {
            this.phase += dt * GameUtil.lerp(2.2, 4.2, k) * Math.PI * 2 * (k > 0.04 ? 1 : 0);
            const ph = this.phase, s = Math.sin(ph);
            if (P.body) {
                const sq = (k > 0.04 ? 1 : 0) * (0.1 * k + 0.02);
                P.body.joint.scaling.set(1 + s * sq * 1.6, 1 - s * sq, 1 + s * sq * 0.4);
            }
            R('head', 0, Math.sin(t * 1.1) * 0.06, -s * 0.12 * k + Math.sin(t * 2.2) * 0.03);
            R('shell', 0, 0, -s * 0.03 * k);
            bob = Math.abs(s) * 2 * k;
        } else if (g === 'slither') {
            this.phase += dt * GameUtil.lerp(2.0, 5.0, k) * Math.PI * 2 * (k > 0.04 ? 1 : 0);
            const ph = this.phase, A = 4 + 22 * k;
            for (const n in P) {
                const m = /^seg_(\d+)$/.exec(n);
                if (m) { const i = Number(m[1]); P[n].joint.position.z = Math.sin(ph - i * 0.85) * A * (0.5 + i * 0.13); P[n].joint.rotation.y = Math.cos(ph - i * 0.85) * 0.3 * k; }
            }
            R('head', 0, Math.sin(ph + 0.7) * (0.12 + 0.28 * k), Math.sin(t * 0.9) * 0.04);
            if (P.head) P.head.joint.position.z = Math.sin(ph + 0.9) * A * 0.4;
        } else if (g === 'spider') {
            this.phase += dt * GameUtil.lerp(2.4, 6.0, k) * Math.PI * 2 * (k > 0.04 ? 1 : 0);
            const ph = this.phase, a = 0.5 * k + 0.02;
            for (const side of [-1, 1]) {
                for (let i = 1; i <= 4; i++) {
                    const grp = ((i % 2) + (side > 0 ? 1 : 0)) % 2;
                    const s = Math.sin(ph + grp * Math.PI + i * 0.3);
                    const nm = (side < 0 ? 'leg_l' : 'leg_r') + i;
                    const lift = Math.max(0, Math.cos(ph + grp * Math.PI + i * 0.3)) * 0.38 * k;
                    if (air) R(nm, -side * 0.5, 0, 0);
                    else R(nm, -side * lift, s * a * (i < 3 ? 1 : -1), 0);
                }
            }
            bob = Math.abs(Math.sin(ph)) * 3 * k;
            R('head', 0, Math.sin(t * 1.5) * 0.05, 0);
        } else if (g === 'swim') {
            this.phase += dt * GameUtil.lerp(2.2, 5.5, k) * Math.PI * 2;
            const ph = this.phase;
            R('tail', 0, Math.sin(ph) * (0.28 + 0.4 * k), Math.sin(ph) * 0.06);
            R('fin_l', 0.5 * Math.sin(ph * 0.5 + 1), 0, 0); R('fin_r', -0.5 * Math.sin(ph * 0.5 + 1), 0, 0);
            bob = Math.sin(t * 2) * 5 + Math.sin(ph) * 2 * k;
            pitch = Math.sin(ph * 0.5) * 0.04 + (air ? -0.1 : 0);
        } else if (g === 'fly') {
            const fast = flying || air;
            const rate = fast ? GameUtil.lerp(2.6, 4.2, k) : 1.1;
            this.phase += dt * rate * Math.PI * 2;
            const ph = this.phase;
            const amp = fast ? 0.85 : 0.22;
            R('wing_l', Math.sin(ph) * amp + (fast ? 0.1 : 0.3), 0, 0); R('wing_r', -Math.sin(ph) * amp - (fast ? 0.1 : 0.3), 0, 0);
            bob = Math.sin(ph) * (fast ? 7 : 3) + Math.sin(t * 1.3) * 3;
            R('tail', 0, Math.sin(ph * 0.5) * 0.25, Math.sin(ph) * 0.1);
            R('head', 0, 0, -Math.sin(ph) * 0.06 - (fast ? 0.12 : 0));
            R('leg_l', 0, 0, 0.7); R('leg_r', 0, 0, 0.7);
            pitch = fast ? -0.12 * k : 0;
        }
        // звенья цепочки хвоста (tail_2, tail_3) качаются с запаздыванием поверх поворота родителя
        const ch = this._tailChain;
        if (ch.length > 1 && g !== 'quad') for (let i = 1; i < ch.length; i++) P[ch[i]].joint.rotation.y += Math.sin(t * 4 - i * 1.1) * 0.07 * (0.35 + k);
        body.position.y = bob + this.hover;
        body.rotation.z = pitch;
        // подвижные суставы без собственной позы (сброшены выше): хвост в покое
        if (g !== 'quad' && g !== 'biped' && g !== 'swim' && g !== 'fly' && P.tail) P.tail.joint.rotation.y += idleTail * 0.6;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        const view3d = PetView.view;
        if (this._mfx) { MutationFX.detach(this._mfx); this._mfx = null; }
        if (this.saddle) { this.saddle.dispose(false, true); this.saddle = null; }
        this.seat.parent = null; this.trailAnchor.parent = null;
        if (this.bodyRoot) { if (view3d) World3D.removeObject(view3d, this.bodyRoot); else this.bodyRoot.dispose(false, false); }
        for (const m of this._ownMats) m.dispose(false, false);
        this._ownMats = [];
        this.seat.dispose(false, false);
        this.trailAnchor.dispose(false, false);
        this.root.dispose(false, false);
        this.parts = {};
        this.bodyRoot = null;
    }
}

Game.register(PetView);
