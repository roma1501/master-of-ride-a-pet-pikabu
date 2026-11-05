// Ranch.js — ранчо: участок, забор, вывеска, гнёзда, доска улучшений, питомцы на ранчо и их доход, сбор денег,
// панели «Яйца», «Питомцы» и простая панель улучшений, окно офлайн-дохода, лавки хаба (точки взаимодействия).
//
//   Ranch.player            участок игрока: { x, y, heading, w, d, toWorld(lx, ly), toLocal(x, y), inside(x, y, margin), name, … } или null
//   Ranch.all               все участки: игрок (маркер ranch) + NPC-соседи (ranch-2…); у каждого name, npc, index
//   Ranch.pets              питомцы игрока на ранчо: { uid, view, x, y, … } (view — PetView; позиция — карта px)
//   Ranch.inside(x, y)      точка внутри участка игрока?       Ranch.nestPos(i) -> { x, y, h, heading } | null
//   Ranch.placePet(uid)  unplacePet(uid)  placeBest()  collect(uid)  collectAll()   питомцы на ранчо и касса
//   Ranch.rebuildFence(style)  setBanner(def)   косметика ранчо (стиль забора 'wood' | 'white' | 'stone' | { post, rail, cap }; флаг { color })
//   Ranch.refreshNests()    пересобрать гнёзда после покупки (Eggs.syncNests зовёт сам)
//   Ranch.openEggs() / openPets() / openUpgrades() / showOffline(amount, seconds)
// События: ranch:enter, ranch:leave, stall:open { id, handled } — лавка/доска: обработчик фазы 2 ставит ev.handled = true, иначе
//   срабатывает запасной вариант (панель улучшений ранчо, тост «скоро» у лавок). Эти запасные панели не мешают фазе 2.
// Время — игровое: питомцы бродят и копят деньги только пока идёт Game.update (не на паузе).

function ranchCfg() {
    const U = 'undefined';
    return {
        w: typeof RANCH_W !== U ? RANCH_W : 1700,
        d: typeof RANCH_D !== U ? RANCH_D : 2100,
        gate: typeof RANCH_GATE_WIDTH !== U ? RANCH_GATE_WIDTH : 480,
        nest: typeof NEST_SPACING !== U ? NEST_SPACING : 260,
        exp: typeof PET_EXP_RANCH !== U ? PET_EXP_RANCH : 2,
    };
}

Lang.add({
    ru: {
        'ranch.yours': 'Твоё ранчо', 'ranch.of': 'Ранчо: {name}', 'ranch.upgrades': 'Улучшения',
        'npc.1': 'Мия', 'npc.2': 'Лео', 'npc.3': 'Кай', 'npc.4': 'Ава', 'npc.5': 'Зед', 'npc.6': 'Рекс',
        'stall.sell': 'Продажа', 'stall.food': 'Корм', 'stall.track': 'Следы яиц', 'stall.gears': 'Снаряжение',
        'stall.soon': 'Скоро откроется!', 'stall.open': 'Открыть: {name}',
        'eggs.title': 'Яйца', 'eggs.growAll': 'Вырастить все', 'eggs.nests': 'Гнёзда', 'eggs.inv': 'Инвентарь яиц',
        'eggs.empty': 'Пусто. Найдите яйца на карте и отвезите их на ранчо!', 'eggs.emptyNest': 'Пустое гнездо',
        'eggs.place': 'Положить', 'eggs.hatch': 'Вылупить', 'eggs.ready': 'Готово!', 'eggs.instant': 'Сразу за рекламу',
        'eggs.left': 'Вылупится через {t}', 'eggs.noNest': 'Нет свободных гнёзд', 'eggs.nestsFull': 'Гнёзда: {a} из {b}',
        'pets.title': 'Питомцы', 'pets.slots': 'На ранчо: {a} из {b}', 'pets.placeBest': 'Поставить лучших', 'pets.ride': 'Сесть',
        'pets.riding': 'Под седлом', 'pets.place': 'На ранчо', 'pets.unplace': 'Снять', 'pets.age': 'Возраст {n}', 'pets.exp': '{a}/{b}',
        'pets.full': 'На ранчо нет свободных слотов', 'pets.none': 'Питомцев пока нет', 'pets.huge': 'ОГРОМНЫЙ',
        'upg.title': 'Улучшения ранчо', 'upg.luckDesc': 'Удача вылупления ×{a} → ×{b}', 'upg.nestsDesc': 'Гнёзд: {a} → {b}',
        'upg.slotsDesc': 'Слотов питомцев: {a} → {b}', 'upg.max': 'МАКС', 'upg.bought': 'Куплено!', 'upg.noCash': 'Не хватает денег',
        'offline.title': 'С возвращением!', 'offline.text': 'Пока вас не было ({t}), питомцы на ранчо заработали', 'offline.collect': 'Забрать',
        'offline.x2': '×2 за рекламу', 'offline.got': 'Получено ${n}',
    },
    en: {
        'ranch.yours': 'Your Ranch', 'ranch.of': "{name}'s Ranch", 'ranch.upgrades': 'Upgrades',
        'npc.1': 'Mia', 'npc.2': 'Leo', 'npc.3': 'Kai', 'npc.4': 'Ava', 'npc.5': 'Zed', 'npc.6': 'Rex',
        'stall.sell': 'Sell', 'stall.food': 'Food', 'stall.track': 'Egg Track', 'stall.gears': 'Gears',
        'stall.soon': 'Opening soon!', 'stall.open': 'Open: {name}',
        'eggs.title': 'Eggs', 'eggs.growAll': 'Grow All', 'eggs.nests': 'Nests', 'eggs.inv': 'Egg inventory',
        'eggs.empty': 'Empty. Find eggs in the world and take them to your ranch!', 'eggs.emptyNest': 'Empty nest',
        'eggs.place': 'Place', 'eggs.hatch': 'Hatch', 'eggs.ready': 'Ready!', 'eggs.instant': 'Now: watch ad',
        'eggs.left': 'Hatches in {t}', 'eggs.noNest': 'No free nests', 'eggs.nestsFull': 'Nests: {a} of {b}',
        'pets.title': 'Pets', 'pets.slots': 'On ranch: {a}/{b}', 'pets.placeBest': 'Place Best', 'pets.ride': 'Ride',
        'pets.riding': 'Riding', 'pets.place': 'Place', 'pets.unplace': 'Unequip', 'pets.age': 'Age {n}', 'pets.exp': '{a}/{b}',
        'pets.full': 'No free ranch slots', 'pets.none': 'No pets yet', 'pets.huge': 'HUGE',
        'upg.title': 'Ranch upgrades', 'upg.luckDesc': 'Hatch luck ×{a} → ×{b}', 'upg.nestsDesc': 'Nests: {a} → {b}',
        'upg.slotsDesc': 'Pet slots: {a} → {b}', 'upg.max': 'MAX', 'upg.bought': 'Purchased!', 'upg.noCash': 'Not enough cash',
        'offline.title': 'Welcome back!', 'offline.text': 'While you were away ({t}), your ranch pets earned', 'offline.collect': 'Collect',
        'offline.x2': '×2: watch ad', 'offline.got': 'Got ${n}',
    },
});

