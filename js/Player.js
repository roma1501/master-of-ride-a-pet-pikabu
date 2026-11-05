// Player.js — наездник (модель из Egg Stealing Master — RiderModel.js), управление, прыжок, полёт, вода, камера от третьего лица.
//
//   Player.x, y, h (высота ног над уровнем мира), heading (рад), vx, vy, onGround, flying, inWater
//   Player.riding            uid питомца под седлом или null (пешком); питомец GameState.state.riding — выбранный (equip)
//   Player.ride(uid?)  dismount()  toggleRide()  teleport(x, y, heading?)  moveSpeed()  speedShown()  canFly()
//   Player.petView           вид питомца (под седлом или припаркованного); Player.rider — наездник
//   Player.headAnchor        TransformNode на макушке (шапки);  Player.bodyParts — части RiderView (Torso, Head, ArmL…)
//   Player.setLook(look)     { tints: [куртка, брюки, волосы, кожа, футболка], hairStyle } — RiderView.setLook
//   Player.wear(slot, mesh)  косметика 'hat' | 'face' | 'back' (координаты головы/торса файла косметики) — RiderView.attach
//   Player.setOutfit(def)    совместимость: { shirt, pants, hair, skin, undershirt|scarf, hairStyle } -> setLook
//   Player.setHat(factory)   factory(scene, anchor) -> узел | null (своя шапка на якоре макушки)
//   Player.camAz / camPitch  азимут и наклон камеры; Player.cameraTarget — { x, y, h }
//   Player.cine              кинематографическая камера (вылупление): { x, y, h, dist, az, pitch } или null; плавный вход и выход,
//                            поля можно менять на лету (dist, az…). Ввод игрока блокирует GameUI.lock.
// Управление (GameUI.input): WASD/стрелки ↑↓ — движение относительно камеры, ← → и ПКМ/ЛКМ-драг — поворот камеры, колесо —
// зум, Пробел — прыжок / вверх в полёте, Shift — вниз, R — сесть/слезть, E — действие. Телефон: джойстик слева, драг справа, щипок.
// Камеру ведёт игрок: RTS-ввод CameraController отключён (detach), его update заменён на камеру игрока.
// События (Game.events): ride { on, pet }, water { on }, jump, land.

// Константы Constants.js (лексические const — читаются только по имени через typeof).
const PCFG = (() => {
    const U = 'undefined';
    return {
        PLAYER_WALK_SPEED: typeof PLAYER_WALK_SPEED !== U ? PLAYER_WALK_SPEED : 430,
        PLAYER_RADIUS: typeof PLAYER_RADIUS !== U ? PLAYER_RADIUS : 38,
        PLAYER_JUMP_SPEED: typeof PLAYER_JUMP_SPEED !== U ? PLAYER_JUMP_SPEED : 820,
        PLAYER_GRAVITY: typeof PLAYER_GRAVITY !== U ? PLAYER_GRAVITY : 2600,
        PLAYER_JUMP_BOOST: typeof PLAYER_JUMP_BOOST !== U ? PLAYER_JUMP_BOOST : 1.7,
        PLAYER_GLIDE_FALL: typeof PLAYER_GLIDE_FALL !== U ? PLAYER_GLIDE_FALL : 170,
        PLAYER_FLY_SPEED: typeof PLAYER_FLY_SPEED !== U ? PLAYER_FLY_SPEED : 760,
        PLAYER_MAX_SLOPE: typeof PLAYER_MAX_SLOPE !== U ? PLAYER_MAX_SLOPE : 1.2,
        PLAYER_RIDE_COOLDOWN: typeof PLAYER_RIDE_COOLDOWN !== U ? PLAYER_RIDE_COOLDOWN : 1,
        PLAYER_CAM_DIST: typeof PLAYER_CAM_DIST !== U ? PLAYER_CAM_DIST : 620,
        PLAYER_CAM_DIST_MIN: typeof PLAYER_CAM_DIST_MIN !== U ? PLAYER_CAM_DIST_MIN : 240,
        PLAYER_CAM_DIST_MAX: typeof PLAYER_CAM_DIST_MAX !== U ? PLAYER_CAM_DIST_MAX : 1700,
        PLAYER_CAM_LOOK_HEIGHT: typeof PLAYER_CAM_LOOK_HEIGHT !== U ? PLAYER_CAM_LOOK_HEIGHT : 130,
        PLAYER_CAM_PITCH_DEG: typeof PLAYER_CAM_PITCH_DEG !== U ? PLAYER_CAM_PITCH_DEG : 22,
        PLAYER_CAM_LERP: typeof PLAYER_CAM_LERP !== U ? PLAYER_CAM_LERP : 9,
        PLAYER_CAM_ALIGN_DELAY: typeof PLAYER_CAM_ALIGN_DELAY !== U ? PLAYER_CAM_ALIGN_DELAY : 2.2,
        PLAYER_CAM_ALIGN_SPEED: typeof PLAYER_CAM_ALIGN_SPEED !== U ? PLAYER_CAM_ALIGN_SPEED : 1.5,
        PLAYER_CAM_SPEED_FOV: typeof PLAYER_CAM_SPEED_FOV !== U ? PLAYER_CAM_SPEED_FOV : 8,
        PET_EXP_RIDE: typeof PET_EXP_RIDE !== U ? PET_EXP_RIDE : 1,
        CAMERA_FOV_DEG: typeof CAMERA_FOV_DEG !== U ? CAMERA_FOV_DEG : 55,
        CAMERA_ORBIT_DEG_PER_PX: typeof CAMERA_ORBIT_DEG_PER_PX !== U ? CAMERA_ORBIT_DEG_PER_PX : 0.3,
        CAMERA_ORBIT_PITCH_MIN_DEG: typeof CAMERA_ORBIT_PITCH_MIN_DEG !== U ? CAMERA_ORBIT_PITCH_MIN_DEG : 8,
        CAMERA_ORBIT_PITCH_MAX_DEG: typeof CAMERA_ORBIT_PITCH_MAX_DEG !== U ? CAMERA_ORBIT_PITCH_MAX_DEG : 65,
    };
})();

