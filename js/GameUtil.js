// GameUtil.js — общие помощники игры: форматирование чисел и времени (K М Б … с учётом языка), seeded rng,
// математика, DOM-хелперы, эмиттер событий и Billboard — DOM-подписи над 3D-миром.
//
//   GameUtil.fmt(n)                  1234 -> 1.23K (RU: 1,23К, кириллические суффиксы), до 1e36 (Dc)
//   GameUtil.fmtTime(sec)            6с / 1м 29с / 2ч 5м (RU) и 6s / 1m 29s / 2h 5m (EN)
//   GameUtil.fmtKg(kg)               «12,5 кг» / «12.5 kg»;  fmtClock(sec) — «9:58»
//   GameUtil.rng(seed) -> () => 0..1 (mulberry32), hash(str), hash01(i)
//   GameUtil.clamp/lerp/damp/smoothstep/wrapAngle/angleDiff/lerpAngle/pick/weighted
//   GameUtil.el(tag, props, ...children), $, clear, on — DOM
//   GameUtil.Emitter                 on/off/once/emit (Game.events)
//   GameUtil.keyName(code)           название клавиши на языке сборки («Пробел»)
//   Billboard.add({ x, y, h, html, className, maxDist }) -> handle { el, setText, setHtml, setPos, remove }
// Lang.add(dict) живёт в Lang.js; здесь — запасной вариант, если файл Lang.js старый.

if (typeof Lang !== 'undefined' && typeof Lang.add !== 'function') {
    /** @type {any} */ (Lang).add = function (dict) {
        for (const code of Object.keys(dict || {})) {
            if (!LANG_STRINGS[code]) LANG_STRINGS[code] = {};
            Object.assign(LANG_STRINGS[code], dict[code]);
        }
    };
}

// Суффиксы больших чисел. В русской сборке — кириллица (правило языка сборки: латиницы в интерфейсе нет).
const FMT_SUFFIX_EN = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
const FMT_SUFFIX_RU = ['', 'К', 'М', 'Б', 'Т', 'Кв', 'Кн', 'Сс', 'Сп', 'Ок', 'Нн', 'Дц'];

