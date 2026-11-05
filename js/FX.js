// FX.js — рецепты частиц (app.fx), живность у ранчо, пыль и брызги, фоновые звуки и музыка игры.
//
//   Рецепты (app.fx.play(имя, [x, y, z])): egg-pickup, egg-break, egg-crack, hatch-flare, confetti, cash-pop, egg-sparkle (их
//   зовёт Eggs.js; здесь они переопределены после проверки на экране), land-puff, splash-burst, strike-hit (Weather.js).
//   Пыль из-под ног питомца под седлом (цвет по типу земли), брызги в воде, облачко при приземлении (событие land),
//   бабочки днём и светлячки ночью у ранчо игрока, падающие листья в лесу, исключение светящихся мешей яиц из слоёв обводки.
//   Звук: музыка игры (Sound.music — Menus.js решает, когда она играет: звук и музыка выключаются в настройках, на паузе
//   и при выключенном звуке платформы всё молчит) и фоновые петли ветра, дождя и ночи, которые плавно сменяют друг друга по
//   времени суток и погоде (через Sound.master: пауза, выключение звука и громкость учитываются сами).
// Плотность — GameWorld.fxScale (0.4 / 0.7 / 1 по уровню графики) и FX_MOBILE_SCALE; числа — Constants.js (FX_*).

function fxCfg() {
    const U = 'undefined';
    return {
        butterflies: typeof FX_BUTTERFLIES !== U ? FX_BUTTERFLIES : 14,
        fireflies: typeof FX_FIREFLIES !== U ? FX_FIREFLIES : 22,
        leaves: typeof FX_LEAVES_RATE !== U ? FX_LEAVES_RATE : 7,
        ambient: typeof FX_AMBIENT_VOLUME !== U ? FX_AMBIENT_VOLUME : 0.55,
        music: typeof FX_MUSIC_VOLUME !== U ? FX_MUSIC_VOLUME : 0.7,
    };
}

/** Цвет пыли и прибоя по типу земли (GameWorld.groundType). */
const FX_GROUND_DUST = {
    grass: ['#a8c47a', '#d8e2a8'], grass2: ['#8fbf6a', '#cfe3a4'], sand: ['#e9d4a0', '#fff0c8'], snow: ['#f4f8ff', '#ffffff'],
    dirt: ['#b5895a', '#d6b48a'], path: ['#c8a06c', '#e6c898'], rock: ['#a9adb5', '#d0d4da'], dark: ['#7a6a62', '#a89890'], lava: ['#ff9a5a', '#ffd08a'],
};

const FX_SOUNDS = {
    wind: 'assets/sounds/wind-loop.ogg',
    rain: 'assets/sounds/rain-loop.ogg',
    night: 'assets/sounds/night-ambience.ogg',
    fall: 'assets/sounds/rain-loop.ogg',   // шум водопада: та же петля дождя, громкость — по близости к водопаду
};

