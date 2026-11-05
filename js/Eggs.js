// Eggs.js — яйца: вид (процедурные текстуры), волны появления, подбор, корзина, таймер разбивания, гнёзда, инкубация,
// рост веса, вылупление и окно результата, конец раунда (реклама, рекорд, статистика).
//
//   Eggs.live            яйца в мире: { uid, type, def, x, y, h, marker, age, view, bb, … }
//   Eggs.basket          яйца в корзине игрока: { uid, type, kg, mutation, timeLeft, total, rescued }
//   Eggs.nests           гнёзда ранчо = GameState.state.nestEggs ({ uid, type, kg, mutation, placedAt, growth, t } | null)
//   Eggs.spawn(type, markerOrPos, opts)   создать яйцо (маркер карты или { x, y, h? }); null — нет места / маркер занят
//   Eggs.extendBreak(uid, s)  Eggs.instantHatch(i)  Eggs.hatch(i)  Eggs.place(uid)  Eggs.placeAll()  Eggs.deliver()
//   Eggs.icon(type, size, opts) -> dataURL   Eggs.iconHtml(type, px)      нарисованная иконка яйца для интерфейса
//   Eggs.endRound(success, info)          раунд: Platform.ads.roundEnded() и Platform.submitScore ровно один раз на результат
//   Eggs.roundGuard = () => false         страж раундов (ставит Tutorial): пока он возвращает false, endRound ничего не считает
//                                         (false), а «Далее» в окне результата закрывает окно без interstitial; Eggs.roundsCount()
//   Eggs.syncNests()                     пересобрать виды яиц в гнёздах (после смены числа гнёзд)
// События (Game.events): egg:spawned {egg}, egg:picked {egg}, egg:broken {egg}, egg:delivered {egg, nest}, egg:ready {nest},
//   pet:hatched {pet, isNew, egg}, round:end {success, …}.
// Время — игровое (Game.update не идёт на паузе): таймеры корзины, инкубации и волн считаются по dt; ввод во время вылупления
// блокирует GameUI.lock, камеру ведёт Player.cine. Верх файла (рисунки яиц, Eggs.icon) не трогает DOM при загрузке скрипта.

// Числа Constants.js читаются через typeof с дефолтом (редактор патчит только литералы).
function eggCfg() {
    const U = 'undefined';
    return {
        wave: typeof EGG_WAVE_SECONDS !== U ? EGG_WAVE_SECONDS : 45,
        count: typeof EGG_WAVE_COUNT !== U ? EGG_WAVE_COUNT : 10,
        liveMax: typeof EGG_LIVE_MAX !== U ? EGG_LIVE_MAX : 40,
        life: typeof EGG_LIFETIME_SECONDS !== U ? EGG_LIFETIME_SECONDS : 360,
        warn: typeof EGG_WARN_SECONDS !== U ? EGG_WARN_SECONDS : 20,
        rescue: typeof EGG_RESCUE_SECONDS !== U ? EGG_RESCUE_SECONDS : 60,
        pickup: typeof EGG_PICKUP_RADIUS !== U ? EGG_PICKUP_RADIUS : 90,
    };
}

Lang.add({
    ru: {
        'egg.announce': 'Появилось: {name}!', 'egg.full': 'Корзина полна — несите яйца домой',
        'egg.picked': 'Подобрано: {name}. Несите на своё ранчо!', 'egg.willBreak': 'Яйцо скоро разобьётся!',
        'egg.rescue': '+{n} с за рекламу', 'egg.rescued': 'Яйцо спасено: ещё {n} с', 'egg.luck': 'Удача',
        'egg.delivered': 'Яиц в гнёздах: {n}', 'egg.stored': 'Яиц в инвентаре: {n}',
        'nest.hatch': 'Вылупить', 'nest.skip': 'Вылупить сразу (реклама)', 'nest.ready': 'Готово!', 'nest.left': 'Вылупится через {t}',
        'nest.readyToast': 'Яйцо готово — вылупите питомца!',
        'obj.carry': 'Отнеси яйцо на своё ранчо!', 'obj.hatch': 'Яйцо готово — вылупи питомца!',
        'obj.place': 'Положи яйцо в гнездо на ранчо', 'obj.find': 'Найди яйцо и отвези на ранчо',
        'hatch.title': 'Вылупился питомец!', 'hatch.new': 'НОВЫЙ!', 'hatch.chance': '1 из {n}', 'hatch.speed': 'Скорость', 'hatch.income': 'Доход',
        'hatch.weight': 'Вес', 'hatch.ride': 'Сесть', 'hatch.place': 'На ранчо', 'hatch.next': 'Далее', 'hatch.noSlot': 'Нет свободных слотов на ранчо',
        'hatch.paws': '+{n} лапок', 'hatch.perSec': '{v}/с', 'hatch.huge': 'ОГРОМНЫЙ',
        'broke.title': 'Яйцо разбилось', 'broke.text': 'Яйцо разбилось, не доехав до ранчо. В следующий раз спешите или спасите его рекламой!',
        'broke.next': 'Далее',
    },
    en: {
        'egg.announce': '{name} appeared!', 'egg.full': 'Basket is full - go home',
        'egg.picked': 'Picked up: {name}. Take it to your ranch!', 'egg.willBreak': 'Egg will break!',
        'egg.rescue': '+{n} s: watch ad', 'egg.rescued': 'Egg saved: {n} s more', 'egg.luck': 'Luck',
        'egg.delivered': 'Eggs in nests: {n}', 'egg.stored': 'Eggs in inventory: {n}',
        'nest.hatch': 'Hatch', 'nest.skip': 'Hatch now (watch ad)', 'nest.ready': 'Ready!', 'nest.left': 'Hatches in {t}',
        'nest.readyToast': 'Your egg is ready - hatch your pet!',
        'obj.carry': 'Take the egg to your ranch!', 'obj.hatch': 'Your egg is ready - hatch your pet!',
        'obj.place': 'Put the egg into a nest on your ranch', 'obj.find': 'Find an egg and ride home',
        'hatch.title': 'You hatched a pet!', 'hatch.new': 'NEW!', 'hatch.chance': '1 in {n}', 'hatch.speed': 'Speed', 'hatch.income': 'Income',
        'hatch.weight': 'Weight', 'hatch.ride': 'Ride', 'hatch.place': 'Place on ranch', 'hatch.next': 'Next', 'hatch.noSlot': 'No free ranch slots',
        'hatch.paws': '+{n} paws', 'hatch.perSec': '{v}/s', 'hatch.huge': 'HUGE',
        'broke.title': 'Egg broke', 'broke.text': 'The egg broke before you got it to the ranch. Hurry next time, or save it with an ad!',
        'broke.next': 'Next',
    },
});

// =================================================================================================
// Рисунки яиц: canvas 512×256, рисунок «оборачивается» по горизонтали (u вокруг яйца), v — от низа к верху.
// =================================================================================================
const EGG_TEX_W = 512, EGG_TEX_H = 256;
const EGG_TAU = Math.PI * 2;
/** Высота яйца и наибольший радиус, px (яйцо крупнее головы питомца-улитки, но меньше наездника). */
const EGG_H = 118, EGG_R = 49;

/** Помощники рисования. */
const EP = {
    /** Выполнить fn трижды со сдвигом по X: рисунок переходит через шов без разрыва. */
    wrap(g, fn) { for (const dx of [-EGG_TEX_W, 0, EGG_TEX_W]) { g.save(); g.translate(dx, 0); fn(); g.restore(); } },
    dot(g, x, y, r, fill, alpha) { g.globalAlpha = alpha == null ? 1 : alpha; g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, EGG_TAU); g.fill(); g.globalAlpha = 1; },
    ell(g, x, y, rx, ry, rot, fill, stroke, lw) {
        g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, EGG_TAU);
        if (fill) { g.fillStyle = fill; g.fill(); }
        if (stroke) { g.lineWidth = lw || 3; g.strokeStyle = stroke; g.stroke(); }
    },
    vgrad(g, stops) {
        const gr = g.createLinearGradient(0, 0, 0, EGG_TEX_H);
        for (const s of stops) gr.addColorStop(s[0], s[1]);
        g.fillStyle = gr; g.fillRect(0, 0, EGG_TEX_W, EGG_TEX_H);
    },
    /** Четырёхлучевая блестка. */
    star(g, x, y, r, fill) {
        g.fillStyle = fill; g.beginPath();
        g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r);
        g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill();
    },
    /** Ломаные зубчатой трещины с ответвлениями: массив массивов точек [x, y]. */
    crackLines(rnd, x0, y0, ang, len, depth = 0) {
        const out = [], pts = [[x0, y0]];
        let x = x0, y = y0, a = ang;
        for (let d = 0; d < len; d += 15) {
            a += (rnd() - 0.5) * 1.15;
            x += Math.cos(a) * 15; y += Math.sin(a) * 15;
            pts.push([x, y, a]);
        }
        out.push(pts);
        if (depth < 2) for (let i = 2; i < pts.length; i++) {
            if (rnd() < 0.24) out.push(...EP.crackLines(rnd, pts[i][0], pts[i][1], pts[i][2] + (rnd() < 0.5 ? -1 : 1) * (0.65 + rnd() * 0.6), len * 0.38, depth + 1));
        }
        return out;
    },
    strokeLines(g, lines, lw, color) {
        g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
        EP.wrap(g, () => { for (const pts of lines) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); } });
    },
    /** Грани-«кристаллы»: сетка треугольников с дрожанием узлов, цвет граней — hsl. Рисунок оборачивается. */
    facets(g, rnd, cols, rows, hue, hueVar, sat, lMin, lMax, stroke, lw) {
        const cw = EGG_TEX_W / cols, ch = EGG_TEX_H / rows;
        const jx = [], jy = [];
        for (let r = 0; r <= rows; r++) {
            jx[r] = []; jy[r] = [];
            for (let c = 0; c < cols; c++) { jx[r][c] = (rnd() - 0.5) * cw * 0.7; jy[r][c] = r === 0 || r === rows ? 0 : (rnd() - 0.5) * ch * 0.7; }
        }
        const P = (r, c) => [c * cw + jx[r][c % cols], r * ch + jy[r][c % cols]];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const a = P(r, c), b = P(r, c + 1), d = P(r + 1, c), e = P(r + 1, c + 1);
                const tris = (r + c) % 2 ? [[a, b, d], [b, e, d]] : [[a, b, e], [a, e, d]];
                for (const t of tris) {
                    // света у граней сверху больше: рисунок читается как блик с левого верхнего угла
                    const lit = lMin + (lMax - lMin) * (0.35 * (1 - r / rows) + 0.65 * rnd());
                    g.fillStyle = 'hsl(' + (hue + (rnd() - 0.5) * hueVar).toFixed(0) + ',' + sat + '%,' + lit.toFixed(0) + '%)';
                    g.beginPath(); g.moveTo(t[0][0], t[0][1]); g.lineTo(t[1][0], t[1][1]); g.lineTo(t[2][0], t[2][1]); g.closePath(); g.fill();
                    if (stroke) { g.lineWidth = lw || 2; g.strokeStyle = stroke; g.lineJoin = 'round'; g.stroke(); }
                }
            }
        }
        // дублируем крайний столбец через шов: нарисованное справа продолжает левый край
        g.drawImage(g.canvas, 0, 0, 2, EGG_TEX_H, EGG_TEX_W - 2, 0, 2, EGG_TEX_H);
    },
};

/**
 * Вид каждого яйца: base — основной цвет (запас под рисунок и цвет иконки), gloss — блик, alpha — прозрачность материала,
 * emit — самосвечение 0..1, facets — гранёная геометрия, paint(g, rnd) — рисунок на фоне base.
 * iconU — центр «лица» яйца в иконке (доля ширины текстуры, по умолчанию 0.5).
 * @type {Record<string, { base: string, gloss?: number, alpha?: number, emit?: number, facets?: boolean, iconU?: number, paint: (g: CanvasRenderingContext2D, rnd: () => number) => void }>}
 */
