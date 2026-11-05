// RiderModel.js — наездник: блочный персонаж из Blender, тот же, что в улучшенной версии
// игры пользователя Egg Stealing Master (assets/models/rider/character.glb, исходник —
// tools/blender/rider/character.py). Скелета нет: части двигает код.
//
// Узлы glTF (движок кладёт вершины частей в координаты модели, pivot — origin узла):
//   Body (бёдра, без меша — здесь TransformNode)
//     Torso (талия)  -> ArmL, ArmR (плечи), Head (шея) -> EyeL, EyeR, Hair_swept|spiky|long|bob
//     LegL, LegR (бёдра)
// Здесь иерархия восстанавливается родителями: у всех частей вершины в одной системе
// координат, поэтому родитель с единичным трансформом ничего не сдвигает, а поворот
// родителя вокруг его pivot тянет детей (голова — за торсом и т. п.).
// Слоты цвета (материалы tint1..tint5): куртка, брюки, волосы, кожа, футболка.
// Модель смотрит вдоль +Z файла; корень разворачивает её носом вдоль +X (правило движка).
//
// Без наложений и мерцания: у модели нет совпадающих граней (рукав и кисть, брюки и
// ботинок стыкуются по высоте, подошва кончается ровно на земле); шапки и прочая
// косметика вешаются attach() на голову/торс со своей геометрией, без копланарных слоёв.

/** @satisfies {Record<string, any>} */
const RiderModel = {
    URL: 'assets/models/rider/character.glb',
    HAIR_STYLES: ['swept', 'spiky', 'long', 'bob'],
    // куртка, брюки, волосы, кожа, футболка — как у игрока в Egg Stealing Master
    DEFAULT_TINTS: ['#1d2226', '#1d2f2a', '#a96716', '#ffe2c6', '#1495dc'],
    HEIGHT: 180,          // px мира: рост наездника (1 м = 100 px)
    // Скины на всё тело (setSkin): та же схема частей, что у персонажа — Body (бёдра), Head, EyeL/EyeR, ArmL/ArmR,
    // LegL/LegR, необязательные Spin (вращается вокруг вертикали), Tail (качается), PupilL/PupilR, HandL/HandR.
    // Пути — литералами (сканер сборки). «67» — из игры пользователя Egg Stealing Master; остальные — свои (tools/blender/rider).
    /** @type {Record<string, string>} */
    SKIN_FILES: {
        skin_67: 'assets/models/rider/skins/skin_67.glb',
        skin_croissanto: 'assets/models/rider/skins/skin_croissanto.glb',
        skin_bananino: 'assets/models/rider/skins/skin_bananino.glb',
        skin_teiera: 'assets/models/rider/skins/skin_teiera.glb',
        skin_pizzagatto: 'assets/models/rider/skins/skin_pizzagatto.glb',
        skin_cactusso: 'assets/models/rider/skins/skin_cactusso.glb',
    },

    load() { return Model3D.load(this.URL); },

    // view — View3D; opts: { tints?, hairStyle?, height? }. Промис готового вида.
    async create(view, opts) {
        const model = await this.load();
        return new RiderView(view, model, opts || {});
    },
};