/** @satisfies {Record<string, any>} */
const GameUtil = {
    // --- Математика ---------------------------------------------------------------------
    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    /** Экспоненциальное сглаживание, не зависящее от fps: доля пути за dt при скорости lambda (1/с). */
    damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); },
    smoothstep(a, b, v) { const t = GameUtil.clamp((v - a) / (b - a || 1), 0, 1); return t * t * (3 - 2 * t); },
    /** Угол в (−π, π]. */
    wrapAngle(a) { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; },
    /** Кратчайшая разность углов b − a. */
    angleDiff(a, b) { return GameUtil.wrapAngle(b - a); },
    lerpAngle(a, b, t) { return a + GameUtil.angleDiff(a, b) * t; },
    /** Сглаживание угла: доля пути за dt. */
    dampAngle(a, b, lambda, dt) { return a + GameUtil.angleDiff(a, b) * (1 - Math.exp(-lambda * dt)); },

    // --- Случайность --------------------------------------------------------------------
    /** Seeded генератор mulberry32: () => число 0..1. Тот же seed — та же последовательность. */
    rng(seed) {
        let a = (typeof seed === 'string' ? GameUtil.hash(seed) : (Number(seed) || 0)) >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },
    /** Хеш строки (FNV-1a, uint32). */
    hash(str) {
        let h = 2166136261;
        const s = String(str);
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    },
    /** Детерминированное 0..1 по целому индексу (прореживание декора). */
    hash01(i) {
        let h = Math.imul((i | 0) + 0x9E3779B9, 0x85EBCA6B);
        h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    },
    pick(list, rng = Math.random) { return list[Math.floor(rng() * list.length) % list.length]; },
    /** Выбор по весам: items — [{ w, … }] или [[значение, вес]]. */
    weighted(items, rng = Math.random) {
        let total = 0;
        for (const it of items) total += Array.isArray(it) ? it[1] : it.w;
        let r = rng() * total;
        for (const it of items) { r -= Array.isArray(it) ? it[1] : it.w; if (r <= 0) return Array.isArray(it) ? it[0] : it; }
        const last = items[items.length - 1];
        return Array.isArray(last) ? last[0] : last;
    },
    /** Уникальный id записи (питомец, яйцо). */
    uid() { GameUtil._uid = (GameUtil._uid + 1) % 1679616; return Date.now().toString(36) + GameUtil._uid.toString(36) + Math.floor(Math.random() * 1296).toString(36); },
    _uid: 0,

    // --- Форматирование -----------------------------------------------------------------
    /** Код языка сборки. */
    lang() { return typeof Lang !== 'undefined' ? Lang.code : 'ru'; },
    suffixes(lang) { return (lang || GameUtil.lang()) === 'ru' ? FMT_SUFFIX_RU : FMT_SUFFIX_EN; },
    /**
     * Число с суффиксом: 1234 -> 1.23K; три значащие цифры. Меньше 1000 — целое (opts.decimals — знаков).
     * @param {number} n
     * @param {{ decimals?: number, lang?: string, sign?: boolean }} [opts]
     */
    fmt(n, opts = {}) {
        n = Number(n);
        if (!Number.isFinite(n)) return n > 0 ? '∞' : n < 0 ? '-∞' : '0';
        const lang = opts.lang || GameUtil.lang();
        const dec = lang === 'ru' ? ',' : '.';
        const neg = n < 0;
        let a = Math.abs(n);
        const sign = neg ? '-' : (opts.sign && a > 0 ? '+' : '');
        const trim = (s) => (s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s).replace('.', dec);
        if (a < 1000) {
            if (opts.decimals != null) return sign + trim(a.toFixed(opts.decimals));
            return sign + String(Math.floor(a + 1e-9));
        }
        const suf = GameUtil.suffixes(lang);
        let idx = Math.min(suf.length - 1, Math.floor(Math.log10(a) / 3));
        let m = a / Math.pow(1000, idx);
        let digits = m >= 100 ? 0 : m >= 10 ? 1 : 2;
        let s = m.toFixed(digits);
        if (Number(s) >= 1000 && idx < suf.length - 1) { idx++; m = a / Math.pow(1000, idx); digits = m >= 100 ? 0 : m >= 10 ? 1 : 2; s = m.toFixed(digits); }
        return sign + trim(s) + suf[idx];
    },
    /** Деньги: «$1,23К». */
    fmtMoney(n) { return '$' + GameUtil.fmt(n); },
    /** Целое с пробелами-разделителями тысяч (для счётчиков до 1e6). */
    fmtInt(n) { return String(Math.floor(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); },
    /** Секунды: 6с, 1м 29с, 2ч 5м. */
    fmtTime(sec) {
        sec = Math.max(0, Math.ceil(Number(sec) || 0));
        const t = (k, v) => Lang.t(k, { n: v });
        if (sec < 60) return t('time.s', sec);
        if (sec < 3600) return t('time.m', Math.floor(sec / 60)) + ' ' + t('time.s', sec % 60);
        if (sec < 86400) return t('time.h', Math.floor(sec / 3600)) + ' ' + t('time.m', Math.floor((sec % 3600) / 60));
        return t('time.d', Math.floor(sec / 86400)) + ' ' + t('time.h', Math.floor((sec % 86400) / 3600));
    },
    /** Часы «м:сс» для таймеров бустов и инкубации: 9:58, 0:07; от часа — «ч:мм:сс». */
    fmtClock(sec) {
        sec = Math.max(0, Math.ceil(Number(sec) || 0));
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        const p2 = (n) => (n < 10 ? '0' : '') + n;
        return h > 0 ? h + ':' + p2(m) + ':' + p2(s) : m + ':' + p2(s);
    },
    /** Вес: «12,5 кг», тысячи — с суффиксом. */
    fmtKg(kg) {
        const v = Number(kg) || 0;
        const s = v < 10 ? GameUtil.fmt(v, { decimals: 1 }) : GameUtil.fmt(v, { decimals: v < 100 ? 1 : 0 });
        return Lang.t('unit.kg', { n: s });
    },
    fmtPercent(p) { return GameUtil.fmt(p, { sign: true }) + '%'; },

    // --- Клавиши ------------------------------------------------------------------------
    // Название клавиши по e.code на языке сборки. Буквы в русской сборке — как напечатаны на русской клавиатуре.
    keyName(code) {
        const ru = GameUtil.lang() === 'ru';
        const RU = { KeyQ: 'Й', KeyW: 'Ц', KeyE: 'У', KeyR: 'К', KeyA: 'Ф', KeyS: 'Ы', KeyD: 'В', KeyP: 'З', KeyF: 'А', KeyM: 'Ь' };
        const named = { Space: 'key.space', ShiftLeft: 'key.shift', ShiftRight: 'key.shift', Escape: 'key.esc', Enter: 'key.enter' };
        if (named[code]) return Lang.t(named[code]);
        const m = /^Key([A-Z])$/.exec(String(code));
        if (m) return ru && RU[code] ? RU[code] : m[1];
        const arrows = { ArrowUp: '▲', ArrowDown: '▼', ArrowLeft: '◀', ArrowRight: '▶' };
        return arrows[code] || String(code);
    },

    // --- DOM ----------------------------------------------------------------------------
    /**
     * Создать элемент. props: class, text, html, style (объект или строка), dataset, on { событие: fn },
     * остальное — атрибуты. children — узлы или строки.
     * @param {string} tag
     * @param {Record<string, any>} [props]
     * @param {...(Node | string | null | undefined)} children
     * @returns {HTMLElement}
     */
    el(tag, props, ...children) {
        const e = document.createElement(tag);
        for (const k of Object.keys(props || {})) {
            const v = props[k];
            if (v == null || v === false) continue;
            if (k === 'class') e.className = v;
            else if (k === 'text') e.textContent = v;
            else if (k === 'html') e.innerHTML = v;
            else if (k === 'style') {
                if (typeof v === 'string') e.style.cssText = v;
                else for (const sk of Object.keys(v)) { if (sk.startsWith('--')) e.style.setProperty(sk, String(v[sk])); else e.style[sk] = v[sk]; }
            }
            else if (k === 'dataset') Object.assign(e.dataset, v);
            else if (k === 'on') { for (const ev of Object.keys(v)) e.addEventListener(ev, v[ev]); }
            else e.setAttribute(k, v === true ? '' : String(v));
        }
        for (const c of children) if (c != null) e.append(c);
        return e;
    },
    /** @param {string} sel @param {ParentNode} [root] @returns {HTMLElement | null} */
    $(sel, root) { return /** @type {HTMLElement | null} */ ((root || document).querySelector(sel)); },
    clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; },
    /** Поле ввода или редактируемый элемент (клавиши игры его не трогают). */
    isField(t) { return !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable); },
    /** Экранировать текст для innerHTML. */
    esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

    // --- События ------------------------------------------------------------------------
    /** Простой эмиттер: on(name, fn) -> отписка, off, once, emit. Ошибка слушателя не роняет остальных. */
    Emitter: class {
        constructor() { /** @type {Map<string, Function[]>} */ this._l = new Map(); }
        on(name, fn) {
            let list = this._l.get(name);
            if (!list) this._l.set(name, list = []);
            list.push(fn);
            return () => this.off(name, fn);
        }
        once(name, fn) {
            const off = this.on(name, (d) => { off(); fn(d); });
            return off;
        }
        off(name, fn) {
            const list = this._l.get(name);
            if (!list) return;
            const i = list.indexOf(fn);
            if (i >= 0) list.splice(i, 1);
        }
        emit(name, data) {
            const list = this._l.get(name);
            if (!list || !list.length) return;
            for (const fn of list.slice()) {
                try { fn(data); } catch (e) { console.error('event ' + name + ':', e); }
            }
        }
    },
};