const EGG_LOOKS = {
    white: { base: '#fbf6e8', gloss: 0.25, paint(g, rnd) {
        EP.vgrad(g, [[0, '#ffffff'], [0.6, '#fbf6e8'], [1, '#e9e0c8']]);
        for (let i = 0; i < 34; i++) EP.dot(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 1 + rnd() * 2.4, '#e2d8bc', 0.55);
    } },
    brown: { base: '#b8764a', gloss: 0.2, paint(g, rnd) {
        EP.vgrad(g, [[0, '#c98a5c'], [1, '#a2623a']]);
        EP.wrap(g, () => { for (let i = 0; i < 9; i++) EP.ell(g, (i * 71 + 20) % EGG_TEX_W, (i * 53 + 30) % EGG_TEX_H, 40, 24, 0.4, 'rgba(235,170,120,.30)'); });
        for (let i = 0; i < 90; i++) { const x = rnd() * EGG_TEX_W, y = rnd() * EGG_TEX_H, r = 1.6 + rnd() * 5; EP.wrap(g, () => EP.ell(g, x, y, r * 1.3, r, rnd() * 3, '#6a3a1e')); }
        for (let i = 0; i < 40; i++) EP.dot(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 1 + rnd() * 2.6, '#ecc093', 0.9);
    } },
    cracked: { base: '#eadfc4', gloss: 0.15, paint(g, rnd) {
        EP.vgrad(g, [[0, '#f4ebd2'], [1, '#d9ccac']]);
        for (let i = 0; i < 26; i++) EP.dot(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 1 + rnd() * 2.5, '#c9bb98', 0.6);
        const lines = [];
        for (let k = 0; k < 4; k++) lines.push(...EP.crackLines(rnd, k * 128 + 20 + rnd() * 70, 6 + rnd() * 30, 1.25 + (rnd() - 0.5) * 0.6, 150 + rnd() * 70));
        EP.strokeLines(g, lines, 9, 'rgba(60,44,30,.25)');
        EP.strokeLines(g, lines, 4.5, '#2d2018');
    } },
    easter: { base: '#ffd6e0', gloss: 0.3, paint(g, rnd) {
        const cols = ['#ffb3c7', '#fff0a0', '#a8e6cf', '#a8d4ff', '#d7b8ff', '#ffc9a0', '#ffb3c7', '#fff0a0'];
        g.fillStyle = cols[0]; g.fillRect(0, 0, EGG_TEX_W, EGG_TEX_H);
        const bh = EGG_TEX_H / 6;
        for (let i = 1; i < 7; i++) {
            g.fillStyle = cols[i];
            g.beginPath(); g.moveTo(0, EGG_TEX_H);
            for (let x = 0; x <= EGG_TEX_W; x += 16) g.lineTo(x, i * bh - 14 + ((x / 16) % 2 ? 10 : -10) + (i === 1 ? 0 : 0));
            g.lineTo(EGG_TEX_W, EGG_TEX_H); g.closePath(); g.fill();
            g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 3; g.beginPath();
            for (let x = 0; x <= EGG_TEX_W; x += 16) { const y = i * bh - 14 + ((x / 16) % 2 ? 10 : -10) + 9; if (x) g.lineTo(x, y); else g.moveTo(x, y); }
            g.stroke();
        }
        for (let i = 0; i < 70; i++) EP.dot(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 2 + rnd() * 2.4, 'rgba(255,255,255,.7)');
    } },
    stone: { base: '#8d949c', gloss: 0.05, paint(g, rnd) {
        EP.vgrad(g, [[0, '#a0a7af'], [1, '#7b838b']]);
        for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(70,76,84,.20)'; g.fillRect(0, i * 58 + rnd() * 20, EGG_TEX_W, 9 + rnd() * 14); }
        for (let i = 0; i < 520; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(60,66,72,.38)' : 'rgba(205,212,220,.34)'; g.fillRect(rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 2 + rnd() * 7, 2 + rnd() * 5); }
        for (let i = 0; i < 7; i++) { const x = rnd() * EGG_TEX_W, y = rnd() * EGG_TEX_H; EP.wrap(g, () => EP.ell(g, x, y, 14 + rnd() * 16, 8 + rnd() * 8, rnd() * 3, 'rgba(112,152,96,.40)')); }
        const lines = [];
        for (let k = 0; k < 3; k++) lines.push(...EP.crackLines(rnd, rnd() * EGG_TEX_W, rnd() * 80, 1.4, 90 + rnd() * 50));
        EP.strokeLines(g, lines, 3, '#4d545b');
    } },
    leaf: { base: '#4fb946', gloss: 0.2, paint(g, rnd) {
        EP.vgrad(g, [[0, '#6fd35a'], [1, '#349a3a']]);
        EP.wrap(g, () => {
            for (let k = 0; k < 4; k++) {
                const cx = EGG_TEX_W * (k + 0.5) / 4;
                g.lineCap = 'round';
                /** @type {[string, number, number][]} */
                const veins = [['#1f7a2c', 7, 0], ['#a6ef86', 3, -3]];
                for (const [col, w, off] of veins) {
                    g.strokeStyle = col; g.lineWidth = w;
                    g.beginPath(); g.moveTo(cx + off, EGG_TEX_H * 0.96); g.lineTo(cx + off, EGG_TEX_H * 0.06); g.stroke();
                    for (let y = 40; y < EGG_TEX_H * 0.9; y += 26) {
                        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + off, y + 10); g.lineTo(cx + off + s * 40, y - 22); g.stroke(); }
                    }
                }
            }
        });
        for (let i = 0; i < 30; i++) EP.dot(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 2 + rnd() * 4, '#c8ff9e', 0.35);
    } },
    mushroom: { base: '#df3a30', gloss: 0.3, paint(g, rnd) {
        EP.vgrad(g, [[0, '#f2564a'], [0.8, '#d93228'], [1, '#c02a22']]);
        for (let i = 0; i < 15; i++) { const x = rnd() * EGG_TEX_W, y = 20 + rnd() * 170, r = 10 + rnd() * 20; EP.wrap(g, () => EP.ell(g, x, y, r * 1.1, r, rnd() * 3, '#fff7ea')); }
        for (let i = 0; i < 24; i++) EP.dot(g, rnd() * EGG_TEX_W, 20 + rnd() * 170, 3 + rnd() * 5, '#fff7ea');
        g.fillStyle = '#f6e7c8'; g.beginPath(); g.moveTo(0, EGG_TEX_H);
        for (let x = 0; x <= EGG_TEX_W; x += 32) g.lineTo(x, EGG_TEX_H * 0.8 + ((x / 32) % 2 ? 14 : -2));
        g.lineTo(EGG_TEX_W, EGG_TEX_H); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(180,140,90,.5)'; g.lineWidth = 3;
        for (let x = 6; x < EGG_TEX_W; x += 22) { g.beginPath(); g.moveTo(x, EGG_TEX_H * 0.9); g.lineTo(x, EGG_TEX_H); g.stroke(); }
    } },
    flower: { base: '#ff9ccb', gloss: 0.25, paint(g, rnd) {
        EP.vgrad(g, [[0, '#ffb3d8'], [1, '#f77fb8']]);
        EP.wrap(g, () => {
            for (let k = 0; k < 4; k++) {
                const cx = EGG_TEX_W * (k + 0.5) / 4, cy = EGG_TEX_H * 0.5;
                for (let p = 0; p < 8; p++) {
                    const a = p / 8 * EGG_TAU;
                    EP.ell(g, cx + Math.cos(a) * 36, cy + Math.sin(a) * 36, 26, 13, a, '#fff3fa', '#d94b8e', 3);
                }
                EP.dot(g, cx, cy, 17, '#ffd21f'); EP.ell(g, cx, cy, 17, 17, 0, null, '#b8860b', 3);
                for (let d = 0; d < 5; d++) EP.dot(g, cx + Math.cos(d * 1.26) * 7, cy + Math.sin(d * 1.26) * 7, 2.2, '#b8860b');
            }
            for (let k = 0; k < 4; k++) { const lx = EGG_TEX_W * k / 4; EP.ell(g, lx, EGG_TEX_H * 0.9, 16, 7, 0.5, '#63c85a', '#2f8a34', 2.5); EP.ell(g, lx, EGG_TEX_H * 0.1, 14, 6, -0.5, '#63c85a', '#2f8a34', 2.5); }
        });
    } },
    slime: { base: '#69df4e', gloss: 0.9, alpha: 0.9, paint(g, rnd) {
        EP.vgrad(g, [[0, '#8cf46c'], [1, '#4ec63a']]);
        g.fillStyle = '#3fae35';
        for (let i = 0; i < 9; i++) {
            const x = i * 57 + 20 + rnd() * 20, w = 16 + rnd() * 14, len = 60 + rnd() * 90;
            EP.wrap(g, () => { g.beginPath(); g.moveTo(x - w, 0); g.lineTo(x - w, len); g.arc(x, len, w, Math.PI, 0, true); g.lineTo(x + w, 0); g.closePath(); g.fill(); EP.ell(g, x - w * 0.35, len * 0.55, 3.5, len * 0.35, 0, '#b6ff9a'); });
        }
        for (let i = 0; i < 18; i++) { const x = rnd() * EGG_TEX_W, y = rnd() * EGG_TEX_H, r = 4 + rnd() * 9; EP.dot(g, x, y, r, 'rgba(210,255,190,.55)'); EP.dot(g, x - r * 0.3, y - r * 0.3, r * 0.3, '#ffffff'); }
    } },
    ice: { base: '#bfe6ff', gloss: 0.7, facets: true, paint(g, rnd) {
        EP.facets(g, rnd, 10, 6, 200, 18, 80, 70, 93, 'rgba(255,255,255,.7)', 2.5);
        for (let i = 0; i < 40; i++) EP.dot(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 1 + rnd() * 2, '#ffffff', 0.9);
    } },
    glass: { base: '#cdeaff', gloss: 1, alpha: 0.5, paint(g, rnd) {
        EP.vgrad(g, [[0, '#e9f7ff'], [0.5, '#bfe2fb'], [1, '#a2cdee']]);
        EP.wrap(g, () => {
            for (let k = 0; k < 4; k++) {
                const x = EGG_TEX_W * (k + 0.3) / 4;
                g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 9; g.lineCap = 'round';
                g.beginPath(); g.moveTo(x, 40); g.quadraticCurveTo(x - 22, 100, x - 8, 180); g.stroke();
                g.lineWidth = 4; g.beginPath(); g.moveTo(x + 26, 60); g.lineTo(x + 18, 110); g.stroke();
            }
        });
        for (let i = 0; i < 22; i++) { const x = rnd() * EGG_TEX_W, y = rnd() * EGG_TEX_H, r = 3 + rnd() * 6; EP.ell(g, x, y, r, r, 0, 'rgba(255,255,255,.35)', 'rgba(255,255,255,.9)', 2); }
    } },
    golden: { base: '#f5b81f', gloss: 1, emit: 0.18, paint(g, rnd) {
        EP.vgrad(g, [[0, '#ffe27a'], [0.45, '#f5b81f'], [1, '#c88410']]);
        EP.wrap(g, () => { for (let k = 0; k < 8; k++) { const x = EGG_TEX_W * k / 8; const gr = g.createLinearGradient(x, 0, x + 64, 0); gr.addColorStop(0, 'rgba(255,255,230,0)'); gr.addColorStop(0.5, 'rgba(255,250,200,.42)'); gr.addColorStop(1, 'rgba(255,255,230,0)'); g.fillStyle = gr; g.fillRect(x, 0, 64, EGG_TEX_H); } });
        for (const y of [EGG_TEX_H * 0.33, EGG_TEX_H * 0.67]) {
            g.strokeStyle = '#a8690a'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, y); g.lineTo(EGG_TEX_W, y); g.stroke();
            for (let x = 16; x < EGG_TEX_W; x += 32) EP.dot(g, x, y, 5.5, '#ffe58a', 1);
        }
        for (let i = 0; i < 16; i++) EP.star(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 6 + rnd() * 9, '#fffbe0');
    } },
    diamond: { base: '#6ee8f0', gloss: 1, emit: 0.1, facets: true, paint(g, rnd) {
        EP.facets(g, rnd, 8, 6, 187, 16, 82, 52, 88, 'rgba(255,255,255,.85)', 3);
        for (let i = 0; i < 14; i++) EP.star(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 7 + rnd() * 9, '#ffffff');
    } },
    crystal: { base: '#9a5cf0', gloss: 1, emit: 0.1, facets: true, paint(g, rnd) {
        EP.facets(g, rnd, 7, 5, 270, 22, 74, 42, 78, 'rgba(235,215,255,.85)', 3);
        for (let i = 0; i < 12; i++) EP.star(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 6 + rnd() * 8, '#f4e8ff');
    } },
    skull: { base: '#efe5ca', gloss: 0.15, iconU: 0.25, paint(g, rnd) {
        EP.vgrad(g, [[0, '#f6eed6'], [1, '#d8cba6']]);
        for (let i = 0; i < 30; i++) EP.dot(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 1 + rnd() * 2.5, '#bfb08a', 0.6);
        for (const cx of [EGG_TEX_W * 0.25, EGG_TEX_W * 0.75]) {
            const cy = EGG_TEX_H * 0.46, ink = '#241a12';
            EP.ell(g, cx, cy - 8, 58, 52, 0, '#fffaf0', ink, 6);
            g.fillStyle = '#fffaf0'; g.strokeStyle = ink; g.lineWidth = 6;
            g.beginPath(); g.rect(cx - 30, cy + 34, 60, 34); g.fill(); g.stroke();
            g.lineWidth = 4; for (let t = -2; t <= 2; t++) { g.beginPath(); g.moveTo(cx + t * 12, cy + 36); g.lineTo(cx + t * 12, cy + 66); g.stroke(); }
            for (const s of [-1, 1]) { EP.ell(g, cx + s * 24, cy - 6, 17, 21, 0, ink); EP.dot(g, cx + s * 24, cy - 3, 4, '#e8392f', 0.9); }
            g.fillStyle = ink; g.beginPath(); g.moveTo(cx, cy + 10); g.lineTo(cx - 9, cy + 28); g.lineTo(cx + 9, cy + 28); g.closePath(); g.fill();
            g.strokeStyle = '#8c7d5a'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 40, cy - 40); g.lineTo(cx - 26, cy - 24); g.lineTo(cx - 32, cy - 12); g.stroke();
        }
    } },
    asteroid: { base: '#4a4046', gloss: 0.1, paint(g, rnd) {
        EP.vgrad(g, [[0, '#5a4f56'], [1, '#3a3238']]);
        for (let i = 0; i < 420; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(25,20,24,.4)' : 'rgba(150,135,145,.28)'; g.fillRect(rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 2 + rnd() * 6, 2 + rnd() * 5); }
        for (let i = 0; i < 15; i++) {
            const x = rnd() * EGG_TEX_W, y = 18 + rnd() * 220, r = 9 + rnd() * 24;
            EP.wrap(g, () => { EP.ell(g, x, y, r, r * 0.82, 0, '#2c252a', '#7a6e76', 3); EP.ell(g, x + r * 0.18, y + r * 0.12, r * 0.64, r * 0.5, 0, '#211b20'); });
        }
        for (let i = 0; i < 10; i++) EP.dot(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 2 + rnd() * 3, '#f0b45a');
    } },
    flaming: { base: '#ff8a1e', gloss: 0.3, emit: 0.4, paint(g, rnd) {
        EP.vgrad(g, [[0, '#ffb42a'], [0.55, '#ff7a18'], [1, '#e8392f']]);
        const tongue = (x, w, hgt, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(x - w, EGG_TEX_H); g.bezierCurveTo(x - w, EGG_TEX_H - hgt * 0.5, x + w * 0.3, EGG_TEX_H - hgt * 0.6, x, EGG_TEX_H - hgt); g.bezierCurveTo(x + w * 1.2, EGG_TEX_H - hgt * 0.5, x + w, EGG_TEX_H - hgt * 0.2, x + w, EGG_TEX_H); g.closePath(); g.fill(); };
        EP.wrap(g, () => {
            for (let i = 0; i < 9; i++) tongue(i * 57 + 10, 34, 170 + (i * 37) % 70, '#e8392f');
            for (let i = 0; i < 9; i++) tongue(i * 57 + 24, 26, 120 + (i * 53) % 60, '#ff8a1e');
            for (let i = 0; i < 9; i++) tongue(i * 57 + 34, 15, 70 + (i * 29) % 40, '#ffe14a');
        });
        for (let i = 0; i < 24; i++) EP.dot(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H * 0.7, 1.5 + rnd() * 2.5, '#fff2a0', 0.9);
    } },
    soul: { base: '#2a1646', gloss: 0.4, emit: 0.5, paint(g, rnd) {
        EP.vgrad(g, [[0, '#3a1f60'], [1, '#150a28']]);
        g.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
            const x = i * 64 + rnd() * 30, y = 30 + rnd() * 180, a = 40 + rnd() * 40;
            EP.wrap(g, () => {
                g.shadowColor = '#c9a0ff'; g.shadowBlur = 16;
                g.strokeStyle = 'rgba(214,176,255,.65)'; g.lineWidth = 7 + rnd() * 4;
                g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + a, y - 40, x - a, y - 90, x + a * 0.6, y - 130); g.stroke();
                g.shadowBlur = 0;
            });
        }
        for (let i = 0; i < 20; i++) { const x = rnd() * EGG_TEX_W, y = rnd() * EGG_TEX_H, r = 2 + rnd() * 5; EP.wrap(g, () => { g.shadowColor = '#e8d0ff'; g.shadowBlur = 12; EP.dot(g, x, y, r, '#f2e4ff'); g.shadowBlur = 0; }); }
    } },
    aurora: { base: '#7be8d0', gloss: 0.6, emit: 0.45, paint(g, rnd) {
        EP.vgrad(g, [[0, '#ff7ad9'], [0.45, '#9a8cff'], [1, '#2ff0c8']]);
        for (let b = 0; b < 5; b++) {
            g.fillStyle = 'rgba(255,255,255,' + (0.16 + b * 0.03).toFixed(2) + ')';
            g.beginPath(); g.moveTo(0, EGG_TEX_H);
            for (let x = 0; x <= EGG_TEX_W; x += 8) g.lineTo(x, 40 + b * 38 + Math.sin(x / EGG_TEX_W * EGG_TAU * (2 + b % 2) + b) * 22);
            for (let x = EGG_TEX_W; x >= 0; x -= 8) g.lineTo(x, 62 + b * 38 + Math.sin(x / EGG_TEX_W * EGG_TAU * (2 + b % 2) + b) * 22);
            g.closePath(); g.fill();
        }
        for (let i = 0; i < 40; i++) EP.dot(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 1 + rnd() * 1.6, '#ffffff', 0.9);
    } },
    galaxy: { base: '#0b1040', gloss: 0.5, emit: 0.55, paint(g, rnd) {
        EP.vgrad(g, [[0, '#101858'], [1, '#070a2a']]);
        /** @type {[string, number][]} */
        const clouds = [['122,60,255', 7], ['255,79,160', 5], ['58,122,255', 6]];
        for (const [col, n] of clouds) {
            for (let i = 0; i < n; i++) {
                const x = rnd() * EGG_TEX_W, y = rnd() * EGG_TEX_H, r = 40 + rnd() * 70;
                EP.wrap(g, () => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(' + col + ',.55)'); gr.addColorStop(1, 'rgba(' + col + ',0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); });
            }
        }
        for (let i = 0; i < 170; i++) EP.dot(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 0.8 + rnd() * 1.4, '#ffffff', 0.5 + rnd() * 0.5);
        for (let i = 0; i < 18; i++) EP.star(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 5 + rnd() * 8, '#ffffff');
    } },
    blackhole: { base: '#09050f', gloss: 0.4, emit: 0.5, iconU: 0.25, paint(g, rnd) {
        EP.vgrad(g, [[0, '#120a1e'], [1, '#05030a']]);
        for (let i = 0; i < 80; i++) EP.dot(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 0.7 + rnd() * 1.2, '#cdb6ff', 0.4 + rnd() * 0.5);
        for (const cx of [EGG_TEX_W * 0.25, EGG_TEX_W * 0.75]) {
            const cy = EGG_TEX_H * 0.5;
            for (let i = 0; i < 7; i++) {
                const k = i / 6;
                g.save(); g.shadowColor = '#a24dff'; g.shadowBlur = 14;
                EP.ell(g, cx, cy, 100 - k * 56, 40 - k * 20, -0.35, null, 'hsla(' + (280 - k * 60).toFixed(0) + ',90%,' + (45 + k * 25).toFixed(0) + '%,' + (0.9 - k * 0.2).toFixed(2) + ')', 8 - k * 4);
                g.restore();
            }
            EP.ell(g, cx, cy, 26, 24, 0, '#000000', '#e6d0ff', 3);
        }
    } },
    solaris: { base: '#ffb81a', gloss: 0.8, emit: 0.5, iconU: 0.25, paint(g, rnd) {
        EP.vgrad(g, [[0, '#ffd84a'], [1, '#f09a14']]);
        for (const cx of [EGG_TEX_W * 0.25, EGG_TEX_W * 0.75]) {
            const cy = EGG_TEX_H * 0.5;
            for (let i = 0; i < 24; i++) {
                const a = i / 24 * EGG_TAU, long = i % 2 ? 78 : 112;
                g.fillStyle = i % 2 ? '#ff9a1a' : '#fff0a0';
                g.beginPath(); g.moveTo(cx + Math.cos(a - 0.1) * 40, cy + Math.sin(a - 0.1) * 40); g.lineTo(cx + Math.cos(a) * long, cy + Math.sin(a) * long); g.lineTo(cx + Math.cos(a + 0.1) * 40, cy + Math.sin(a + 0.1) * 40); g.closePath(); g.fill();
            }
            EP.dot(g, cx, cy, 42, '#fff6b8'); EP.ell(g, cx, cy, 42, 42, 0, null, '#e8890c', 4); EP.dot(g, cx - 10, cy - 10, 12, '#ffffff', 0.8);
        }
    } },
    volcanic: { base: '#1b1215', gloss: 0.2, emit: 0.45, paint(g, rnd) {
        EP.vgrad(g, [[0, '#2a1d21'], [1, '#120c0e']]);
        for (let i = 0; i < 360; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(70,52,56,.45)' : 'rgba(0,0,0,.35)'; g.fillRect(rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 2 + rnd() * 6, 2 + rnd() * 5); }
        const lines = [];
        for (let k = 0; k < 5; k++) lines.push(...EP.crackLines(rnd, k * 102 + rnd() * 60, rnd() * 50, 1.3 + (rnd() - 0.5) * 0.5, 170 + rnd() * 70));
        g.save(); g.shadowColor = '#ffa028'; g.shadowBlur = 16;
        EP.strokeLines(g, lines, 8, '#ff5a1a');
        g.restore();
        EP.strokeLines(g, lines, 3, '#ffe08a');
        for (let i = 0; i < 24; i++) EP.dot(g, rnd() * EGG_TEX_W, rnd() * EGG_TEX_H, 1.4 + rnd() * 2.4, '#ff8a2a', 0.85);
    } },
};