class RiderView {
    constructor(view, model, opts) {
        const scene = view.scene;
        this.view = view;
        /** @type {Record<string, BABYLON.AbstractMesh>} */
        this.parts = {};
        /** @type {BABYLON.StandardMaterial[][]} */
        this.tintMats = [[], [], [], [], []];
        this.hairStyle = 'swept';
        this.t = Math.random() * 10;
        this.run = 0; this.air = 0; this.sit = 0; this.carryK = 0;
        this.squash = 0; this.squashV = 0;
        this.blink = 1 + Math.random() * 3;
        this.cheer = 0;
        this.waveT = 0;
        this.wasGrounded = true;
        /** @type {Record<string, BABYLON.AbstractMesh | null>} */
        this.worn = { hat: null, face: null, back: null };

        // Корень: ступни в начале координат, нос вдоль +X.
        this.root = new BABYLON.TransformNode('rider', scene);
        this.mesh = Model3D.build(model, scene, { name: 'rider' });
        const height = (model.max[1] - model.min[1]) || 590;
        this.scale = (opts.height || RiderModel.HEIGHT) / height;
        this.mesh.parent = this.root;
        this.mesh.rotation.y = Math.PI / 2;
        this.mesh.scaling.setAll(this.scale);
        this.mesh.position.y = -model.min[1] * this.scale;

        for (const m of this.mesh.getChildMeshes(true)) {
            const md = m.metadata || {};
            if (md.part) this.parts[md.part] = m;
            if (md.pivot) m.setPivotPoint(new BABYLON.Vector3(md.pivot[0], md.pivot[1], md.pivot[2]));
            const mat = m.material;
            const mats = mat ? (/** @type {any} */ (mat).subMaterials || [mat]) : [];
            for (const sm of mats) {
                const hit = sm && /\/tint([1-5])$/.exec(sm.name || '');
                if (hit) this.tintMats[+hit[1] - 1].push(sm);
            }
        }
        const P = this.parts;
        const pivotOf = (m, fb) => (m && m.metadata && m.metadata.pivot) ? m.metadata.pivot : fb;
        // Бёдра: в файле это пустой узел Body, его высота = pivot торса (или ног).
        const hip = pivotOf(P.Torso, pivotOf(P.LegL, [0, 210, 0]));
        this.hipModelY = hip[1];
        this.body = new BABYLON.TransformNode('rider/Body', scene);
        this.body.parent = this.mesh;
        this.body.setPivotPoint(new BABYLON.Vector3(0, hip[1], 0));
        const attach = (child, parent) => { if (child && parent) child.parent = parent; };
        attach(P.LegL, this.body); attach(P.LegR, this.body); attach(P.Torso, this.body);
        const torso = P.Torso || this.body;
        attach(P.ArmL, torso); attach(P.ArmR, torso); attach(P.Head, torso);
        for (const name of ['EyeL', 'EyeR'].concat(RiderModel.HAIR_STYLES.map(h => 'Hair_' + h))) attach(P[name], P.Head);
        this.headPivot = pivotOf(P.Head, [0, 412, 0]);
        this.torsoPivot = pivotOf(P.Torso, hip);

        // Якорь шапки — макушка головы (в координатах модели, ребёнок головы).
        this.headAnchor = new BABYLON.TransformNode('rider/hatAnchor', scene);
        this.headAnchor.parent = P.Head || torso;
        this.headAnchor.position.set(0, P.Head ? P.Head.getBoundingInfo().boundingBox.maximum.y : 563, 0);

        World3D.addObject(view, this.mesh, 'actor');
        this.setLook({ tints: opts.tints || RiderModel.DEFAULT_TINTS, hairStyle: opts.hairStyle || 'swept' });
        // Скин на всё тело (setSkin): на время скина анимируются его части, обычная модель и косметика скрыты.
        this.baseParts = this.parts;
        this.baseBody = this.body;
        this.baseHipY = this.hipModelY;
        /** @type {string | null} */
        this.skinId = null;
        /** @type {BABYLON.Mesh | null} */
        this.skinMesh = null;
        this._skinSeq = 0;
        /** @type {Record<string, number>} */
        this._pupilX = {};
    }