// --- Billboard: DOM-подписи над миром ---------------------------------------------------
// Проекция — View3D.projectToScreen, после кадра (scene.onAfterRenderObservable: матрица уже текущая, подпись
// не отстаёт от картинки). Дальше maxDist, за спиной камеры и за краем экрана — скрыты; у границы дальности —
// плавное затухание. Элементы пулятся; DOM трогается только при смене положения/видимости.
/** @satisfies {Record<string, any>} */
const Billboard = {
    /** @type {HTMLElement | null} */
    root: null,
    /** @type {View3D | null} */
    view: null,
    /** @type {Set<any>} */
    items: new Set(),
    /** @type {HTMLElement[]} */
    pool: [],
    enabled: true,

    /** Привязка к виду и контейнеру (GameUI.init). */
    init(view, root) {
        this.view = view;
        this.root = root;
        for (const it of this.items) if (!it.el.parentNode) root.appendChild(it.el);
        view.scene.onAfterRenderObservable.add(() => this.update());
    },

    /**
     * @param {{ x: number, y: number, h?: number, html?: string, className?: string, maxDist?: number }} o
     */
    add(o) {
        const el = this.pool.pop() || document.createElement('div');
        el.className = 'bb ' + (o.className || '');
        el.innerHTML = o.html || '';
        el.style.display = 'none';
        const maxDefault = typeof BILLBOARD_MAX_DIST !== 'undefined' ? BILLBOARD_MAX_DIST : 2600;
        const it = {
            el, x: o.x, y: o.y, h: o.h || 0, maxDist: o.maxDist || maxDefault,
            shown: false, sx: 0, sy: 0, op: 1, hidden: false, scale: 1,
            setText(t) { el.textContent = t; },
            setHtml(h) { el.innerHTML = h; },
            setPos(x, y, h) { it.x = x; it.y = y; if (h != null) it.h = h; },
            setVisible(v) { it.hidden = !v; },
            remove() { Billboard.remove(it); },
        };
        this.items.add(it);
        if (this.root) this.root.appendChild(el);
        return it;
    },

    remove(it) {
        if (!this.items.delete(it)) return;
        const el = it.el;
        if (el.parentNode) el.parentNode.removeChild(el);
        el.innerHTML = '';
        el.className = 'bb';
        if (this.pool.length < 64) this.pool.push(el);
    },

    clear() { for (const it of Array.from(this.items)) this.remove(it); },

    update() {
        const view = this.view;
        if (!view || !view.scene || !this.enabled) return;
        const cp = view.camera.position;
        for (const it of this.items) {
            let show = !it.hidden;
            let sx = 0, sy = 0, op = 1, sc = 1;
            if (show) {
                const dx = it.x - cp.x, dy = it.h - cp.y, dz = it.y - cp.z;
                const d2 = dx * dx + dy * dy + dz * dz;
                const max = it.maxDist;
                if (d2 > max * max) show = false;
                else {
                    const p = view.projectToScreen(it.x, it.y, it.h);
                    if (!p.visible) show = false;
                    else {
                        const d = Math.sqrt(d2);
                        const fade = max * 0.3;
                        op = d > max - fade ? Math.max(0, (max - d) / fade) : 1;
                        sc = GameUtil.clamp(1.1 - d / max * 0.45, 0.62, 1.1);
                        sx = p.x; sy = p.y;
                    }
                }
            }
            const el = it.el;
            if (!show) {
                if (it.shown) { el.style.display = 'none'; it.shown = false; }
                continue;
            }
            if (!it.shown) { el.style.display = ''; it.shown = true; it.sx = -1e9; }
            if (Math.abs(sx - it.sx) > 0.25 || Math.abs(sy - it.sy) > 0.25 || Math.abs(sc - it.scale) > 0.01) {
                it.sx = sx; it.sy = sy; it.scale = sc;
                el.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0) translate(-50%,-100%) scale(' + sc.toFixed(2) + ')';
            }
            if (Math.abs(op - it.op) > 0.03) { it.op = op; el.style.opacity = op.toFixed(2); }
        }
    },
};