const RANCH_CSS = `
.rv-bb{display:flex;align-items:center;gap:calc(var(--u)*8);padding:calc(var(--u)*4) calc(var(--u)*18) calc(var(--u)*4) calc(var(--u)*5);font-size:calc(var(--u)*22);border-radius:999px}
.rv-av{width:calc(var(--u)*42);height:calc(var(--u)*42);border-radius:50%;border:calc(var(--u)*3.5) solid #1c0f06;overflow:hidden;flex:none;background:#bfe6ff}
.rv-av img{width:100%;height:100%;display:block}
.board-bb{display:flex;align-items:center;gap:calc(var(--u)*6);padding:calc(var(--u)*4) calc(var(--u)*16);font-size:calc(var(--u)*20);border-radius:calc(var(--u)*12)}
.pbank{display:flex;flex-direction:column;align-items:center;font-size:calc(var(--u)*16);line-height:1.05}
.pbank .a{font-size:1.4em;color:#9cff7a}
.pbank .r{color:#ffe9a8;font-size:.95em}
.cpop{font-size:calc(var(--u)*27);color:#9cff7a}
.cpop span{display:inline-block;animation:cpopa 1.1s ease-out forwards}
@keyframes cpopa{0%{transform:scale(.6);opacity:0}15%{transform:scale(1.15);opacity:1}70%{opacity:1}100%{transform:scale(1);opacity:0}}
.pn-top{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--u)*10);flex-wrap:wrap;margin-bottom:calc(var(--u)*8)}
.pn-top .sub{font-size:calc(var(--u)*17);color:#7a5a38;font-weight:800}
.pn-sec{margin:calc(var(--u)*12) 0 calc(var(--u)*2);font-size:calc(var(--u)*20);font-weight:900;color:#6b3a17}
.pn-empty{padding:calc(var(--u)*10);text-align:center;color:#8a6a48;font-weight:800;font-size:calc(var(--u)*17)}
.egrow .pi{flex:none}
.egrow .tag{font-size:calc(var(--u)*13.5);font-weight:900;padding:calc(var(--u)*1) calc(var(--u)*7);border-radius:999px;border:calc(var(--u)*2) solid #1c0f06;color:#fff;margin-left:calc(var(--u)*6);vertical-align:middle;-webkit-text-stroke:calc(var(--u)*2.5) #120904;paint-order:stroke fill}
.egrow .acts{display:flex;gap:calc(var(--u)*8);flex:none;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.egrow .gb{font-size:calc(var(--u)*17);padding:calc(var(--u)*7) calc(var(--u)*14);border-radius:calc(var(--u)*12)}
.egrow .gb .ico{width:1.1em;height:1.1em}
.bar2{height:calc(var(--u)*11);border-radius:999px;background:#5b3417;border:calc(var(--u)*2.5) solid #1c0f06;overflow:hidden;margin-top:calc(var(--u)*4)}
.bar2 i{display:block;height:100%;width:0;background:linear-gradient(#a4f27f,#43c431 60%,#2f9a24)}
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(calc(var(--u)*300),1fr));gap:calc(var(--u)*10)}
.pcard{display:flex;gap:calc(var(--u)*10);padding:calc(var(--u)*9);border:calc(var(--u)*3) solid #7a4a22;border-radius:calc(var(--u)*14);background:rgba(255,250,228,.7);box-shadow:inset 0 calc(var(--u)*-3) 0 rgba(150,100,45,.2);min-width:0}
.pcard.placed{background:rgba(214,247,196,.75);border-color:#3f8a2a}
.pcard.equip{background:rgba(255,236,150,.85);border-color:#c98a0a}
.pcard .ic{--rc:#c8d0d8;width:calc(var(--u)*76);height:calc(var(--u)*76);flex:none;border-radius:calc(var(--u)*14);border:calc(var(--u)*4) solid var(--rc);background:radial-gradient(circle at 50% 40%,#fffbea,#ffe9a8);display:flex;align-items:center;justify-content:center;position:relative}
.pcard .ic .pi{width:92%;height:92%}
.pcard .mn{flex:1;min-width:0;display:flex;flex-direction:column;gap:calc(var(--u)*2)}
.pcard .nm{font-size:calc(var(--u)*20);font-weight:900;color:#5b3417;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pcard .ln{font-size:calc(var(--u)*15.5);font-weight:800;color:#6b4a28;display:flex;align-items:center;gap:calc(var(--u)*8);flex-wrap:wrap}
.pcard .ln .ico{width:calc(var(--u)*20);height:calc(var(--u)*20);vertical-align:middle}
.pcard .age{font-size:calc(var(--u)*14);font-weight:800;color:#7a5a38}
.pcard .mut{align-self:flex-start;font-size:calc(var(--u)*13);font-weight:900;padding:calc(var(--u)*1) calc(var(--u)*8);border-radius:999px;border:calc(var(--u)*2) solid #120904;color:#fff;-webkit-text-stroke:calc(var(--u)*2.5) #120904;paint-order:stroke fill}
.pcard .tg{display:flex;gap:calc(var(--u)*5);flex-wrap:wrap;align-items:center}
.pcard .huge{align-self:flex-start;font-size:calc(var(--u)*13);font-weight:900;padding:calc(var(--u)*1) calc(var(--u)*8);border-radius:999px;border:calc(var(--u)*2) solid #120904;color:#fff;background:linear-gradient(#ffb23d,#e8392f);-webkit-text-stroke:calc(var(--u)*2.5) #120904;paint-order:stroke fill;letter-spacing:.03em}
.pcard .bt{display:flex;gap:calc(var(--u)*6);margin-top:calc(var(--u)*3);flex-wrap:wrap}
.pcard .bt .gb{font-size:calc(var(--u)*15);padding:calc(var(--u)*5) calc(var(--u)*11);border-radius:calc(var(--u)*10)}
.pcard .riding{font-size:calc(var(--u)*14);font-weight:900;color:#a86a00;padding:calc(var(--u)*5) calc(var(--u)*4)}
.up-row .gb{font-size:calc(var(--u)*19)}
.up-row .gb .ico{width:1.15em;height:1.15em}
.up-row .mx{font-size:calc(var(--u)*20);color:#2f9a24;font-weight:900;padding:calc(var(--u)*6) calc(var(--u)*12)}
.off-amt{display:flex;align-items:center;justify-content:center;gap:calc(var(--u)*10);font-size:calc(var(--u)*46);margin:calc(var(--u)*6) 0 calc(var(--u)*14)}
.off-amt .ico{width:calc(var(--u)*64);height:calc(var(--u)*64)}
.off-txt{text-align:center;font-size:calc(var(--u)*20);font-weight:800;color:#5b3417;padding:0 calc(var(--u)*8)}
.off-btns{display:flex;gap:calc(var(--u)*12);justify-content:center;flex-wrap:wrap}
.off-btns .gb{font-size:calc(var(--u)*23);padding:calc(var(--u)*10) calc(var(--u)*24)}
`;

/** Стили забора: цвета столба, перекладины и шапки столба. */
const RANCH_FENCES = {
    wood: { post: '#4a2a14', rail: '#6b3d1c', cap: '#8a5a2b' },
    white: { post: '#efe6d4', rail: '#fffaf0', cap: '#d8ccb4' },
    stone: { post: '#7f858c', rail: '#a3aab1', cap: '#656b72' },
};
const RANCH_NEST_SLOTS = [0, -1, 1, -2, 2, -3];   // порядок и смещение гнёзд в ряду (в шагах NEST_SPACING)

/** Лицо-аватарка для вывески (оригинальный блочный человечек): dataURL 64×64. */
/** @type {Record<string, string>} */
const RANCH_AVATAR_FILES = {
    player: 'assets/ui/avatars/player.webp',
    npc1: 'assets/ui/avatars/npc1.webp',
    npc2: 'assets/ui/avatars/npc2.webp',
    npc3: 'assets/ui/avatars/npc3.webp',
    npc4: 'assets/ui/avatars/npc4.webp',
    npc5: 'assets/ui/avatars/npc5.webp',
};
function ranchAvatar(seed) {
    return GameUI.artUrl(RANCH_AVATAR_FILES[seed], () => ranchCanvasAvatar(seed));
}
function ranchCanvasAvatar(seed) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const rnd = GameUtil.rng('avatar-' + seed);
    const skins = ['#ffd1a0', '#f1b98a', '#c98d5c', '#8d5a3a', '#ffe0c0'];
    const hairs = ['#5a3a22', '#2a1a10', '#c9852a', '#e8d27a', '#a83a2a', '#3a4a7a'];
    const shirts = ['#3a8ee6', '#e8392f', '#43c431', '#ff7ad9', '#ffae1a', '#8d5aff'];
    const skin = skins[Math.floor(rnd() * skins.length)], hair = hairs[Math.floor(rnd() * hairs.length)], shirt = shirts[Math.floor(rnd() * shirts.length)];
    g.fillStyle = '#bfe6ff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = shirt; g.fillRect(8, 48, 48, 20);
    g.fillStyle = skin; g.fillRect(15, 14, 34, 34);
    g.fillStyle = hair; g.fillRect(13, 10, 38, 11); g.fillRect(13, 10, 8, 26);
    g.fillStyle = '#ffffff'; g.fillRect(22, 28, 8, 9); g.fillRect(36, 28, 8, 9);
    g.fillStyle = '#2a1608'; g.fillRect(25, 30, 5, 7); g.fillRect(39, 30, 5, 7);
    g.strokeStyle = '#7a2418'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(24, 41); g.quadraticCurveTo(32, 48, 41, 41); g.stroke();
    return cv.toDataURL('image/png');
}