    /**
     * Надеть скин на всё тело по id из RiderModel.SKIN_FILES или снять (null). Промис — когда модель на месте.
     * Схема частей скина — как у персонажа (Body, Head, EyeL/R, ArmL/R, LegL/R; Spin, Tail, PupilL/R, HandL/R — по желанию).
     */
    async setSkin(id) {
        const seq = ++this._skinSeq;
        const url = id ? RiderModel.SKIN_FILES[id] : null;
        if (!url) { this._clearSkin(); return false; }
        if (this.skinId === id && this.skinMesh) return true;
        let model;
        try { model = await Model3D.load(url); } catch (e) { console.warn('RiderModel: скин не загрузился — ' + id); return false; }
        if (seq !== this._skinSeq || this.root.isDisposed()) return false;
        this._clearSkin();
        const scene = this.view.scene;
        const mesh = Model3D.build(model, scene, { name: 'rider-skin:' + id });
        mesh.parent = this.root;
        mesh.rotation.y = Math.PI / 2;
        mesh.scaling.setAll(this.scale);                       // тот же масштаб, что у персонажа: скины сделаны в его размерах
        mesh.position.y = -Math.min(0, model.min[1]) * this.scale;
        /** @type {Record<string, BABYLON.AbstractMesh>} */
        const P = {};
        for (const m of mesh.getChildMeshes(true)) {
            const md = m.metadata || {};
            if (md.part) P[md.part] = m;
            if (md.pivot) m.setPivotPoint(new BABYLON.Vector3(md.pivot[0], md.pivot[1], md.pivot[2]));
        }
        const pv = (m) => (m && m.metadata && m.metadata.pivot) ? m.metadata.pivot : [0, 0, 0];
        // иерархия по именам (движок кладёт части плоско): голова и конечности — на теле, глаза — на голове …
        const parentOf = (name) => {
            if (name === 'Body') return null;
            if (name === 'EyeL' || name === 'EyeR' || name === 'HatPoint') return P.Head || P.Body;
            if (name === 'PupilL') return P.EyeL || P.Head;
            if (name === 'PupilR') return P.EyeR || P.Head;
            if (name === 'HandL') return P.ArmL || P.Body;
            if (name === 'HandR' || name === 'Prop') return P.ArmR || P.Body;
            if (name === 'Spin') return P.Head && pv(P.Spin)[1] > pv(P.Head)[1] ? P.Head : P.Body;
            return P.Body;
        };
        for (const name of Object.keys(P)) { const par = parentOf(name); if (par && par !== P[name]) P[name].parent = par; }
        for (const k of ['PupilL', 'PupilR']) if (P[k]) this._pupilX[k] = P[k].position.x;
        World3D.addObject(this.view, mesh, 'actor');
        this.skinMesh = mesh;
        this.skinId = id;
        // на время скина: анимируются его части; торса нет — наклон корпуса берёт тело
        this.parts = P;
        this.body = P.Body || this.baseBody;
        // бёдра — шарнир ноги (у скинов Body — меш с началом в бёдрах), иначе — тела
        this.hipModelY = P.LegL ? pv(P.LegL)[1] : P.Body ? pv(P.Body)[1] : this.baseHipY;
        this.mesh.setEnabled(false);
        for (const k of Object.keys(this.worn)) if (this.worn[k]) this.worn[k].setEnabled(false);
        return true;
    }

    _clearSkin() {
        if (this.skinMesh) {
            Model3D.dispose(this.view, this.skinMesh);
            this.skinMesh = null;
        }
        this.skinId = null;
        this._pupilX = {};
        this.parts = this.baseParts;
        this.body = this.baseBody;
        this.hipModelY = this.baseHipY;
        this.mesh.setEnabled(true);
        for (const k of Object.keys(this.worn)) if (this.worn[k]) this.worn[k].setEnabled(true);
    }

    // Высота бёдер над ступнями, px мира: на столько опустить корень относительно седла.
    get hipHeight() { return this.hipModelY * this.scale; }

    // look: { tints?: [куртка, брюки, волосы, кожа, футболка], hairStyle? } — пустые поля не меняются.
    setLook(look) {
        const l = look || {};
        if (l.tints) {
            for (let i = 0; i < 5; i++) {
                if (!l.tints[i]) continue;
                const c = BABYLON.Color3.FromHexString(l.tints[i]);
                for (const m of this.tintMats[i]) m.diffuseColor = c.clone();
            }
        }
        if (l.hairStyle && RiderModel.HAIR_STYLES.includes(l.hairStyle)) this.hairStyle = l.hairStyle;
        this._showHair();
    }

