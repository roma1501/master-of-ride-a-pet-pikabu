// SuperRewards.js — супер-награда за рекламу (требование пользователя): SUPER_VIEWS подтверждённых просмотров
// (прогресс сохраняется, «За рекламу 2/5») открывают на SUPER_DURATION секунд мощный временный буст:
// деньги ×SUPER_CASH_MULT, удача ×SUPER_LUCK_MULT, скорость ×SUPER_SPEED_MULT, яйца ломаются позже (×SUPER_EGG_TIME_MULT),
// инкубация быстрее (×SUPER_HATCH_MULT), лапки за вылупление ×SUPER_PAWS_MULT. Повтор продлевает буст (до SUPER_MAX_DURATION).
// Множители читает GameState.superMult(вид) — Player (скорость), Eggs (время яиц, инкубация), GameState (деньги, удача, лапки).
// Просмотры — rewarded id 'super-reward', награда только после подтверждения SDK, это не раунды.
// Кнопка «Супер» справа на HUD: значок — прогресс просмотров, при активном бусте — оставшееся время.

const SUPER_CFG = (() => {
    const U = 'undefined';
    return {
        views: typeof SUPER_VIEWS !== U ? SUPER_VIEWS : 5,
        duration: typeof SUPER_DURATION !== U ? SUPER_DURATION : 600,
        max: typeof SUPER_MAX_DURATION !== U ? SUPER_MAX_DURATION : 1800,
    };
})();

Lang.add({
    ru: {
        'super.btn': 'Супер', 'super.title': 'Супер-награда',
        'super.lead': 'Посмотри рекламу {n} раз — и получи мощные бусты на {m} мин!',
        'super.cash': 'Деньги ×{v}', 'super.luck': 'Удача ×{v}', 'super.speed': 'Скорость +{v}%',
        'super.egg': 'Яйца ломаются на {v}% позже', 'super.hatch': 'Вылупление ×{v} быстрее', 'super.paws': 'Лапки ×{v}',
        'super.watch': 'За рекламу {a}/{b}', 'super.progress': 'Просмотрено: {a} из {b}',
        'super.active': 'Супер-буст активен: {t}', 'super.extend': 'Ещё {n} просмотров — продлить на {m} мин',
        'super.got': 'Супер-награда! Бусты на {m} мин', 'super.max': 'Буст уже на максимуме',
    },
    en: {
        'super.btn': 'Super', 'super.title': 'Super reward',
        'super.lead': 'Watch {n} ads and get powerful boosts for {m} min!',
        'super.cash': 'Cash x{v}', 'super.luck': 'Luck x{v}', 'super.speed': 'Speed +{v}%',
        'super.egg': 'Eggs break {v}% later', 'super.hatch': 'Hatching x{v} faster', 'super.paws': 'Paws x{v}',
        'super.watch': 'Watch ad {a}/{b}', 'super.progress': 'Watched: {a} of {b}',
        'super.active': 'Super boost active: {t}', 'super.extend': '{n} more ads to add {m} min',
        'super.got': 'Super reward! Boosts for {m} min', 'super.max': 'Boost is already at max',
    },
});