/** @satisfies {Record<string, any>} */
const Ranch = {
    id: 'ranch',
    /** Участок ранчо игрока: { x, y, heading, w, d, toWorld(lx, ly), toLocal(x, y), inside(x, y) } или null. @type {any} */
    player: null,
    /** Все участки: игрок + NPC-соседи. @type {any[]} */
    all: [],
    /** Питомцы игрока на ранчо: { uid, view, x, y, … }. @type {any[]} */
    pets: [],
    /** Игрок сейчас внутри своего участка. */
    playerInside: false,
    /** @type {LoryApp | null} */
    app: null,
    /** @type {BABYLON.Scene | null} */
    scene: null,
    time: 0,
    /** Мешы и коллайдеры забора: { player: {meshes, tag}, npc: {...} }. @type {any} */
    _fence: { player: null, npc: null },
    _fenceStyle: 'wood',
    /** @type {any[]} */
    _nestMeshes: [],
    /** @type {any[]} */
    _decor: [],
    /** @type {any} */
    _banner: null,
    _bannerDef: { color: '#43c431' },
    /** @type {any[]} */
    _pops: [],
    /** @type {any} */
    _cashSnd: 0,
    /** @type {any} */
    _panelTimer: 0,
    _expT: 0,
    _bbT: 0,
    _incT: 0,
    _offlineShown: false,
    _newPets: 0,

    // =============================================================================================
    // Модуль
    // =============================================================================================
    async init(app) {
        this.app = app;
        this.scene = app.location ? app.location.view.scene : null;
        GameUI.addCss('ranch', RANCH_CSS);
        const loc = app.location;
        if (!loc) return;
        await this._loadProps();
        const cfg = ranchCfg();
        const marks = loc.markers('ranch');
        if (!marks.length) {
            const sp = loc.marker('spawn');
            if (sp) marks.push(sp);
        }
        this.all = marks.map((m, i) => this._makePlot(m, i, cfg));
        this.player = this.all[0] || null;
        // забор: NPC-участки одной пачкой, участок игрока — отдельно (косметика меняет только его)
        const npcPlots = this.all.filter(p => !p.isPlayer);
        if (npcPlots.length) this._fence.npc = this._buildFence(npcPlots, 'wood', 'ranch');
        if (this.player) {
            this._fence.player = this._buildFence([this.player], this._fenceSpec, 'ranch-p');
            this._buildDecor();
            this.setBanner(this._bannerDef);
        }
        this._buildGates(this.all);
        this._buildSigns(this.all);
        this._registerStalls(loc);
        // события
        Game.events.on('ui:side', (e) => {
            if (!e) return;
            if (e.id === 'eggs') (GameUI.isPanelOpen('eggs') ? GameUI.closePanel('eggs') : this.openEggs());
            else if (e.id === 'pets') (GameUI.isPanelOpen('pets') ? GameUI.closePanel('pets') : this.openPets());
        });
        Game.events.on('ride', () => this.syncPets());
        Game.events.on('pet:hatched', () => { this._newPets++; this.updateBadges(); });
    },

    /** Состояние загружено/сброшено: гнёзда по state.nests, питомцы на ранчо по state.ranchPets. */
    onLoad() {
        this.refreshNests();
        this.syncPets();
        this.updateBadges();
        if (typeof Eggs !== 'undefined') Eggs.syncNests();
    },

    ready() {
        this.updateBadges();
    },

    // --- Участок ---------------------------------------------------------------------------------
    _makePlot(m, i, cfg) {
        const rot = Array.isArray(m.rot) ? m.rot[1] : m.rot;
        const heading = (Number(rot) || 0) * Math.PI / 180;
        const cs = Math.cos(heading), sn = Math.sin(heading);
        const plot = {
            index: i, x: Number(m.x), y: Number(m.y), heading, cs, sn, w: cfg.w, d: cfg.d,
            isPlayer: i === 0, npc: i > 0,
            name: i === 0 ? Lang.t('ranch.yours') : Lang.t('ranch.of', { name: Lang.t('npc.' + (((i - 1) % 6) + 1)) }),
            toWorld(lx, ly) { return { x: plot.x + lx * cs - ly * sn, y: plot.y + lx * sn + ly * cs }; },
            toLocal(x, y) { const dx = x - plot.x, dy = y - plot.y; return { lx: dx * cs + dy * sn, ly: -dx * sn + dy * cs }; },
            inside(x, y, margin = 0) { const l = plot.toLocal(x, y); return Math.abs(l.lx) <= plot.w / 2 + margin && Math.abs(l.ly) <= plot.d / 2 + margin; },
        };
        return plot;
    },

    /** Точка внутри участка игрока? */
    inside(x, y) { return !!this.player && this.player.inside(x, y); },

    // =============================================================================================
    // Пропсы ранчо из Blender (assets/models/props через PetModels): ворота, вывеска, доска улучшений, гнёзда, забор.
    // Все — thin instances одной модели (забор, ворота, вывески и гнёзда всех участков — по одному draw call на деталь).
    // Нет файла — запасные фигуры из примитивов (старый код ниже), сцена не падает.
    // =============================================================================================
    /** Загруженные пропсы: id -> { id, model, meta }. @type {Record<string, any>} */
    _P: {},
    /** Заданный сейчас стиль забора игрока: 'wood' | 'white' | 'stone' | { post, rail, cap }. @type {any} */
    _fenceSpec: 'wood',
    /** Вывески: { plot, x, y, h, rot, main, plank } и общие меши. @type {any} */
    _signs: null,
    /** Гнёзда игрока: { mesh, buf }. @type {any} */
    _nestInst: null,
    _swayT: 0,
    _swayT2: 0,

    async _loadProps() {
        const ids = ['nest', 'ranch_sign', 'upgrade_board', 'ranch_gate', 'fence_rail', 'fence_rail_white', 'fence_rail_stone'];
        await Promise.all(ids.map(async (id) => {
            const rec = typeof PetModels !== 'undefined' ? PetModels.prop(id) : null;
            if (!rec || !rec.model) return;
            try {
                const model = await Model3D.load(rec.model);
                const meta = rec.meta ? await PetModels.loadMeta(rec.meta) : null;
                if (model) this._P[id] = { id, model, meta };
            } catch (e) { console.warn('Ranch: нет модели ' + id + ' — ' + ((e && e.message) || e)); }
        }));
    },

    /** Половина проёма ворот (px): не уже заданной RANCH_GATE_WIDTH и не уже самих ворот (с фонарями ±253). */
    _gh() { return Math.max(ranchCfg().gate / 2, 268); },

    /** Меши частей пропса, отцеплены от корня (у каждого вызова свои материалы). */
    _parts(prop, name) {
        const root = Model3D.build(prop.model, this.scene, { name });
        const parts = root.getChildMeshes(true);
        for (const m of parts) { m.parent = null; m.isPickable = false; }
        root.dispose(false, false);
        return parts;
    },

    /** Меш частей -> thin instances (buf — по 16 чисел на экземпляр; dynamic — буфер потом обновляется). */
    _instance(mesh, buf, count, dynamic) {
        mesh.thinInstanceSetBuffer('matrix', buf, 16, !dynamic);
        mesh.thinInstanceCount = count;
        mesh.thinInstanceRefreshBoundingInfo(true);
        mesh.alwaysSelectAsActiveMesh = false;
        World3D.addObject(this.app.location.view, mesh, 'prop', { ink: false, outline: false });
    },

    /** Матрица экземпляра: положение (x, h, y карты), курс rotY (rotation.y = −курс), масштаб. */
    _mat(buf, i, x, h, y, heading, sx = 1, sy = 1, sz = 1) {
        BABYLON.Matrix.Compose(new BABYLON.Vector3(sx, sy, sz), BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), -heading), new BABYLON.Vector3(x, h, y)).copyToArray(buf, i * 16);
    },

    /** Перекрасить секцию забора по областям: столб (|z| у конца), шапка столба, перекладины — вершинными цветами. */
    _recolor(mesh, st) {
        const pos = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind), col = mesh.getVerticesData(BABYLON.VertexBuffer.ColorKind);
        if (!pos || !col) return;
        const c = (hex) => BABYLON.Color3.FromHexString(hex);
        const post = c(st.post || st.rail || '#ffffff'), rail = c(st.rail || st.post || '#ffffff'), cap = c(st.cap || st.post || '#ffffff');
        const out = new Float32Array(col.length);
        const stride = col.length / (pos.length / 3);
        for (let i = 0; i < pos.length / 3; i++) {
            const y = pos[i * 3 + 1], z = Math.abs(pos[i * 3 + 2]);
            const k = z > 90.5 ? (y > 105 ? cap : post) : rail;
            out[i * stride] = k.r; out[i * stride + 1] = k.g; out[i * stride + 2] = k.b;
            if (stride > 3) out[i * stride + 3] = col[i * stride + 3];
        }
        mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, out, true, stride);   // буфер модели не обновляемый: пересоздаём
    },

    /** Модель секции забора по стилю: 'wood' | 'white' | 'stone' или цвета { post, rail, cap } (белая база + перекраска вершин). */
    _fenceModel(style) {
        const P = this._P;
        if (typeof style === 'string') {
            const id = style === 'white' ? 'fence_rail_white' : style === 'stone' ? 'fence_rail_stone' : 'fence_rail';
            return P[id] ? { prop: P[id], colors: null } : null;
        }
        const base = P.fence_rail_white || P.fence_rail;
        if (!base) return null;
        return { prop: base, colors: Object.assign({}, RANCH_FENCES.white, style || {}) };
    },

    /** Забор участков plots: секции Blender по 200 px, коллайдеры по отрезкам (тег tag). Возвращает { meshes, tag, own }. */
    _buildFence(plots, style, tag) {
        const fm = this._fenceModel(style);
        if (!fm) return this._buildFenceProc(plots, typeof style === 'string' ? (RANCH_FENCES[style] || RANCH_FENCES.wood) : Object.assign({}, RANCH_FENCES.wood, style || {}), tag);
        const secs = [];
        for (const plot of plots) {
            const { runs } = this._fenceRuns(plot);
            let runNo = 0;
            for (const run of runs) {
                runNo++;
                const a = plot.toWorld(run[0][0], run[0][1]), b = plot.toWorld(run[1][0], run[1][1]);
                const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
                GameWorld.colliders.addSegment(a.x, a.y, b.x, b.y, 28, tag);
                if (L < 20) continue;
                const n = Math.max(1, Math.round(L / 200)), s = L / (n * 200), th = Math.atan2(dx, dy);
                for (let k = 0; k < n; k++) {
                    const x0 = a.x + dx * k / n, y0 = a.y + dy * k / n, x1 = a.x + dx * (k + 1) / n, y1 = a.y + dy * (k + 1) / n;
                    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
                    secs.push([mx, Math.min(GameWorld.groundH(x0, y0), GameWorld.groundH(x1, y1), GameWorld.groundH(mx, my)) - 1, my, th, s, [0, 1, 0, 0, 1][runNo - 1] || 0]);
                }
            }
        }
        const buf = new Float32Array(secs.length * 16);
        const up = BABYLON.Vector3.Up();
        secs.forEach((q, i) => {
            // ось секции (локальная Z) — вдоль участка забора: поворот вокруг Y на atan2(dx, dy)
            // секции соседних участков забора чуть различаются толщиной и высотой: на углу два столба не совпадают гранями (7b: без z-fighting)
            const k = q[5] ? 1.05 : 1, kh = q[5] ? 1.012 : 1;
            BABYLON.Matrix.Compose(new BABYLON.Vector3(k, kh, q[4]), BABYLON.Quaternion.RotationAxis(up, q[3]), new BABYLON.Vector3(q[0], q[1], q[2])).copyToArray(buf, i * 16);
        });
        const parts = this._parts(fm.prop, 'fence-' + tag);
        for (const m of parts) {
            if (fm.colors) this._recolor(m, fm.colors);
            this._instance(m, buf, secs.length, false);
        }
        return { meshes: parts, tag, own: true };
    },

    /** Ворота на въезде каждого участка: проём вдоль +X, коллайдеры столбов из метаданных. */
    _buildGates(plots) {
        const prop = this._P.ranch_gate;
        if (!prop) return;
        const [mesh] = this._parts(prop, 'rv-gate');
        const buf = new Float32Array(plots.length * 16);
        plots.forEach((plot, i) => {
            const w = plot.toWorld(plot.w / 2 - 22, 0), h = GameWorld.groundH(w.x, w.y);
            this._mat(buf, i, w.x, h, w.y, plot.heading);
            if (prop.meta) GameWorld.addPropColliders(prop.meta, w.x, w.y, plot.heading * 180 / Math.PI, 1, 'ranch-deco');
        });
        this._instance(mesh, buf, plots.length, false);
    },

    /** Вывески всех участков: столб и качающаяся доска (две детали, thin instances), подпись над доской. */
    _buildSigns(plots) {
        const prop = this._P.ranch_sign;
        if (!prop) { for (const p of plots) this._buildSignProc(p); return; }
        const parts = this._parts(prop, 'rv-sign');
        const plank = parts.find(m => m.metadata && m.metadata.part === 'plank') || null;
        const mainPart = parts.find(m => m !== plank) || null;
        const gh = this._gh();
        const list = plots.map((plot) => {
            // вывеска вне забора сбоку от ворот; повёрнута на 180°, чтобы столб оказался дальше от проёма
            const w = plot.toWorld(plot.w / 2 - 22 + 130, -(gh + 190)), h = GameWorld.groundH(w.x, w.y), rot = plot.heading + Math.PI;
            if (prop.meta) GameWorld.addPropColliders(prop.meta, w.x, w.y, rot * 180 / Math.PI, 1, 'ranch-deco');
            // подпись над доской: name_anchor модели (x, y, z) -> карта
            const an = (prop.meta && prop.meta.notes && prop.meta.notes.name_anchor_px) || [0, 345, -20];
            const wx = w.x + an[0] * Math.cos(rot) - an[2] * Math.sin(rot), wy = w.y + an[0] * Math.sin(rot) + an[2] * Math.cos(rot);
            const av = ranchAvatar(plot.isPlayer ? 'player' : 'npc' + plot.index);
            plot.signBb = Billboard.add({
                x: wx, y: wy, h: h + an[1] + 42, className: 'rv-bb wood', maxDist: 3600,
                html: '<span class="rv-av" style="' + (plot.isPlayer ? 'border-color:#ffd21f;box-shadow:0 0 0 calc(var(--u)*2) #1c0f06' : '') + '"><img alt="" src="' + av + '"></span><span>' + GameUtil.esc(plot.name) + '</span>',
            });
            plot.signPos = { x: w.x, y: w.y, h };
            return { plot, x: w.x, y: w.y, h, rot };
        });
        const n = list.length;
        const mainBuf = new Float32Array(n * 16), plankBuf = new Float32Array(n * 16);
        list.forEach((q, i) => { this._mat(mainBuf, i, q.x, q.h, q.y, q.rot); });
        if (mainPart) this._instance(mainPart, mainBuf, n, false);
        if (plank) {
            const pv = plank.metadata.pivot || [0, 269, -20];
            this._instance(plank, plankBuf, n, true);
            this._signs = { list, plank, plankBuf, pivot: pv, tmp: [new BABYLON.Matrix(), new BABYLON.Matrix(), new BABYLON.Matrix(), new BABYLON.Matrix()], q: BABYLON.Quaternion.Identity(), v: BABYLON.Vector3.Zero(), s: BABYLON.Vector3.One() };
            this._swaySigns(0);
        }
    },

    /** Доска вывески качается вокруг оси X в точке подвеса (±5°); матрицы экземпляров обновляются. */
    _swaySigns(dt) {
        const S = this._signs;
        if (!S) return;
        this._swayT += dt;
        const [t0, t1, t2, w] = S.tmp, pv = S.pivot;
        S.list.forEach((q, i) => {
            const phi = Math.sin(this._swayT * 1.5 + i * 1.7) * 0.085 + Math.sin(this._swayT * 0.7 + i) * 0.03;
            BABYLON.Matrix.TranslationToRef(-pv[0], -pv[1], -pv[2], t0);
            BABYLON.Matrix.RotationXToRef(phi, t1);
            t0.multiplyToRef(t1, t2);
            BABYLON.Matrix.TranslationToRef(pv[0], pv[1], pv[2], t0);
            t2.multiplyToRef(t0, t1);
            BABYLON.Quaternion.RotationAxisToRef(BABYLON.Vector3.Up(), -q.rot, S.q);
            S.v.set(q.x, q.h, q.y);
            BABYLON.Matrix.ComposeToRef(S.s, S.q, S.v, w);
            t1.multiplyToRef(w, t2);
            t2.copyToArray(S.plankBuf, i * 16);
        });
        S.plank.thinInstanceBufferUpdated('matrix');
    },

    /** Доска улучшений у въезда (внутри забора), интерактив и подпись. */
    _buildDecor() {
        const plot = this.player;
        const prop = this._P.upgrade_board;
        if (!prop) { this._buildDecorProc(); return; }
        const lx = plot.w / 2 - 280, ly = this._gh() + 330;
        const w = plot.toWorld(lx, ly), h = GameWorld.groundH(w.x, w.y);
        const [mesh] = this._parts(prop, 'rv-board');
        const buf = new Float32Array(16);
        this._mat(buf, 0, w.x, h, w.y, plot.heading);
        this._instance(mesh, buf, 1, false);
        this._decor.push(mesh);
        if (prop.meta) GameWorld.addPropColliders(prop.meta, w.x, w.y, plot.heading * 180 / Math.PI, 1, 'ranch-deco');
        this.boardPos = { x: w.x, y: w.y, h };
        Billboard.add({ x: w.x, y: w.y, h: h + 290, className: 'board-bb wood', maxDist: 2600, html: GameUI.icon('wrench') + '<span>' + GameUtil.esc(Lang.t('ranch.upgrades')) + '</span>' });
        Interact.register({
            id: 'board-upgrades', x: w.x + Math.cos(plot.heading) * 140, y: w.y + Math.sin(plot.heading) * 140, r: 300,
            label: () => Lang.t('ranch.upgrades'), action: () => this.openStall('upgrades'),
        });
    },

    /** Гнёзда игрока: модель nest (thin instances по числу гнёзд); яйцо Eggs.js сидит на 22 px над землёй — гнездо опущено так, что дно на 16 px. */
    refreshNests() {
        if (!this.scene || !this.player) return;
        const prop = this._P.nest;
        if (!prop) { this._refreshNestsProc(); return; }
        const n = GameState.state.nests;
        if (!this._nestInst) {
            const [mesh] = this._parts(prop, 'rv-nest');
            const buf = new Float32Array(GameData.UPGRADES.nests.max * 16);
            this._instance(mesh, buf, 0, true);
            this._nestInst = { mesh, buf };
        }
        const I = this._nestInst;
        let cnt = 0;
        for (let i = 0; i < n; i++) {
            const pos = this.nestPos(i);
            if (!pos) break;
            this._mat(I.buf, cnt++, pos.x, pos.h + 6, pos.y, pos.heading + i * 0.9);
        }
        I.mesh.thinInstanceCount = cnt;
        I.mesh.thinInstanceBufferUpdated('matrix');
        I.mesh.thinInstanceRefreshBoundingInfo(true);
    },

    // =============================================================================================
    // Забор: столбы и перекладины пачками (thin instances), коллайдеры по отрезкам
    // =============================================================================================
    _fenceRuns(plot) {
        const cfg = ranchCfg();
        const hx = plot.w / 2 - 22, hy = plot.d / 2 - 22, gh = this._gh();
        // обход по кругу; въезд — проём в передней стороне (lx = +hx) шириной RANCH_GATE_WIDTH
        return {
            runs: [[[-hx, -hy], [-hx, hy]], [[-hx, hy], [hx, hy]], [[hx, hy], [hx, gh]], [[hx, -gh], [hx, -hy]], [[hx, -hy], [-hx, -hy]]],
            gate: [[hx, -gh], [hx, gh]],
        };
    },

    /**
     * Забор участков plots в стиле style. Возвращает { meshes, tag } (коллайдеры — тег tag).
     * @param {any[]} plots
     * @param {{ post: string, rail: string, cap: string }} style
     * @param {string} tag
     */
    _buildFenceProc(plots, style, tag) {
        const scene = this.scene, view = this.app.location.view;
        const posts = [], rails = [];
        const seen = new Set();
        const terrain = GameWorld.terrain;
        for (const plot of plots) {
            const { runs, gate } = this._fenceRuns(plot);
            const gateKeys = new Set(gate.map(p => p[0].toFixed(0) + ',' + p[1].toFixed(0)));
            for (const run of runs) {
                const a = run[0], b = run[1];
                const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
                const n = Math.max(1, Math.ceil(len / 150));
                let prev = null;
                for (let k = 0; k <= n; k++) {
                    const lx = a[0] + (b[0] - a[0]) * k / n, ly = a[1] + (b[1] - a[1]) * k / n;
                    const w = plot.toWorld(lx, ly);
                    const key = plot.index + ':' + lx.toFixed(0) + ',' + ly.toFixed(0);
                    const tall = gateKeys.has(lx.toFixed(0) + ',' + ly.toFixed(0));
                    const h = terrain ? terrain.heightAt(w.x, w.y) : 0;
                    if (!seen.has(key)) { seen.add(key); posts.push({ x: w.x, y: w.y, h, tall, heading: plot.heading }); }
                    if (prev) rails.push({ ax: prev.x, ay: prev.y, ah: prev.h, bx: w.x, by: w.y, bh: h });
                    prev = { x: w.x, y: w.y, h };
                }
                // коллайдер на отрезок забора (не на проём)
                const wa = plot.toWorld(a[0], a[1]), wb = plot.toWorld(b[0], b[1]);
                GameWorld.colliders.addSegment(wa.x, wa.y, wb.x, wb.y, 28, tag);
            }
        }
        const PV_ = PV;
        const postMesh = PetView.buildMesh(scene, 'fence-posts', [PV_.box(16, 100, 16, [0, 44, 0], style.post), PV_.box(23, 8, 23, [0, 98, 0], style.cap)]);
        const railMesh = PetView.buildMesh(scene, 'fence-rails', [PV_.box(1, 10, 7, [0, 0, 0], style.rail)]);
        const pb = new Float32Array(posts.length * 16), rb = new Float32Array(rails.length * 2 * 16);
        const up = BABYLON.Vector3.Up();
        posts.forEach((p, i) => {
            BABYLON.Matrix.Compose(new BABYLON.Vector3(1, p.tall ? 1.5 : 1, 1), BABYLON.Quaternion.RotationAxis(up, -p.heading), new BABYLON.Vector3(p.x, p.h, p.y)).copyToArray(pb, i * 16);
        });
        let ri = 0;
        for (const r of rails) {
            const dx = r.bx - r.ax, dy = r.by - r.ay, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
            const q = BABYLON.Quaternion.RotationAxis(up, -ang);
            for (const hh of [36, 72]) {
                BABYLON.Matrix.Compose(new BABYLON.Vector3(len + 8, 1, 1), q, new BABYLON.Vector3((r.ax + r.bx) / 2, (r.ah + r.bh) / 2 + hh, (r.ay + r.by) / 2)).copyToArray(rb, ri * 16);
                ri++;
            }
        }
        for (const [mesh, buf, n] of [[postMesh, pb, posts.length], [railMesh, rb, rails.length * 2]]) {
            mesh.thinInstanceSetBuffer('matrix', buf, 16, true);
            mesh.thinInstanceCount = n;
            mesh.thinInstanceRefreshBoundingInfo(true);
            mesh.alwaysSelectAsActiveMesh = false;
            World3D.addObject(view, mesh, 'prop', { ink: false, outline: false });
        }
        return { meshes: [postMesh, railMesh], tag };
    },

    _disposeFence(f) {
        if (!f) return;
        GameWorld.colliders.removeTag(f.tag);
        for (const m of f.meshes) {
            const mats = f.own && m.material ? (/** @type {any} */ (m.material).subMaterials || [m.material]) : [];
            World3D.removeObject(this.app.location.view, m);
            for (const mat of mats) if (mat) mat.dispose(false, false);
        }
    },

    /** Сменить стиль забора ранчо игрока: 'wood' | 'white' | 'stone' или { post, rail, cap } (косметика). */
    rebuildFence(style) {
        if (!this.player) return;
        const spec = typeof style === 'string' ? (RANCH_FENCES[style] ? style : 'wood') : Object.assign({}, style || {});
        this._fenceStyle = typeof style === 'string' ? style : 'custom';
        this._fenceSpec = spec;
        this._disposeFence(this._fence.player);
        this._fence.player = this._buildFence([this.player], spec, 'ranch-p');
    },

    // =============================================================================================
    // Вывески, доска улучшений, флаг
    // =============================================================================================
    // Деревянный столбик-вывеска участка: две опоры и доска; над ней — подпись «<имя>'s Ranch» с аватаркой.
    _buildSignProc(plot) {
        const cfg = ranchCfg();
        const lx = plot.w / 2 - 22 + 130, ly = -(cfg.gate / 2 + 190);
        const w = plot.toWorld(lx, ly), h = GameWorld.groundH(w.x, w.y);
        const node = this._signNode('rv-sign', plot, w.x, h, w.y, [
            PV.box(14, 150, 14, [0, 69, -92], '#4a2a14'), PV.box(14, 150, 14, [0, 69, 92], '#4a2a14'),
            PV.box(12, 66, 232, [0, 128, 0], '#7b4a24'), PV.box(14, 8, 244, [0, 166, 0], '#5b3417'), PV.box(14, 8, 244, [0, 90, 0], '#5b3417'),
            PV.box(13, 12, 12, [0, 128, -100], '#f1d3a6'), PV.box(13, 12, 12, [0, 128, 100], '#f1d3a6'),
        ]);
        if (plot.isPlayer) this._decor.push(node);
        GameWorld.colliders.addCircle(w.x + Math.cos(plot.heading + Math.PI / 2) * 92, w.y + Math.sin(plot.heading + Math.PI / 2) * 92, 20, 'ranch-deco');
        GameWorld.colliders.addCircle(w.x - Math.cos(plot.heading + Math.PI / 2) * 92, w.y - Math.sin(plot.heading + Math.PI / 2) * 92, 20, 'ranch-deco');
        const av = ranchAvatar(plot.isPlayer ? 'player' : 'npc' + plot.index);
        plot.signBb = Billboard.add({
            x: w.x, y: w.y, h: h + 215, className: 'rv-bb wood', maxDist: 3600,
            html: '<span class="rv-av" style="' + (plot.isPlayer ? 'border-color:#ffd21f;box-shadow:0 0 0 calc(var(--u)*2) #1c0f06' : '') + '"><img alt="" src="' + av + '"></span><span>' + GameUtil.esc(plot.name) + '</span>',
        });
        plot.signPos = { x: w.x, y: w.y, h };
    },

    // Узел с одним мешем из примитивов в локальной системе участка (+X — наружу, к хабу).
    _signNode(name, plot, x, h, y, specs) {
        const scene = this.scene;
        const node = new BABYLON.TransformNode(name, scene);
        node.position.set(x, h, y);
        node.rotation.y = -plot.heading;
        const mesh = PetView.buildMesh(scene, name + '-mesh', specs);
        mesh.parent = node;
        World3D.addObject(this.app.location.view, mesh, 'prop', { ink: false });
        return node;
    },

    _buildDecorProc() {
        const plot = this.player, cfg = ranchCfg();
        // доска улучшений: у въезда справа (внутри забора)
        const lx = plot.w / 2 - 300, ly = cfg.gate / 2 + 360;
        const w = plot.toWorld(lx, ly), h = GameWorld.groundH(w.x, w.y);
        const node = this._signNode('rv-board', plot, w.x, h, w.y, [
            PV.box(18, 170, 18, [0, 79, -122], '#4a2a14'), PV.box(18, 170, 18, [0, 79, 122], '#4a2a14'),
            PV.box(14, 120, 270, [0, 150, 0], '#7b4a24'), PV.box(16, 9, 282, [0, 214, 0], '#5b3417'), PV.box(16, 9, 282, [0, 90, 0], '#5b3417'),
            PV.box(46, 14, 300, [-4, 232, 0], '#3f2410'), PV.box(15, 40, 40, [0, 150, 0], '#ffd21f'),
        ]);
        this._decor.push(node);
        this.boardPos = { x: w.x, y: w.y, h };
        Billboard.add({ x: w.x, y: w.y, h: h + 280, className: 'board-bb wood', maxDist: 2600, html: GameUI.icon('wrench') + '<span>' + GameUtil.esc(Lang.t('ranch.upgrades')) + '</span>' });
        this._rebuildDecorColliders();
        Interact.register({
            id: 'board-upgrades', x: w.x + Math.cos(plot.heading) * 120, y: w.y + Math.sin(plot.heading) * 120, r: 300,
            label: () => Lang.t('ranch.upgrades'), action: () => this.openStall('upgrades'),
        });
    },

    _rebuildDecorColliders() {
        // столбы доски — круги (тег ranch-deco: смена забора их не трогает)
        if (!this.boardPos || !this.player) return;
        const p = this.player, s = Math.cos(p.heading + Math.PI / 2), c = Math.sin(p.heading + Math.PI / 2);
        for (const k of [-122, 122]) GameWorld.colliders.addCircle(this.boardPos.x + s * k, this.boardPos.y + c * k, 22, 'ranch-deco');
    },

    /** Флаг ранчо: { color } — полотнище на шесте у въезда; null — убрать (косметика). */
    setBanner(def) {
        if (!this.player || !this.scene) return;
        if (this._banner) { World3D.removeObject(this.app.location.view, this._banner.pole); World3D.removeObject(this.app.location.view, this._banner.cloth); this._banner.node.dispose(false, false); this._banner = null; }
        this._bannerDef = def;
        if (!def) return;
        const plot = this.player;
        const w = plot.toWorld(plot.w / 2 - 22 + 130, this._gh() + 190), h = GameWorld.groundH(w.x, w.y);
        const scene = this.scene, view = this.app.location.view;
        const node = new BABYLON.TransformNode('rv-banner', scene);
        node.position.set(w.x, h, w.y);
        node.rotation.y = -plot.heading;
        const pole = PetView.buildMesh(scene, 'rv-pole', [PV.box(12, 250, 12, [0, 119, 0], '#4a2a14'), PV.ell(24, 24, 24, [0, 250, 0], '#ffd21f')]);
        pole.parent = node;
        const cloth = PetView.buildMesh(scene, 'rv-cloth', [PV.box(6, 86, 118, [0, 0, 62], def.color || '#43c431'), PV.box(7, 18, 118, [0, 34, 62], def.color2 || '#ffd21f')]);
        cloth.parent = node; cloth.position.set(0, 196, 0);
        World3D.addObject(view, pole, 'prop', { ink: false });
        World3D.addObject(view, cloth, 'prop', { ink: false, castShadow: true });
        this._banner = { node, pole, cloth };
    },

    // =============================================================================================
    // Гнёзда на ранчо
    // =============================================================================================
    /** Положение гнезда i на карте: { x, y, h, heading } (ряд у задней стороны, порядок: центр, влево, вправо…). */
    nestPos(i) {
        const p = this.player;
        if (!p || !(i >= 0) || i >= GameData.UPGRADES.nests.max) return null;
        const cfg = ranchCfg();
        const w = p.toWorld(-(p.w / 2 - 22) + 270, RANCH_NEST_SLOTS[i] * cfg.nest);
        return { x: w.x, y: w.y, h: GameWorld.groundH(w.x, w.y), heading: p.heading };
    },

    /** Пересобрать меши гнёзд по state.nests. */
    _refreshNestsProc() {
        if (!this.scene || !this.player) return;
        const n = GameState.state.nests;
        while (this._nestMeshes.length > n) { const m = this._nestMeshes.pop(); World3D.removeObject(this.app.location.view, m); }
        for (let i = this._nestMeshes.length; i < n; i++) {
            const pos = this.nestPos(i);
            if (!pos) break;
            const specs = [PV.cyl(14, 150, 160, [0, 4, 0], '#7a4a22'), PV.cyl(10, 112, 122, [0, 14, 0], '#d9b568')];
            for (let k = 0; k < 12; k++) {
                const a = k / 12 * Math.PI * 2;
                specs.push(PV.ell(52, 24, 28, [Math.cos(a) * 74, 18 + (k % 2) * 4, Math.sin(a) * 74], k % 3 === 0 ? '#e0b860' : '#c99a4a', [0, -a, 0.12]));
            }
            for (let k = 0; k < 9; k++) {
                const a = k / 9 * Math.PI * 2 + 0.2;
                specs.push(PV.ell(40, 18, 22, [Math.cos(a) * 52, 28, Math.sin(a) * 52], k % 2 ? '#b8862e' : '#e8c878', [0, -a, 0.2]));
            }
            const mesh = PetView.buildMesh(this.scene, 'nest-' + i, specs);
            mesh.position.set(pos.x, pos.h, pos.y);
            World3D.addObject(this.app.location.view, mesh, 'prop', { ink: false });
            this._nestMeshes.push(mesh);
        }
    },

    // =============================================================================================
    // Лавки и доска: Interact у маркеров stall-*
    // =============================================================================================
    _registerStalls(loc) {
        for (const id of ['sell', 'food', 'track', 'gears']) {
            const m = loc.marker('stall-' + id);
            if (!m) continue;
            Interact.register({
                id: 'stall-' + id, x: Number(m.x), y: Number(m.y), r: 330,
                label: () => Lang.t('stall.open', { name: Lang.t('stall.' + id) }),
                action: () => this.openStall(id),
            });
        }
    },

    /** Открыть лавку/доску id: событие stall:open { id, handled }; не обработано — запасной вариант. */
    openStall(id) {
        const ev = { id, handled: false };
        Game.events.emit('stall:open', ev);
        if (ev.handled) return;
        if (id === 'upgrades') this.openUpgrades();
        else GameUI.toast(Lang.t('stall.soon'), 'info');
    },

    // =============================================================================================
    // Питомцы на ранчо
    // =============================================================================================
    /** Привести виды питомцев на ранчо к state.ranchPets (создать, убрать, выплатить копилки снятых). */
    syncPets(opts = {}) {
        if (!this.scene || !this.player) return;
        const s = GameState.state;
        const want = s.ranchPets.slice(0, s.slots);
        // убрать
        for (const rec of this.pets.slice()) {
            if (!want.includes(rec.uid) || !GameState.findPet(rec.uid)) this._removePetRec(rec);
        }
        // копилки питомцев, которых на ранчо больше нет, — в кассу
        let paid = 0;
        for (const uid of Object.keys(s.ranchBank)) if (!want.includes(uid)) { paid += s.ranchBank[uid] || 0; delete s.ranchBank[uid]; }
        if (paid >= 1) { GameState.addCash(Math.floor(paid), 'income'); GameUI.sfx('cash'); }
        // добавить
        for (const uid of want) {
            if (this.pets.some(r => r.uid === uid)) continue;
            const pet = GameState.findPet(uid);
            if (!pet) continue;
            this._addPetRec(pet, opts.from);
        }
        this.updateBadges();
    },

    _roam(plot) {
        // зона прогулок питомцев: между гнёздами и въездом, без доски у въезда
        return { x0: -plot.w / 2 + 520, x1: plot.w / 2 - 190, y0: -plot.d / 2 + 190, y1: plot.d / 2 - 190 };
    },

    _pickTarget(rec) {
        const p = this.player, r = this._roam(p);
        for (let k = 0; k < 8; k++) {
            const lx = GameUtil.lerp(r.x0, r.x1, Math.random()), ly = GameUtil.lerp(r.y0, r.y1, Math.random());
            if (lx > p.w / 2 - 520 && ly > ranchCfg().gate / 2 + 200) continue;   // доска улучшений
            const w = p.toWorld(lx, ly);
            rec.tx = w.x; rec.ty = w.y;
            return;
        }
        rec.tx = p.x; rec.ty = p.y;
    },

    _addPetRec(pet, from) {
        const p = this.player;
        const view = PetView.create(this.scene, pet.species, { w: pet.w, mutation: pet.mutation });
        const r = this._roam(p);
        const start = from && Number.isFinite(from.x) ? { x: from.x, y: from.y } : p.toWorld(GameUtil.lerp(r.x0, r.x1, Math.random()), GameUtil.lerp(r.y0, r.y1, Math.random()));
        const d = GameData.PETS[pet.species];
        const rec = {
            uid: pet.uid, view, x: start.x, y: start.y, heading: p.heading + Math.PI + (Math.random() - 0.5), tx: start.x, ty: start.y, wait: 0.5 + Math.random() * 2,
            speed: 0, bb: null, last: '', income: 0, def: d, expAcc: 0, cd: 0,
        };
        rec.bb = Billboard.add({ x: start.x, y: start.y, h: GameWorld.groundH(start.x, start.y) + view.size.height + 50, className: 'pbank', maxDist: 2300, html: '' });
        this.pets.push(rec);
        this._pickTarget(rec);
        view.place(rec.x, GameWorld.groundH(rec.x, rec.y), rec.y, rec.heading, 0, 0);
    },

    _removePetRec(rec) {
        const i = this.pets.indexOf(rec);
        if (i >= 0) this.pets.splice(i, 1);
        if (rec.bb) rec.bb.remove();
        if (rec.view) rec.view.dispose();
    },

    /** Поставить питомца на ранчо (нужен свободный слот; питомец под седлом нельзя). opts.fromNest — откуда он выходит. */
    placePet(uid, opts = {}) {
        const s = GameState.state;
        const pet = GameState.findPet(uid);
        if (!pet || s.riding === uid || s.ranchPets.includes(uid)) return false;
        if (s.ranchPets.length >= s.slots) { GameUI.toast(Lang.t('pets.full'), 'bad'); return false; }
        s.ranchPets.push(uid);
        GameState.markDirty();
        GameUI.sfx('place');
        this.syncPets({ from: opts.fromNest });
        Game.events.emit('pet:placed', { pet, uid });
        return true;
    },

    /** Снять питомца с ранчо (копилка выплачивается). */
    unplacePet(uid) {
        const s = GameState.state;
        const i = s.ranchPets.indexOf(uid);
        if (i < 0) return false;
        this.collect(uid);
        s.ranchPets.splice(i, 1);
        GameState.markDirty();
        this.syncPets();
        return true;
    },

    /** «Поставить лучших»: свободные слоты — самыми доходными питомцами, что ещё не на ранчо и не под седлом. */
    placeBest() {
        const s = GameState.state;
        const cand = s.pets.filter(p => p.uid !== s.riding && !s.ranchPets.includes(p.uid)).sort((a, b) => GameState.petIncome(b) - GameState.petIncome(a));
        let n = 0;
        while (s.ranchPets.length < s.slots && cand.length) { s.ranchPets.push(cand.shift().uid); n++; }
        if (n) { GameState.markDirty(); GameUI.sfx('place'); this.syncPets(); }
        return n;
    },

    /** Забрать деньги, накопленные над питомцем. Возвращает сумму. */
    collect(uid, silent) {
        const s = GameState.state;
        const amount = Math.floor(s.ranchBank[uid] || 0);
        if (amount < 1) return 0;
        s.ranchBank[uid] = (s.ranchBank[uid] || 0) - amount;
        GameState.addCash(amount, 'income');
        const rec = this.pets.find(r => r.uid === uid);
        if (rec) rec.cd = 0.6;
        if (rec && !silent) this._pop('+$' + GameUtil.fmt(amount), rec.x, rec.y, GameWorld.groundH(rec.x, rec.y) + rec.view.size.height + 40);
        if (rec) { const fx = this.app && this.app.fx; if (fx) { try { fx.play('cash-pop', [rec.x, GameWorld.groundH(rec.x, rec.y) + rec.view.size.height * 0.8, rec.y]); } catch (e) { /* без частиц */ } } }
        if (!silent && this.time - this._cashSnd > 0.1) { this._cashSnd = this.time; GameUI.sfx('cash', { volume: 0.6, detune: Math.min(0.5, amount / 1e4) }); }
        return amount;
    },
    collectAll() { let n = 0; for (const r of this.pets) n += this.collect(r.uid); return n; },

    // Всплывающий текст над миром («+$5»).
    _pop(text, x, y, h) {
        const bb = Billboard.add({ x, y, h, className: 'cpop', maxDist: 2600, html: '<span>' + GameUtil.esc(text) + '</span>' });
        this._pops.push({ bb, t: 0, h0: h });
        if (this._pops.length > 12) { const o = this._pops.shift(); o.bb.remove(); }
    },

    // =============================================================================================
    // Кадр
    // =============================================================================================
    update(dt) {
        this.time += dt;
        const P = typeof Player !== 'undefined' ? Player : null;
        if (!P || !this.player) return;
        const inside = this.player.inside(P.x, P.y);
        if (inside !== this.playerInside) { this.playerInside = inside; Game.events.emit(inside ? 'ranch:enter' : 'ranch:leave', {}); }
        if (this._banner) this._banner.cloth.rotation.y = Math.sin(this.time * 2.4) * 0.14;
        this._swayT2 = (this._swayT2 || 0) - dt;
        if (this._signs && this._swayT2 <= 0) { this._swayT2 = 1 / 30; this._swaySigns(1 / 30); }
        this._tickPets(dt, P);
        // всплывающие подписи
        for (const o of this._pops.slice()) {
            o.t += dt;
            o.bb.setPos(o.bb.x, o.bb.y, o.h0 + o.t * 90);
            if (o.t > 1.15) { o.bb.remove(); this._pops.splice(this._pops.indexOf(o), 1); }
        }
    },

    _tickPets(dt, P) {
        if (!this.pets.length) return;
        const s = GameState.state, cfg = ranchCfg();
        const plot = this.player, roam = this._roam(plot);
        this._incT -= dt;
        const refreshIncome = this._incT <= 0;
        if (refreshIncome) this._incT = 1;
        this._bbT -= dt;
        const refreshText = this._bbT <= 0;
        if (refreshText) this._bbT = 0.4;
        let bankMoved = false;
        // питомцы не наезжают друг на друга: пары ближе суммы «радиусов» мягко расталкиваются
        for (let i = 0; i < this.pets.length; i++) {
            for (let j = i + 1; j < this.pets.length; j++) {
                const a = this.pets[i], b = this.pets[j];
                const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
                const min = 0.3 * (a.view.size.length + b.view.size.length) + 40;
                if (d < min) { const k = (min - d) * Math.min(1, dt * 3) * 0.5 / d; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
            }
        }
        for (const rec of this.pets) {
            const pet = GameState.findPet(rec.uid);
            if (!pet) continue;
            const v = rec.view;
            // прогулка: идёт к цели, у цели стоит и отдыхает
            let k = 0;
            if (rec.wait > 0) rec.wait -= dt;
            else {
                const dx = rec.tx - rec.x, dy = rec.ty - rec.y, dist = Math.hypot(dx, dy);
                if (dist < 40) { rec.wait = 1.5 + Math.random() * 4.5; this._pickTarget(rec); }
                else {
                    const sp = 70 + 0.25 * Math.min(180, v.size.length);
                    rec.heading = GameUtil.dampAngle(rec.heading, Math.atan2(dy, dx), 4, dt);
                    const turn = Math.abs(GameUtil.angleDiff(rec.heading, Math.atan2(dy, dx)));
                    const f = turn > 0.9 ? 0.15 : 1;
                    const step = sp * f * dt;
                    rec.x += Math.cos(rec.heading) * Math.min(step, dist);
                    rec.y += Math.sin(rec.heading) * Math.min(step, dist);
                    k = 0.22 * f;
                }
            }
            // не выходим за зону прогулок
            const l = plot.toLocal(rec.x, rec.y);
            const cx = GameUtil.clamp(l.lx, roam.x0 - 60, roam.x1 + 60), cy = GameUtil.clamp(l.ly, roam.y0 - 60, roam.y1 + 60);
            if (cx !== l.lx || cy !== l.ly) { const w = plot.toWorld(cx, cy); rec.x = w.x; rec.y = w.y; }
            const gh = GameWorld.groundH(rec.x, rec.y);
            v.update(dt, k);
            v.place(rec.x, gh, rec.y, rec.heading, 0, 0);
            // доход копится над питомцем
            if (refreshIncome) rec.income = GameState.petIncome(pet);
            const add = rec.income * dt;
            s.ranchBank[rec.uid] = (s.ranchBank[rec.uid] || 0) + add;
            if (add > 0) bankMoved = true;
            rec.expAcc += dt * cfg.exp;
            if (rec.expAcc >= 10) { GameState.addPetExp(pet, Math.floor(rec.expAcc)); rec.expAcc -= Math.floor(rec.expAcc); }
            rec.bb.setPos(rec.x, rec.y, gh + v.size.height + 50);
            if (refreshText) {
                const txt = '<span class="r">' + GameUtil.esc(Lang.t('hatch.perSec', { v: GameUtil.fmtMoney(rec.income) })) + '</span><span class="a">' + GameUtil.esc(GameUtil.fmtMoney(Math.floor(s.ranchBank[rec.uid]))) + '</span>';
                if (txt !== rec.last) { rec.last = txt; rec.bb.setHtml(txt); }
            }
            // касание или проезд рядом — собрать деньги
            if (rec.cd > 0) rec.cd -= dt;
            if (!GameUI.blocking && rec.cd <= 0 && s.ranchBank[rec.uid] >= 1) {
                const rr = v.size.width * 0.5 + P.radius() + 90;
                const dxp = P.x - rec.x, dyp = P.y - rec.y;
                if (dxp * dxp + dyp * dyp < rr * rr && Math.abs(P.h - gh) < 420) this.collect(rec.uid);
            }
        }
        if (bankMoved) GameState.softDirty();
    },

    // =============================================================================================
    // Значки кнопок
    // =============================================================================================
    updateBadges() {
        if (typeof Eggs !== 'undefined') Eggs._updateBadge();
        GameUI.setBadge('pets', GameUI.isPanelOpen('pets') ? 0 : this._newPets);
    },

    // =============================================================================================
    // Панель «Яйца»
    // =============================================================================================
    openEggs() {
        if (GameUI.blocking) return;
        const E = GameUtil.el;
        let sig = '';
        /** @type {any[]} */
        let dyn = [];
        let body = null;
        const render = () => {
            const s = GameState.state;
            dyn = [];
            GameUtil.clear(body);
            const free = Eggs.freeNest();
            let used = 0;
            for (let i = 0; i < s.nests; i++) if (s.nestEggs[i]) used++;
            const grow = E('button', { class: 'gb', type: 'button', text: Lang.t('eggs.growAll') });
            if (!s.eggs.length || free < 0) { grow.classList.add('off'); grow.title = free < 0 ? Lang.t('eggs.noNest') : ''; }
            GameUI._press(grow, () => { if (!s.eggs.length || Eggs.freeNest() < 0) { GameUI.toast(Lang.t('eggs.noNest'), 'bad'); return; } Eggs.placeAll(); sig = ''; tick(); });
            body.appendChild(E('div', { class: 'pn-top' }, E('div', { class: 'sub', text: Lang.t('eggs.nestsFull', { a: used, b: s.nests }) }), grow));
            body.appendChild(E('div', { class: 'pn-sec', text: Lang.t('eggs.nests') }));
            for (let i = 0; i < s.nests; i++) {
                const e = s.nestEggs[i];
                if (!e) { body.appendChild(E('div', { class: 'row egrow' }, E('div', { class: 'grow' }, E('div', { class: 'sub', text: Lang.t('eggs.emptyNest') })))); continue; }
                const d = GameData.EGGS[e.type], st = GameData.nestState(e);
                const sub = E('div', { class: 'sub' }), bar = E('i'), barBox = E('div', { class: 'bar2' }, bar);
                const acts = E('div', { class: 'acts' });
                const row = E('div', { class: 'row egrow' }, E('div', { html: Eggs.iconHtml(e.type, 54) }),
                    E('div', { class: 'grow' }, E('div', { class: 'ttl', html: GameUtil.esc(GameData.eggName(e.type)) + this._tag(d) }), sub, barBox), acts);
                if (st.ready) {
                    barBox.style.display = 'none';
                    const b = E('button', { class: 'gb', type: 'button', text: Lang.t('eggs.hatch') });
                    GameUI._press(b, () => { Eggs.hatch(i); });
                    acts.appendChild(b);
                } else {
                    const b = E('button', { type: 'button' });
                    GameUI.rewardButton(b, { id: 'instant-hatch', cls: 'blue', label: Lang.t('eggs.instant'), onReward: () => { Eggs.instantHatch(i); GameState.saveNow(); sig = ''; tick(); } });
                    acts.appendChild(b);
                }
                dyn.push({ i, sub, bar });
                body.appendChild(row);
            }
            body.appendChild(E('div', { class: 'pn-sec', text: Lang.t('eggs.inv') }));
            if (!s.eggs.length) body.appendChild(E('div', { class: 'pn-empty', text: Lang.t('eggs.empty') }));
            for (const e of s.eggs.slice()) {
                const d = GameData.EGGS[e.type];
                const b = E('button', { class: 'gb', type: 'button', text: Lang.t('eggs.place') });
                if (free < 0) { b.classList.add('off'); b.title = Lang.t('eggs.noNest'); }
                GameUI._press(b, () => { if (!Eggs.place(e.uid)) { GameUI.toast(Lang.t('eggs.noNest'), 'bad'); return; } sig = ''; tick(); });
                body.appendChild(E('div', { class: 'row egrow' }, E('div', { html: Eggs.iconHtml(e.type, 54) }),
                    E('div', { class: 'grow' }, E('div', { class: 'ttl', html: GameUtil.esc(GameData.eggName(e.type)) + this._tag(d) }),
                        E('div', { class: 'sub', html: GameUI.icon('clover') + ' ' + GameUtil.esc(GameUtil.fmt(d.luck)) + ' · ' + GameUtil.esc(GameUtil.fmtKg(e.kg)) })),
                    E('div', { class: 'acts' }, b)));
            }
        };
        const tick = () => {
            if (!body || !GameUI.isPanelOpen('eggs')) return;
            const s = GameState.state;
            const nsig = s.nests + '|' + s.nestEggs.map(e => (e ? e.uid + (GameData.nestState(e).ready ? 'r' : 'i') : '-')).join(',') + '|' + s.eggs.map(e => e.uid).join(',') + '|' + Eggs.freeNest();
            if (nsig !== sig) { sig = nsig; render(); }
            for (const d of dyn) {
                const e = s.nestEggs[d.i];
                if (!e) continue;
                const st = GameData.nestState(e);
                d.sub.textContent = st.ready ? Lang.t('eggs.ready') + ' · ' + GameUtil.fmtKg(st.kg) : Lang.t('eggs.left', { t: GameUtil.fmtClock(st.left) }) + ' · ' + GameUtil.fmtKg(st.kg);
                d.bar.style.width = Math.round(st.frac * 100) + '%';
            }
        };
        GameUI.openPanel({
            id: 'eggs', title: Lang.t('eggs.title'),
            onClose: () => { clearInterval(this._panelTimer); },
            build: (el) => { body = el; tick(); this._panelTimer = window.setInterval(tick, 400); },
        });
    },

    // Подпись тира яйца: цветной «пилюлей».
    _tag(def) {
        const t = GameData.TIERS[def.tier];
        return '<span class="tag" style="background:' + t.color + '">' + GameUtil.esc(GameData.tierName(def.tier)) + '</span>';
    },

    // =============================================================================================
    // Панель «Питомцы»
    // =============================================================================================
    openPets() {
        if (GameUI.blocking) return;
        const E = GameUtil.el;
        let sig = '';
        /** @type {any[]} */
        let dyn = [];
        let body = null;
        const render = () => {
            const s = GameState.state;
            dyn = [];
            GameUtil.clear(body);
            const best = E('button', { class: 'gb', type: 'button', text: Lang.t('pets.placeBest') });
            GameUI._press(best, () => { if (!Ranch.placeBest()) GameUI.toast(Lang.t('pets.full'), 'bad'); sig = ''; tick(); });
            body.appendChild(E('div', { class: 'pn-top' }, E('div', { class: 'sub', text: Lang.t('pets.slots', { a: s.ranchPets.length, b: s.slots }) }), best));
            const list = s.pets.slice().sort((a, b) => {
                const ka = (a.uid === s.riding ? 2 : s.ranchPets.includes(a.uid) ? 1 : 0), kb = (b.uid === s.riding ? 2 : s.ranchPets.includes(b.uid) ? 1 : 0);
                return kb - ka || GameState.petIncome(b) - GameState.petIncome(a);
            });
            if (!list.length) body.appendChild(E('div', { class: 'pn-empty', text: Lang.t('pets.none') }));
            const grid = E('div', { class: 'pgrid' });
            for (const pet of list) {
                const d = GameData.PETS[pet.species], rar = GameData.RARITY[d.rarity];
                const placed = s.ranchPets.includes(pet.uid), equip = s.riding === pet.uid;
                const income = E('span'), exp = E('span');
                const bar = E('i');
                const bt = E('div', { class: 'bt' });
                if (equip) bt.appendChild(E('span', { class: 'riding', text: Lang.t('pets.riding') }));
                else {
                    const ride = E('button', { class: 'gb yellow', type: 'button', text: Lang.t('pets.ride') });
                    GameUI._press(ride, () => { GameUI.closePanel(); Player.ride(pet.uid); });
                    bt.appendChild(ride);
                    const pl = E('button', { class: 'gb ' + (placed ? 'red' : ''), type: 'button', text: Lang.t(placed ? 'pets.unplace' : 'pets.place') });
                    GameUI._press(pl, () => { if (placed) Ranch.unplacePet(pet.uid); else if (!Ranch.placePet(pet.uid)) return; sig = ''; tick(); });
                    bt.appendChild(pl);
                }
                const mn = E('div', { class: 'mn' },
                    E('div', { class: 'nm', text: GameData.petName(pet.species) }),
                    E('div', { class: 'ln' }, E('span', { html: GameUI.icon('banknote') }), income, E('span', { text: GameUtil.fmtKg(GameState.petKg(pet)) })),
                    E('div', { class: 'age' }, E('span', { text: Lang.t('pets.age', { n: pet.age }) + ' · ' }), exp, E('div', { class: 'bar2' }, bar)));
                if (pet.huge || pet.mutation) {
                    const tg = E('div', { class: 'tg' });
                    if (pet.huge) tg.appendChild(E('span', { class: 'huge', text: Lang.t('pets.huge') }));
                    if (pet.mutation) tg.appendChild(E('span', { class: 'mut', text: GameData.mutationName(pet.mutation), style: { background: GameData.MUTATIONS[pet.mutation].color } }));
                    mn.appendChild(tg);
                }
                mn.appendChild(bt);
                grid.appendChild(E('div', { class: 'pcard' + (equip ? ' equip' : placed ? ' placed' : '') },
                    E('div', { class: 'ic', style: { '--rc': rar.color }, html: GameUI.petIcon(pet.species, 70) }), mn));
                dyn.push({ pet, income, exp, bar });
            }
            body.appendChild(grid);
        };
        const tick = () => {
            if (!body || !GameUI.isPanelOpen('pets')) return;
            const s = GameState.state;
            const nsig = s.pets.map(p => p.uid + ':' + p.age + (p.mutation || '')).join(',') + '|' + s.ranchPets.join(',') + '|' + s.riding + '|' + s.slots;
            if (nsig !== sig) { sig = nsig; render(); }
            for (const d of dyn) {
                d.income.textContent = Lang.t('hatch.perSec', { v: GameUtil.fmtMoney(GameState.petIncome(d.pet)) });
                const need = GameData.need(d.pet.age);
                d.exp.textContent = Lang.t('pets.exp', { a: GameUtil.fmt(Math.floor(d.pet.exp)), b: GameUtil.fmt(need) });
                d.bar.style.width = Math.round(GameUtil.clamp(d.pet.exp / need, 0, 1) * 100) + '%';
            }
        };
        this._newPets = 0;
        GameUI.openPanel({
            id: 'pets', title: Lang.t('pets.title'), wide: true,
            onClose: () => { clearInterval(this._panelTimer); this.updateBadges(); },
            build: (el) => { body = el; tick(); this._panelTimer = window.setInterval(tick, 500); },
        });
        this.updateBadges();
    },

    // =============================================================================================
    // Простая панель улучшений ранчо (до магазина фазы 2): удача, гнёзда, слоты
    // =============================================================================================
    openUpgrades() {
        if (GameUI.blocking) return;
        const E = GameUtil.el;
        let body = null;
        const render = () => {
            const s = GameState.state;
            GameUtil.clear(body);
            const rows = [
                { id: 'luck', icon: 'upg-luck', desc: () => Lang.t('upg.luckDesc', { a: GameData.luckLevelMult(s.luckLevel), b: GameData.luckLevelMult(s.luckLevel + 1) }),
                    buy: () => { s.luckLevel++; } },
                { id: 'nests', icon: 'upg-nests', desc: () => Lang.t('upg.nestsDesc', { a: s.nests, b: s.nests + 1 }),
                    buy: () => { s.nests++; while (s.nestEggs.length < s.nests) s.nestEggs.push(null); Ranch.refreshNests(); Eggs.syncNests(); } },
                { id: 'slots', icon: 'upg-slots', desc: () => Lang.t('upg.slotsDesc', { a: s.slots, b: s.slots + 1 }),
                    buy: () => { s.slots++; } },
            ];
            for (const r of rows) {
                const cost = GameData.nextUpgradeCost(r.id, s);
                const btn = cost == null ? E('span', { class: 'mx', text: Lang.t('upg.max') }) : E('button', { class: 'gb', type: 'button', html: GameUI.icon('banknote') + '<span>' + GameUtil.esc(GameUtil.fmtMoney(cost)) + '</span>' });
                if (cost != null) {
                    if (!GameState.canAfford(cost)) btn.classList.add('off');
                    GameUI._press(btn, () => {
                        const c = GameData.nextUpgradeCost(r.id, s);
                        if (c == null || !GameState.spendCash(c)) { GameUI.toast(Lang.t('upg.noCash'), 'bad'); return; }
                        r.buy();
                        GameState.saveNow();
                        GameUI.sfx('buy');
                        render();
                    }, true);
                }
                body.appendChild(E('div', { class: 'row up-row' }, E('div', { html: GameUI.icon(r.icon), style: { fontSize: 'calc(var(--u)*40)' } }),
                    E('div', { class: 'grow' }, E('div', { class: 'ttl', text: Lang.t('upg.' + r.id) }), E('div', { class: 'sub', text: cost == null ? '' : r.desc() })), btn));
            }
        };
        const off = Game.events.on('cash', () => { if (body && GameUI.isPanelOpen('upgrades')) render(); });
        GameUI.openPanel({ id: 'upgrades', title: Lang.t('upg.title'), onClose: () => off(), build: (el) => { body = el; render(); } });
    },

    // =============================================================================================
    // Окно офлайн-дохода
    // =============================================================================================
    /** «С возвращением»: деньги за время отсутствия — «Забрать» или «×2 за рекламу» (награда offline-x2). */
    showOffline(amount, seconds) {
        if (this._offlineShown) return;
        this._offlineShown = true;
        const E = GameUtil.el;
        let claimed = false;
        GameUI.showModal({
            title: Lang.t('offline.title'), noEsc: true,
            build: (el, rec) => {
                const take = (mult) => {
                    if (claimed) return;
                    claimed = true;
                    const n = GameState.claimOffline(mult);
                    GameState.saveNow();
                    GameUI.sfx('cashBig');
                    GameUI.toast(Lang.t('offline.got', { n: GameUtil.fmt(n) }), 'good', 3600);
                    rec.finish(true);
                };
                const collect = E('button', { class: 'gb', type: 'button', text: Lang.t('offline.collect') });
                GameUI._press(collect, () => take(1));
                const x2 = E('button', { type: 'button' });
                GameUI.rewardButton(x2, { id: 'offline-x2', cls: 'blue', label: Lang.t('offline.x2'), onReward: () => take(2) });
                el.append(
                    E('div', { class: 'off-txt', text: Lang.t('offline.text', { t: GameUtil.fmtTime(seconds) }) }),
                    E('div', { class: 'off-amt otx', html: GameUI.icon('banknote') + '<span>' + GameUtil.esc(GameUtil.fmtMoney(amount)) + '</span>' }),
                    E('div', { class: 'off-btns' }, collect, x2));
            },
        });
    },
};

Game.register(Ranch);