    _showHair() {
        // Под шапкой торчащие «шипы» заменяет зачёс (как в Egg Stealing Master).
        const style = this.worn.hat && this.hairStyle === 'spiky' ? 'swept' : this.hairStyle;
        for (const h of RiderModel.HAIR_STYLES) {
            const m = this.parts['Hair_' + h];
            if (m) m.setEnabled(h === style);
        }
    }

    // Надеть косметику: slot 'hat' | 'face' — на голову, 'back' — на торс. mesh — корень
    // косметики в координатах головы/торса файла косметики (как в cosmetics_*.glb) или null.
    attach(slot, mesh) {
        const old = this.worn[slot];
        if (old && old !== mesh) old.parent = null;
        this.worn[slot] = mesh || null;
        if (mesh) {
            const back = slot === 'back';
            const BP = this.baseParts || this.parts, BB = this.baseBody || this.body;   // косметика — на обычной модели
            const parent = back ? (BP.Torso || BB) : (BP.Head || BB);
            const p = back ? this.torsoPivot : this.headPivot;
            mesh.parent = parent;
            mesh.position.set(p[0], p[1], p[2]);
            if (this.skinMesh) mesh.setEnabled(false);   // со скином на всё тело косметика скрыта
        }
        this._showHair();
        return old && old !== mesh ? old : null;   // снятое — владелец решает, удалить ли
    }

    setVisible(on) { this.root.setEnabled(!!on); }

    land(power) { this.squashV -= Math.min(5, 2 + (power || 10) * 0.08); }
    jump() { this.squashV += 3.2; }
    celebrate(sec) { this.cheer = sec || 1.6; }
    // Помахать правой рукой (приветствие продавца, NPC): рука вверх и качается из стороны в сторону.
    wave(sec) { this.waveT = sec || 1.6; }

    // st: { moving, speed (0.6..2.4 — темп шага), grounded, riding, carry }.
    update(dt, st) {
        const s0 = st || {};
        const grounded = s0.grounded !== false;
        if (grounded && !this.wasGrounded && !s0.riding) this.land(10);
        if (!grounded && this.wasGrounded && !s0.riding) this.jump();
        this.wasGrounded = grounded;
        const damp = (a, b, k) => a + (b - a) * (1 - Math.exp(-k * dt));
        const sf = Math.min(2.4, Math.max(0.6, s0.speed || 1));
        this.sit = damp(this.sit, s0.riding ? 1 : 0, 12);
        this.run = damp(this.run, s0.moving && !s0.riding ? 1 : 0, 10);
        this.air = damp(this.air, grounded || s0.riding ? 0 : 1, 14);
        this.carryK = damp(this.carryK, s0.carry ? 1 : 0, 10);
        this.t += dt * (6 + 5.5 * sf * (s0.riding ? (s0.moving ? 1 : 0) : this.run));
        const s = Math.sin(this.t), c = Math.cos(this.t);
        const sit = this.sit, stand = 1 - sit;
        const run = this.run * (1 - this.air) * stand;
        const idle = 1 - this.run;
        const P = this.parts;
        const rx = (m, v) => { if (m) m.rotation.x = v; };
        const rz = (m, v) => { if (m) m.rotation.z = v; };

        // Пружина приседания (прыжок, приземление).
        this.squashV += (-this.squash * 90 - this.squashV * 11) * dt;
        this.squash += this.squashV * dt;
        const sq = Math.max(-0.22, Math.min(0.22, this.squash));
        this.body.scaling.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);

        // Ноги: шаг / прыжок / посадка верхом (вперёд и врозь — обхватить питомца).
        const legAmp = 0.95 * run;
        const rideSwing = s0.riding && s0.moving ? Math.sin(this.t) * 0.08 : 0;
        rx(P.LegL, (-s * legAmp + this.air * -0.75) * stand + (-1.35 + rideSwing) * sit);
        rx(P.LegR, (s * legAmp + this.air * 0.35) * stand + (-1.35 - rideSwing) * sit);
        rz(P.LegL, -0.32 * sit);
        rz(P.LegR, 0.32 * sit);