const SUPER_CSS = `
.sr-wrap{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*10);text-align:center}
.sr-chest{width:calc(var(--u)*120);height:calc(var(--u)*92);position:relative;filter:drop-shadow(0 calc(var(--u)*4) 0 rgba(0,0,0,.35))}
.sr-chest .lid{position:absolute;left:4%;right:4%;top:0;height:42%;border-radius:calc(var(--u)*30) calc(var(--u)*30) calc(var(--u)*8) calc(var(--u)*8);
 background:linear-gradient(#ffd85a,#f0a31a);border:calc(var(--u)*4) solid #5b3417}
.sr-chest .box{position:absolute;left:0;right:0;bottom:0;height:62%;border-radius:calc(var(--u)*10);background:linear-gradient(#b8742e,#7b4a24);border:calc(var(--u)*4) solid #5b3417}
.sr-chest .lock{position:absolute;left:50%;top:34%;width:calc(var(--u)*24);height:calc(var(--u)*28);margin-left:calc(var(--u)*-12);border-radius:calc(var(--u)*6);background:#ffe27a;border:calc(var(--u)*4) solid #5b3417}
.sr-chest .glow{position:absolute;inset:-30%;background:radial-gradient(circle,rgba(255,236,140,.75),rgba(255,236,140,0) 62%);animation:sr-pulse 1.6s ease-in-out infinite;z-index:-1}
@keyframes sr-pulse{0%,100%{transform:scale(.9);opacity:.75}50%{transform:scale(1.08);opacity:1}}
.sr-lead{font-weight:900;font-size:calc(var(--u)*17);color:#5b3417}
.sr-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(var(--u)*6);width:100%}
.sr-item{display:flex;align-items:center;gap:calc(var(--u)*6);padding:calc(var(--u)*6) calc(var(--u)*8);border-radius:calc(var(--u)*10);background:rgba(255,250,228,.85);
 border:calc(var(--u)*3) solid #c79a5a;font-weight:900;font-size:calc(var(--u)*14);color:#3a2210;text-align:left}
.sr-item .ico{width:calc(var(--u)*28);height:calc(var(--u)*28);flex:none}
.sr-dots{display:flex;gap:calc(var(--u)*6)}
.sr-dots i{width:calc(var(--u)*22);height:calc(var(--u)*22);border-radius:50%;background:#e9d7b0;border:calc(var(--u)*3) solid #5b3417}
.sr-dots i.on{background:radial-gradient(circle at 35% 35%,#fff7b0,#ffc21a 60%,#e08a00)}
.sr-active{font-weight:900;font-size:calc(var(--u)*16);color:#2f7d32}
@media (max-width: 520px){.sr-list{grid-template-columns:1fr}}
`;

