// Vendors.js — продавцы за прилавками хаба (Sell, Food, Track, Gears): тот же блочный персонаж, что у игрока
// (RiderModel, модель из Egg Stealing Master), в своей одежде и шапке из косметики. Живут сами по себе:
//   • стоят за прилавком лицом к покупателю, дышат, моргают, оглядываются;
//   • игрок подошёл ближе VENDOR_GREET_RADIUS — поворачиваются к нему (не больше чем на 75° от фасада), машут рукой и
//     говорят фразу своей лавки (облачко над головой), повтор приветствия — не чаще VENDOR_GREET_COOLDOWN;
//   • лавку открыли (событие stall:open) — радуются (руки вверх) и говорят «Добро пожаловать!».
// Места: модели лавок карты (assets/models/props/stall_<вид>.glb) — продавец ставится за прилавок в локальных координатах модели.

const VENDOR_CFG = (() => {
    const U = 'undefined';
    return {
        greet: typeof VENDOR_GREET_RADIUS !== U ? VENDOR_GREET_RADIUS : 650,
        look: typeof VENDOR_LOOK_RADIUS !== U ? VENDOR_LOOK_RADIUS : 1100,
        cooldown: typeof VENDOR_GREET_COOLDOWN !== U ? VENDOR_GREET_COOLDOWN : 12,
        active: 4500,        // дальше — без анимации (замер позы)
    };
})();

/** Вид и реплики продавцов по виду лавки. tints — [куртка, брюки, волосы, кожа, футболка]. */
const VENDOR_LOOKS = {
    sell: { tints: ['#2f7d32', '#3b2a1a', '#2b1b10', '#ffd9b8', '#ffe066'], hair: 'swept', hat: 'top' },
    food: { tints: ['#e8392f', '#f4efe6', '#a96716', '#f1c8a0', '#ffffff'], hair: 'bob', hat: 'chef' },
    track: { tints: ['#7b4a24', '#3a2a1c', '#5a3a22', '#e8b890', '#f2d17a'], hair: 'long', hat: 'cowboy' },
    gears: { tints: ['#2f6fd0', '#1d2f4a', '#ff9a3a', '#ffe0c2', '#ffd21f'], hair: 'swept', hat: 'miner' },
};

Lang.add({
    ru: {
        'vendor.sell.1': 'Куплю питомцев по хорошей цене!', 'vendor.sell.2': 'Лишние питомцы? Заходи!',
        'vendor.food.1': 'Свежая еда — питомцы растут быстрее!', 'vendor.food.2': 'Морковка, кости, драконий фрукт!',
        'vendor.track.1': 'Знаю, где лежит каждое яйцо!', 'vendor.track.2': 'Нужен радар? Покажу дорогу!',
        'vendor.gears.1': 'Радары и корзины — всё для охоты!', 'vendor.gears.2': 'Корзина побольше — яиц побольше!',
        'vendor.welcome': 'Добро пожаловать!',
    },
    en: {
        'vendor.sell.1': 'I buy pets at a fair price!', 'vendor.sell.2': 'Too many pets? Come on in!',
        'vendor.food.1': 'Fresh food makes pets grow faster!', 'vendor.food.2': 'Carrots, bones, dragon fruit!',
        'vendor.track.1': 'I know where every egg is!', 'vendor.track.2': 'Need a radar? I will show the way!',
        'vendor.gears.1': 'Radars and baskets for the hunt!', 'vendor.gears.2': 'Bigger basket, more eggs!',
        'vendor.welcome': 'Welcome!',
    },
});

const VENDORS_CSS = `
#game-ui .bb.vendor-bubble{pointer-events:none;white-space:normal;-webkit-text-stroke:0;text-shadow:none;z-index:3}
#game-ui .vendor-bubble .vb{position:relative;transform-origin:50% 100%;max-width:calc(var(--u,1px)*230);padding:calc(var(--u,1px)*7) calc(var(--u,1px)*11);
 background:#fffaf0;border:calc(var(--u,1px)*3) solid #5b3417;border-radius:calc(var(--u,1px)*14);color:#3a2210;font:800 calc(var(--u,1px)*15)/1.15 RideFont,system-ui,sans-serif;
 text-align:center;-webkit-text-stroke:0;text-shadow:none;white-space:normal;width:max-content;box-shadow:0 calc(var(--u,1px)*3) 0 rgba(0,0,0,.25);animation:vb-pop .22s ease-out}
#game-ui .vendor-bubble .vb:after{content:"";position:absolute;left:50%;bottom:calc(var(--u,1px)*-11);margin-left:calc(var(--u,1px)*-8);border:calc(var(--u,1px)*8) solid transparent;border-top-color:#5b3417}
@keyframes vb-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
`;