        // Руки: бег / прыжок / радость / переноска / поводья верхом.
        const armAmp = 0.85 * run;
        let ax = s * armAmp - this.air * 2.3 * stand + idle * Math.sin(this.t * 0.5) * 0.04;
        let bx = -s * armAmp - this.air * 2.0 * stand - idle * Math.sin(this.t * 0.5) * 0.04;
        let az = 0.06 + this.air * 0.35;
        if (this.cheer > 0) {
            this.cheer -= dt;
            const w = Math.sin(this.t * 2.2) * 0.35;
            ax = -2.9 + w; bx = -2.9 - w; az = 0.35;
        }
        const ck = this.carryK;
        const rein = -0.95 + (s0.riding && s0.moving ? Math.sin(this.t * 2) * 0.06 : 0);
        const cheerK = this.cheer > 0 ? 1 : 0;
        const armSit = sit * (1 - cheerK);
        rx(P.ArmL, (ax * (1 - ck) + (-2.75 + Math.sin(this.t * 0.6) * 0.05) * ck) * (1 - armSit) + rein * armSit);
        rx(P.ArmR, (bx * (1 - ck) + (-2.75 - Math.sin(this.t * 0.6) * 0.05) * ck) * (1 - armSit) + rein * armSit);
        rz(P.ArmL, (-az * (1 - ck) + 0.3 * ck) * (1 - armSit) + 0.18 * armSit);
        rz(P.ArmR, (az * (1 - ck) - 0.3 * ck) * (1 - armSit) - 0.18 * armSit);
        if (this.waveT > 0) {
            this.waveT -= dt;
            const k = Math.min(1, this.waveT * 4, 1);
            rx(P.ArmR, -2.75 * k + (P.ArmR ? P.ArmR.rotation.x : 0) * (1 - k));
            rz(P.ArmR, (0.35 + Math.sin(this.t * 2.6) * 0.45) * k);
        }

        // Корпус: покачивание, наклон вперёд на бегу и верхом.
        const ride = s0.riding && s0.moving ? 1 : 0;
        this.body.position.y = (Math.abs(c) * 22 * run + idle * Math.sin(this.t * 0.5) * 2 * stand) + Math.abs(s) * 6 * ride * sit;
        const torso = P.Torso;
        if (torso) {
            torso.rotation.x = 0.13 * run + this.air * -0.1 * stand - ck * 0.05 + (0.06 + 0.1 * ride) * sit;
            torso.rotation.y = s * 0.14 * run;
            torso.rotation.z = c * 0.03 * run;
            torso.scaling.y = 1 + idle * Math.sin(this.t * 0.5) * 0.012;
        }
        if (P.Head) {
            P.Head.rotation.y = -s * 0.1 * run + idle * Math.sin(this.t * 0.17) * 0.25 * (1 - ck) * stand;
            P.Head.rotation.x = -0.08 * run + ck * -0.12 - 0.05 * sit;
        }
        // Моргание.
        this.blink -= dt;
        let e = 1;
        if (this.blink < 0.12) e = 0.12;
        if (this.blink < 0) this.blink = 1.8 + Math.random() * 3.2;
        if (P.EyeL) P.EyeL.scaling.y = e;
        if (P.EyeR) P.EyeR.scaling.y = e;
        // Детали скинов: пропеллер, хвост, бегающие зрачки.
        if (P.Spin) P.Spin.rotation.y += dt * (8 + 22 * Math.max(this.run, ride));
        if (P.Tail) P.Tail.rotation.y = Math.sin(this.t * (s0.moving ? 1 : 0.6)) * (0.25 + 0.2 * this.run);
        for (const k of ['PupilL', 'PupilR']) if (P[k] && this._pupilX && k in this._pupilX) P[k].position.x = this._pupilX[k] + Math.sin(this.t * 0.23) * 9;
    }

    dispose() {
        this._skinSeq++;
        if (this.skinMesh) { Model3D.dispose(this.view, this.skinMesh); this.skinMesh = null; }
        for (const k of Object.keys(this.worn)) if (this.worn[k]) this.worn[k].parent = null;
        Model3D.dispose(this.view, this.mesh);
        this.root.dispose();
    }
}