/** UI-only ImageGen files. EGG_LOOKS and the 3D textures remain procedural. */
/** @type {Record<string, string>} */
const EGG_ICON_FILES = {
    white: 'assets/ui/eggs/white.webp',
    brown: 'assets/ui/eggs/brown.webp',
    cracked: 'assets/ui/eggs/cracked.webp',
    easter: 'assets/ui/eggs/easter.webp',
    stone: 'assets/ui/eggs/stone.webp',
    leaf: 'assets/ui/eggs/leaf.webp',
    mushroom: 'assets/ui/eggs/mushroom.webp',
    flower: 'assets/ui/eggs/flower.webp',
    slime: 'assets/ui/eggs/slime.webp',
    ice: 'assets/ui/eggs/ice.webp',
    glass: 'assets/ui/eggs/glass.webp',
    golden: 'assets/ui/eggs/golden.webp',
    diamond: 'assets/ui/eggs/diamond.webp',
    crystal: 'assets/ui/eggs/crystal.webp',
    skull: 'assets/ui/eggs/skull.webp',
    asteroid: 'assets/ui/eggs/asteroid.webp',
    flaming: 'assets/ui/eggs/flaming.webp',
    soul: 'assets/ui/eggs/soul.webp',
    aurora: 'assets/ui/eggs/aurora.webp',
    galaxy: 'assets/ui/eggs/galaxy.webp',
    blackhole: 'assets/ui/eggs/blackhole.webp',
    solaris: 'assets/ui/eggs/solaris.webp',
    volcanic: 'assets/ui/eggs/volcanic.webp',
};
const EGG_CRACK_FILE = 'assets/ui/eggs/crack.webp';