/** @satisfies {Record<string, any>} */
const Vendors = {
    id: 'vendors',
    /** @type {LoryApp | null} */
    app: null,
    /** @type {any[]} */
    list: [],
    time: 0,

    init(app) {
        this.app = app;
        if (typeof GameUI !== 'undefined' && GameUI.addCss) GameUI.addCss('vendors', VENDORS_CSS);
        Game.events.on('stall:open', (e) => {
            const v = e && this.list.find(x => x.kind === e.id);
            if (!v || !v.rider) return;
            v.rider.celebrate(1.1);
            this._say(v, Lang.t('vendor.welcome'), 2.2);
        });
    },

    async ready() {
        const loc = this.app && this.app.location;
        if (!loc) return;
        const view = loc.view;
        for (const rec of loc.objects) {
            const m = rec.def && rec.def.model;
            const hit = m && /props\/stall_(sell|food|track|gears)\.glb$/.exec(m);
            if (!hit) continue;
            const kind = hit[1], def = rec.def;
            const s = Array.isArray(def.scale) ? def.scale[0] : (Number(def.scale) || 1);
            const heading = (Array.isArray(def.rot) ? def.rot[1] : 0) * Math.PI / 180;
            // за прилавком: локально x = −40 (фасад — +X), по центру ширины
            const lx = -40 * s, cos = Math.cos(heading), sin = Math.sin(heading);
            const x = def.x + lx * cos, y = def.y + lx * sin;
            const v = { kind, x, y, heading, yaw: heading, rider: null, greetAt: -1e9, inside: false, bubble: null, bubbleT: 0, lookT: Math.random() * 4 };
            this.list.push(v);
            try {
                const look = VENDOR_LOOKS[kind];
                const rider = await RiderModel.create(view, { tints: look.tints, hairStyle: look.hair });
                rider.root.position.set(x, GameWorld.groundH(x, y), y);
                rider.root.rotation.set(0, -heading, 0);
                v.rider = rider;
                this._hat(view, rider, look.hat);
            } catch (e) { console.warn('Vendors: продавец не создан — ' + ((e && e.message) || e)); }
        }
    },

    // Шапка из косметики пользователя (cosmetics_a.glb, узел C_hat_<key>): вершины — к суставу головы, как в Cosmetics.js.
    async _hat(view, rider, key) {
        try {
            const model = await Model3D.load('assets/models/rider/cosmetics_a.glb');
            const part = model && model.parts.find(p => p.name === 'C_hat_' + key);
            if (!part) return;
            const root = Model3D.build({ materials: model.materials, parts: [part], min: model.min, max: model.max }, view.scene, { name: 'vendor-hat:' + key });
            const kid = root.getChildMeshes(true)[0];
            if (kid) kid.position.set(-part.pivot[0], -part.pivot[1], -part.pivot[2]);
            World3D.addObject(view, root, 'actor');
            rider.attach('hat', root);
        } catch (e) { /* без шапки */ }
    },

    _say(v, text, sec) {
        if (typeof Billboard === 'undefined') return;
        const h = (v.rider ? (RiderModel.HEIGHT || 180) : 180) + 70;
        const ground = GameWorld.groundH(v.x, v.y);
        if (!v.bubble) v.bubble = Billboard.add({ x: v.x, y: v.y, h: ground + h, html: '', className: 'vendor-bubble', maxDist: 2600 });
        v.bubble.setHtml('<div class="vb">' + GameUtil.esc(text) + '</div>');
        v.bubble.setVisible(true);
        v.bubbleT = sec || 3;
    },

    update(dt) {
        this.time += dt;
        const P = typeof Player !== 'undefined' ? Player : null;
        if (!P || !this.list.length) return;
        for (const v of this.list) {
            const dx = P.x - v.x, dy = P.y - v.y, d = Math.hypot(dx, dy);
            if (v.bubble && v.bubbleT > 0) { v.bubbleT -= dt; if (v.bubbleT <= 0) v.bubble.setVisible(false); }
            if (!v.rider || d > VENDOR_CFG.active) continue;
            // поворот к игроку (в пределах ±75° от фасада лавки), иначе — обратно к фасаду
            let target = v.heading;
            if (d < VENDOR_CFG.look) {
                const toP = Math.atan2(dy, dx);
                const off = GameUtil.angleDiff(v.heading, toP);
                target = v.heading + GameUtil.clamp(off, -1.3, 1.3);
            }
            v.yaw = GameUtil.dampAngle(v.yaw, target, 5, dt);
            v.rider.root.rotation.y = -v.yaw;
            // приветствие при входе в радиус
            const inside = d < VENDOR_CFG.greet;
            if (inside && !v.inside && this.time - v.greetAt > VENDOR_CFG.cooldown) {
                v.greetAt = this.time;
                v.rider.wave(1.8);
                this._say(v, Lang.t('vendor.' + v.kind + '.' + (1 + Math.floor(Math.random() * 2))), 3.2);
                if (typeof GameUI !== 'undefined' && GameUI.sfx) GameUI.sfx('announce', { volume: 0.22, detune: 0.15 });
            }
            v.inside = inside;
            v.rider.update(dt, { moving: false, speed: 1, grounded: true, riding: false });
            // оглядывается, когда игрока рядом нет
            if (d >= VENDOR_CFG.look && v.rider.parts.Head) {
                v.lookT += dt;
                v.rider.parts.Head.rotation.y += Math.sin(v.lookT * 0.6) * 0.35;
            }
        }
    },
};

Game.register(Vendors);