/** @satisfies {Record<string, any>} */
const Player = {
    id: 'player',
    /** @type {LoryApp | null} */
    app: null,
    ready: false,
    x: 0, y: 0, h: 0, heading: 0, vx: 0, vy: 0, vh: 0,
    onGround: true, flying: false, inWater: false,
    /** @type {string | null} */
    riding: null,
    /** @type {any} */
    petView: null,
    /** @type {any} */
    rider: null,
    /** Припаркованный питомец: где стоит, когда наездник пешком. */
    park: { x: 0, y: 0, heading: 0 },
    headAnchor: null,
    bodyParts: null,
    // камера
    camAz: 0, camPitch: 0.4, zoomK: 1,
    cameraTarget: { x: 0, y: 0, h: 0 },
    _camOrbitAt: -10,
    _camInit: false,
    /** @type {{ x: number, y: number, h: number, dist: number, az: number, pitch: number } | null} */
    cine: null,
    /** @type {{ x: number, y: number, h: number, dist: number, az: number, pitch: number } | null} */
    _cineLast: null,
    _cineK: 0,
    _hat: null,
    _rideFxReady: false,
    _petHop: 0,          // «пружинка» питомца после посадки/спешивания, 1 → 0
    _rideCdUntil: 0,     // игровое время, до которого «Сесть/Слезть» недоступно (PLAYER_RIDE_COOLDOWN)
    // внутреннее
    _phase: 0, _stepT: 0, _flapT: 0, _coyote: 0, _pitchS: 0, _rollS: 0, _expAcc: 0, _lastHeading: 0, _bank: 0,
    _speedS: 0, _camSpeed: 0, _wasWater: false, _fallV: 0, _time: 0,
    _fov: 0,
    /** Кроны высоких деревьев и грибов для камеры (из данных карты): { cells: Map, n, map } или null, пока не собраны. @type {any} */
    _canopy: null,
    _canopyBusy: false,
    _canopyHold: 0,
    _canopyStamp: 0,
    /** Результат _canopyLimit: сколько px вдоль камеры до первой кроны — с запасом (soft) и вплотную (hard). */
    _clSoft: 1e9, _clHard: 1e9,

    // =============================================================================================
    // Модуль
    // =============================================================================================
    async init(app) {
        this.app = app;
        const loc = app.location;
        const scene = loc.view.scene;
        const spawn = loc.marker('spawn');
        this.x = spawn ? spawn.x : loc.width / 2;
        this.y = spawn ? spawn.y : loc.height / 2;
        const rot = spawn ? (Array.isArray(spawn.rot) ? spawn.rot[1] : spawn.rot) : 0;
        this.heading = (Number(rot) || 0) * Math.PI / 180;
        this.h = GameWorld.groundH(this.x, this.y) + (spawn ? Number(spawn.h) || 0 : 0);
        this.camAz = this.heading;
        this.camPitch = PCFG.PLAYER_CAM_PITCH_DEG * Math.PI / 180;
        this.cameraTarget = { x: this.x, y: this.y, h: this.h };
        this._fov = loc.view.camera.fov;

        await this._buildRider(loc.view);
        // питомец под седлом из сохранения
        const pet = GameState.ridingPet();
        if (pet) {
            await PetView.preload([pet.species]);
            this.riding = pet.uid;
            this._spawnPet(pet);
            this._mount(true);
            GameUI.setRide(true);
        }

        // Камера игрока вместо RTS-камеры движка.
        const cam = app.camera;
        if (cam) {
            cam.detach();
            cam.followObj = null;
            cam.update = (dt) => this.updateCamera(dt);
            cam.home = () => { this._snapCamera(); };
        }
        this.updateCamera(0);
        this._snapCamera();
        this._registerRideFx(app);
        this.ready = true;
        // Подсказка: «Сесть/Слезть» (R)
        Game.events.on('pet:equip', (e) => { if (e && e.uid) this.ride(e.uid); });
        window.addEventListener('lory-release-input', () => { this.vx *= 0.5; this.vy *= 0.5; });
    },

    onLoad() {
        // сохранение перезагружено (сброс): пересобрать питомца
        if (!this.ready) return;
        const pet = GameState.ridingPet();
        if (pet && (!this.petView || this._petUid !== pet.uid)) {
            this._spawnPet(pet);
            this.riding = pet.uid;
            this.flying = false;
            this._mount(true);
            GameUI.setRide(true);
        }
    },

    // =============================================================================================
    // Наездник
    // =============================================================================================
    async _buildRider(view) {
        try {
            this.rider = await RiderModel.create(view, {});
        } catch (e) {
            // Нет модели — пустой наездник: игра продолжается (отсутствующий ассет не роняет сцену).
            console.warn('Player: модель наездника не загрузилась — ' + ((e && e.message) || e));
            const root = new BABYLON.TransformNode('rider', view.scene);
            this.rider = { root, parts: {}, headAnchor: root, hipHeight: 60, setLook() {}, attach() { return null; }, update() {}, celebrate() {}, land() {}, jump() {}, setVisible(on) { root.setEnabled(!!on); } };
        }
        this.headAnchor = this.rider.headAnchor;
        this.bodyParts = this.rider.parts;
        this.rider.root.position.set(this.x, this.h, this.y);
        this.rider.root.rotation.set(0, -this.heading, 0);
    },

    /** Внешний вид наездника: { tints: [куртка, брюки, волосы, кожа, футболка], hairStyle }. */
    setLook(look) { if (this.rider) this.rider.setLook(look); },

    /** Скин на всё тело по id из RiderModel.SKIN_FILES (null — снять). Верхом посадка пересчитывается под высоту бёдер скина. */
    async setSkin(id) {
        if (!this.rider || typeof this.rider.setSkin !== 'function') return false;
        const ok = await this.rider.setSkin(id || null);
        if (this.riding && this.petView) this._mount(true);
        return ok;
    },

    /** Надеть косметику на голову/лицо/спину: slot 'hat' | 'face' | 'back', mesh или null. Возвращает снятый узел. */
    wear(slot, mesh) { return this.rider ? this.rider.attach(slot, mesh) : null; },

    /** Совместимость: цвета наряда { shirt, pants, hair, skin, undershirt|scarf, hairStyle } (hex-строки). */
    setOutfit(def) {
        const d = def || {};
        const T = RiderModel.DEFAULT_TINTS;
        this.setLook({ tints: [d.shirt || T[0], d.pants || T[1], d.hair || T[2], d.skin || T[3], d.undershirt || d.scarf || T[4]], hairStyle: d.hairStyle });
    },

    /** Шапка: factory(scene, anchor) -> узел (родитель — якорь на макушке); null — снять. */
    setHat(factory) {
        if (this._hat) { this._hat.dispose(false, true); this._hat = null; }
        if (!factory || !this.rider) return;
        const node = factory(this.rider.root.getScene(), this.headAnchor);
        if (!node) return;
        node.parent = this.headAnchor;
        this._hat = node;
    },

    // =============================================================================================
    // Питомец и посадка
    // =============================================================================================
    _spawnPet(pet) {
        if (this.rider) this.rider.root.parent = null;   // наездник живёт на седле: не уничтожить вместе со старым питомцем
        if (this.petView) { this.petView.dispose(); this.petView = null; }
        const scene = this.rider.root.getScene();
        this.petView = PetView.create(scene, pet.species, { w: pet.w, mutation: pet.mutation });
        this._petUid = pet.uid;
        this.park = { x: this.x, y: this.y, heading: this.heading };
        this._placePet(0);
    },

    // Посадить наездника на питомца (родитель — седло) или снять.
    _mount(on) {
        const R = this.rider;
        if (on && this.petView) {
            R.root.parent = this.petView.seat;
            R.root.position.set(0, -(R.hipHeight - 4), 0);
            R.root.rotation.set(0, 0, 0);
        } else {
            R.root.parent = null;
            R.root.position.set(this.x, this.h, this.y);
        }
    },

    /** Посадить игрока на питомца uid (по умолчанию — выбранного в сохранении). Питомец приходит к игроку. */
    ride(uid) {
        const s = GameState.state;
        const pet = GameState.findPet(uid || s.riding);
        if (!pet || !this.ready && !this.rider) return false;
        const same = s.riding === pet.uid && this.petView && this._petUid === pet.uid;
        s.riding = pet.uid;
        s.ranchPets = s.ranchPets.filter(u => u !== pet.uid);
        if (!same) this._spawnPet(pet);
        this.riding = pet.uid;
        this.park = { x: this.x, y: this.y, heading: this.heading };
        this._mount(true);
        this.vx = this.vy = 0;
        GameState.markDirty();
        GameUI.sfx('mount');
        GameUI.setRide(true);
        Game.events.emit('ride', { on: true, pet });
        this._rideFx(true);
        return true;
    },

    dismount() {
        if (!this.riding) return false;
        const pet = GameState.findPet(this.riding);
        // питомец остаётся на месте, наездник сходит сбоку
        const side = this.heading + Math.PI / 2;
        const off = this.petView ? Math.max(70, this.petView.size.width * 0.5 + 40) : 80;
        this.park = { x: this.x, y: this.y, heading: this.heading };
        this.x += Math.cos(side) * off; this.y += Math.sin(side) * off;
        const r = GameWorld.colliders.resolve(this.x, this.y, PCFG.PLAYER_RADIUS);
        this.x = r.x; this.y = r.y;
        this.riding = null;
        this.flying = false;
        this.vx = this.vy = 0;
        this.h = GameWorld.groundH(this.x, this.y);
        this.onGround = true; this.vh = 0;
        this._mount(false);
        this._placePet(0);
        GameUI.sfx('dismount');
        GameUI.setRide(false);
        Game.events.emit('ride', { on: false, pet });
        this._rideFx(false);
        return true;
    },

    /** Сесть/слезть по кнопке или клавише R — с паузой PLAYER_RIDE_COOLDOWN между переключениями. */
    toggleRide() {
        if (this.rideCooldown() > 0) { this._rideCdNudge(); return false; }
        const ok = this.riding ? this.dismount() : this.ride();
        if (ok) { this._rideCdUntil = this._time + PCFG.PLAYER_RIDE_COOLDOWN; this._rideCdVisual(); }
        return ok;
    },

    /** Сколько секунд ещё нельзя садиться/слезать (0 — можно). */
    rideCooldown() { return Math.max(0, this._rideCdUntil - this._time); },

    // Эффекты посадки и спешивания: кольцо пыли от лап, искры вверх, «пружинка» наездника и питомца.
    _registerRideFx(app) {
        const fx = app && app.fx;
        if (!fx || this._rideFxReady) return;
        this._rideFxReady = true;
        const ring = [[-1, 0.05, -1], [1, 0.35, 1]];
        fx.register('ride-mount', [
            { burst: 26, capacity: 32, life: [0.35, 0.8], size: [16, 34], speed: [150, 300], color: '#e8d6ae', color2: '#c9ad7f', blend: 'standard', gravity: [0, -60, 0], direction: ring, box: [[-40, 0, -40], [40, 12, 40]], sizeGradient: [[0, 0.5], [0.3, 1], [1, 1.5]] },
            { delay: 0.04, burst: 20, capacity: 24, life: [0.45, 0.95], size: [5, 11], speed: [90, 210], color: '#fff6c8', color2: '#ffd86a', gravity: [0, 40, 0], direction: [[-0.5, 0.8, -0.5], [0.5, 1.2, 0.5]], box: [[-30, 60, -30], [30, 140, 30]] },
            { burst: 3, capacity: 4, life: [0.18, 0.3], size: [120, 170], speed: [0, 2], color: '#ffffff', box: [[0, 70, 0], [0, 80, 0]], sizeGradient: [[0, 0.3], [0.5, 1], [1, 0]] },
        ]);
        fx.register('ride-dismount', [
            { burst: 18, capacity: 24, life: [0.3, 0.7], size: [12, 26], speed: [110, 230], color: '#e8d6ae', color2: '#c9ad7f', blend: 'standard', gravity: [0, -60, 0], direction: ring, box: [[-24, 0, -24], [24, 8, 24]], sizeGradient: [[0, 0.5], [0.3, 1], [1, 1.4]] },
            { delay: 0.02, burst: 10, capacity: 12, life: [0.3, 0.6], size: [4, 9], speed: [60, 140], color: '#ffffff', color2: '#cfeaff', gravity: [0, 30, 0], direction: [[-0.6, 0.6, -0.6], [0.6, 1, 0.6]], box: [[-20, 40, -20], [20, 110, 20]] },
        ]);
    },

    _rideFx(on) {
        const fx = this.app && this.app.fx;
        try {
            if (fx) {
                const x = this.x, y = this.y;
                fx.play(on ? 'ride-mount' : 'ride-dismount', new BABYLON.Vector3(x, GameWorld.groundH(x, y) + 4, y));
            }
        } catch (e) { /* без частиц — не беда */ }
        const R = this.rider;
        if (R && typeof R.jump === 'function') { if (on) R.jump(); else R.land(14); }
        if (this.petView) this._petHop = 1;
    },

    // Наглядная пауза на кнопке «Сесть/Слезть»: тёмная полоса сходит за PLAYER_RIDE_COOLDOWN.
    _rideCdVisual() {
        const btn = GameUI.hud && GameUI.hud.ride;
        const cd = PCFG.PLAYER_RIDE_COOLDOWN;
        if (!btn || !(cd > 0)) return;
        if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
        const bar = document.createElement('span');
        bar.className = 'ride-cd';
        bar.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:100%;border-radius:inherit;background:rgba(40,20,0,.38);pointer-events:none;transition:width ' + cd + 's linear;';
        btn.appendChild(bar);
        btn.style.filter = 'saturate(.55)';
        requestAnimationFrame(() => { bar.style.width = '0%'; });
        setTimeout(() => { bar.remove(); btn.style.filter = ''; }, cd * 1000 + 30);
    },

    // Нажали во время паузы — кнопка вздрагивает, без звука ошибки и без действия.
    _rideCdNudge() {
        const btn = GameUI.hud && GameUI.hud.ride;
        if (!btn || typeof btn.animate !== 'function') return;
        btn.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 220 });
    },

    /** Телепорт (на ранчо, к цели). Питомец под седлом едет с игроком. */
    teleport(x, y, heading) {
        this.x = x; this.y = y;
        if (heading != null) this.heading = heading;
        this.h = GameWorld.groundH(x, y);
        this.vx = this.vy = this.vh = 0;
        this.onGround = true; this.flying = false;
        if (!this.riding) this.park = { x, y, heading: this.heading };
        this._snapCamera();
    },

    petDef() { const p = GameState.ridingPet(); return p ? GameData.PETS[p.species] : null; },
    canFly() { return !!this.riding && !!this.petDef() && this.petDef().ability === 'fly'; },
    /** Реальная скорость, px/с: питомец под седлом или шаг пешком. */
    moveSpeed() {
        const k = GameState.superMult('speed');   // супер-награда: быстрее и верхом, и пешком
        if (this.riding) { const p = GameState.findPet(this.riding); if (p) return GameState.petWorldSpeed(p) * k; }
        return PCFG.PLAYER_WALK_SPEED * k;
    },
    /** Показанная скорость ⚡ выбранного питомца (для HUD). */
    speedShown() { const p = GameState.ridingPet(); return p ? GameState.petSpeed(p) : 1; },
    radius() { return PCFG.PLAYER_RADIUS * (this.riding && this.petView ? Math.max(1, Math.min(2.6, this.petView.size.width / 70)) : 1); },

    // Положение и поза питомца (под седлом — по игроку, припаркованный — на месте).
    _placePet(dt) {
        const v = this.petView;
        if (!v) return;
        if (this.riding) {
            v.place(this.x, this.h, this.y, this.heading, this._pitchS, this._rollS);
        } else {
            const p = this.park, th = GameWorld.terrain;
            const h = GameWorld.groundH(p.x, p.y);
            let pitch = 0, roll = 0;
            if (th) { const t = th.tiltAt(p.x, p.y, p.heading, v.length * 0.3, v.width * 0.3); pitch = t.pitch; roll = t.roll; }
            v.place(p.x, h, p.y, p.heading, pitch, roll);
        }
    },

    // =============================================================================================
    // Кадр
    // =============================================================================================
    update(dt) {
        if (!this.ready) return;
        this._time += dt;
        const inp = GameUI.input, blocked = GameUI.blocking;
        const C = (name, d) => (name in PCFG ? PCFG[name] : d);
        this._cameraInput(dt, inp, blocked);

        const pet = this.riding ? GameState.findPet(this.riding) : null;
        const def = pet ? GameData.PETS[pet.species] : null;
        const ability = def ? def.ability : null;
        const az = this.camAz;
        let mx = blocked ? 0 : inp.moveX, my = blocked ? 0 : inp.moveY;
        const fx = Math.cos(az), fy = Math.sin(az), rx = -Math.sin(az), ry = Math.cos(az);
        const dx = fx * my + rx * mx, dy = fy * my + ry * mx;
        const mag = Math.min(1, Math.hypot(mx, my));
        const base = this.moveSpeed();

        // вода
        const gh0 = GameWorld.groundH(this.x, this.y);
        const wl = GameWorld.waterAt(this.x, this.y);
        const depth = wl != null ? wl - gh0 : 0;
        const wading = depth > 28 && !this.flying && (this.onGround || this.h <= wl + 10);
        let speedK = 1;
        if (wading) speedK = this.riding ? (ability === 'swim' ? 1.1 : 0.38) : 0.5;
        if (wading !== this.inWater) {
            this.inWater = wading;
            if (wading) GameUI.sfx('splash', { volume: 0.55 });
            Game.events.emit('water', { on: wading });
        }

        // скорость с плавным разгоном
        const rate = this.riding ? (mag > 0 ? 5.5 : 7.5) : (mag > 0 ? 14 : 18);
        const tvx = dx * base * speedK, tvy = dy * base * speedK;
        const kk = 1 - Math.exp(-rate * dt);
        this.vx += (tvx - this.vx) * kk; this.vy += (tvy - this.vy) * kk;

        // шаг с ограничением крутизны подъёма и коллизиями
        let nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
        const maxSlope = C('PLAYER_MAX_SLOPE', 1.2);
        const step = Math.hypot(nx - this.x, ny - this.y);
        const airborneHigh = this.flying && this.h - gh0 > 260;
        if (step > 0.01 && (this.onGround || !this.flying) && !airborneHigh && this.h - gh0 < 40) {
            const slopeTo = (px, py) => (GameWorld.groundH(px, py) - gh0) / Math.max(1, step);
            if (slopeTo(nx, ny) > maxSlope) {
                if (slopeTo(nx, this.y) <= maxSlope) { ny = this.y; this.vy *= 0.2; }
                else if (slopeTo(this.x, ny) <= maxSlope) { nx = this.x; this.vx *= 0.2; }
                else { nx = this.x; ny = this.y; this.vx *= 0.1; this.vy *= 0.1; }
            }
        }
        if (!airborneHigh) {
            const r = GameWorld.colliders.resolve(nx, ny, this.radius());
            if (r.hit) {
                const ddx = r.x - nx, ddy = r.y - ny, dl = Math.hypot(ddx, ddy);
                if (dl > 1e-4) { const nxn = ddx / dl, nyn = ddy / dl, vn = this.vx * nxn + this.vy * nyn; if (vn < 0) { this.vx -= vn * nxn; this.vy -= vn * nyn; } }
                nx = r.x; ny = r.y;
            }
        }
        const cl = GameWorld.clampToWorld(nx, ny, 260);
        const edx = cl.x - nx, edy = cl.y - ny, edl = Math.hypot(edx, edy);
        if (edl > 1e-4) {   // у края поля гасим только составляющую скорости наружу
            const enx = edx / edl, eny = edy / edl, evn = this.vx * enx + this.vy * eny;
            if (evn < 0) { this.vx -= evn * enx; this.vy -= evn * eny; }
        }
        this.x = cl.x; this.y = cl.y;

        // поворот по движению
        const speed = Math.hypot(this.vx, this.vy);
        const prevHeading = this.heading;
        if (speed > 25 && mag > 0.01) this.heading = GameUtil.dampAngle(this.heading, Math.atan2(this.vy, this.vx), this.riding ? 8 : 14, dt);
        const turnRate = dt > 0 ? GameUtil.angleDiff(prevHeading, this.heading) / dt : 0;
        this._bank = GameUtil.damp(this._bank, GameUtil.clamp(turnRate * 0.07 * Math.min(1, speed / Math.max(1, base)), -0.32, 0.32), 8, dt);

        this._vertical(dt, inp, blocked, ability, wl, depth);

        // тангаж и крен корпуса питомца по склону
        const th = GameWorld.terrain;
        let pitchT = 0, rollT = 0;
        const v = this.petView;
        if (this.riding && v) {
            if (this.onGround && !this.flying && th) {
                const t = th.tiltAt(this.x, this.y, this.heading, v.size.length * 0.35, v.size.width * 0.35);
                pitchT = GameUtil.clamp(t.pitch, -0.6, 0.6); rollT = GameUtil.clamp(t.roll, -0.5, 0.5);
            } else if (this.flying) {
                pitchT = GameUtil.clamp(this.vh * 0.0004, -0.35, 0.35);
            }
            this._pitchS = GameUtil.damp(this._pitchS, pitchT, 9, dt);
            this._rollS = GameUtil.damp(this._rollS, rollT + this._bank, 9, dt);
        }

        // опыт питомца под седлом
        if (pet && speed > 60) {
            this._expAcc += dt * C('PET_EXP_RIDE', 1);
            if (this._expAcc >= 1) { const e = Math.floor(this._expAcc); this._expAcc -= e; GameState.addPetExp(pet, e); }
        }

        // анимация и размещение
        const speed01 = GameUtil.clamp(speed / Math.max(1, base), 0, 1);
        this._speedS = speed01;
        this._phase += dt * (4 + speed01 * 9);
        if (v) {
            v.update(dt, this.riding ? speed01 : 0, this.flying, !this.onGround && !this.flying);
            this._placePet(dt);
            if (this._petHop > 0) {   // «пружинка» питомца при посадке/спешивании
                this._petHop = Math.max(0, this._petHop - dt * 3.2);
                const k = this._petHop;
                if (v.root) v.root.position.y += Math.sin((1 - k) * Math.PI) * 14 * k;
            }
        }
        this._animRider(dt, speed01, wading);
        this._sounds(dt, speed01, wading);
    },

    _vertical(dt, inp, blocked, ability, wl, depth) {
        const G = PCFG.PLAYER_GRAVITY, J = PCFG.PLAYER_JUMP_SPEED, JB = PCFG.PLAYER_JUMP_BOOST;
        const GL = PCFG.PLAYER_GLIDE_FALL, FS = PCFG.PLAYER_FLY_SPEED;
        const gh = GameWorld.groundH(this.x, this.y);
        const wading = this.inWater;
        const jumpPressed = !blocked && inp.consume('Space');
        const jumpHeld = !blocked && inp.jump;
        // уровень «поверхности» под ногами: земля или вода (плывущий питомец держится на воде)
        let surface = gh;
        if (wading && wl != null) surface = Math.max(gh, wl - (this.riding ? (ability === 'swim' ? 22 : 46) : 40));
        // полёт
        if (this.flying) {
            const up = jumpHeld ? 1 : 0, down = !blocked && inp.descend ? 1 : 0;
            const target = (up - down) * FS;
            this.vh = GameUtil.damp(this.vh, target, 5, dt);
            this.h += this.vh * dt;
            if (this.h > gh + 5600) { this.h = gh + 5600; this.vh = Math.min(0, this.vh); }
            if (this.h <= Math.max(gh, wl != null ? wl : -1e9) + 6) {
                this.h = Math.max(gh, surface);
                if (this.vh <= 0 && !up) { this.flying = false; this.onGround = true; this.vh = 0; GameUI.sfx('land', { volume: 0.5 }); }
                else this.vh = Math.max(0, this.vh);
            }
            return;
        }
        if (this.onGround) {
            this._coyote = 0.1;
            this.h = surface;
            if (this.h < gh) this.h = gh;
        } else this._coyote -= dt;
        // прыжок
        if (jumpPressed) {
            if (this.canFly() && !this.onGround) { this.flying = true; this.vh = FS * 0.6; GameUI.sfx('wing'); Game.events.emit('fly', { on: true }); return; }
            if (this.onGround || this._coyote > 0) {
                let k = this.riding ? (ability === 'jump' ? JB : 0.8) : 1;
                if (this.canFly()) { this.flying = true; this.onGround = false; this.vh = FS * 0.75; GameUI.sfx('wing'); Game.events.emit('fly', { on: true }); return; }
                if (wading && !this.riding) k = 0.75;
                this.vh = J * k; this.onGround = false; this._coyote = 0;
                GameUI.sfx('jump', { volume: 0.5, detune: 0.1 });
                Game.events.emit('jump', {});
            }
        }
        if (!this.onGround) {
            this.vh -= G * dt;
            if (jumpHeld && this.vh < 0 && ability === 'glide') this.vh = Math.max(this.vh, -GL);
            this.h += this.vh * dt;
            this._fallV = Math.min(this._fallV, this.vh);
            if (this.h <= surface) {
                this.h = surface; this.onGround = true;
                if (this._fallV < -420) GameUI.sfx(wading ? 'splash' : 'land', { volume: Math.min(0.6, -this._fallV / 1800) });
                this._fallV = 0; this.vh = 0;
                Game.events.emit('land', {});
            }
        } else {
            // обрыв: земля ушла из-под ног
            if (this.h - gh > 60 && !wading) { this.onGround = false; this.vh = 0; }
            else this._fallV = 0;
        }
    },

    // Звуки шагов, взмахов.
    _sounds(dt, speed01, wading) {
        if (this.flying) {
            this._flapT -= dt;
            if (this._flapT <= 0) { this._flapT = 0.38; GameUI.sfx('wing', { volume: 0.25, detune: 0.1 }); }
            return;
        }
        if (this.onGround && !wading && speed01 > 0.12) {
            this._stepT -= dt;
            const period = this.riding ? GameUtil.lerp(0.4, 0.22, speed01) : 0.36;
            if (this._stepT <= 0) { this._stepT = period; GameUI.sfx('step', { volume: this.riding ? 0.13 : 0.22, detune: 0.25 }); }
        }
    },

    // Поза наездника: бег, покой, прыжок, плавание, посадка верхом (анимация — RiderView.update).
    _animRider(dt, k, wading) {
        const R = this.rider;
        if (!R) return;
        R.update(dt, {
            moving: k > 0.05,
            speed: 0.8 + 1.4 * k,
            grounded: this.onGround || !!this.riding || wading,
            riding: !!this.riding,
        });
        if (!this.riding) {
            R.root.position.set(this.x, this.h + (wading ? 8 : 0), this.y);
            R.root.rotation.set(0, -this.heading, 0);
        }
    },

    // =============================================================================================
    // Камера от третьего лица
    // =============================================================================================
    _cameraInput(dt, inp, blocked) {
        const C = (name, d) => (name in PCFG ? PCFG[name] : d);
        const deg = Math.PI / 180;
        const perPx = C('CAMERA_ORBIT_DEG_PER_PX', 0.3) * deg;
        const pMin = C('CAMERA_ORBIT_PITCH_MIN_DEG', 8) * deg, pMax = C('CAMERA_ORBIT_PITCH_MAX_DEG', 65) * deg;
        if (!blocked) {
            if (inp.camDX || inp.camDY) {
                this.camAz += inp.camDX * perPx;
                this.camPitch = GameUtil.clamp(this.camPitch + inp.camDY * perPx, pMin, pMax);
                this._camOrbitAt = this._time;
            }
            if (inp.rotKey) { this.camAz += inp.rotKey * 2.0 * dt; this._camOrbitAt = this._time; }
            if (inp.zoom) { this.zoomK = GameUtil.clamp(this.zoomK * Math.exp(inp.zoom * 0.09), 0.35, 3.2); }
        }
        inp.camDX = inp.camDY = inp.zoom = 0;
        this.camPitch = GameUtil.clamp(this.camPitch, pMin, pMax);
        // выравнивание за спину при движении вперёд, если игрок давно не крутил камеру
        const delay = C('PLAYER_CAM_ALIGN_DELAY', 2.2), sp = C('PLAYER_CAM_ALIGN_SPEED', 1.5);
        if (!blocked && inp.moveY > 0.3 && this._time - this._camOrbitAt > delay && Math.hypot(this.vx, this.vy) > 80) {
            const target = Math.atan2(this.vy, this.vx);
            this.camAz = GameUtil.dampAngle(this.camAz, target, sp * inp.moveY, dt);
        }
    },

    _desiredDistance() {
        const C = (name, d) => (name in PCFG ? PCFG[name] : d);
        const v = this.petView;
        const size = this.riding && v ? v.size : null;
        const sizeK = size ? GameUtil.clamp((size.height + size.length * 0.3) / 260, 0.85, 2.6) : 0.9;
        const dmin = C('PLAYER_CAM_DIST_MIN', 240), dmax = C('PLAYER_CAM_DIST_MAX', 1700);
        // узкий экран (портрет): вертикальный FOV фиксирован, по ширине кадр тесный — отодвигаем камеру
        const aspect = (window.innerWidth || 1280) / Math.max(1, window.innerHeight || 720);
        const aspectK = aspect < 1.4 ? Math.pow(1.4 / aspect, 0.55) : 1;
        return GameUtil.clamp(C('PLAYER_CAM_DIST', 620) * sizeK * aspectK * this.zoomK, dmin * Math.min(sizeK, 1.5), dmax * Math.max(1, sizeK) * aspectK);
    },

    /**
     * Кроны высокого декора карты (деревья, грибы, большое дерево): ячейки 700 px, записи { x, y, r (радиус кроны), rt (ствола), z0, z1 }
     * (высоты — мир; крона — эллипсоид между z0 и z1, ствол — цилиндр под ней). Данные карты и габариты моделей; декор — thin instances, у него меша для опроса нет. Грузится один раз на карту.
     */
    _buildCanopies() {
        const app = this.app;
        const map = app && app.location ? app.location.map : null;
        if (!map || !Array.isArray(map.objects) || typeof Model3D === 'undefined' || this._canopyBusy) return;
        const re = /assets\/models\/(?:nature\/(?:tree_|mushroom_)|props\/giant_tree)/;
        const defs = map.objects.filter((/** @type {any} */ d) => d && d.model && d.kind !== 'marker' && re.test(d.model));
        const cells = new Map(), pack = { cells, n: 0, map };
        if (!defs.length) { this._canopy = pack; return; }
        this._canopyBusy = true;
        const models = new Map();
        const files = [...new Set(defs.map((/** @type {any} */ d) => d.model))];
        Promise.all(files.map((f) => Promise.resolve(Model3D.load(f)).then((m) => { models.set(f, m); }, () => {}))).then(() => {
            const cs = 700;
            try { for (const d of defs) {
                const m = models.get(d.model);
                if (!m || !m.min || !m.max) continue;
                const sc = Array.isArray(d.scale) ? d.scale : [d.scale, d.scale, d.scale];
                const sx = Number(sc[0]) || 1, sy = Number(sc[1]) || sx, sz = Number(sc[2]) || sx;
                const w = (m.max[0] - m.min[0]) * sx, dp = (m.max[2] - m.min[2]) * sz, top = m.max[1] * sy;
                if (top < 260) continue;   // низкое — камера выше него
                const mush = /mushroom_/.test(d.model);
                const gh = GameWorld.groundH(d.x, d.y), half = Math.max(w, dp) / 2;
                const c = { x: Number(d.x), y: Number(d.y), r: half * 0.95, rt: half * (mush ? 0.35 : 0.14), z0: gh + top * (mush ? 0.55 : 0.38), z1: gh + top, gh, stamp: 0 };   // профиль моделей Kenney: крона деревьев с ~40% высоты, шляпка гриба с ~60%
                const x0 = Math.floor((c.x - c.r) / cs), x1 = Math.floor((c.x + c.r) / cs), y0 = Math.floor((c.y - c.r) / cs), y1 = Math.floor((c.y + c.r) / cs);
                for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
                    const k = cx * 100003 + cy;
                    let a = cells.get(k);
                    if (!a) cells.set(k, a = []);
                    a.push(c);
                }
                pack.n++;
            } } catch (e) { console.warn('Player: кроны для камеры не собраны — ' + ((e && e.message) || e)); }
            this._canopy = pack;
            this._canopyBusy = false;
        });
    },

    /**
     * Сколько px вдоль луча от цели T до камеры (длина L, наклон и азимут — камеры игрока) свободно до кроны или ствола высокого
     * декора: { soft } — с запасом 60 px (к нему камера идёт плавно), { hard } — вплотную, 20 px (камера не заходит дальше ни на кадр).
     * Пока кроны не собраны или камера свободна — null.
     * @param {{ x: number, y: number, h: number }} T @param {number} L
     */
    _canopyAt(T, L) {
        if (!this._canopy || this._canopy.map !== (this.app && this.app.location ? this.app.location.map : null)) { this._canopy = null; this._buildCanopies(); return null; }
        if (!this._canopy.n || this._cineLast) return null;
        const cp = Math.cos(this.camPitch), up = Math.sin(this.camPitch);
        const dx = -Math.cos(this.camAz) * cp * L, dz = -Math.sin(this.camAz) * cp * L, dh = up * L;
        const cs = 700, cells = this._canopy.cells, stamp = ++this._canopyStamp;
        const x0 = Math.floor((Math.min(T.x, T.x + dx) - 160) / cs), x1 = Math.floor((Math.max(T.x, T.x + dx) + 160) / cs);
        const y0 = Math.floor((Math.min(T.y, T.y + dz) - 160) / cs), y1 = Math.floor((Math.max(T.y, T.y + dz) + 160) / cs);
        let tSoft = 1, tHard = 1;
        for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
            const a = cells.get(cx * 100003 + cy);
            if (!a) continue;
            for (let i = 0; i < a.length; i++) {
                const c = a[i];
                if (c.stamp === stamp) continue;
                c.stamp = stamp;
                for (let k = 0; k < 4; k++) {
                    // k 0/1 — крона (эллипсоид), k 2/3 — ствол под кроной (цилиндр); чётные — запас 60 px (плавный предел), нечётные — 20 px (жёсткий)
                    const m = k & 1 ? 20 : 60, mv = k & 1 ? 20 : 40;
                    let t1 = 0, t2 = 1, t3 = 0, t4 = 1;
                    if (k < 2) {
                        const A = c.r + m, B = (c.z1 - c.z0) / 2 + mv;
                        const ox = (T.x - c.x) / A, oy = (T.h - (c.z0 + c.z1) / 2) / B, oz = (T.y - c.y) / A;
                        const ux = dx / A, uy = dh / B, uz = dz / A;
                        const qa = ux * ux + uy * uy + uz * uz, qb = 2 * (ox * ux + oy * uy + oz * uz), qc = ox * ox + oy * oy + oz * oz - 1, disc = qb * qb - 4 * qa * qc;
                        if (qa < 1e-12 || disc < 0) continue;
                        const sq = Math.sqrt(disc);
                        t1 = (-qb - sq) / (2 * qa); t2 = (-qb + sq) / (2 * qa);
                    } else {
                        const R = c.rt + m, lo = c.gh - 40 - mv, hi = c.z0 + mv;
                        const fx = T.x - c.x, fz = T.y - c.y, aa = dx * dx + dz * dz;
                        if (aa < 1e-6) { if (fx * fx + fz * fz > R * R) continue; }
                        else {
                            const bb = 2 * (fx * dx + fz * dz), cc = fx * fx + fz * fz - R * R, disc = bb * bb - 4 * aa * cc;
                            if (disc < 0) continue;
                            const sq = Math.sqrt(disc);
                            t1 = (-bb - sq) / (2 * aa); t2 = (-bb + sq) / (2 * aa);
                        }
                        if (Math.abs(dh) < 1e-6) { if (T.h < lo || T.h > hi) continue; }
                        else { const ta = (lo - T.h) / dh, tb = (hi - T.h) / dh; t3 = Math.min(ta, tb); t4 = Math.max(ta, tb); }
                    }
                    const tin = Math.max(t1, t3, 0), tout = Math.min(t2, t4, 1);
                    if (tin > tout) continue;
                    if (tin <= 0 && tout < 1) continue;   // цель уже в запасе вокруг кроны, но луч из него выходит до камеры — не загораживает
                    if (k & 1) { if (tin < tHard) tHard = tin; } else if (tin < tSoft) tSoft = tin;
                }
            }
        }
        if (tSoft >= 1 && tHard >= 1) return null;
        const floor = 170;   // ближе камера не подходит: цель внутри кроны (полёт над деревом, подъём в гриб); жёсткий предел — 100
        return { soft: Math.min(L, Math.max(floor, tSoft * L)), hard: Math.min(L, Math.max(100, tHard * L)) };
    },

    _snapCamera() {
        const v = this.petView;
        const lookH = PCFG.PLAYER_CAM_LOOK_HEIGHT + (this.riding && v ? v.seatHeight * 0.5 : 0);
        this.cameraTarget = { x: this.x, y: this.y, h: this.h + lookH };
        this._camSpeed = 0;
    },

    // Заменяет CameraController.update: цель — игрок, орбита, мягкое следование, не ниже земли.
    updateCamera(dt) {
        const app = this.app;
        if (!app || !app.camera || !app.location) return;
        const cam = app.camera, view = app.location.view, ground = GameWorld;
        const C = (name, d) => (name in PCFG ? PCFG[name] : d);
        const v = this.petView;
        const lookH = C('PLAYER_CAM_LOOK_HEIGHT', 130) + (this.riding && v ? v.seatHeight * 0.5 : 0);
        const speed = Math.hypot(this.vx, this.vy);
        this._camSpeed = GameUtil.damp(this._camSpeed, speed, 4, dt);
        const lam = C('PLAYER_CAM_LERP', 9) * (1 + this._camSpeed / 1300);
        const T = this.cameraTarget;
        if (dt <= 0) { T.x = this.x; T.y = this.y; T.h = this.h + lookH; }
        else {
            T.x = GameUtil.damp(T.x, this.x, lam, dt); T.y = GameUtil.damp(T.y, this.y, lam, dt);
            T.h = GameUtil.damp(T.h, this.h + lookH, Math.min(lam, 7), dt);
        }
        const dist = this._desiredDistance();
        // кроны: если крона высокого дерева или гриба между целью и камерой — камера ближе (быстро), потом возвращается плавно
        let lim = dist, hard = dist;
        const canopy = this._canopyAt(T, dist);
        if (canopy) { lim = canopy.soft; hard = canopy.hard; }
        if (lim < dist - 1) this._canopyHold = 1.2; else this._canopyHold = Math.max(0, this._canopyHold - dt);
        const rate = this._dist && lim < this._dist - 2 ? 14 : this._canopyHold > 0 ? 2.5 : 8;
        this._dist = this._dist ? GameUtil.damp(this._dist, lim, rate, dt || 1) : lim;
        if (this._dist > hard) this._dist = hard;   // внутрь кроны камера не заходит ни на кадр
        const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch), d = this._dist;
        let px = T.x - Math.cos(this.camAz) * cp * d, pz = T.y - Math.sin(this.camAz) * cp * d;
        let py = T.h + sp * d;
        const g = ground.groundH(px, pz) + 45;
        if (py < g) py = g;
        let tx = T.x, th = T.h, tz = T.y, ease = 0;
        // кинематографическая камера: плавно смешивается с обычной (вход и выход)
        if (this.cine) this._cineLast = this.cine;
        const wantK = this.cine ? 1 : 0;
        this._cineK = dt > 0 ? GameUtil.damp(this._cineK, wantK, 3.4, dt) : wantK;
        if (!this.cine && this._cineK < 0.004) { this._cineK = 0; this._cineLast = null; }
        if (this._cineLast && this._cineK > 0) {
            const c = this._cineLast, k = Math.min(1, this._cineK);
            ease = k * k * (3 - 2 * k);
            const ccp = Math.cos(c.pitch), csp = Math.sin(c.pitch);
            const cx = c.x - Math.cos(c.az) * ccp * c.dist, cz = c.y - Math.sin(c.az) * ccp * c.dist;
            let cyh = c.h + csp * c.dist;
            const gg = ground.groundH(cx, cz) + 40;
            if (cyh < gg) cyh = gg;
            px = GameUtil.lerp(px, cx, ease); py = GameUtil.lerp(py, cyh, ease); pz = GameUtil.lerp(pz, cz, ease);
            tx = GameUtil.lerp(tx, c.x, ease); th = GameUtil.lerp(th, c.h, ease); tz = GameUtil.lerp(tz, c.y, ease);
        }
        const c3 = view.camera;
        c3.position.set(px, py, pz);
        if (!this._tv) this._tv = new BABYLON.Vector3();
        this._tv.set(tx, th, tz);
        c3.setTarget(this._tv);
        // FOV чуть растёт со скоростью
        const base = C('CAMERA_FOV_DEG', 55) * Math.PI / 180, kick = C('PLAYER_CAM_SPEED_FOV', 8) * Math.PI / 180;
        const sp01 = GameUtil.clamp(this._camSpeed / Math.max(900, this.moveSpeed()), 0, 1);
        c3.fov = GameUtil.damp(c3.fov, base + kick * sp01 * (1 - ease), 4, dt || 1);
        // тени — вокруг цели камеры, чуть вперёд по взгляду камеры
        const fwx = Math.cos(this.camAz) * (1 - ease), fwy = Math.sin(this.camAz) * (1 - ease);
        view.fitShadowFrustum(tx + fwx * 250, tz + fwy * 250, th, 900);
        // совместимость с CameraController
        cam.target.x = tx; cam.target.y = tz; cam.target.h = th;
        cam.azimuth = this.camAz; cam.pitch = this.camPitch;
        cam.viewVersion++;
    },
};

Game.register(Player);