/** Кэш рисунков и иконок. */
const EggArt = {
    /** @type {Map<string, HTMLCanvasElement>} */
    canvases: new Map(),
    /** @type {Map<string, string>} */
    icons: new Map(),

    /** @type {Map<string, Promise<HTMLImageElement | null>>} */
    fileImages: new Map(),
    /** @type {Map<string, { url: string }>} */
    crackedIcons: new Map(),
    loadIconFile(src) {
        if (!this.fileImages.has(src)) {
            this.fileImages.set(src, new Promise(resolve => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = src;
            }));
        }
        return this.fileImages.get(src);
    },
    crackedIcon(type, size) {
        const key = type + '|' + size;
        if (this.crackedIcons.has(key)) return this.crackedIcons.get(key).url;
        const entry = { url: this.canvasIcon(type, size, { cracked: true }) };
        this.crackedIcons.set(key, entry);
        Promise.all([this.loadIconFile(EGG_ICON_FILES[type]), this.loadIconFile(EGG_CRACK_FILE)]).then(([egg, crack]) => {
            if (!egg || !crack) return; // Keep the original canvas if either file is unavailable.
            const cv = document.createElement('canvas');
            cv.width = cv.height = size;
            const g = cv.getContext('2d');
            g.drawImage(egg, 0, 0, size, size);
            g.globalCompositeOperation = 'source-atop';
            g.drawImage(crack, 0, 0, size, size);
            const previous = entry.url;
            entry.url = cv.toDataURL('image/png');
            for (const img of document.querySelectorAll('img')) {
                if (img.getAttribute('src') === previous) img.src = entry.url;
            }
        });
        return entry.url;
    },
    look(type) { return EGG_LOOKS[type] || EGG_LOOKS.white; },

    /** Холст с рисунком яйца (кэшируется). stage 1..3 — трещины вылупления поверх рисунка (отдельный холст). */
    canvas(type, stage = 0) {
        const key = type + '|' + stage;
        let cv = this.canvases.get(key);
        if (cv) return cv;
        cv = document.createElement('canvas');
        cv.width = EGG_TEX_W; cv.height = EGG_TEX_H;
        const g = cv.getContext('2d');
        const look = this.look(type);
        g.fillStyle = look.base; g.fillRect(0, 0, EGG_TEX_W, EGG_TEX_H);
        if (stage > 0) g.drawImage(this.canvas(type, 0), 0, 0);
        else look.paint(g, GameUtil.rng('egg-' + type));
        if (stage > 0) this.cracks(g, type, stage);
        this.canvases.set(key, cv);
        return cv;
    },

    /** Трещины вылупления: чем больше stage, тем их больше и тем ярче свет изнутри. */
    cracks(g, type, stage) {
        const rnd = GameUtil.rng('crack-' + type);
        const lines = [];
        const n = 2 + stage * 2;
        for (let k = 0; k < n; k++) lines.push(...EP.crackLines(rnd, (k + rnd() * 0.6) * EGG_TEX_W / n, 10 + rnd() * 60, 1.3 + (rnd() - 0.5) * 0.5, 100 + stage * 36 + rnd() * 50));
        g.save();
        if (stage >= 2) { g.shadowColor = '#fff6a0'; g.shadowBlur = 14 + stage * 3; EP.strokeLines(g, lines, 3 + stage * 2, '#fff2a8'); }
        g.restore();
        EP.strokeLines(g, lines, 2 + stage, '#1c1008');
    },

    /** Путь яйца в прямоугольнике (для иконок): острый верх, широкий низ. */
    path(g, cx, top, w, h) {
        g.beginPath();
        g.moveTo(cx, top);
        g.bezierCurveTo(cx + w * 0.32, top, cx + w * 0.5, top + h * 0.28, cx + w * 0.5, top + h * 0.62);
        g.bezierCurveTo(cx + w * 0.5, top + h * 0.88, cx + w * 0.3, top + h, cx, top + h);
        g.bezierCurveTo(cx - w * 0.3, top + h, cx - w * 0.5, top + h * 0.88, cx - w * 0.5, top + h * 0.62);
        g.bezierCurveTo(cx - w * 0.5, top + h * 0.28, cx - w * 0.32, top, cx, top);
        g.closePath();
    },

    /**
     * Иконка яйца для интерфейса: dataURL PNG с прозрачным фоном (тот же рисунок, что и на 3D-яйце).
     * @param {string} type
     * @param {number} [size]
     * @param {{ cracked?: boolean }} [opts]
     */
    icon(type, size = 96, opts = {}) {
        if (typeof document === 'undefined') return '';
        const src = EGG_ICON_FILES[type];
        if (src && opts.cracked && typeof Image === 'function') return this.crackedIcon(type, size);
        if (src && !opts.cracked) return GameUI.artUrl(src, () => this.canvasIcon(type, size, opts));
        return this.canvasIcon(type, size, opts);
    },
    /** Original procedural icon, retained as the missing-file fallback. */
    canvasIcon(type, size = 96, opts = {}) {
        if (typeof document === 'undefined') return '';
        const key = type + '|' + size + '|' + (opts.cracked ? 1 : 0);
        const hit = this.icons.get(key);
        if (hit) return hit;
        const look = this.look(type);
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const g = cv.getContext('2d');
        const w = size * 0.8, h = size * 0.95, cx = size / 2, top = size * 0.025;
        g.save();
        this.path(g, cx, top, w, h);
        g.clip();
        g.globalAlpha = look.alpha && look.alpha < 0.9 ? 0.85 : 1;
        // средняя половина текстуры (180° вокруг яйца) — «лицо» яйца
        const u0 = (look.iconU || 0.5) - 0.25;
        const src = this.canvas(type, 0);
        if (u0 >= 0) g.drawImage(src, EGG_TEX_W * u0, 0, EGG_TEX_W * 0.5, EGG_TEX_H, cx - w / 2, top, w, h);
        else {   // полоса переходит через шов текстуры
            const a = -u0 * EGG_TEX_W;
            g.drawImage(src, EGG_TEX_W - a, 0, a, EGG_TEX_H, cx - w / 2, top, w * a / (EGG_TEX_W * 0.5), h);
            g.drawImage(src, 0, 0, EGG_TEX_W * 0.5 - a, EGG_TEX_H, cx - w / 2 + w * a / (EGG_TEX_W * 0.5), top, w * (1 - a / (EGG_TEX_W * 0.5)), h);
        }
        g.globalAlpha = 1;
        // объём: тень снизу справа и блик слева сверху
        const sh = g.createRadialGradient(cx - w * 0.2, top + h * 0.3, w * 0.1, cx, top + h * 0.55, h * 0.7);
        sh.addColorStop(0, 'rgba(255,255,255,0.26)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.30)');
        g.fillStyle = sh; g.fillRect(0, 0, size, size);
        if (opts.cracked) {
            g.strokeStyle = '#1c1008'; g.lineWidth = Math.max(2, size * 0.04); g.lineJoin = 'round'; g.lineCap = 'round';
            g.beginPath(); g.moveTo(cx - w * 0.55, top + h * 0.46);
            for (let i = 1; i <= 8; i++) g.lineTo(cx - w * 0.55 + (w * 1.1) * i / 8, top + h * (0.46 + (i % 2 ? -0.08 : 0.08)));
            g.stroke();
        }
        g.restore();
        this.path(g, cx, top, w, h);
        g.lineWidth = Math.max(2, size * 0.05); g.lineJoin = 'round'; g.strokeStyle = '#17110c'; g.stroke();
        if (!opts.cracked) {
            g.fillStyle = 'rgba(255,255,255,0.7)';
            g.beginPath(); g.ellipse(cx - w * 0.22, top + h * 0.26, w * 0.07, h * 0.12, 0.5, 0, EGG_TAU); g.fill();
        }
        const url = cv.toDataURL('image/png');
        this.icons.set(key, url);
        return url;
    },
};

/** Масштаб яйца по тиру: редкие крупнее. */
const EGG_TIER_SCALE = { common: 1, rare: 1.05, epic: 1.1, legendary: 1.18, mythic: 1.25, divine: 1.32, ethereal: 1.4 };

// =================================================================================================
// 3D-вид яйца
// =================================================================================================
/** @type {WeakMap<object, { smooth: any, flat: any }>} */
const EGG_MASTERS = new WeakMap();

/** Мастер-меш яйца (гладкий или гранёный) на сцену: вращением профиля; копии делает clone(). */
function eggMaster(scene, flat) {
    let rec = EGG_MASTERS.get(scene);
    if (!rec) { rec = { smooth: null, flat: null }; EGG_MASTERS.set(scene, rec); }
    const key = flat ? 'flat' : 'smooth';
    if (rec[key]) return rec[key];
    const n = flat ? 8 : 16;
    const shape = [];
    for (let i = 0; i <= n; i++) {
        const th = Math.PI * i / n, c = Math.cos(th), s = Math.sin(th);
        shape.push(new BABYLON.Vector3(EGG_R * s * (1 + 0.14 * c), (1 - c) * 0.5 * EGG_H, 0));
    }
    const mesh = BABYLON.MeshBuilder.CreateLathe('egg-master-' + key, { shape, tessellation: flat ? 8 : 20, sideOrientation: BABYLON.Mesh.FRONTSIDE }, scene);
    if (flat) mesh.convertToFlatShadedMesh();
    mesh.setEnabled(false);
    mesh.isPickable = false;
    rec[key] = mesh;
    return mesh;
}

/** @type {WeakMap<object, Map<string, BABYLON.StandardMaterial>>} */
const EGG_MATS = new WeakMap();

/** Материал яйца типа type на сцене (рисунок — DynamicTexture, общий на все яйца типа). stage > 0 — отдельный с трещинами. */
function eggMaterial(scene, type, stage = 0) {
    let map = EGG_MATS.get(scene);
    if (!map) { map = new Map(); EGG_MATS.set(scene, map); }
    const key = type + '|' + stage;
    const hit = map.get(key);
    if (hit && stage === 0) return hit;
    const look = EggArt.look(type);
    const tex = new BABYLON.DynamicTexture('egg-tex-' + key, { width: EGG_TEX_W, height: EGG_TEX_H }, scene, true);
    tex.getContext().drawImage(EggArt.canvas(type, stage), 0, 0);
    tex.update();
    tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    tex.anisotropicFilteringLevel = 4;
    const mat = new BABYLON.StandardMaterial('egg-' + key, scene);
    mat.diffuseTexture = tex;
    mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
    mat.specularColor = new BABYLON.Color3(0, 0, 0);
    // Самосвечение: яйцо — добыча, оно не должно темнеть в тени toon-ступеней; светящиеся виды — ярче (emit)
    const em = Math.min(0.75, 0.3 + (look.emit || 0) * 0.6);
    mat.emissiveColor = new BABYLON.Color3(em, em, em);
    if (look.alpha && look.alpha < 1) { mat.alpha = look.alpha; mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND; mat.backFaceCulling = true; }
    mat.metadata = { eggType: type, eggStage: stage, ownTexture: stage > 0, toonGroup: 'actor' };
    World3D.applyMaterialConstants(mat);
    if (stage === 0) map.set(key, mat);
    return mat;
}

/**
 * Материал мутировавшего яйца: отдельный StandardMaterial, делящий ГОТОВУЮ текстуру материала base. Нельзя клонировать
 * материал: clone() создаёт новую DynamicTexture без рисунка, и яйцо рисуется чёрным.
 * @param {BABYLON.Scene} scene @param {BABYLON.StandardMaterial} base
 */
function eggMutMaterial(scene, base) {
    const c = new BABYLON.StandardMaterial('egg-mut', scene);
    c.diffuseTexture = base.diffuseTexture;
    c.diffuseColor = base.diffuseColor.clone();
    c.specularColor = base.specularColor.clone();
    c.emissiveColor = base.emissiveColor.clone();
    if (base.alpha < 1) { c.alpha = base.alpha; c.transparencyMode = base.transparencyMode; c.backFaceCulling = base.backFaceCulling; }
    c.metadata = Object.assign({}, base.metadata, { mut: true, ownTexture: false });
    World3D.applyMaterialConstants(c);
    return c;
}

/** Цвет подсветки мутации id (0..1): из вида мутации питомцев (MutationFX.LOOK), иначе из GameData.MUTATIONS. null — нет такой. */
function eggMutationColor(id) {
    const L = typeof MutationFX !== 'undefined' ? MutationFX.LOOK[id] : null;
    if (L) return new BABYLON.Color3(L.c[0], L.c[1], L.c[2]);
    const m = GameData.MUTATIONS[id];
    return m ? BABYLON.Color3.FromHexString(m.color) : null;
}

/** Общая мягкая «капля света» для свечения под яйцом (на сцену). */
const EGG_GLOW_TEX = new WeakMap();
function eggGlowTexture(scene) {
    let tex = EGG_GLOW_TEX.get(scene);
    if (tex) return tex;
    tex = new BABYLON.DynamicTexture('egg-glow-tex', 128, scene, false);
    const g = tex.getContext();
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.clearRect(0, 0, 128, 128); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    tex.update();
    tex.hasAlpha = true;
    EGG_GLOW_TEX.set(scene, tex);
    return tex;
}

/** Вид яйца: корень в основании (ноль — на земле), меш с текстурой, трещины, свечение и луч у редких. */
class EggView {
    /**
     * @param {BABYLON.Scene} scene
     * @param {string} type
     * @param {{ glow?: boolean, scale?: number, mutation?: string | null }} [opts]
     */
    constructor(scene, type, opts = {}) {
        this.scene = scene;
        this.type = GameData.EGGS[type] ? type : 'white';
        this.def = GameData.EGGS[this.type];
        this.look = EggArt.look(this.type);
        this.disposed = false;
        this.time = Math.random() * 20;
        this.spin = Math.random() * 6;
        this.wobble = 0;           // амплитуда качания (рад), вызывается вылуплением и готовностью
        this.wobbleRate = 8;
        this.bob = 0;              // амплитуда подпрыгивания, px
        this.idleSpin = 0.7;       // скорость вращения в покое, рад/с
        this.stage = 0;
        /** @type {BABYLON.StandardMaterial | null} */
        this.crackMat = null;
        /** Материал мутации (делит текстуру с материалом типа яйца). @type {BABYLON.StandardMaterial | null} */
        this._mutMat = null;
        this.mutation = null;
        this.scale = opts.scale || EGG_TIER_SCALE[this.def.tier] || 1;
        this.root = new BABYLON.TransformNode('egg:' + this.type, scene);
        const master = eggMaster(scene, !!this.look.facets);
        this.mesh = /** @type {BABYLON.Mesh} */ (master.clone('egg-mesh'));
        this.mesh.setEnabled(true);
        this.mesh.material = eggMaterial(scene, this.type, 0);
        this.mesh.parent = this.root;
        this.mesh.scaling.setAll(this.scale);
        this.mesh.isPickable = false;
        const view = Game.app && Game.app.location ? Game.app.location.view : null;
        if (view) World3D.addObject(view, this.mesh, 'actor', { ink: false });
        this.view = view;
        /** @type {BABYLON.Mesh | null} */
        this.glow = null;
        /** @type {BABYLON.Mesh | null} */
        this.beam = null;
        if (opts.glow !== false && GameData.TIERS[this.def.tier].rank >= GameData.TIERS.legendary.rank) this._buildGlow();
        if (opts.mutation) this.setMutation(opts.mutation);
    }

    get height() { return EGG_H * this.scale; }

    // Свечение на земле и световой луч — только легендарным и выше (аддитивные, без теней и контура).
    _buildGlow() {
        const scene = this.scene, tier = GameData.TIERS[this.def.tier];
        const col = BABYLON.Color3.FromHexString(tier.color);
        const gm = new BABYLON.StandardMaterial('egg-glow-mat', scene);
        gm.diffuseTexture = eggGlowTexture(scene);
        gm.useAlphaFromDiffuseTexture = true;
        gm.emissiveColor = col; gm.diffuseColor = new BABYLON.Color3(0, 0, 0); gm.specularColor = new BABYLON.Color3(0, 0, 0);
        gm.disableLighting = true; gm.alphaMode = BABYLON.Engine.ALPHA_ADD; gm.disableDepthWrite = true; gm.zOffset = -4;
        gm.backFaceCulling = false;
        gm.metadata = { toon: false };
        const disc = BABYLON.MeshBuilder.CreateDisc('egg-glow', { radius: 150 * this.scale, tessellation: 24 }, scene);
        disc.rotation.x = Math.PI / 2;
        disc.position.y = 5;
        disc.material = gm; disc.parent = this.root; disc.isPickable = false;
        this.glow = disc;
        const bm = new BABYLON.StandardMaterial('egg-beam-mat', scene);
        bm.emissiveColor = col; bm.diffuseColor = new BABYLON.Color3(0, 0, 0); bm.specularColor = new BABYLON.Color3(0, 0, 0);
        bm.disableLighting = true; bm.alphaMode = BABYLON.Engine.ALPHA_ADD; bm.disableDepthWrite = true; bm.backFaceCulling = false;
        bm.metadata = { toon: false };
        const H = 900;
        const beam = BABYLON.MeshBuilder.CreateCylinder('egg-beam', { height: H, diameterTop: 40, diameterBottom: 90 * this.scale, tessellation: 12, subdivisions: 1, cap: BABYLON.Mesh.NO_CAP }, scene);
        const n = beam.getTotalVertices();
        const colors = new Float32Array(n * 4), pos = beam.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        for (let i = 0; i < n; i++) { const t = (pos[i * 3 + 1] + H / 2) / H; colors[i * 4] = colors[i * 4 + 1] = colors[i * 4 + 2] = 1; colors[i * 4 + 3] = 0.42 * (1 - t) * (1 - t); }
        beam.setVerticesData(BABYLON.VertexBuffer.ColorKind, colors);
        beam.hasVertexAlpha = true;
        beam.material = bm; beam.parent = this.root; beam.position.y = H / 2 - 4; beam.isPickable = false;
        this.beam = beam;
    }