/** @satisfies {Record<string, any>} */
const FX = {
    id: 'fx',
    /** @type {LoryApp | null} */
    app: null,
    time: 0,
    /** Пыль и брызги: общие непрерывные системы, следуют за питомцем игрока. @type {any} */
    _dust: null,
    /** @type {any} */
    _splash: null,
    _dustKey: '',
    _groundT: 0,
    _lastVh: 0,
    /** @type {any} */
    _leaves: null,
    _leafT: 0,
    /** @type {any} */
    _leafTex: null,
    /** Бабочки: два меша (левое и правое крыло) на thin instances. @type {any} */
    _bf: null,
    /** @type {{ x: number, y: number, z: number, ph: number, sp: number, r: number, hz: number, a: number, c: number[] }[]} */
    _flies: [],
    _scanT: 0,
    /** @type {any} */
    _amb: null,
    _ambT: 0,
    /** Мягкий ограничитель на выходе звука (пики некоторых файлов ~1.2). @type {any} */
    _lim: null,
    /** Водопады: { sheet, pool, sheetTex, poolTex, bases, top, fx: handle[], near } @type {any[]} */
    _falls: [],
    _fallNear: 0,
    /** Кэш текстур воды водопада (sheet, pool). @type {any} */
    _wfTex: null,

    init(app) {
        this.app = app;
        this._registerRecipes(app.fx);
        Game.events.on('land', () => this._landPuff());
        Game.events.on('egg:spawned', (e) => { if (e && e.egg) this._exemptEgg(e.egg); });
        Game.events.on('water', (e) => { if (e && e.on) this._splashBurst(); });
        // музыка игры: громкость внутри MUSIC_VOLUME (у файла пики ~1.2: держим ниже 1); включением управляет Menus
        Sound.music('assets/sounds/music-game.ogg', { volume: fxCfg().music, fade: 1.2 });
    },

    onLoad() { this._dustKey = ''; },

    ready() {
        this._buildLife();
        this._buildWaterfalls();
    },

    update(dt) {
        this.time += dt;
        const P = typeof Player !== 'undefined' ? Player : null;
        if (P && P.ready !== false) {
            this._updateDust(dt, P);
            this._lastVh = P.vh || 0;
        }
        this._updateLife(dt);
        this._updateLeaves(dt);
        this._scanT -= dt;
        if (this._scanT <= 0) { this._scanT = 0.8; this._exemptEggMeshes(); }
        this._updateWaterfalls(dt);
        this._updateAmbient(dt);
    },

    // =============================================================================================
    // Рецепты
    // =============================================================================================
    _registerRecipes(fx) {
        if (!fx) return;
        const up = [[-0.6, 0.5, -0.6], [0.6, 1.4, 0.6]];
        fx.register('egg-pickup', [
            { burst: 30, capacity: 44, life: [0.4, 0.9], size: [8, 16], speed: [90, 220], color: '#fff6a8', color2: '#9fffb0', gravity: [0, 80, 0], direction: up, sizeGradient: [[0, 1], [1, 0.1]] },
            { burst: 5, capacity: 8, life: [0.22, 0.42], size: [90, 140], speed: [0, 4], color: '#ffffff', sizeGradient: [[0, 0.3], [0.4, 1], [1, 0]] },
        ]);
        fx.register('egg-break', [
            { burst: 44, capacity: 56, life: [0.5, 1.1], size: [11, 24], speed: [120, 320], color: '#f3e2b8', color2: '#e0c88a', blend: 'standard', gravity: [0, -420, 0], direction: [[-1, 0.2, -1], [1, 1.3, 1]], spin: [-5, 5] },
            { delay: 0.02, burst: 14, capacity: 18, life: [0.8, 1.6], size: [40, 70], speed: [10, 40], color: '#d8c9a8', blend: 'standard', gravity: [0, 18, 0], direction: [[-0.4, 0.2, -0.4], [0.4, 1, 0.4]], sizeGradient: [[0, 0.4], [1, 1.8]] },
        ]);
        fx.register('egg-crack', [{ burst: 16, capacity: 22, life: [0.3, 0.7], size: [6, 12], speed: [70, 170], color: '#fff1b0', gravity: [0, -220, 0] }]);
        fx.register('hatch-flare', [
            { burst: 10, capacity: 14, life: [0.35, 0.8], size: [180, 300], speed: [0, 6], color: '#ffffff', sizeGradient: [[0, 0.4], [0.35, 1], [1, 0]] },
            { burst: 80, capacity: 100, life: [0.5, 1.3], size: [10, 20], speed: [160, 420], color: '#fff4a0', color2: '#8ff0ff', gravity: [0, -120, 0], sizeGradient: [[0, 1], [1, 0.2]] },
            { delay: 0.04, burst: 24, capacity: 30, life: [0.7, 1.4], size: [26, 48], speed: [30, 90], color: '#f3e2b8', blend: 'standard', gravity: [0, -300, 0], direction: [[-1, 0.3, -1], [1, 1, 1]] },
        ]);
        const confetti = (color, delay) => ({ delay, burst: 26, capacity: 32, life: [1.1, 2.3], size: [9, 16], speed: [170, 440], color, blend: 'standard', gravity: [0, -430, 0], direction: [[-0.8, 0.9, -0.8], [0.8, 1.7, 0.8]], spin: [-4, 4] });
        fx.register('confetti', [confetti('#ff4f7a', 0), confetti('#ffd21f', 0.03), confetti('#43c431', 0.06), confetti('#3d9cf0', 0.09), confetti('#b46cff', 0.12)]);
        fx.register('cash-pop', [
            { burst: 18, capacity: 22, life: [0.4, 0.9], size: [12, 20], speed: [70, 170], color: '#8dff6a', color2: '#fff6a8', gravity: [0, 90, 0], direction: up, sizeGradient: [[0, 1], [1, 0.2]] },
            { burst: 2, capacity: 3, life: [0.25, 0.4], size: [70, 100], speed: [0, 3], color: '#b6ff90', alpha: 0.7, sizeGradient: [[0, 0.4], [0.4, 1], [1, 0]] },
        ]);
        fx.register('egg-sparkle', [{ rate: 12, capacity: 36, life: [0.9, 1.7], size: [8, 15], speed: [8, 36], color: '#fff6c8', box: [[-34, 10, -34], [34, 110, 34]], direction: [[-0.3, 0.6, -0.3], [0.3, 1, 0.3]], sizeGradient: [[0, 0.3], [0.4, 1], [1, 0]] }]);
        fx.register('land-puff', [{ burst: 14, capacity: 20, life: [0.45, 0.85], size: [26, 50], speed: [70, 170], color: '#b9a37d', alpha: 0.55, blend: 'standard', gravity: [0, 25, 0], direction: [[-1, 0.04, -1], [1, 0.3, 1]], sizeGradient: [[0, 0.5], [0.5, 1], [1, 1.4]] }]);
        fx.register('splash-burst', [
            { burst: 38, capacity: 46, life: [0.45, 0.85], size: [12, 22], speed: [140, 340], color: '#ffffff', color2: '#9fd8ff', gravity: [0, -520, 0], direction: [[-0.7, 0.8, -0.7], [0.7, 1.8, 0.7]], sizeGradient: [[0, 1], [1, 0.3]] },
            { burst: 3, capacity: 4, life: [0.5, 0.8], size: [70, 120], speed: [0, 6], color: '#bfe6ff', alpha: 0.5, sizeGradient: [[0, 0.3], [0.5, 1], [1, 1.3]] },
        ]);
    },

    // =============================================================================================
    // Пыль, брызги, приземление
    // =============================================================================================
    /** Позиция под ногами питомца игрока (чуть позади). */
    _feet(P, out) {
        const v = P.petView;
        const back = v ? v.length * 0.28 : 40;
        out.x = P.x - Math.cos(P.heading) * back; out.z = P.y - Math.sin(P.heading) * back;
        out.y = (P.riding ? P.h : GameWorld.groundH(P.x, P.y)) + 8;
        return out;
    },

    _updateDust(dt, P) {
        const fx = this.app && this.app.fx;
        if (!fx) return;
        if (!this._dust) {
            this._dust = fx.create({
                rate: 0.001, capacity: 110, life: [0.45, 0.9], size: [26, 46], speed: [20, 70], gravity: [0, 18, 0], blend: 'standard',
                color: '#b9a37d', color2: '#d8c8a0', alpha: 0.5, direction: [[-0.7, 0.15, -0.7], [0.7, 0.9, 0.7]], sizeGradient: [[0, 0.45], [0.5, 1], [1, 1.5]],
                position: [0, -9000, 0],
            });
            this._splash = fx.create({
                rate: 0.001, capacity: 120, life: [0.35, 0.7], size: [7, 13], speed: [90, 240], gravity: [0, -520, 0],
                color: '#ffffff', color2: '#9fd8ff', direction: [[-0.6, 0.9, -0.6], [0.6, 1.8, 0.6]], sizeGradient: [[0, 1], [1, 0.3]],
                position: [0, -9000, 0],
            });
        }
        if (!this._dust) return;
        const speed = Math.hypot(P.vx || 0, P.vy || 0);
        const riding = !!(P.riding && P.petView);
        const ground = !P.flying && P.onGround !== false;
        const feet = this._tmpFeet || (this._tmpFeet = { x: 0, y: 0, z: 0 });
        this._feet(P, feet);
        const scale = typeof GameWorld !== 'undefined' ? GameWorld.fxScale : 1;
        // цвет по типу земли — раз в 0.25 с
        this._groundT -= dt;
        if (this._groundT <= 0) {
            this._groundT = 0.25;
            const key = GameWorld.groundType(P.x, P.y);
            if (key !== this._dustKey) {
                this._dustKey = key;
                const c = FX_GROUND_DUST[key] || FX_GROUND_DUST.grass;
                const ps = this._dust.system;
                ps.color1 = ParticleFX.color(c[0], 0.5); ps.color2 = ParticleFX.color(c[1], 0.5); ps.colorDead = ParticleFX.color(c[1], 0);
            }
        }
        const water = !!P.inWater;
        if (this._dust) {
            this._dust.setPosition([feet.x, feet.y, feet.z]);
            this._dust.setRate(riding && ground && !water && speed > 220 ? Math.min(60, speed / 26) * scale : 0.001);
        }
        if (this._splash) {
            this._splash.setPosition([P.x, (typeof GameWorld !== 'undefined' ? (GameWorld.waterAt(P.x, P.y) || P.h) : P.h) + 6, P.y]);
            this._splash.setRate(water && speed > 120 ? Math.min(90, speed / 14) * scale : 0.001);
        }
    },

    _landPuff() {
        const P = typeof Player !== 'undefined' ? Player : null, fx = this.app && this.app.fx;
        if (!P || !fx) return;
        const power = Math.min(1, Math.max(0, -this._lastVh) / 1500);
        if (power < 0.12) return;
        const c = FX_GROUND_DUST[GameWorld.groundType(P.x, P.y)] || FX_GROUND_DUST.grass;
        try { fx.play(P.inWater ? 'splash-burst' : 'land-puff', [P.x, P.h + 8, P.y], P.inWater ? {} : { color: c[0], color2: c[1], burst: Math.round(8 + 18 * power) }); } catch (e) { /* без частиц */ }
    },

    _splashBurst() {
        const P = typeof Player !== 'undefined' ? Player : null, fx = this.app && this.app.fx;
        if (!P || !fx) return;
        const wl = GameWorld.waterAt(P.x, P.y);
        try { fx.play('splash-burst', [P.x, (wl != null ? wl : P.h) + 6, P.y]); } catch (e) { /* без частиц */ }
    },

    // =============================================================================================
    // Живность у ранчо: бабочки днём, светлячки ночью
    // =============================================================================================
    _buildLife() {
        const app = this.app;
        if (!app || !app.location || typeof Ranch === 'undefined' || !Ranch.player) return;
        const scene = app.location.view.scene, tier = typeof GameWorld !== 'undefined' ? GameWorld.tier : 1;
        const k = [0.35, 0.6, 1][tier];
        const cfg = fxCfg();
        const nb = Math.round(cfg.butterflies * k), nf = Math.round(cfg.fireflies * k);
        const plot = Ranch.player, rnd = GameUtil.rng('fx-life');
        const pal = [[1, 0.78, 0.2], [1, 0.45, 0.65], [0.55, 0.8, 1], [1, 1, 1], [1, 0.6, 0.2]];
        // крылья: тонкие четырёхугольники с вершинными цветами; цвет бабочки — цвет экземпляра
        if (nb > 0) {
            const wing = (side) => PetView.buildMesh(scene, 'butterfly-wing' + side, [
                PV.box(11, 0.7, 9, [0, 0, side * 5.2], '#ffffff'),
                PV.box(6, 0.8, 5, [-3, 0.05, side * 7], '#ffffff'),
            ]);
            const L = wing(1), R = wing(-1);
            const bufL = new Float32Array(nb * 16), bufR = new Float32Array(nb * 16);
            const colBuf = new Float32Array(nb * 4);
            for (let i = 0; i < nb; i++) { const c = pal[i % pal.length]; colBuf.set([c[0], c[1], c[2], 1], i * 4); }
            for (const m of [L, R]) {
                m.thinInstanceSetBuffer('matrix', m === L ? bufL : bufR, 16, false);
                m.thinInstanceSetBuffer('color', colBuf.slice(), 4, true);
                m.thinInstanceCount = nb;
                m.alwaysSelectAsActiveMesh = true;
                m.isPickable = false;
                World3D.addObject(app.location.view, m, 'prop', { ink: false, outline: false, castShadow: false });
            }
            this._bf = { L, R, bufL, bufR, n: nb, mat: [new BABYLON.Matrix(), new BABYLON.Matrix()], q: BABYLON.Quaternion.Identity(), qf: BABYLON.Quaternion.Identity(), pos: BABYLON.Vector3.Zero(), sc: new BABYLON.Vector3(1.7, 1.7, 1.7) };
        }
        this._flies = [];
        const total = nb + nf;
        for (let i = 0; i < total; i++) {
            // «дом» бабочки — вокруг ранчо игрока, между забором и лугом
            const a = rnd() * Math.PI * 2, d = 500 + rnd() * 1300;
            this._flies.push({
                x: plot.x + Math.cos(a) * d, y: plot.y + Math.sin(a) * d, z: 50 + rnd() * 170, ph: rnd() * 100, sp: 0.35 + rnd() * 0.4,
                r: 120 + rnd() * 260, hz: 9 + rnd() * 5, a: rnd() * 6.28, c: pal[i % pal.length],
            });
        }
        this._nb = nb;
    },

    _updateLife(dt) {
        const app = this.app, arcs = typeof PetView !== 'undefined' ? PetView.arcs : null;
        if (!app || !app.location || !this._flies.length) return;
        const cam = app.location.view.camera.position;
        const plot = Ranch.player;
        if (!plot) return;
        const dxc = cam.x - plot.x, dzc = cam.z - plot.y;
        const near = dxc * dxc + dzc * dzc < 4200 * 4200;
        const nf = GameWorld.nightFactor, day = 1 - nf;
        const t = this.time;
        // бабочки: летают восьмёрками и взмахивают крыльями; ночью, вдали и в грозу скрыты
        const bf = this._bf;
        if (bf) {
            const w = typeof Weather !== 'undefined' && Weather.active ? 0 : 1;
            const on = near && day > 0.5 && w > 0;
            if (bf.L.isEnabled() !== on) { bf.L.setEnabled(on); bf.R.setEnabled(on); }
            if (on) {
                const bufL = bf.bufL, bufR = bf.bufR;
                const q = bf.q, qf = bf.qf, pos = bf.pos, sc = bf.sc;
                for (let i = 0; i < bf.n; i++) {
                    const f = this._flies[i];
                    const u = t * f.sp + f.ph;
                    const x = f.x + Math.sin(u) * f.r, y = f.y + Math.sin(u * 2) * f.r * 0.5;
                    const h = GameWorld.groundH(x, y) + f.z + Math.sin(u * 1.7) * 28;
                    const hd = Math.atan2(Math.cos(u * 2) * f.r, Math.cos(u) * f.r);
                    const flap = 0.15 + 0.95 * Math.abs(Math.sin(t * f.hz + f.ph));
                    pos.set(x, h, y);
                    BABYLON.Quaternion.RotationYawPitchRollToRef(-hd, 0, flap, q);
                    BABYLON.Matrix.ComposeToRef(sc, q, pos, bf.mat[0]);
                    BABYLON.Quaternion.RotationYawPitchRollToRef(-hd, 0, -flap, qf);
                    BABYLON.Matrix.ComposeToRef(sc, qf, pos, bf.mat[1]);
                    bf.mat[0].copyToArray(bufL, i * 16);
                    bf.mat[1].copyToArray(bufR, i * 16);
                }
                bf.L.thinInstanceBufferUpdated('matrix');
                bf.R.thinInstanceBufferUpdated('matrix');
            }
        }
        // светлячки: тёплые мигающие огоньки ночью
        if (arcs && near && nf > 0.2) {
            const k = (nf - 0.2) / 0.8;
            for (let i = this._nb; i < this._flies.length; i++) {
                const f = this._flies[i];
                const u = t * f.sp * 0.6 + f.ph;
                const x = f.x + Math.sin(u) * f.r * 0.8, y = f.y + Math.cos(u * 0.8) * f.r * 0.8;
                const h = GameWorld.groundH(x, y) + 60 + f.z * 0.7 + Math.sin(u * 2.3) * 34;
                const blink = Math.max(0, Math.sin(t * (0.9 + f.sp) + f.ph * 2));
                const a = k * (0.15 + 0.85 * blink * blink);
                if (a < 0.04) continue;
                arcs.sprite(x, h, y, 46, 0.78, 1, 0.35, a * 0.55);
                arcs.sprite(x, h, y, 14, 1, 1, 0.8, a);
            }
        }
    },

    // =============================================================================================
    // Листопад в лесу
    // =============================================================================================
    _updateLeaves(dt) {
        const app = this.app, fx = app && app.fx;
        if (!app || !fx || !app.location) return;
        const tier = typeof GameWorld !== 'undefined' ? GameWorld.tier : 1;
        this._leafT -= dt;
        if (this._leafT > 0) return;
        this._leafT = 0.6;
        const rate = fxCfg().leaves * [0, 0.5, 1][tier];
        const cam = app.location.view.camera;
        // лес — вокруг маркеров egg-forest: ближе 2200 px к камере листья падают
        let near = false;
        const E = typeof Eggs !== 'undefined' ? Eggs : null;
        if (E && E.markers && rate > 0) {
            for (const m of E.markers) {
                if (m.zone !== 'forest') continue;
                const dx = m.x - cam.position.x, dy = m.y - cam.position.z;
                if (dx * dx + dy * dy < 2200 * 2200) { near = true; break; }
            }
        }
        const raining = typeof Weather !== 'undefined' && Weather.active && Weather.active.id === 'thunder';
        if (near && !this._leaves) {
            this._leaves = fx.create({
                rate: rate * 1.4, capacity: 80, life: [3, 5.2], size: [11, 18], speed: [8, 36], gravity: [0, -48, 0], blend: 'standard',
                color: '#6dbb45', color2: '#d9a23a', alpha: 0.95, box: [[-1300, 380, -1300], [1300, 700, 1300]], spin: [-2.4, 2.4],
                direction: [[-0.6, -0.5, -0.6], [0.6, 0.1, 0.6]], follow: () => cam.position, position: cam.position,
            });
            if (this._leaves) {
                const t = this._leafTexture();
                if (t) this._leaves.system.particleTexture = t;
            }
        } else if ((!near || raining) && this._leaves) { this._leaves.stop(); this._leaves = null; }
    },

    _leafTexture() {
        if (this._leafTex || !this.app || !this.app.location) return this._leafTex;
        const scene = this.app.location.view.scene;
        const tex = new BABYLON.DynamicTexture('fx-leaf', { width: 32, height: 32 }, scene, true);
        const g = /** @type {any} */ (tex.getContext());
        g.clearRect(0, 0, 32, 32);
        g.fillStyle = '#ffffff';
        g.beginPath(); g.moveTo(16, 2); g.bezierCurveTo(30, 8, 28, 24, 16, 30); g.bezierCurveTo(4, 24, 2, 8, 16, 2); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(16, 5); g.lineTo(16, 29); g.stroke();
        tex.update();
        tex.hasAlpha = true;
        this._leafTex = tex;
        return tex;
    },

    // =============================================================================================
    // Светящиеся меши яиц (свечение на земле и луч): не заслонки маски обводки
    // =============================================================================================
    _exemptEgg(e) {
        const v = e && e.view;
        if (!v || v._fxExempt || typeof PetView === 'undefined') return;
        v._fxExempt = true;
        if (v.glow) PetView.exempt(v.glow);
        if (v.beam) PetView.exempt(v.beam);
    },

    _exemptEggMeshes() {
        const E = typeof Eggs !== 'undefined' ? Eggs : null;
        if (!E) return;
        for (const e of E.live) this._exemptEgg(e);
    },


    // =============================================================================================
    // Водопад: текущая вода, рябь в чаше, брызги, пена, туман, шум
    // =============================================================================================
    // Часть «water» модели waterfall_cliff (стена воды + ручей наверху + гладь чаши, вершинные цвета, без UV) делится по
    // нормали граней на две сетки: отвесная стена — бегущие вниз струи, пологая гладь — медленная рябь. Исходная часть
    // скрывается (isVisible = false), новые сетки — её дети с теми же координатами. Частицы — у подножия стены.
    _buildWaterfalls() {
        const loc = this.app && this.app.location;
        this._falls = [];
        if (!loc) return;
        for (const rec of loc.objects) {
            const model = rec.def && rec.def.model;
            if (!model || !/waterfall_cliff\.glb$/.test(model) || !rec.mesh) continue;
            const water = rec.mesh.getChildMeshes(false).find(m => m.metadata && m.metadata.part === 'water');
            if (!water) continue;
            try { const wf = this._makeWaterfall(water); if (wf) this._falls.push(wf); }
            catch (e) { console.warn('FX: водопад не оживлён — ' + ((e && e.message) || e)); }
        }
    },

    _makeWaterfall(water) {
        const scene = water.getScene();
        const P = water.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const I = water.getIndices();
        if (!P || !I) return null;
        const sheet = { p: [], n: [], uv: [], i: [] }, pool = { p: [], n: [], uv: [], i: [] };
        let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity, frontX = -Infinity;
        for (let t = 0; t < I.length; t += 3) {
            const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
            const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
            const steep = Math.abs(ny) < 0.55;
            const g = steep ? sheet : pool;
            for (const k of [a, b, c]) {
                const x = P[k], y = P[k + 1], z = P[k + 2];
                g.i.push(g.p.length / 3);
                g.p.push(x, y, z);
                g.n.push(steep ? nx : 0, steep ? ny : 1, steep ? nz : 0);
                if (steep) {
                    // u — поперёк стены (вдоль её ширины), v — вниз: струи бегут сменой vOffset
                    g.uv.push((z * Math.abs(nx) + x * Math.abs(nz)) / 150, -y / 230);
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    if (z < minZ) minZ = z;
                    if (z > maxZ) maxZ = z;
                    if (x > frontX) frontX = x;
                } else g.uv.push(x / 210, z / 210);
            }
        }
        if (!sheet.i.length) return null;
        const mk = (name, d, tex, alpha, em) => {
            const m = new BABYLON.Mesh(name, scene);
            const vd = new BABYLON.VertexData();
            vd.positions = d.p; vd.normals = d.n; vd.uvs = d.uv; vd.indices = d.i;
            vd.applyToMesh(m);
            const mat = new BABYLON.StandardMaterial(name + '-mat', scene);
            mat.diffuseTexture = tex;
            mat.diffuseTexture.hasAlpha = true;
            mat.useAlphaFromDiffuseTexture = true;
            mat.alpha = alpha;
            mat.emissiveColor = new BABYLON.Color3(em[0], em[1], em[2]);
            mat.specularColor = new BABYLON.Color3(0.25, 0.3, 0.32);
            mat.specularPower = 48;
            mat.backFaceCulling = false;
            mat.disableDepthWrite = true;
            mat.metadata = { toon: false };
            m.material = mat;
            m.parent = water;
            m.isPickable = false;
            m.alphaIndex = name === 'wf-sheet' ? 2 : 1;
            m.metadata = { noOutline: true };
            return m;
        };
        const sheetTex = this._waterTex('sheet'), poolTex = this._waterTex('pool');
        const sheetMesh = mk('wf-sheet', sheet, sheetTex, 0.9, [0.32, 0.5, 0.58]);
        const poolMesh = pool.i.length ? mk('wf-pool', pool, poolTex, 0.86, [0.2, 0.36, 0.44]) : null;
        water.isVisible = false;
        // подножие стены в мире: три точки по ширине, чуть перед фронтом стены, на уровне низа
        const wm = water.getWorldMatrix();
        const toWorld = (x, y, z) => BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(x, y, z), wm);
        const zc = (minZ + maxZ) / 2, half = (maxZ - minZ) / 2;
        const bases = [-0.6, 0, 0.6].map(k => toWorld(frontX + 30, minY + 10, zc + k * half));
        const top = toWorld(frontX, maxY - 20, zc);
        return { sheet: sheetMesh, pool: poolMesh, sheetTex, poolTex, bases, top, fx: [], near: false };
    },

    // Текстуры воды (бесшовные): стена — светлые вертикальные струи разной ширины и прозрачности, чаша — рябь и блики.
    _waterTex(kind) {
        const cache = this._wfTex || (this._wfTex = {});
        if (cache[kind]) return cache[kind];
        const scene = this.app.location.view.scene;
        const W = kind === 'sheet' ? 128 : 256, H = 256;
        const tex = new BABYLON.DynamicTexture('wf-' + kind, { width: W, height: H }, scene, true);
        const g = /** @type {CanvasRenderingContext2D} */ (/** @type {any} */ (tex.getContext()));
        let seed = kind === 'sheet' ? 71 : 113;
        const R = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
        if (kind === 'sheet') {
            const grd = g.createLinearGradient(0, 0, W, 0);
            grd.addColorStop(0, 'rgba(120,205,240,0.80)'); grd.addColorStop(0.5, 'rgba(170,228,250,0.86)'); grd.addColorStop(1, 'rgba(120,205,240,0.80)');
            g.fillStyle = grd; g.fillRect(0, 0, W, H);
            // струи: вертикальные полосы с разрывами; рисуем и со сдвигом −H — шва по вертикали не видно
            for (let i = 0; i < 70; i++) {
                const x = R() * W, w = 1 + R() * 3.5, len = 30 + R() * 140, y = R() * H;
                g.fillStyle = 'rgba(255,255,255,' + (0.25 + R() * 0.6).toFixed(2) + ')';
                for (const dy of [0, -H]) { g.fillRect(x, y + dy, w, len); if (x + w > W) g.fillRect(x - W, y + dy, w, len); }
            }
            for (let i = 0; i < 40; i++) {
                const x = R() * W, y = R() * H, r = 1 + R() * 2.2;
                g.fillStyle = 'rgba(255,255,255,0.9)';
                for (const dy of [0, -H, H]) { g.beginPath(); g.arc(x, y + dy, r, 0, Math.PI * 2); g.fill(); }
            }
        } else {
            g.fillStyle = 'rgba(95,195,235,0.82)'; g.fillRect(0, 0, W, H);
            // рябь: светлые дуги и пятна бликов, бесшовно по обеим осям
            for (let i = 0; i < 90; i++) {
                const x = R() * W, y = R() * H, rx = 8 + R() * 26, ry = 3 + R() * 7, rot = R() * 0.4;
                g.strokeStyle = 'rgba(235,252,255,' + (0.12 + R() * 0.35).toFixed(2) + ')';
                g.lineWidth = 1 + R() * 2;
                for (const dx of [0, -W, W]) for (const dy of [0, -H, H]) {
                    g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, rot, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
                }
            }
            for (let i = 0; i < 30; i++) {
                const x = R() * W, y = R() * H, r = 2 + R() * 5;
                g.fillStyle = 'rgba(255,255,255,0.35)';
                for (const dx of [0, -W, W]) for (const dy of [0, -H, H]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill(); }
            }
        }
        tex.update(true);
        tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        tex.anisotropicFilteringLevel = 4;
        cache[kind] = tex;
        return tex;
    },

    _updateWaterfalls(dt) {
        if (!this._falls.length) { this._fallNear = 0; return; }
        const P = typeof Player !== 'undefined' ? Player : null;
        const fx = this.app && this.app.fx;
        let near = 0;
        for (const wf of this._falls) {
            if (wf.sheetTex) wf.sheetTex.vOffset -= dt * 1.35;              // струи бегут вниз
            if (wf.poolTex) { wf.poolTex.uOffset += dt * 0.035; wf.poolTex.vOffset += dt * 0.022; }
            const b = wf.bases[1];
            const d = P ? Math.hypot((P.x || 0) - b.x, (P.y || 0) - b.z) : 1e9;
            near = Math.max(near, GameUtil.clamp(1 - (d - 600) / 3800, 0, 1));
            const want = d < 6500;
            if (want && !wf.near && fx) {
                // брызги и пена у подножия, туман, мелкая водяная пыль у кромки наверху
                const k = typeof GameWorld !== 'undefined' && GameWorld.fxScale ? GameWorld.fxScale : 1;
                for (const p of wf.bases) {
                    const h1 = fx.create({ position: p, rate: 26 * k, capacity: 70, life: [0.45, 1.0], size: [10, 24], speed: [140, 300], color: '#ffffff', color2: '#d6f4ff', blend: 'standard', gravity: [0, -620, 0], direction: [[-0.7, 0.9, -0.7], [0.7, 1.7, 0.7]], box: [[-70, 0, -70], [70, 10, 70]] });
                    const h2 = fx.create({ position: p, rate: 4 * k, capacity: 16, life: [2.2, 3.8], size: [130, 230], speed: [12, 36], color: '#ffffff', alpha: 0.32, blend: 'standard', gravity: [0, 22, 0], direction: [[-0.5, 0.6, -0.5], [0.5, 1, 0.5]], box: [[-90, 0, -90], [90, 40, 90]], sizeGradient: [[0, 0.5], [1, 1.5]], colorGradient: [[0, '#ffffff', 0], [0.25, '#ffffff', 0.32], [1, '#ffffff', 0]] });
                    const h3 = fx.create({ position: p, rate: 8 * k, capacity: 30, life: [1.2, 2.2], size: [26, 54], speed: [30, 80], color: '#f4fdff', alpha: 0.7, blend: 'standard', gravity: [0, -10, 0], direction: [[-1, 0.05, -1], [1, 0.15, 1]], box: [[-60, 0, -60], [60, 6, 60]], sizeGradient: [[0, 0.4], [1, 1.6]], colorGradient: [[0, '#ffffff', 0.75], [1, '#ffffff', 0]] });
                    for (const h of [h1, h2, h3]) if (h) wf.fx.push(h);
                }
                const h4 = fx.create({ position: wf.top, rate: 10 * k, capacity: 30, life: [0.6, 1.2], size: [6, 14], speed: [40, 110], color: '#ffffff', color2: '#e0f7ff', blend: 'standard', gravity: [0, -380, 0], direction: [[0.2, 0.2, -0.8], [1, 0.6, 0.8]], box: [[-40, 0, -120], [40, 10, 120]] });
                if (h4) wf.fx.push(h4);
                wf.near = true;
            } else if (!want && wf.near) {
                for (const h of wf.fx) { try { h.stop(); } catch (e) { /* ок */ } }
                wf.fx = [];
                wf.near = false;
            }
        }
        this._fallNear = near;
    },

    // =============================================================================================
    // Звук: фоновые петли ветра, дождя и ночи
    // =============================================================================================
    /** Ветер всегда тихо, сильнее в грозу и бурю; дождь — в грозу; ночные сверчки — по ночному коэффициенту; шум водопада — по близости. */
    ambientTargets() {
        const nf = typeof GameWorld !== 'undefined' ? GameWorld.nightFactor : 0;
        const wid = typeof Weather !== 'undefined' && Weather.active ? Weather.active.id : null;
        const storm = wid === 'thunder' ? 1 : wid === 'voidstorm' ? 0.8 : 0;
        return {
            wind: GameUtil.clamp(0.32 + 0.5 * storm + (wid === 'bloodmoon' ? 0.2 : 0) - 0.12 * nf, 0, 1),
            rain: wid === 'thunder' ? 1 : 0,
            night: nf * (1 - 0.7 * storm) * (wid === 'aurora' ? 0.8 : 1),
            fall: this._fallNear * 0.85,
        };
    },

    _updateAmbient(dt) {
        this._ambT -= dt;
        if (this._ambT > 0) return;
        this._ambT = 0.4;
        const ctx = Sound.ctx;
        if (!ctx || !Sound.master) return;
        if (!this._lim) {
            // master -> компрессор-ограничитель -> выход: музыка, петли и эффекты вместе не клиппируют
            try {
                const lim = ctx.createDynamicsCompressor();
                lim.threshold.value = -8; lim.knee.value = 10; lim.ratio.value = 6; lim.attack.value = 0.004; lim.release.value = 0.2;
                Sound.master.disconnect();
                Sound.master.connect(lim);
                lim.connect(ctx.destination);
                this._lim = lim;
            } catch (e) { this._lim = true; }
        }
        if (!this._amb) {
            // первый жест игрока: контекст создан — запускаем петли (громкость 0, дальше плавно по целям)
            this._amb = {};
            for (const key of Object.keys(FX_SOUNDS)) {
                const rec = this._amb[key] = { gain: ctx.createGain(), src: null, target: 0 };
                rec.gain.gain.value = 0;
                rec.gain.connect(Sound.master);
                Sound.load(FX_SOUNDS[key]).then((buf) => {
                    if (!buf) return;
                    const src = ctx.createBufferSource();
                    src.buffer = buf; src.loop = true;
                    src.connect(rec.gain);
                    src.start();
                    rec.src = src;
                });
            }
        }
        const st = /** @type {any} */ (GameState.state.settings);
        const sfxOn = !st || (st.sfx !== 0 && st.sfx !== false);
        const vol = fxCfg().ambient * (typeof SOUND_VOLUME !== 'undefined' ? SOUND_VOLUME : 0.8) * (sfxOn ? 1 : 0);
        const t = this.ambientTargets();
        const now = ctx.currentTime;
        for (const key of Object.keys(this._amb)) {
            const rec = this._amb[key];
            const tg = Math.min(0.9, (t[key] || 0) * vol);
            if (Math.abs(tg - rec.target) < 0.004) continue;
            rec.target = tg;
            rec.gain.gain.setTargetAtTime(tg, now, 1.4);
        }
    },
};

Game.register(FX);