/** @satisfies {Record<string, any>} */
const SuperRewards = {
    id: 'super',
    _t: 0,
    /** @type {any} */
    _ui: null,

    progress() {
        const s = /** @type {any} */ (GameState.state);
        if (!s.superRewards || typeof s.superRewards !== 'object') s.superRewards = { progress: 0 };
        const p = Number(s.superRewards.progress) || 0;
        return Math.max(0, Math.min(SUPER_CFG.views - 1, Math.floor(p)));
    },

    init() {
        GameUI.addCss('super-rewards', SUPER_CSS);
        GameUI.addSideButton({ id: 'super', side: 'right', icon: 'star', label: Lang.t('super.btn'), color: 'yellow', onClick: () => this.open() });
        this._badge();
    },

    onLoad() { this._badge(); },

    // Один подтверждённый просмотр. На последнем — буст (продление), прогресс с нуля. Возвращает true, если буст выдан.
    addView() {
        const s = /** @type {any} */ (GameState.state);
        const p = this.progress() + 1;
        if (p < SUPER_CFG.views) {
            s.superRewards = { progress: p };
            GameState.saveNow();
            GameUI.toast(Lang.t('super.progress', { a: p, b: SUPER_CFG.views }), 'good', 1800);
            this._badge();
            return false;
        }
        s.superRewards = { progress: 0 };
        const left = GameState.boostLeft('super');
        const add = Math.max(0, Math.min(SUPER_CFG.duration, SUPER_CFG.max - left));
        GameState.addBoost('super', add);
        this._extendBasketEggs(left > 0);
        GameState.saveNow();
        GameUI.sfx('unlock', { volume: 0.6 });
        GameUI.banner(Lang.t('super.got', { m: Math.round(SUPER_CFG.duration / 60) }), 2600, { color: '#ffd21f' });
        try { if (window.app && window.app.fx && typeof Player !== 'undefined') window.app.fx.play('confetti', new BABYLON.Vector3(Player.x, Player.h + 160, Player.y)); } catch (e) { /* без частиц */ }
        this._badge();
        return true;
    },

    // Яйца в корзине в момент включения буста тоже получают запас времени (×SUPER_EGG_TIME_MULT к остатку), один раз.
    _extendBasketEggs(alreadyOn) {
        if (alreadyOn || typeof Eggs === 'undefined' || !Array.isArray(Eggs.basket)) return;
        const k = GameState.superMult('eggTime');
        for (const e of Eggs.basket) {
            if (!e || !(e.timeLeft > 0)) continue;
            e.timeLeft *= k;
            if (e.total > 0) e.total *= k;
        }
    },

    open() {
        const views = SUPER_CFG.views, m = Math.round(SUPER_CFG.duration / 60);
        const self = this;
        GameUI.openPanel({
            id: 'super', title: Lang.t('super.title'),
            build(el, panel) {
                const E = GameUtil.el;
                const pct = (k) => Math.round((k - 1) * 100);
                const items = [
                    ['banknote', Lang.t('super.cash', { v: GameState.superMultValue('cash') })],
                    ['clover', Lang.t('super.luck', { v: GameState.superMultValue('luck') })],
                    ['bolt', Lang.t('super.speed', { v: pct(GameState.superMultValue('speed')) })],
                    ['hourglass', Lang.t('super.egg', { v: pct(GameState.superMultValue('eggTime')) })],
                    ['egg', Lang.t('super.hatch', { v: GameState.superMultValue('hatch') })],
                    ['paw', Lang.t('super.paws', { v: GameState.superMultValue('paws') })],
                ];
                const wrap = E('div', { class: 'sr-wrap parch' });
                wrap.appendChild(E('div', { class: 'sr-chest', html: '<i class="glow"></i><i class="box"></i><i class="lid"></i><i class="lock"></i>' }));
                wrap.appendChild(E('div', { class: 'sr-lead', text: Lang.t('super.lead', { n: views, m }) }));
                const list = E('div', { class: 'sr-list' });
                for (const [ic, txt] of items) list.appendChild(E('div', { class: 'sr-item', html: GameUI.icon(ic) + '<span>' + GameUtil.esc(txt) + '</span>' }));
                wrap.appendChild(list);
                const dots = E('div', { class: 'sr-dots' });
                const active = E('div', { class: 'sr-active' });
                const btn = E('button', { class: 'gb pink big', type: 'button' });
                wrap.append(dots, active, btn);
                el.appendChild(wrap);
                const paint = () => {
                    const p = self.progress();
                    dots.innerHTML = '';
                    for (let i = 0; i < views; i++) dots.appendChild(E('i', { class: i < p ? 'on' : '' }));
                    const left = GameState.boostLeft('super');
                    active.textContent = left > 0 ? Lang.t('super.active', { t: GameUtil.fmtClock ? GameUtil.fmtClock(left) : Math.ceil(left) + '' }) : '';
                    active.style.display = left > 0 ? '' : 'none';
                    rb.setLabel(Lang.t('super.watch', { a: p, b: views }));
                };
                const rb = GameUI.rewardButton(btn, {
                    id: 'super-reward', label: Lang.t('super.watch', { a: self.progress(), b: views }),
                    onReward: () => {
                        if (GameState.boostLeft('super') >= SUPER_CFG.max - 1) { GameUI.toast(Lang.t('super.max'), 'info'); return; }
                        self.addView();
                        paint();
                    },
                });
                paint();
                const tick = setInterval(() => { if (!document.body.contains(btn)) { clearInterval(tick); return; } paint(); }, 1000);
                void panel;
            },
        });
    },

    // Значок кнопки: прогресс просмотров или «★» оставшиеся минуты.
    _badge() {
        if (typeof GameUI === 'undefined' || !GameUI.setBadge) return;
        const left = GameState.boostLeft ? GameState.boostLeft('super') : 0;
        GameUI.setBadge('super', left > 0 ? Math.ceil(left / 60) + "'" : (this.progress() ? this.progress() + '/' + SUPER_CFG.views : 0));
    },

    update(dt) {
        this._t += dt;
        if (this._t < 1) return;
        this._t = 0;
        this._badge();
    },
};

Game.register(SuperRewards);