    /**
     * Мутация: цветной свет изнутри (id из GameData.MUTATIONS, null — снять). Материал мутировавшего яйца — НЕ clone() общего:
     * клон DynamicTexture создаётся пустым и не получает рисунок (яйцо рисовалось чёрным). Свой StandardMaterial делит ту же
     * готовую текстуру, что и материал типа яйца; на яйце с трещинами подсвечивается материал трещин.
     * @param {string | null} id
     */
    setMutation(id) {
        this.mutation = id && GameData.MUTATIONS[id] ? id : null;
        const base = eggMaterial(this.scene, this.type, 0);
        if (!this.mutation) {
            if (this._mutMat) { this._mutMat.dispose(false, false); this._mutMat = null; }   // текстура общая — не освобождается
            if (this.crackMat) this.crackMat.emissiveColor.copyFrom(base.emissiveColor);
            else this.mesh.material = base;
            return;
        }
        if (!this.crackMat) {
            if (!this._mutMat) this._mutMat = eggMutMaterial(this.scene, base);
            this.mesh.material = this._mutMat;
        }
        this._tint(/** @type {BABYLON.StandardMaterial} */ (this.mesh.material), base);
    }

    /** Подсветка мутации на материале mat: свечение типа яйца + цвет мутации. */
    _tint(mat, base) {
        const c = eggMutationColor(/** @type {string} */ (this.mutation));
        if (!mat || !c) return;
        mat.emissiveColor.copyFromFloats(Math.min(1, base.emissiveColor.r + c.r * 0.32), Math.min(1, base.emissiveColor.g + c.g * 0.32), Math.min(1, base.emissiveColor.b + c.b * 0.32));
    }

    /** Трещины вылупления 0..3: на яйцо кладётся отдельная текстура. */
    setCrack(stage) {
        stage = Math.max(0, Math.min(3, stage | 0));
        if (stage === this.stage) return;
        this.stage = stage;
        if (this.crackMat) { const t = this.crackMat.diffuseTexture; this.crackMat.dispose(false, false); if (t) t.dispose(); this.crackMat = null; }
        if (stage === 0) { this.setMutation(this.mutation); return; }   // общий материал типа или материал мутации
        this.crackMat = eggMaterial(this.scene, this.type, stage);
        if (this.mutation) this._tint(this.crackMat, eggMaterial(this.scene, this.type, 0));
        this.mesh.material = this.crackMat;
    }

    /** Поставить яйцо: x, y — карта, h — высота основания над уровнем мира. */
    place(x, h, y) { this.root.position.set(x, h, y); this.baseH = h; }

    setEnabled(on) { this.root.setEnabled(on); }

    /** Кадр: вращение, качание, подпрыгивание. */
    update(dt) {
        if (this.disposed) return;
        this.time += dt;
        this.spin += dt * this.idleSpin;
        this.root.rotation.y = this.spin;
        const w = this.wobble;
        this.mesh.rotation.z = w ? Math.sin(this.time * this.wobbleRate) * w : 0;
        this.mesh.rotation.x = w ? Math.cos(this.time * this.wobbleRate * 0.83) * w * 0.7 : 0;
        const b = this.bob ? Math.sin(this.time * 2.2) * this.bob : 0;
        this.root.position.y = (this.baseH || 0) + b;
        if (this.glow) {
            const m = /** @type {BABYLON.StandardMaterial} */ (this.glow.material);
            m.alpha = 0.55 + 0.25 * Math.sin(this.time * 2.6);
        }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        if (this.view) World3D.removeObject(this.view, this.mesh); else this.mesh.dispose(false, false);
        if (this.glow) { const m = this.glow.material; this.glow.dispose(false, false); if (m) m.dispose(false, false); }
        if (this.beam) { const m = this.beam.material; this.beam.dispose(false, false); if (m) m.dispose(false, false); }
        if (this.crackMat) { const t = this.crackMat.diffuseTexture; this.crackMat.dispose(false, false); if (t) t.dispose(); this.crackMat = null; }
        if (this._mutMat) { this._mutMat.dispose(false, false); this._mutMat = null; }
        this.root.dispose(false, false);
    }
}

// =================================================================================================
// Модуль Eggs
// =================================================================================================
const EGG_CSS = `
.egg-bb{margin-top:calc(var(--u)*50);font-size:calc(var(--u)*23);display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1)}
.egg-bb .nm{font-size:.62em;line-height:1}
.egg-bb .lk{display:flex;align-items:center;gap:calc(var(--u)*3)}
.egg-bb .lk .ico{width:1.05em;height:1.05em}
.nest-bb{font-size:calc(var(--u)*19);display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*2)}
.nest-bb .rd{font-size:1.18em;color:#9cff7a;animation:warnblink .6s ease-in-out infinite alternate}
.nest-bb .tm{font-size:.9em;color:#ffe9a8}
.res{display:flex;align-items:center;justify-content:center;gap:calc(var(--u)*22);flex-wrap:wrap;padding:calc(var(--u)*4) 0 calc(var(--u)*12)}
.res-ico{--rc:#c8d0d8;position:relative;width:calc(var(--u)*150);height:calc(var(--u)*150);border-radius:50%;display:flex;align-items:center;justify-content:center;
 background:radial-gradient(circle at 50% 38%,#fffbea,#ffeeb8 62%,#f0cf86);border:calc(var(--u)*6) solid var(--rc);box-shadow:0 0 calc(var(--u)*24) var(--rc),inset 0 0 0 calc(var(--u)*3) #1c0f06,0 0 0 calc(var(--u)*3) #1c0f06;flex:none}
.res-ico .pi{width:86%;height:86%}
.res-ico.rar-secret{border-color:transparent;background:linear-gradient(#fffbea,#ffeeb8) padding-box,conic-gradient(#ff4f7a,#ffc53a,#6fe07a,#4aa8ff,#b46cff,#ff4f7a) border-box;animation:rainbow 3s linear infinite}
@keyframes rainbow{to{filter:hue-rotate(360deg)}}
.res-new{position:absolute;right:calc(var(--u)*-14);top:calc(var(--u)*-8);padding:calc(var(--u)*3) calc(var(--u)*9);border-radius:calc(var(--u)*10);background:linear-gradient(#ff7a6a,#e8392f);border:calc(var(--u)*3) solid #120904;font-size:calc(var(--u)*20);transform:rotate(12deg);-webkit-text-stroke:calc(var(--u)*4) #3a0a06;paint-order:stroke fill;animation:signpop .5s cubic-bezier(.2,1.8,.4,1)}
.res-info{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*4);min-width:calc(var(--u)*190);text-align:center}
.res-name{font-size:calc(var(--u)*36);font-weight:900;line-height:1.05;color:#fff}
.res-rar{font-size:calc(var(--u)*19);font-weight:900}
.res-stats{display:flex;flex-direction:column;gap:calc(var(--u)*3);align-items:center;font-size:calc(var(--u)*21);font-weight:900;margin-top:calc(var(--u)*4)}
.res-stats .st{display:flex;align-items:center;gap:calc(var(--u)*6)}
.res-stats .ico{width:calc(var(--u)*26);height:calc(var(--u)*26)}
.res-mut{padding:calc(var(--u)*2) calc(var(--u)*10);border-radius:999px;border:calc(var(--u)*3) solid #120904;font-size:calc(var(--u)*16);font-weight:900;background:#4a3a2a}
.res-huge{padding:calc(var(--u)*2) calc(var(--u)*14);border-radius:999px;border:calc(var(--u)*3) solid #120904;font-size:calc(var(--u)*19);font-weight:900;line-height:1.2;color:#fff;background:linear-gradient(#ffb23d,#e8392f);-webkit-text-stroke:calc(var(--u)*3.5) #120904;paint-order:stroke fill;letter-spacing:.04em;margin-top:calc(var(--u)*2)}
#game-ui.short .res-huge{font-size:calc(var(--u)*15)}
.res-paws{font-size:calc(var(--u)*16);color:#7a5a38;font-weight:800;display:flex;align-items:center;gap:calc(var(--u)*4)}
.res-paws .ico{width:calc(var(--u)*20);height:calc(var(--u)*20)}
.res-btns{display:flex;gap:calc(var(--u)*12);justify-content:center;flex-wrap:wrap;margin-top:calc(var(--u)*4)}
.res-btns .gb{font-size:calc(var(--u)*22);padding:calc(var(--u)*10) calc(var(--u)*22)}
.res-text{text-align:center;font-size:calc(var(--u)*19);padding:calc(var(--u)*2) calc(var(--u)*8) calc(var(--u)*12);max-width:calc(var(--u)*420);color:#5b3417}
#game-ui.short .res-ico{width:calc(var(--u)*118);height:calc(var(--u)*118)}
#game-ui.short .res-name{font-size:calc(var(--u)*29)}
#game-ui.short .res-stats{font-size:calc(var(--u)*18)}
`;

/** Безопасное целое для рекордов платформы. */
function eggSafeScore(n) {
    n = Number(n);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n));
}

/** @satisfies {Record<string, any>} */
const Eggs = {
    id: 'eggs',
    /** Яйца в мире. @type {any[]} */
    live: [],
    /** Яйца в корзине игрока. @type {any[]} */
    basket: [],
    get nests() { return GameState.state.nestEggs; },
    /** Модуль готов (после ready()): без этого update ничего не делает. */
    active: false,
    /** @type {LoryApp | null} */
    app: null,
    /** @type {BABYLON.Scene | null} */
    scene: null,
    time: 0,
    waveT: 6,
    waveNo: 0,
    /** Видимость карты маркеров яиц: [{ name, zone, x, y, h }]. @type {any[]} */
    markers: [],
    /** Яйца в гнёздах: виды и подписи по номеру гнезда. @type {any[]} */
    nestViews: [],
    /** Гнёзда с зарегистрированной зоной Interact. @type {Record<number, boolean>} */
    _zones: {},
    /** Идёт вылупление: { i, egg, pet, … } или null. @type {any} */
    hatching: null,
    /** Очередь окон результата. @type {any[]} */
    _results: [],
    /** @type {any} */
    _resultModal: null,
    /** uid яиц, для которых раунд уже учтён. @type {string[]} */
    _ended: [],
    /** Страж раундов: функция, возвращающая false, пока результаты не считаются (обучение; см. roundsCount). @type {(() => boolean) | null} */
    roundGuard: null,
    _lastTick: -1,
    _fullToastAt: -10,
    _hudT: 0,
    _fxT: 0,
    _wasInside: false,
    /** @type {any} */
    _rescueBtn: null,
    /** @type {any} */
    _rescueHandle: null,
    _offlineApplied: false,
    /** uid яиц в гнёздах, о готовности которых уже сообщено. @type {Set<string>} */
    _readySeen: new Set(),
    _nestT: 0,
    newPetsSession: 0,

    // =============================================================================================
    // Модуль
    // =============================================================================================
    init(app) {
        this.app = app;
        this.scene = app.location ? app.location.view.scene : null;
        GameUI.addCss('eggs', EGG_CSS);
        this._registerFx();
        // кнопка «+60 с за рекламу» под корзиной
        const btn = GameUtil.el('button', { type: 'button', class: 'gb green small' });
        this._rescueBtn = btn;
        this._rescueHandle = GameUI.rewardButton(btn, {
            id: 'egg-rescue', cls: 'green small', label: Lang.t('egg.rescue', { n: eggCfg().rescue }),
            onReward: () => this._rescueReward(),
        });
        // метки появления яиц: egg-<зона>, egg-<зона>-N
        this.markers = [];
        if (app.location) {
            for (const d of app.location.markers()) {
                const m = /^egg-([a-z]+)(?:-\d+)?$/.exec(String(d.name));
                if (m) this.markers.push({ name: d.name, zone: m[1], x: Number(d.x), y: Number(d.y), h: Number(d.h) || 0 });
            }
        }
        Game.events.on('daynight', (e) => { if (e && e.night === false) this._despawnNightEggs(); });
    },

    /** Состояние загружено/сброшено: чистим корзину и виды, пересобираем гнёзда. */
    onLoad(state) {
        this.basket.length = 0;
        if (this.hatching) this._abortHatch();
        this._results.length = 0;
        for (const e of this.live.slice()) this._removeLive(e, 'reset', true);
        this.waveT = 6;
        this.waveNo = 0;
        // яйца в гнёздах растут и пока игры нет: офлайн-время засчитывается как доход (OFFLINE_RATE), один раз после загрузки
        if (!this._offlineApplied && GameState.offline && GameState.offline.seconds >= 60) {
            const rate = typeof OFFLINE_RATE !== 'undefined' ? OFFLINE_RATE : 0.5;
            const cap = typeof OFFLINE_MAX_SECONDS !== 'undefined' ? OFFLINE_MAX_SECONDS : 7200;
            const add = Math.min(cap, GameState.offline.seconds) * rate;
            for (const e of state.nestEggs) if (e) { e.t += add; e.growth = GameData.nestState(e).growth; }
            GameState.markDirty();
        }
        this._offlineApplied = true;
        this._readySeen.clear();
        for (const e of state.nestEggs) if (e && e.t >= GameData.EGGS[e.type].hatch) this._readySeen.add(e.uid);
        this.syncNests();
        this._updateBadge();
    },

    ready() { this.active = true; this._hudT = 0; },

    // =============================================================================================
    // Частицы
    // =============================================================================================
    _registerFx() {
        const fx = this.app && this.app.fx;
        if (!fx) return;
        const up = [[-0.6, 0.5, -0.6], [0.6, 1.4, 0.6]];
        fx.register('egg-pickup', [
            { burst: 26, capacity: 40, life: [0.35, 0.85], size: [5, 12], speed: [70, 190], color: '#fff6a8', color2: '#9fffb0', gravity: [0, 70, 0], direction: up },
            { burst: 6, capacity: 8, life: [0.2, 0.4], size: [60, 100], speed: [0, 4], color: '#ffffff', sizeGradient: [[0, 0.3], [0.4, 1], [1, 0]] },
        ]);
        fx.register('egg-break', [
            { burst: 30, capacity: 40, life: [0.5, 1.1], size: [6, 15], speed: [90, 260], color: '#f3e2b8', blend: 'standard', gravity: [0, -420, 0], direction: [[-1, 0.2, -1], [1, 1.3, 1]] },
            { delay: 0.02, burst: 12, capacity: 16, life: [0.8, 1.6], size: [18, 40], speed: [10, 40], color: '#d8c9a8', blend: 'standard', gravity: [0, 18, 0], direction: [[-0.4, 0.2, -0.4], [0.4, 1, 0.4]], sizeGradient: [[0, 0.4], [1, 1.8]] },
        ]);
        fx.register('egg-crack', [{ burst: 14, capacity: 20, life: [0.3, 0.7], size: [4, 9], speed: [60, 150], color: '#fff1b0', gravity: [0, -220, 0] }]);
        fx.register('hatch-flare', [
            { burst: 10, capacity: 14, life: [0.3, 0.7], size: [120, 220], speed: [0, 6], color: '#ffffff', sizeGradient: [[0, 0.4], [0.35, 1], [1, 0]] },
            { burst: 70, capacity: 90, life: [0.5, 1.3], size: [6, 15], speed: [140, 380], color: '#fff4a0', color2: '#8ff0ff', gravity: [0, -120, 0] },
            { delay: 0.04, burst: 24, capacity: 30, life: [0.7, 1.4], size: [14, 32], speed: [30, 90], color: '#f3e2b8', blend: 'standard', gravity: [0, -300, 0], direction: [[-1, 0.3, -1], [1, 1, 1]] },
        ]);
        const confetti = (color, delay) => ({ delay, burst: 24, capacity: 30, life: [1.1, 2.3], size: [6, 12], speed: [170, 440], color, blend: 'standard', gravity: [0, -430, 0], direction: [[-0.8, 0.9, -0.8], [0.8, 1.7, 0.8]], spin: [-4, 4] });
        fx.register('confetti', [confetti('#ff4f7a', 0), confetti('#ffd21f', 0.03), confetti('#43c431', 0.06), confetti('#3d9cf0', 0.09), confetti('#b46cff', 0.12)]);
        fx.register('cash-pop', [{ burst: 12, capacity: 16, life: [0.3, 0.7], size: [4, 9], speed: [50, 130], color: '#8dff6a', color2: '#fff6a8', gravity: [0, 90, 0], direction: up }]);
        fx.register('egg-sparkle', [{ rate: 10, capacity: 30, life: [0.9, 1.7], size: [4, 9], speed: [8, 36], color: '#fff6c8', box: [[-34, 10, -34], [34, 110, 34]], direction: [[-0.3, 0.6, -0.3], [0.3, 1, 0.3]], sizeGradient: [[0, 0.3], [0.4, 1], [1, 0]] }]);
    },
    _fx(name, x, h, y, overrides) {
        const fx = this.app && this.app.fx;
        if (!fx) return null;
        try { return fx.play(name, [x, h, y], overrides); } catch (e) { return null; }
    },

    // =============================================================================================
    // Яйца в мире
    // =============================================================================================
    /** Яйцо типа type в точке маркера карты или { x, y, h? }. Возвращает запись или null (нет места, маркер занят). */
    spawn(type, markerOrPos, opts = {}) {
        const def = GameData.EGGS[type];
        if (!def || !markerOrPos || !this.scene) return null;
        const cfg = eggCfg();
        if (!opts.force && this.live.length >= cfg.liveMax) return null;
        const name = markerOrPos.name ? String(markerOrPos.name) : null;
        if (name && this.live.some(e => e.marker === name)) return null;
        const x = Number(markerOrPos.x), y = Number(markerOrPos.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const h = GameWorld.groundH(x, y) + (Number(markerOrPos.h) || 0);
        const tier = GameData.TIERS[def.tier];
        const view = new EggView(this.scene, type, {});
        view.place(x, h, y);
        view.bob = 6;
        const egg = { uid: GameUtil.uid(), type, def, x, y, h, marker: name, age: 0, view, bb: null, fxGroup: null, near: false, touched: false, shown: true, mutation: null };
        const nm = GameData.eggName(type);
        const rare = tier.rank >= GameData.TIERS.legendary.rank;
        egg.bb = Billboard.add({
            x, y, h: h + 6, className: 'egg-bb', maxDist: rare ? 3600 : 2300,
            html: (rare ? '<span class="nm" style="color:' + tier.color + '">' + GameUtil.esc(nm) + '</span>' : '') +
                '<span class="lk">' + GameUI.icon('clover') + '<span style="color:' + (tier.rank >= 1 ? tier.color : '#fff') + '">' + GameUtil.fmt(def.luck) + '</span></span>',
        });
        this.live.push(egg);
        Game.events.emit('egg:spawned', { egg });
        if (opts.announce !== false && GameData.eggAnnounced(type)) GameUI.banner(Lang.t('egg.announce', { name: nm }), 4200, { color: tier.color });
        this._updateBadge();
        return egg;
    },

    _removeLive(egg, reason, silent) {
        const i = this.live.indexOf(egg);
        if (i >= 0) this.live.splice(i, 1);
        if (egg.fxGroup) { egg.fxGroup.stop(); egg.fxGroup = null; }
        if (egg.bb) { egg.bb.remove(); egg.bb = null; }
        if (egg.view) { egg.view.dispose(); egg.view = null; }
    },

    // Ночные яйца (soul, aurora) исчезают на рассвете: «только ночью».
    _despawnNightEggs() {
        for (const e of this.live.slice()) if (e.def.night) this._removeLive(e, 'day');
    },

    /** Волна: до EGG_WAVE_COUNT яиц по маркерам егг-зон с учётом весов; ночные — только ночью; живых не больше EGG_LIVE_MAX. */
    spawnWave() {
        const cfg = eggCfg();
        const night = GameWorld.isNight;
        const room = cfg.liveMax - this.live.length;
        const n = Math.min(cfg.count, room);
        if (n <= 0) return 0;
        const used = new Set(this.live.map(e => e.marker));
        /** @type {Record<string, any[]>} */
        const free = {};
        for (const m of this.markers) if (!used.has(m.name)) (free[m.zone] = free[m.zone] || []).push(m);
        let made = 0;
        // первая волна сессии: белое яйцо у ближайшего к ранчо луга — чтобы новичку было что искать
        if (this.waveNo === 0 && GameState.state.stats.rounds === 0 && Ranch.player) {
            let best = null, bd = Infinity;
            for (const z of ['meadow', 'flower']) for (const m of free[z] || []) {
                const d = Math.hypot(m.x - Ranch.player.x, m.y - Ranch.player.y);
                if (d < bd) { bd = d; best = m; }
            }
            if (best && this.spawn('white', best, { announce: false })) {
                made++;
                free[best.zone] = free[best.zone].filter(m => m !== best);
            }
        }
        while (made < n) {
            const avail = GameData.EGG_LIST.filter(e => (night || !e.night) && e.zones.some(z => free[z] && free[z].length)).map(e => e.id);
            if (!avail.length) break;
            const type = GameData.pickEggType(Math.random, night, avail);
            const def = GameData.EGGS[type];
            const zones = def.zones.filter(z => free[z] && free[z].length);
            if (!zones.length) break;
            const zone = GameUtil.pick(zones);
            const list = free[zone];
            const k = Math.floor(Math.random() * list.length);
            const m = list[k];
            list.splice(k, 1);
            if (this.spawn(type, m)) made++;
        }
        this.waveNo++;
        return made;
    },

    /** Ближайшее живое яйцо (для радара и Track): filter(egg) -> bool. */
    nearestLive(x, y, filter) {
        let best = null, bd = Infinity;
        for (const e of this.live) {
            if (filter && !filter(e)) continue;
            const d = Math.hypot(e.x - x, e.y - y);
            if (d < bd) { bd = d; best = e; }
        }
        return best;
    },

    // =============================================================================================
    // Корзина
    // =============================================================================================
    /** Подобрать яйцо в корзину; false — корзина полна. */
    pickup(egg) {
        const s = GameState.state;
        if (this.basket.length >= s.basketCap) return false;
        const def = egg.def;
        const brk = def.break * GameState.superMult('eggTime');   // супер-награда: яйцо ломается позже
        const entry = { uid: egg.uid, type: egg.type, kg: def.kg, mutation: egg.mutation || null, timeLeft: brk, total: brk, rescued: false };
        this.basket.push(entry);
        GameState.discoverEgg(egg.type);
        const x = egg.x, y = egg.y, h = egg.h;
        this._removeLive(egg, 'picked');
        this._fx('egg-pickup', x, h + 60, y);
        GameUI.sfx('pickup');
        GameUI.toast(Lang.t('egg.picked', { name: GameData.eggName(entry.type) }), 'good');
        Guide.toRanch();
        Game.events.emit('egg:picked', { egg: entry });
        this._updateBadge();
        return true;
    },

    /** Продлить таймер разбивания яйца в корзине на s секунд («+60 с за рекламу»). */
    extendBreak(uid, s) {
        const e = this.basket.find(x => x.uid === uid);
        if (!e) return false;
        e.timeLeft += s;
        e.total = Math.max(e.total, e.timeLeft);
        return true;
    },

    _rescueTarget() {
        const w = eggCfg().warn;
        let best = null;
        for (const e of this.basket) if (!e.rescued && e.timeLeft > 0 && e.timeLeft <= w && (!best || e.timeLeft < best.timeLeft)) best = e;
        return best;
    },

    _rescueReward() {
        const e = this._rescueTarget();
        if (!e) return;
        e.rescued = true;
        const n = eggCfg().rescue;
        this.extendBreak(e.uid, n);
        GameUI.sfx('unlock');
        GameUI.toast(Lang.t('egg.rescued', { n }), 'good');
    },

    _tickBasket(dt, blocked) {
        const cfg = eggCfg();
        const b = this.basket;
        if (!b.length) {
            GameUI.setBasket([], {});
            GameUI.setBasketAction(null);
            this._lastTick = -1;
            return;
        }
        let min = Infinity;
        const broken = [];
        for (const e of b) {
            if (!blocked) e.timeLeft -= dt;
            if (e.timeLeft <= 0) broken.push(e);
            else if (e.timeLeft < min) min = e.timeLeft;
        }
        for (const e of broken) this.breakEgg(e);
        if (!this.basket.length) { GameUI.setBasket([], {}); GameUI.setBasketAction(null); this._lastTick = -1; return; }
        const warn = min <= cfg.warn;
        if (warn && !blocked) {
            const sec = Math.ceil(min);
            if (sec !== this._lastTick) { this._lastTick = sec; GameUI.sfx('timerWarn', { volume: 0.55, detune: (cfg.warn - sec) * 0.02 }); }
        } else if (!warn) this._lastTick = -1;
        const items = this.basket.map(e => ({
            html: '<img class="pi" src="' + EggArt.icon(e.type, 96) + '" alt="">',
            frac: e.timeLeft / e.total, warn: e.timeLeft <= cfg.warn,
        }));
        GameUI.setBasket(items, { cap: GameState.state.basketCap, warning: warn ? Lang.t('egg.willBreak') : '' });
        const target = this._rescueTarget();
        GameUI.setBasketAction(target ? this._rescueBtn : null);
    },

    /** Яйцо разбилось: окно «Яйцо разбилось» → «Далее» → конец раунда. */
    breakEgg(entry) {
        const i = this.basket.indexOf(entry);
        if (i >= 0) this.basket.splice(i, 1);
        if (!this.basket.length) Guide.set(null);
        const P = typeof Player !== 'undefined' ? Player : null;
        if (P) this._fx('egg-break', P.x, P.h + 90, P.y);
        GameUI.sfx('eggBreak');
        GameState.addPaws(GameData.PAWS_REWARDS.broken, 'broken');
        Game.events.emit('egg:broken', { egg: entry });
        this._queueResult({ kind: 'break', egg: entry });
        this._updateBadge();
    },

    /** Въезд на своё ранчо: яйца из корзины — в свободные гнёзда, остальные — в инвентарь. */
    deliver() {
        if (!this.basket.length) return 0;
        const s = GameState.state;
        let toNest = 0, toInv = 0, firstNest = -1;
        for (const e of this.basket.splice(0)) {
            let slot = -1;
            for (let i = 0; i < s.nests; i++) if (!s.nestEggs[i]) { slot = i; break; }
            if (slot >= 0) {
                s.nestEggs[slot] = { uid: e.uid, type: e.type, kg: e.kg, mutation: e.mutation, placedAt: Date.now(), growth: 1, t: 0 };
                toNest++;
                if (firstNest < 0) firstNest = slot;
            } else {
                s.eggs.push({ uid: e.uid, type: e.type, kg: e.kg, mutation: e.mutation });
                toInv++;
            }
            Game.events.emit('egg:delivered', { egg: e, nest: slot >= 0 ? slot : null });
        }
        Guide.set(null);
        GameState.markDirty();
        GameUI.sfx('place');
        if (toNest) GameUI.toast(Lang.t('egg.delivered', { n: toNest }), 'good');
        if (toInv) GameUI.toast(Lang.t('egg.stored', { n: toInv }), 'info');
        this.syncNests();
        if (firstNest >= 0) { const p = Ranch.nestPos(firstNest); if (p) this._fx('egg-pickup', p.x, p.h + 70, p.y); }
        GameUI.setBasket([], {});
        this._updateBadge();
        return toNest + toInv;
    },

    // =============================================================================================
    // Гнёзда и инкубация
    // =============================================================================================
    /** Номер первого свободного гнезда или -1. */
    freeNest() {
        const s = GameState.state;
        for (let i = 0; i < s.nests; i++) if (!s.nestEggs[i]) return i;
        return -1;
    },

    /** Положить яйцо из инвентаря в свободное гнездо; false — нет гнезда или яйца. */
    place(uid) {
        const s = GameState.state;
        const k = s.eggs.findIndex(e => e.uid === uid);
        const slot = this.freeNest();
        if (k < 0 || slot < 0) return false;
        const e = s.eggs.splice(k, 1)[0];
        s.nestEggs[slot] = { uid: e.uid, type: e.type, kg: e.kg, mutation: e.mutation, placedAt: Date.now(), growth: 1, t: 0 };
        GameState.markDirty();
        GameUI.sfx('place');
        this.syncNests();
        this._updateBadge();
        return true;
    },

    /** «Вырастить все»: все яйца инвентаря — в свободные гнёзда. Возвращает число положенных. */
    placeAll() {
        let n = 0;
        while (GameState.state.eggs.length && this.freeNest() >= 0) { if (!this.place(GameState.state.eggs[0].uid)) break; n++; }
        return n;
    },

    /** Мгновенно довести яйцо в гнезде до готовности (награда за рекламу выдаётся вызывающим). */
    instantHatch(i) {
        const e = GameState.state.nestEggs[i];
        if (!e) return false;
        const d = GameData.EGGS[e.type];
        if (e.t < d.hatch) e.t = d.hatch;
        GameState.markDirty();
        return true;
    },

    /** Яйцо в гнезде i стало готовым (один раз на яйцо): звук, тост, событие. */
    _markReady(i) {
        const e = GameState.state.nestEggs[i];
        if (!e || this._readySeen.has(e.uid)) return;
        this._readySeen.add(e.uid);
        const v = this.nestViews[i];
        if (v) v.last = '';
        GameUI.sfx('unlock', { volume: 0.5 });
        GameUI.toast(Lang.t('nest.readyToast'), 'good');
        Game.events.emit('egg:ready', { nest: i, egg: e });
        this._updateBadge();
    },

    /** Пересобрать виды яиц и подписи в гнёздах по state.nestEggs (и зоны Interact). Гнездо, где идёт вылупление, не трогаем. */
    syncNests() {
        if (!this.scene) return;
        const s = GameState.state;
        const count = Math.max(s.nests, this.nestViews.length);
        for (let i = 0; i < count; i++) {
            const zid = 'nest-' + i;
            const busy = !!(this.hatching && this.hatching.i === i);
            const pos = Ranch.nestPos(i);
            if (!busy) {
                const egg = i < s.nests ? s.nestEggs[i] : null;
                let v = this.nestViews[i];
                if (v && (!egg || !pos || v.uid !== egg.uid)) {
                    if (v.view) v.view.dispose();
                    if (v.bb) v.bb.remove();
                    v = this.nestViews[i] = null;
                }
                if (egg && pos && !v) {
                    const view = new EggView(this.scene, egg.type, { glow: false, scale: 0.9, mutation: egg.mutation });
                    view.place(pos.x, pos.h + 22, pos.y);
                    view.bob = 0; view.idleSpin = 0.25;
                    const bb = Billboard.add({ x: pos.x, y: pos.y, h: pos.h + 22 + EGG_H * 0.9 + 50, className: 'nest-bb', maxDist: 2400, html: '' });
                    this.nestViews[i] = { uid: egg.uid, view, bb, last: '', pos };
                } else if (v && pos) v.pos = pos;
            }
            // зона «Вылупить [E]» у гнезда
            if (i < s.nests && pos) {
                let z = this._zones[i] ? Interact.zones.find(q => q.id === zid) : null;
                if (!z) {
                    this._zones[i] = true;
                    z = Interact.register({
                        id: zid, x: pos.x, y: pos.y, r: 210,
                        visible: () => { const e = GameState.state.nestEggs[i]; return !!e && !this.hatching && (GameData.nestState(e).ready || GameUI.adsAvailable()); },
                        label: () => (GameState.state.nestEggs[i] && GameData.nestState(GameState.state.nestEggs[i]).ready ? Lang.t('nest.hatch') : Lang.t('nest.skip')),
                        action: () => this._nestAction(i),
                    }).zone;
                }
                z.x = pos.x; z.y = pos.y;
            } else if (this._zones[i]) { Interact.unregister(zid); this._zones[i] = false; }
        }
        this.nestViews.length = Math.max(s.nests, 0);
    },

    // Действие у гнезда: готово — вылупить, иначе — «вылупить сразу» за рекламу.
    async _nestAction(i) {
        const e = GameState.state.nestEggs[i];
        if (!e || this.hatching) return;
        if (GameData.nestState(e).ready) { this.hatch(i); return; }
        if (!GameUI.adsAvailable() || GameUI._adBusy) return;
        GameUI._adBusy = true;
        try {
            const ok = await Platform.rewarded('instant-hatch');
            if (ok === true) { this.instantHatch(i); GameState.saveNow(); } else GameUI.toast(Lang.t('ad.fail'), 'bad');
        } catch (err) { console.error('instant-hatch:', err); } finally { GameUI._adBusy = false; }
    },

    _tickNests(dt) {
        const s = GameState.state;
        for (let i = 0; i < s.nests; i++) {
            const e = s.nestEggs[i];
            if (!e) continue;
            const hatchingThis = this.hatching && this.hatching.i === i;
            if (hatchingThis) continue;
            const d = GameData.EGGS[e.type];
            e.t += dt * GameState.superMult('hatch');   // супер-награда: инкубация быстрее
            const ready = e.t >= d.hatch;
            if (ready) {
                e.growth = GameData.nestState(e).growth;
                if (!this._readySeen.has(e.uid)) this._markReady(i);
            }
            const v = this.nestViews[i];
            if (!v || !v.view) continue;
            v.view.update(dt);
            if (ready) { v.view.wobble = 0.06 + 0.05 * Math.max(0, Math.sin(this.time * 1.7)); v.view.wobbleRate = 9; }
            else v.view.wobble = 0;
        }
        if (s.nestEggs.some(Boolean)) GameState.softDirty();
        // подписи над гнёздами — 4 раза в секунду
        this._nestT -= dt;
        if (this._nestT <= 0) {
            this._nestT = 0.25;
            for (let i = 0; i < s.nests; i++) {
                const e = s.nestEggs[i], v = this.nestViews[i];
                if (!e || !v || !v.bb || (this.hatching && this.hatching.i === i)) continue;
                const st = GameData.nestState(e);
                const html = st.ready
                    ? '<span class="rd">' + GameUtil.esc(Lang.t('nest.ready')) + '</span><span class="tm">' + GameUtil.esc(GameUtil.fmtKg(st.kg)) + '</span>'
                    : '<span class="tm">' + GameUtil.esc(GameUtil.fmtClock(st.left)) + '</span>';
                if (html !== v.last) { v.last = html; v.bb.setHtml(html); }
            }
        }
    },

    // =============================================================================================
    // Кадр
    // =============================================================================================
    update(dt) {
        if (!this.active) return;
        this.time += dt;
        const blocked = GameUI.blocking;
        // волны (идут всегда, пока игра не на паузе)
        const cfg = eggCfg();
        this.waveT -= dt;
        if (this.waveT <= 0) { this.waveT += cfg.wave; if (this.waveT <= 0) this.waveT = cfg.wave; this.spawnWave(); }
        this._hudT -= dt;
        if (this._hudT <= 0) { this._hudT = 0.2; GameUI.setWave(Math.max(0, Math.ceil(this.waveT)), cfg.count); this._updateObjective(); }
        this._tickLive(dt, blocked, cfg);
        this._tickBasket(dt, blocked);
        // вход на своё ранчо
        const inside = Ranch.inside(Player.x, Player.y);
        if (inside && this.basket.length && !blocked) this.deliver();
        this._wasInside = inside;
        this._tickNests(dt);
        this._tickHatch(dt);
        this._tickResults();
    },

    // Яйца в мире: возраст, исчезновение, анимация, отсечение дальних, подбор касанием, искры у редких.
    _tickLive(dt, blocked, cfg) {
        const P = Player;
        const pr = P.radius() + cfg.pickup;
        this._fxT -= dt;
        const doFx = this._fxT <= 0;
        if (doFx) this._fxT = 0.5;
        const cam = this.app && this.app.location ? this.app.location.view.camera.position : null;
        for (const e of this.live.slice()) {
            e.age += dt;
            if (e.age >= cfg.life) { this._removeLive(e, 'expired'); continue; }
            const v = e.view;
            // дальше 4200 px (за туманом) — не рисуем и не анимируем
            const dxc = cam ? e.x - cam.x : 0, dzc = cam ? e.y - cam.z : 0;
            const far = cam ? dxc * dxc + dzc * dzc > 4600 * 4600 : false;
            if (far === e.shown) { e.shown = !far; v.setEnabled(!far); }
            if (e.shown) {
                v.update(dt);
                const left = cfg.life - e.age;
                v.root.scaling.setAll(left < 1 ? Math.max(0.01, left) : 1);
            }
            // искры у легендарных и выше — только рядом с игроком (бюджет частиц)
            if (doFx && GameData.TIERS[e.def.tier].rank >= GameData.TIERS.legendary.rank) {
                const near = Math.hypot(e.x - P.x, e.y - P.y) < 2400;
                if (near && !e.fxGroup) e.fxGroup = this._fx('egg-sparkle', e.x, e.h, e.y, { color: GameData.TIERS[e.def.tier].color });
                else if (!near && e.fxGroup) { e.fxGroup.stop(); e.fxGroup = null; }
            }
            if (blocked) continue;
            const dx = e.x - P.x, dy = e.y - P.y;
            const touch = dx * dx + dy * dy < pr * pr && Math.abs(P.h - e.h) < 360;
            if (touch) {
                if (!this.pickup(e)) {
                    if (!e.touched && this.time - this._fullToastAt > 2.4) { this._fullToastAt = this.time; GameUI.toast(Lang.t('egg.full'), 'bad', 2400); }
                    e.touched = true;
                }
            } else e.touched = false;
        }
    },

    // =============================================================================================
    // Вылупление
    // =============================================================================================
    /** Вылупить яйцо из готового гнезда i: сцена вылупления → окно результата. */
    hatch(i) {
        const s = GameState.state;
        const egg = s.nestEggs[i];
        if (!egg || this.hatching) return false;
        const st = GameData.nestState(egg);
        if (!st.ready) return false;
        const pos = Ranch.nestPos(i);
        const nv = this.nestViews[i];
        if (!pos || !nv || !nv.view) return false;
        // исход решается сразу: питомец записан в сохранение, яйцо из гнезда убрано
        const r = GameData.hatchResult(egg.type, { luckMult: GameState.luckMult(), growth: st.growth });
        const { pet, isNew } = GameState.givePet(r.species, { w: r.w, mutation: egg.mutation });
        const paws = GameData.pawsFor(r.species);
        GameState.addPaws(paws, 'hatch');
        s.nestEggs[i] = null;
        GameState.markDirty();
        PetView.loadModel(r.species);
        GameUI.closePanel();
        GameUI.lock++;
        Game.events.emit('pet:hatched', { pet, isNew, egg });
        const rank = GameData.RARITY[GameData.PETS[r.species].rarity].rank;
        this.hatching = {
            i, egg, pet, isNew, paws, t: 0, pos, eggView: nv.view, petView: null, eggGone: false, stage: 0, rank,
            modal: false, spin: 0, exit: null,
        };
        nv.view.idleSpin = 0.1;
        nv.view.bob = 0;
        if (nv.bb) nv.bb.setVisible(false);
        // камера — со стороны въезда; если игрок стоит между ней и гнездом, отходим вбок, чтобы он не закрывал яйцо
        let camDir = Number.isFinite(pos.heading) ? pos.heading : 0;
        const dxp = Player.x - pos.x, dyp = Player.y - pos.y;
        if (Math.hypot(dxp, dyp) < 1100) {
            const d = GameUtil.angleDiff(camDir, Math.atan2(dyp, dxp));
            if (Math.abs(d) < 1.1) camDir += (d >= 0 ? -1 : 1) * 1.2;
        }
        Player.cine = { x: pos.x, y: pos.y, h: pos.h + 80, dist: 380, az: camDir + Math.PI, pitch: 0.3 };
        this.newPetsSession++;
        Ranch.updateBadges();
        return true;
    },

    _abortHatch() {
        const h = this.hatching;
        if (!h) return;
        this._endHatchVisuals();
        this.hatching = null;
    },

    _endHatchVisuals() {
        const h = this.hatching;
        if (!h) return;
        if (h.petView) { h.petView.dispose(); h.petView = null; }
        Player.cine = null;
        GameUI.lock = Math.max(0, GameUI.lock - 1);
        const v = this.nestViews[h.i];
        if (v && v.view === h.eggView) { v.view = null; }
        if (h.eggView) h.eggView.dispose();
        if (v) { if (v.bb) v.bb.remove(); this.nestViews[h.i] = null; }
    },

    _tickHatch(dt) {
        const h = this.hatching;
        if (!h) return;
        h.t += dt;
        // страховка: если сцена по какой-то причине застряла, результат всё равно показывается и управление возвращается
        if (h.t > 14 && !h.modal) {
            if (!h.eggGone) { try { this._reveal(); } catch (e) { h.eggGone = true; } }
            h.modal = true;
            this._showHatchResult(h);
            return;
        }
        const t = h.t, ev = h.eggView, pos = h.pos;
        if (!h.eggGone) {
            ev.update(dt);
            // качание нарастает; три стадии трещин; в 2.7 с — взрыв
            const k = Math.min(1, Math.max(0, (t - 0.7) / 2.0));
            ev.wobble = 0.03 + 0.34 * k * k;
            ev.wobbleRate = 8 + 12 * k;
            const stage = t > 2.15 ? 3 : t > 1.6 ? 2 : t > 1.1 ? 1 : 0;
            if (stage !== h.stage) {
                h.stage = stage;
                ev.setCrack(stage);
                GameUI.sfx('crack', { volume: 0.7, detune: stage * 0.08 });
                this._fx('egg-crack', pos.x, pos.h + 70, pos.y);
            }
            if (t >= 2.7) this._reveal();
        } else {
            const pv = h.petView;
            // питомец: «выскакивает» с пружиной, крутится и успокаивается
            const a = Math.min(1, (t - 2.7) / 0.7);
            const back = 1 + 2.2 * Math.pow(a - 1, 3) + 1.2 * Math.pow(a - 1, 2);
            const sc = Math.max(0.05, back);
            if (pv) {
                pv.root.scaling.setAll(sc);
                h.spin += dt * (t < 4.4 ? 5.5 : 1.4 + Math.max(0, 4.4 + 1.2 - t) * 0.6);
                const th = GameWorld.groundH(pos.x, pos.y);
                pv.place(pos.x, th + 30 + Math.sin(Math.min(1, a) * Math.PI) * 60, pos.y, h.spin, 0, 0);
                pv.update(dt, 0.0);
            }
            // камера отъезжает по размеру питомца
            if (Player.cine && pv) {
                const sz = pv.size;
                const want = GameUtil.clamp(Math.max(sz.length * 1.55, sz.height * 2.2, 380), 380, 1300);
                Player.cine.dist = GameUtil.damp(Player.cine.dist, want, 3, dt);
                Player.cine.h = GameUtil.damp(Player.cine.h, pos.h + Math.max(80, sz.height * 0.55), 3, dt);
            }
            if (t >= 3.5 && !h.modal) { h.modal = true; this._showHatchResult(h); }
        }
    },

    // Взрыв: вспышка, питомец вместо яйца.
    _reveal() {
        const h = this.hatching;
        if (!h || h.eggGone) return;
        h.eggGone = true;
        const pos = h.pos;
        h.eggView.setEnabled(false);
        GameUI.flash('#ffffff', 800);
        this._fx('hatch-flare', pos.x, pos.h + 70, pos.y);
        this._fx('confetti', pos.x, pos.h + 90, pos.y);
        GameUI.sfx(h.rank >= GameData.RARITY.epic.rank ? 'revealRare' : 'reveal', { volume: 0.85 });
        const pet = h.pet;
        h.petView = PetView.create(this.scene, pet.species, { w: pet.w, mutation: pet.mutation });
        h.petView.root.scaling.setAll(0.05);
        h.petView.place(pos.x, pos.h + 30, pos.y, 0, 0, 0);
    },

    // =============================================================================================
    // Окна результата и раунд
    // =============================================================================================
    /**
     * Раунды сейчас считаются? Страж roundGuard (обучение) возвращает false — результат вылупления не раунд:
     * ни рекламы, ни рекорда, ни статистики, а «Далее» закрывает окно без interstitial. Ошибка стража — считаем.
     */
    roundsCount() {
        const g = this.roundGuard;
        if (typeof g !== 'function') return true;
        try { return g() !== false; } catch (e) { console.error('roundGuard:', e); return true; }
    },

    /** Раунд завершён: один раз на яйцо — Platform.ads.roundEnded(), рекорд, статистика, round:end. */
    endRound(success, info = {}) {
        if (!this.roundsCount()) return false;
        const key = String(info.uid || GameUtil.uid());
        if (this._ended.includes(key)) return false;
        this._ended.push(key);
        if (this._ended.length > 60) this._ended.shift();
        const s = GameState.state;
        s.stats.rounds++;
        if (success) s.stats.hatched++; else s.stats.broken++;
        if (typeof Platform !== 'undefined') {
            Platform.ads.roundEnded();
            Platform.submitScore(eggSafeScore(s.totalEarned));
        }
        GameState.markDirty();
        Game.events.emit('round:end', { success: !!success, uid: key, type: info.type || null, species: info.species || null });
        return true;
    },

    _queueResult(r) { this._results.push(r); },
    _tickResults() {
        if (this._resultModal && !this._resultModal.done) return;
        this._resultModal = null;
        if (this.hatching || !this._results.length) return;
        const r = this._results.shift();
        if (r.kind === 'break') this._showBreakResult(r.egg);
    },

    // Выход из окна результата: переход по «Далее» (interstitial после двух результатов), затем действие.
    // Раунды не считаются (roundsCount, обучение) — окно закрывается сразу, без Platform.ads.next.
    _exit(modal, then) {
        if (modal.exiting) return;
        modal.exiting = true;
        const go = async () => {
            modal.finish(true);
            if (then) { try { then(); } catch (e) { console.error('result exit:', e); } }
        };
        if (!this.roundsCount()) { go(); return; }
        Platform.ads.next(go).finally(() => { modal.exiting = false; });
    },

    _showBreakResult(entry) {
        this.endRound(false, { uid: entry.uid, type: entry.type });
        const modal = GameUI.showModal({
            title: Lang.t('broke.title'), noEsc: true, cls: 'res-body',
            build: (el, rec) => {
                const E = GameUtil.el;
                const wrap = E('div', { class: 'res' },
                    E('div', { class: 'res-ico', html: '<img class="pi" alt="" src="' + EggArt.icon(entry.type, 128, { cracked: true }) + '">' }),
                    E('div', { class: 'res-info' },
                        E('div', { class: 'res-name otx', text: GameData.eggName(entry.type), style: { fontSize: 'calc(var(--u)*28)' } }),
                        E('div', { class: 'res-paws', html: GameUI.icon('paw') + GameUtil.esc(Lang.t('hatch.paws', { n: GameData.PAWS_REWARDS.broken })) })));
                const next = E('button', { class: 'gb orange', type: 'button', text: Lang.t('broke.next') });
                GameUI._press(next, () => this._exit(rec, null));
                el.append(wrap, E('div', { class: 'res-text', text: Lang.t('broke.text') }), E('div', { class: 'res-btns' }, next));
            },
        });
        this._resultModal = modal;
    },

    _showHatchResult(h) {
        const pet = h.pet, d = GameData.PETS[pet.species], rar = GameData.RARITY[d.rarity];
        this.endRound(true, { uid: h.egg.uid, type: h.egg.type, species: pet.species });
        const modal = GameUI.showModal({
            title: Lang.t('hatch.title'), noEsc: true, light: true, cls: 'res-body',
            onClose: () => this._finishHatch(),
            build: (el, rec) => {
                const E = GameUtil.el;
                const ico = E('div', { class: 'res-ico rar-' + d.rarity, style: { '--rc': rar.color }, html: GameUI.petIcon(pet.species, 128) });
                if (h.isNew) ico.appendChild(E('span', { class: 'res-new', text: Lang.t('hatch.new') }));
                const stat = (icon, text) => E('div', { class: 'st', html: GameUI.icon(icon) + '<span>' + GameUtil.esc(text) + '</span>' });
                const info = E('div', { class: 'res-info' },
                    E('div', { class: 'res-name otx', text: GameData.petName(pet.species), style: { color: rar.color } }),
                    E('div', { class: 'res-rar otx-s', text: GameData.rarityName(d.rarity) + ' · ' + Lang.t('hatch.chance', { n: GameUtil.fmt(d.chance) }), style: { color: rar.color } }),
                    ...(pet.huge ? [E('div', { class: 'res-huge', text: Lang.t('hatch.huge') })] : []),
                    E('div', { class: 'res-stats otx-s' },
                        stat('bolt', GameUtil.fmt(GameState.petSpeed(pet))),
                        stat('banknote', Lang.t('hatch.perSec', { v: GameUtil.fmtMoney(GameState.petIncome(pet)) })),
                        E('div', { class: 'st', html: '<span>' + GameUtil.esc(Lang.t('hatch.weight') + ': ' + GameUtil.fmtKg(GameState.petKg(pet))) + '</span>' })));
                if (pet.mutation) info.appendChild(E('div', { class: 'res-mut otx-s', text: GameData.mutationName(pet.mutation), style: { color: GameData.MUTATIONS[pet.mutation].color } }));
                info.appendChild(E('div', { class: 'res-paws', html: GameUI.icon('paw') + GameUtil.esc(Lang.t('hatch.paws', { n: h.paws })) }));
                const ride = E('button', { class: 'gb yellow', type: 'button', text: Lang.t('hatch.ride') });
                const place = E('button', { class: 'gb', type: 'button', text: Lang.t('hatch.place') });
                const next = E('button', { class: 'gb orange', type: 'button', text: Lang.t('hatch.next') });
                const free = GameState.state.ranchPets.length < GameState.state.slots;
                if (!free) { place.classList.add('off'); place.title = Lang.t('hatch.noSlot'); }
                GameUI._press(ride, () => this._exit(rec, () => { if (typeof Player !== 'undefined') Player.ride(pet.uid); }));
                GameUI._press(place, () => {
                    if (!free) { GameUI.toast(Lang.t('hatch.noSlot'), 'bad'); return; }
                    this._exit(rec, () => Ranch.placePet(pet.uid, { fromNest: h.pos }));
                });
                GameUI._press(next, () => this._exit(rec, null));
                el.append(E('div', { class: 'res' }, ico, info), E('div', { class: 'res-btns' }, ride, place, next));
            },
        });
        this._resultModal = modal;
        h.exit = modal;
    },

    // Окно закрыто: убираем сцену вылупления, возвращаем управление.
    _finishHatch() {
        const h = this.hatching;
        if (!h) return;
        this._endHatchVisuals();
        this.hatching = null;
        this.syncNests();
        Ranch.updateBadges();
        this._updateBadge();
    },

    // =============================================================================================
    // Интерфейс: значок, цель
    // =============================================================================================
    _updateBadge() {
        const s = GameState.state;
        let ready = 0;
        for (let i = 0; i < s.nests; i++) if (s.nestEggs[i] && GameData.nestState(s.nestEggs[i]).ready) ready++;
        GameUI.setBadge('eggs', s.eggs.length + ready);
    },

    // Цель на табличке сверху по ситуации (обучение фазы 2 может переопределить).
    _updateObjective() {
        if (this.hatching) return;
        const s = GameState.state;
        let key = 'hud.objective';
        if (this.basket.length) key = 'obj.carry';
        else {
            let ready = false;
            for (let i = 0; i < s.nests; i++) if (s.nestEggs[i] && GameData.nestState(s.nestEggs[i]).ready) ready = true;
            if (ready) key = 'obj.hatch';
            else if (s.eggs.length && this.freeNest() >= 0) key = 'obj.place';
        }
        GameUI.setObjective(Lang.t(key));
        this._updateBadge();
    },

    // =============================================================================================
    // Иконки яиц для интерфейса
    // =============================================================================================
    /** dataURL иконки яйца типа type (кэш). */
    icon(type, size = 96, opts) { return EggArt.icon(type, size, opts); },
    /** HTML-картинка иконки яйца: Eggs.iconHtml('golden', 56). */
    iconHtml(type, px = 48) {
        const u = 'calc(var(--u)*' + px + ')';
        return '<img class="pi" alt="" src="' + EggArt.icon(type, Math.max(64, Math.round(px * 2))) + '" style="width:' + u + ';height:' + u + '">';
    },
};

Game.register(Eggs);
