// Tutorial.js — обучение новичка по действиям поверх живой игры: короткие шаги, «Пропустить» на каждом шаге, «Как играть».
//
//   Tutorial.active                    идёт обучение (Daily Gift, магазин и прочие окна не всплывают: !Tutorial.active)
//   Tutorial.step                      id шага: move | look | dismount | ride | egg | pick | home | hatch | place
//   Tutorial.autoStart()               начать, если state.tutorialDone = false (зовёт Menus по «Играть»)
//   Tutorial.start({ replay })         начать сначала (пункт «Как играть» в паузе и на титульном экране)
//   Tutorial.skip()                    «Пропустить» одним нажатием: сразу обычная игра, tutorialDone = true и запись
//   Tutorial.finish(reason)            'done' | 'skip' | 'abort' (сброс сохранения, перезапуск — без записи tutorialDone)
// События (Game.events): tutorial { step, active, reason? } на каждом шаге и при выходе.
//
// Шаги засчитываются ДЕЙСТВИЕМ, не таймером: 1 иди, 2 осмотрись, 3 слезь с питомца (R / кнопка; если уже пешком — пропуск),
// 4 сядь на питомца обратно (R / кнопка, после паузы PLAYER_RIDE_COOLDOWN), 5 следуй за зелёными стрелками к светящемуся
// белому яйцу, 6 подбери его, 7 вези на ранчо (яйцо ложится в гнездо), 8 вылупи (кнопка действия / E), 9 «На ранчо» в окне
// результата. Новичок начинает верхом, поэтому «слезь» и «сядь» учат кнопку R, которую иначе никто бы не нажал. Шаг, условие
// которого уже выполнено, пропускается. Подсказка — деревянная табличка
// сверху (жирный заголовок + значки ввода под текущий способ: клавиатура и мышь или касания, меняется на лету) и указатель
// на кнопку HUD или на предмет в мире (стрелка над ним; за краем экрана — стрелка у границы).
// Обучение — не раунд: пока оно идёт, результат вылупления не считается (Platform.ads.roundEnded, рекорд, interstitial),
// таймеры яйца заморожены (оно не разобьётся и не исчезнет). Для этого init ставит Eggs.roundGuard = () => !Tutorial.active:
// пока страж возвращает false, Eggs.endRound ничего не считает, а «Далее» в окне результата закрывает окно без interstitial.
// Пауза, автопауза и lory-release-input работают как всегда: обучение не трогает ввод и не ставит своих пауз.

Lang.add({
    ru: {
        'tut.skip': 'Пропустить',
        'tut.move.t': 'Двигайся', 'tut.move.pc': 'или', 'tut.move.touch': 'Веди пальцем по левой половине экрана',
        'tut.look.t': 'Осмотрись', 'tut.look.pc': 'Зажми кнопку мыши и води', 'tut.look.touch': 'Води пальцем по правой половине экрана',
        'tut.off.t': 'Слезь с питомца', 'tut.off.pc': 'или нажми кнопку «{a}»', 'tut.off.touch': 'Нажми кнопку «{a}»',
        'tut.ride.t': 'Сядь на питомца', 'tut.ride.pc': 'или нажми кнопку «{a}»', 'tut.ride.touch': 'Нажми кнопку «{a}»',
        'tut.egg.t': 'Найди яйцо', 'tut.egg.h': 'Следуй за зелёными стрелками к светящемуся яйцу',
        'tut.pick.t': 'Подбери яйцо', 'tut.pick.h': 'Подъедь к яйцу вплотную',
        'tut.home.t': 'Вези яйцо домой', 'tut.home.h': 'Зелёные стрелки ведут на ранчо. Пока идёт обучение, яйцо не разобьётся',
        'tut.wait.t': 'Яйцо греется', 'tut.wait.h': 'Подожди: скоро в гнезде появится «{a}»',
        'tut.hatch.t': 'Вылупи питомца!', 'tut.hatch.pc': 'Встань у гнезда и нажми', 'tut.hatch.touch': 'Встань у гнезда и нажми кнопку «{a}»',
        'tut.cine.t': 'Смотри!', 'tut.cine.h': 'Из яйца вылупляется питомец',
        'tut.place.t': 'Новый питомец!', 'tut.place.h': 'Нажми «{a}»: питомец будет приносить деньги', 'tut.next.h': 'Нажми «{a}»',
        'tut.done': 'Обучение пройдено! Теперь ищи редкие яйца', 'tut.doneCash': 'Питомец на ранчо приносит деньги: проезжай рядом и собирай!',
    },
    en: {
        'tut.skip': 'Skip',
        'tut.move.t': 'Move around', 'tut.move.pc': 'or', 'tut.move.touch': 'Drag your finger on the left half of the screen',
        'tut.look.t': 'Look around', 'tut.look.pc': 'Hold the mouse button and drag', 'tut.look.touch': 'Drag your finger on the right half of the screen',
        'tut.off.t': 'Get off your pet', 'tut.off.pc': 'or press the "{a}" button', 'tut.off.touch': 'Press the "{a}" button',
        'tut.ride.t': 'Ride your pet', 'tut.ride.pc': 'or press the "{a}" button', 'tut.ride.touch': 'Press the "{a}" button',
        'tut.egg.t': 'Find the egg', 'tut.egg.h': 'Follow the green arrows to the glowing egg',
        'tut.pick.t': 'Pick up the egg', 'tut.pick.h': 'Ride right up to the egg',
        'tut.home.t': 'Take the egg home', 'tut.home.h': 'The green arrows lead to your ranch. The egg will not break during the tutorial',
        'tut.wait.t': 'The egg is warming up', 'tut.wait.h': 'Wait a moment: the nest will say "{a}" soon',
        'tut.hatch.t': 'Hatch your pet!', 'tut.hatch.pc': 'Stand by the nest and press', 'tut.hatch.touch': 'Stand by the nest and press the "{a}" button',
        'tut.cine.t': 'Look!', 'tut.cine.h': 'A pet is hatching from the egg',
        'tut.place.t': 'A new pet!', 'tut.place.h': 'Press "{a}": your pet will earn money', 'tut.next.h': 'Press "{a}"',
        'tut.done': 'Tutorial complete! Now hunt for rare eggs', 'tut.doneCash': 'The pet on your ranch earns money: ride past it to collect!',
    },
});

// Числа Constants.js читаются через typeof с дефолтом (редактор патчит только литералы).
function tutCfg() {
    const U = 'undefined';
    return {
        move: typeof TUTORIAL_MOVE_DISTANCE !== U ? TUTORIAL_MOVE_DISTANCE : 350,
        look: typeof TUTORIAL_LOOK_PIXELS !== U ? TUTORIAL_LOOK_PIXELS : 260,
        near: typeof TUTORIAL_NEAR_EGG !== U ? TUTORIAL_NEAR_EGG : 750,
        hatchWait: typeof TUTORIAL_HATCH_WAIT !== U ? TUTORIAL_HATCH_WAIT : 8,
    };
}

/** Порядок шагов. Шаг, условие которого уже выполнено при входе, пропускается (см. Tutorial._skipStep). */
const TUTORIAL_STEPS = ['move', 'look', 'dismount', 'ride', 'egg', 'pick', 'home', 'hatch', 'place'];

const TUT_CSS = `
#tut-layer{position:absolute;inset:0;z-index:7;pointer-events:none;display:none}
#game-ui.tut #tut-layer{display:block}
/* табличка подсказки: по центру сверху (как цель в HUD), в портрете — во всю ширину левее кнопки паузы */
.tut-sign{position:absolute;left:50%;top:max(env(safe-area-inset-top),calc(var(--u)*8));transform:translateX(-50%);display:flex;align-items:center;gap:calc(var(--u)*14);
 padding:calc(var(--u)*8) calc(var(--u)*14) calc(var(--u)*8) calc(var(--u)*26);width:max-content;max-width:calc(100vw - var(--u)*190);text-align:left}
.tut-sign.pop{animation:tutpop .35s cubic-bezier(.2,1.6,.4,1)}
@keyframes tutpop{0%{transform:translateX(-50%) scale(.9)}100%{transform:translateX(-50%) scale(1)}}
#game-ui.portrait .tut-sign{left:max(env(safe-area-inset-left),calc(var(--u)*8));right:calc(var(--u)*80);transform:none;width:auto;max-width:none;flex-direction:column;align-items:stretch;gap:calc(var(--u)*6);padding:calc(var(--u)*8) calc(var(--u)*14)}
#game-ui.portrait .tut-sign.pop{animation:tutpop2 .35s cubic-bezier(.2,1.6,.4,1)}
@keyframes tutpop2{0%{transform:scale(.92)}100%{transform:scale(1)}}
.tut-main{display:flex;flex-direction:column;gap:calc(var(--u)*3);min-width:0;flex:1 1 auto}
.tut-ttl{font-size:max(15px,calc(var(--u)*23));font-weight:900;line-height:1.05}
.tut-hint{display:flex;align-items:center;flex-wrap:wrap;gap:calc(var(--u)*3) calc(var(--u)*6);font-size:max(12px,calc(var(--u)*17));line-height:1.18;font-weight:800;min-height:1.2em}
.tut-hint .kimg{height:max(24px,calc(var(--u)*36));margin:0}
.tut-hint .key{font-size:max(13px,calc(var(--u)*20))}
.tut-bar{height:calc(var(--u)*10);min-height:6px;border-radius:999px;background:#2b190b;border:calc(var(--u)*2) solid #120904;overflow:hidden;display:none}
.tut-bar.show{display:block}
.tut-bar i{display:block;height:100%;width:0;background:linear-gradient(#9cf07a,#43c431);transition:width .15s linear}
.tut-side{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--u)*7);flex:none}
#game-ui.portrait .tut-side{flex-direction:row-reverse;justify-content:space-between;align-items:center}
.tut-skip{pointer-events:auto;font-size:max(13px,calc(var(--u)*18));min-height:max(32px,calc(var(--u)*40));padding:max(5px,calc(var(--u)*8)) max(12px,calc(var(--u)*16));gap:calc(var(--u)*7)}
#game-ui.touch .tut-skip{min-height:max(40px,calc(var(--u)*48));padding-left:max(16px,calc(var(--u)*20));padding-right:max(16px,calc(var(--u)*20))}
.tut-skip .key{font-size:max(11px,calc(var(--u)*14))}
.tut-skip .kimg{height:max(18px,calc(var(--u)*26))}
.tut-dots{display:flex;gap:calc(var(--u)*5);align-items:center}
.tut-dots i{width:max(7px,calc(var(--u)*10));height:max(7px,calc(var(--u)*10));border-radius:50%;background:#2b190b;border:calc(var(--u)*2) solid #120904;flex:none}
.tut-dots i.done{background:#43c431}
.tut-dots i.cur{background:#ffd21f;transform:scale(1.3)}
/* панель, пауза или модальное окно (результат вылупления) открыты: табличка сворачивается до одной кнопки «Пропустить» в левом верхнем
   углу и окна не закрывает. Указатель на кнопку окна («На ранчо») при модальном окне остаётся: его ведёт _domTarget */
#game-ui.panel-open #tut-layer{visibility:visible}
#game-ui.panel-open .tut-sign,#game-ui.modal-open .tut-sign{left:max(env(safe-area-inset-left),calc(var(--u)*8));right:auto;transform:none;width:auto;max-width:none;padding:calc(var(--u)*5) calc(var(--u)*8);flex-direction:row;animation:none}
#game-ui.panel-open .tut-main,#game-ui.panel-open .tut-dots,#game-ui.panel-open .tut-pointer,#game-ui.panel-open .tut-edge,#game-ui.modal-open .tut-main,#game-ui.modal-open .tut-dots,#game-ui.modal-open .tut-edge{display:none}
/* подсветка кнопки */
#game-ui .tut-hl{outline:calc(var(--u)*5) solid #ffe14a;outline-offset:calc(var(--u)*3);animation:tuthl .75s ease-in-out infinite alternate}
@keyframes tuthl{from{outline-color:#ffe14a;filter:brightness(1)}to{outline-color:#fff;filter:brightness(1.22)}}
/* указатель над кнопкой HUD или над кнопкой окна */
.tut-pointer{position:absolute;left:0;top:0;width:calc(var(--u)*46);height:calc(var(--u)*56);margin-left:calc(var(--u)*-23);display:none;will-change:transform}
.tut-pointer .tpr{width:100%;height:100%}
.tut-pointer.below .tpr{transform:rotate(180deg)}
.tut-pointer .tp{position:relative;width:100%;height:100%;animation:tutbob .6s ease-in-out infinite alternate}
.tut-chip{display:flex;align-items:center;justify-content:center;border-radius:50%;background:linear-gradient(#fff067,#ffd21f 55%,#e29f00);border:calc(var(--u)*3.5) solid #120904;box-shadow:inset 0 calc(var(--u)*3) 0 rgba(255,255,255,.55),0 calc(var(--u)*3.5) 0 #120904}
.tut-chip img{width:62%;height:62%;object-fit:contain;filter:drop-shadow(0 calc(var(--u)*2) 0 rgba(0,0,0,.55))}
.tut-pointer .tut-chip{width:calc(var(--u)*46);height:calc(var(--u)*46)}
.tut-pointer .tp::after{content:'';position:absolute;left:50%;bottom:0;margin-left:calc(var(--u)*-9);border:calc(var(--u)*9) solid transparent;border-top:calc(var(--u)*11) solid #120904;border-bottom:0}
@keyframes tutbob{from{transform:translateY(calc(var(--u)*-3))}to{transform:translateY(calc(var(--u)*7))}}
/* стрелка у границы экрана: цель за кадром */
.tut-edge{position:absolute;left:0;top:0;width:calc(var(--u)*54);height:calc(var(--u)*54);margin:calc(var(--u)*-27) 0 0 calc(var(--u)*-27);display:none;will-change:transform}
.tut-edge .te{width:100%;height:100%}
.tut-edge .tut-chip{width:100%;height:100%;animation:tutpulse .55s ease-in-out infinite alternate}
@keyframes tutpulse{from{transform:scale(.94)}to{transform:scale(1.12)}}
/* указатель в мире (Billboard): стрелка вниз над предметом и подпись */
.bb.tut-bb{font-size:calc(var(--u)*18)}
.tut-pin{display:flex;flex-direction:column;align-items:center;animation:tutpin .7s ease-in-out infinite alternate}
.tut-pin .tp{position:relative;width:calc(var(--u)*52);height:calc(var(--u)*62)}
.tut-pin .tut-chip{width:calc(var(--u)*52);height:calc(var(--u)*52)}
.tut-pin .tp::after{content:'';position:absolute;left:50%;bottom:0;margin-left:calc(var(--u)*-10);border:calc(var(--u)*10) solid transparent;border-top:calc(var(--u)*12) solid #120904;border-bottom:0}
.tut-pin .lb{margin-bottom:calc(var(--u)*5);font-size:calc(var(--u)*19)}
@keyframes tutpin{from{transform:translateY(calc(var(--u)*-6))}to{transform:translateY(calc(var(--u)*8))}}
`;

/** @satisfies {Record<string, any>} */
const Tutorial = {
    id: 'tutorial',
    /** Идёт обучение. Для Daily Gift, магазина и прочих окон: пока true — не показывать поверх. */
    active: false,
    /** Запущено заново пунктом «Как играть» (шаги не пропускаются по сохранению, tutorialDone уже true). */
    replay: false,
    /** id текущего шага ('' — обучения нет). */
    step: '',
    idx: -1,
    /** @type {LoryApp | null} */
    app: null,
    /** Яйцо обучения в мире (запись Eggs.live) или null. @type {any} */
    egg: null,
    /** Получено в этом обучении: яйцо доставлено / питомец вылуплен / питомец поставлен на ранчо. */
    delivered: false,
    deliveredNest: /** @type {number | null} */ (null),
    hatched: false,
    placed: false,
    // UI
    /** @type {HTMLElement | null} */
    layer: null,
    /** @type {any} */
    ui: null,
    /** @type {any} */
    pin: null,
    /** @type {HTMLElement | null} */
    hlEl: null,
    // внутреннее
    _t: 0,
    _sig: '',
    _uiT: 0,
    _edgeT: 0,
    /** Нижняя граница таблички подсказки на экране, px (раз в 0.1 с). */
    _signBottom: 70,
    /** Цель в мире, обновляется раз в 0.1 с: { key, x, y, h, label } или null. @type {any} */
    _w: null,
    _guideT: 0,
    _moved: 0,
    _lastX: 0, _lastY: 0,
    _lookBase: 0,
    _progress: -1,
    _pendingAuto: false,
    _bound: false,

    // =============================================================================================
    // Модуль
    // =============================================================================================
    init(app) {
        this.app = app;
        GameUI.addCss('tutorial', TUT_CSS);
        this._buildUi();
        this._bindEvents();
        // обучение — не раунд: пока оно идёт, результат вылупления не считается (рекорд, реклама, interstitial по «Далее»)
        if (typeof Eggs !== 'undefined') Eggs.roundGuard = () => !this.active;
    },

    /** Состояние загружено или сброшено (GameState.reset): обучение не доживает до чужого сохранения. */
    onLoad(state) {
        if (this.active) this.finish('abort');
        this.egg = null;
        // сброс сохранения во время игры: новичок снова проходит обучение (на старте его запускает Menus по «Играть»)
        if (typeof Game !== 'undefined' && Game.started && !state.tutorialDone) this._pendingAuto = true;
    },

    update(dt) {
        if (this._pendingAuto) {
            const titleOpen = typeof Menus !== 'undefined' && !!Menus.titleOpen;
            if (!titleOpen && !GameUI.blocking) { this._pendingAuto = false; this.autoStart(); }
        }
        if (!this.active || !Player.ready) return;
        // яйца не разбиваются и не исчезают, пока идёт обучение: Eggs уже вычел dt в этом кадре — возвращаем
        for (const b of Eggs.basket) b.timeLeft = b.total;
        if (this.egg) this.egg.age = 0;
        this._t += dt;
        if (this._check(this.step)) this._next();
        if (!this.active) return;
        this._guideT -= dt;
        if (this._guideT <= 0) { this._guideT = 0.4; this._updateGuide(); }
        this._updateUi(dt);
    },

    // =============================================================================================
    // Запуск, пропуск, выход
    // =============================================================================================
    /** Первый запуск игры: обучение, если оно ещё не пройдено и не пропущено. */
    autoStart() {
        if (this.active || GameState.state.tutorialDone) return false;
        this.start({ replay: false });
        return true;
    },

    /** Начать (или начать заново) с первого шага. replay — «Как играть». */
    start(opts = {}) {
        if (!GameUI.root) return false;
        if (this.active) this.finish('abort');
        this.replay = !!opts.replay;
        this.egg = null;
        this.delivered = false; this.deliveredNest = null; this.hatched = false; this.placed = false;
        this.active = true;
        this._sig = '';
        GameUI.root.classList.add('tut');
        if (this.layer) this.layer.style.display = '';
        this._renderDots();
        this._enter(0);
        if (this.active) this._updateUi(0);   // табличка заполнена сразу, не с первого кадра
        return this.active;
    },

    /** «Пропустить»: одно нажатие, сразу обычная игра. */
    skip() {
        if (!this.active) return;
        GameUI.sfx('click', { volume: 0.4 });
        this.finish('skip');
    },

    /** Выход: подсветка, указатели и стрелки сняты, заморозка яиц отпущена; 'done' и 'skip' запоминают tutorialDone. */
    finish(reason = 'done') {
        if (!this.active) return;
        const hatchedDone = this.hatched, placed = this.placed;
        this.active = false;
        this.step = ''; this.idx = -1;
        if (GameUI.root) GameUI.root.classList.remove('tut');
        if (this.layer) this.layer.style.display = 'none';
        this._setHighlight(null);
        this._removePin();
        this._w = null;
        if (this.ui) { this.ui.pointer.style.display = 'none'; this.ui.edge.style.display = 'none'; }
        // стрелки обучения: к ранчо, если игрок несёт яйцо, иначе убрать
        if (typeof Guide !== 'undefined') { if (Eggs.basket.length) Guide.toRanch(); else Guide.set(null); }
        // яйцо обучения становится обычным яйцом мира: без своей искры
        if (this.egg && this.egg.fxGroup) { try { this.egg.fxGroup.stop(); } catch (e) { /* уже остановлена */ } this.egg.fxGroup = null; }
        this.egg = null;
        if (reason === 'done' || reason === 'skip') {
            const s = GameState.state;
            if (!s.tutorialDone) { s.tutorialDone = true; }
            GameState.markDirty();
            GameState.saveNow();
        }
        if (reason === 'done' && typeof GameUI.banner === 'function') {
            GameUI.banner(Lang.t(hatchedDone && placed ? 'tut.doneCash' : 'tut.done'), 4800);
        }
        Game.events.emit('tutorial', { step: reason === 'done' ? 'done' : reason, active: false, reason });
    },

    isActive() { return this.active; },

    // =============================================================================================
    // Шаги
    // =============================================================================================
    _carrying() { return Eggs.basket.length > 0; },
    _hasNestEgg() {
        const s = GameState.state;
        for (let i = 0; i < s.nests; i++) if (s.nestEggs[i]) return true;
        return false;
    },

    /** Номер гнезда, где вылупляем: доставленное обучением яйцо, иначе (не повтор) самое близкое к готовности. */
    _hatchTarget() {
        const s = GameState.state;
        if (this.deliveredNest != null && s.nestEggs[this.deliveredNest]) return this.deliveredNest;
        if (this.replay) return -1;
        let best = -1, bl = Infinity;
        for (let i = 0; i < s.nests; i++) {
            const e = s.nestEggs[i];
            if (!e) continue;
            const left = GameData.nestState(e).left;
            if (left < bl) { bl = left; best = i; }
        }
        return best;
    },

    /** Условие шага уже выполнено — пропустить (игрок уже верхом, уже несёт яйцо, яйцо уже в гнезде…). */
    _skipStep(id) {
        switch (id) {
            case 'dismount': return !Player.riding;
            case 'ride': return !!Player.riding;
            case 'egg': case 'pick': return this._carrying() || (!this.replay && this._hasNestEgg());
            case 'home': return !this._carrying();
            case 'hatch': return this._hatchTarget() < 0;
            case 'place': return !this.hatched;
            default: return false;
        }
    },

    _enter(i) {
        while (i < TUTORIAL_STEPS.length && this._skipStep(TUTORIAL_STEPS[i])) i++;
        if (i >= TUTORIAL_STEPS.length) { this.finish('done'); return; }
        this.idx = i;
        this.step = TUTORIAL_STEPS[i];
        this._t = 0;
        this._sig = '';
        this._progress = -1;
        this._moved = 0; this._lastX = Player.x; this._lastY = Player.y;
        this._lookBase = GameUI.input.lookTotal;
        this._guideT = 0;
        this._uiT = 0;   // указатели нового шага — в этом же кадре
        if (this.step === 'egg' || this.step === 'pick') this._ensureEgg();
        this._renderDots();
        Game.events.emit('tutorial', { step: this.step, active: true });
    },

    _next() {
        GameUI.sfx('unlock', { volume: 0.4 });
        this._enter(this.idx + 1);
    },

    /** Шаг выполнен действием игрока? */
    _check(id) {
        const cfg = tutCfg();
        const P = Player;
        switch (id) {
            case 'move': {
                const d = Math.hypot(P.x - this._lastX, P.y - this._lastY);
                this._lastX = P.x; this._lastY = P.y;
                if (d < 700) this._moved += d;     // телепорт не считается
                this._setProgress(this._moved / cfg.move);
                return this._moved >= cfg.move;
            }
            case 'look': {
                const got = GameUI.input.lookTotal - this._lookBase;
                this._setProgress(got / cfg.look);
                return got >= cfg.look;
            }
            case 'dismount': return !P.riding;
            case 'ride': return !!P.riding;
            case 'egg': {
                if (this._carrying()) return true;
                this._ensureEgg();
                return !!this.egg && Math.hypot(this.egg.x - P.x, this.egg.y - P.y) < cfg.near;
            }
            case 'pick': {
                if (this._carrying()) return true;
                this._ensureEgg();
                return false;
            }
            case 'home': return this.delivered;
            case 'hatch': {
                if (this.hatched || Eggs.hatching) return true;
                const i = this._hatchTarget();
                if (i < 0) return true;
                const e = GameState.state.nestEggs[i];
                const st = GameData.nestState(e);
                // ждать не дольше TUTORIAL_HATCH_WAIT секунд: яйцо в гнезде доводится до готовности
                if (st.left > cfg.hatchWait) { e.t = GameData.EGGS[e.type].hatch - cfg.hatchWait; GameState.markDirty(); }
                return false;
            }
            case 'place': return this.hatched && !Eggs.hatching;
            default: return false;
        }
    },

    _setProgress(f) {
        f = Math.max(0, Math.min(1, f));
        const k = Math.round(f * 50);
        if (k === this._progress) return;
        this._progress = k;
        if (this.ui) this.ui.barFill.style.width = (k * 2) + '%';
    },

    // =============================================================================================
    // Яйцо обучения
    // =============================================================================================
    /** Белое яйцо в мире: ближайшее живое к ранчо, иначе рождается у ближайшей к ранчо точки луга. */
    _ensureEgg() {
        if (this._carrying()) return;
        if (this.egg && Eggs.live.indexOf(this.egg) >= 0) return;
        this.egg = null;
        const R = Ranch.player || Player;
        let best = null, bd = Infinity;
        for (const e of Eggs.live) {
            if (e.type !== 'white') continue;
            const d = Math.hypot(e.x - R.x, e.y - R.y);
            if (d < bd) { bd = d; best = e; }
        }
        if (!best) {
            const ms = Eggs.markers.filter((m) => m.zone === 'meadow' || m.zone === 'flower')
                .sort((a, b) => Math.hypot(a.x - R.x, a.y - R.y) - Math.hypot(b.x - R.x, b.y - R.y));
            for (const m of ms) {
                best = Eggs.spawn('white', m, { force: true, announce: false });
                if (best) break;
            }
            // нет подходящих точек луга: яйцо перед игроком
            if (!best) best = Eggs.spawn('white', { x: Player.x + Math.cos(Player.heading) * 1500, y: Player.y + Math.sin(Player.heading) * 1500 }, { force: true, announce: false });
        }
        if (!best) return;
        this.egg = best;
        best.age = 0;
        // светящееся яйцо: искры над ним (Eggs.egg-sparkle); Eggs._removeLive останавливает группу сам
        const fx = this.app && this.app.fx;
        if (fx && !best.fxGroup) {
            try { best.fxGroup = fx.play('egg-sparkle', [best.x, best.h, best.y], { color: '#fff6c8' }); } catch (e) { best.fxGroup = null; }
        }
    },

    // =============================================================================================
    // События игры
    // =============================================================================================
    _bindEvents() {
        if (this._bound) return;
        this._bound = true;
        const ev = Game.events;
        ev.on('egg:delivered', (e) => { if (this.active) { this.delivered = true; this.deliveredNest = e && e.nest != null ? e.nest : null; } });
        ev.on('pet:hatched', () => { if (this.active) this.hatched = true; });
        ev.on('pet:placed', () => { if (this.active) this.placed = true; });
        // «Пропустить» с клавиатуры: Ввод (не занят игрой и паузой: WASD, стрелки, Пробел, Shift, E, R, Q, P, Esc)
        window.addEventListener('keydown', (e) => {
            if (!this.active || e.repeat || (e.code !== 'Enter' && e.code !== 'NumpadEnter')) return;
            if (GameUtil.isField(e.target) || GameUI.paused || Pause.active) return;
            if (typeof Menus !== 'undefined' && Menus.titleOpen) return;
            e.preventDefault();
            this.skip();
        });
    },

    // =============================================================================================
    // Интерфейс: табличка, значки ввода, подсветка и указатели
    // =============================================================================================
    _buildUi() {
        const E = GameUtil.el;
        const root = GameUI.root;
        if (!root) return;
        const ui = this.ui = {
            ttl: E('div', { class: 'tut-ttl otx' }),
            hint: E('div', { class: 'tut-hint otx-s' }),
            barFill: E('i'),
            bar: null, dots: E('div', { class: 'tut-dots' }),
            skip: E('button', { class: 'gb small orange tut-skip', type: 'button' }),
            sign: null, pointer: null, edge: null, pointerRot: null, edgeRot: null,
            dotEls: [],
        };
        ui.bar = E('div', { class: 'tut-bar' }, ui.barFill);
        const main = E('div', { class: 'tut-main' }, ui.ttl, ui.hint, ui.bar);
        const side = E('div', { class: 'tut-side' }, ui.skip, ui.dots);
        ui.sign = E('div', { class: 'tut-sign wood' }, main, side);
        ui.pointerRot = E('div', { class: 'tpr' }, E('div', { class: 'tp', html: '<span class="tut-chip">' + GameUI.icon('w-arrow-down') + '</span>' }));
        ui.pointer = E('div', { class: 'tut-pointer' }, ui.pointerRot);
        ui.edgeRot = E('div', { class: 'te', html: '<span class="tut-chip">' + GameUI.icon('w-arrow-right') + '</span>' });
        ui.edge = E('div', { class: 'tut-edge' }, ui.edgeRot);
        GameUI._press(ui.skip, () => this.skip(), true);
        const layer = this.layer = E('div', { id: 'tut-layer' }, ui.sign, ui.pointer, ui.edge);
        layer.style.display = 'none';
        root.appendChild(layer);
    },

    _renderDots() {
        const ui = this.ui;
        if (!ui) return;
        if (ui.dotEls.length !== TUTORIAL_STEPS.length) {
            GameUtil.clear(ui.dots);
            ui.dotEls = TUTORIAL_STEPS.map(() => ui.dots.appendChild(GameUtil.el('i')));
        }
        ui.dotEls.forEach((d, i) => {
            d.className = i < this.idx ? 'done' : i === this.idx ? 'cur' : '';
        });
    },

    /** Что сейчас происходит внутри шага: 'wait' | 'ready' (гнездо), 'cine' | 'modal' (вылупление), '' — ничего особенного. */
    _sub() {
        if (this.step === 'hatch') {
            const i = this._hatchTarget();
            const e = i >= 0 ? GameState.state.nestEggs[i] : null;
            return e && GameData.nestState(e).ready ? 'ready' : 'wait';
        }
        if (this.step === 'place') {
            const h = Eggs.hatching;
            return h && h.modal ? 'modal' : 'cine';
        }
        return '';
    },

    /** Кнопка окна результата вылупления: «На ранчо» (есть слот) или «Далее». */
    _modalButton() {
        const m = GameUI.modals[GameUI.modals.length - 1];
        if (!m || !m.el || typeof m.el.querySelectorAll !== 'function') return null;
        const s = GameState.state;
        const label = Lang.t(s.ranchPets.length < s.slots ? 'hatch.place' : 'hatch.next');
        for (const b of m.el.querySelectorAll('.res-btns .gb')) if (b.textContent === label) return /** @type {HTMLElement} */ (b);
        return null;
    },

    /** Кнопка HUD (или окна), на которую сейчас указываем. */
    _domTarget(sub) {
        const h = GameUI.hud;
        if (this.step === 'dismount' || this.step === 'ride') return h.ride && h.ride.style.display !== 'none' ? h.ride : null;
        if (this.step === 'hatch' && sub === 'ready') {
            const z = Interact.current;
            return z && /^nest-/.test(z.id) && h.act.classList.contains('show') ? h.act : null;
        }
        if (this.step === 'place' && sub === 'modal') return this._modalButton();
        return null;
    },

    /** Точка мира, на которую указываем: { key, x, y, h, label? } или null. */
    _worldTarget() {
        switch (this.step) {
            case 'egg': case 'pick': {
                const e = this.egg;
                return e ? { key: 'egg:' + e.uid, x: e.x, y: e.y, h: e.h + 185, label: '' } : null;
            }
            case 'home': {
                const r = Ranch.player;
                return r ? { key: 'ranch', x: r.x, y: r.y, h: GameWorld.groundH(r.x, r.y) + 560, label: Lang.t('ranch.yours') } : null;
            }
            case 'hatch': {
                const i = this._hatchTarget();
                const p = i >= 0 ? Ranch.nestPos(i) : null;
                return p ? { key: 'nest:' + i, x: p.x, y: p.y, h: p.h + 330, label: '' } : null;
            }
            default: return null;
        }
    },

    _updateGuide() {
        if (typeof Guide === 'undefined') return;
        switch (this.step) {
            case 'egg': case 'pick': if (this.egg) Guide.set({ x: this.egg.x, y: this.egg.y }); break;
            case 'home': Guide.toRanch(); break;
            case 'hatch': {
                const w = this._worldTarget();
                if (w && this._sub() === 'ready') Guide.set({ x: w.x, y: w.y }); else Guide.set(null);
                break;
            }
            default:
                // шаги без цели: стрелки, оставшиеся от прошлых шагов, убираем (яйцо в корзине — к ранчо)
                if (this.step !== 'place' && !Eggs.basket.length && Guide.target) Guide.set(null);
        }
    },

    /** Текст таблички под текущий шаг и способ ввода. */
    _renderText(sub, touch) {
        const ui = this.ui;
        if (!ui) return;
        const t = (k, p) => Lang.t(k, p);
        const esc = GameUtil.esc;
        const key = (c) => GameUI.keyHtml(c);
        const ic = (n) => GameUI.inputIcon(n);
        const span = (s) => '<span>' + esc(s) + '</span>';
        const q = (s) => (Lang.code === 'ru' ? '«' + s + '»' : '"' + s + '"');
        let ttl = '', html = '';
        switch (this.step) {
            case 'move':
                ttl = t('tut.move.t');
                html = touch ? ic('joystick') + span(t('tut.move.touch')) : key('KeyW') + key('KeyA') + key('KeyS') + key('KeyD') + span(t('tut.move.pc')) + ic('arrows');
                break;
            case 'look':
                ttl = t('tut.look.t');
                html = touch ? ic('touch-drag') + span(t('tut.look.touch')) : ic('mouse-move') + span(t('tut.look.pc'));
                break;
            case 'dismount': {
                ttl = t('tut.off.t');
                const a = t('hud.dismount');
                html = touch ? ic('touch-tap') + span(t('tut.off.touch', { a })) : key('KeyR') + span(t('tut.off.pc', { a }));
                break;
            }
            case 'ride': {
                ttl = t('tut.ride.t');
                const a = t('hud.ride');
                html = touch ? ic('touch-tap') + span(t('tut.ride.touch', { a })) : key('KeyR') + span(t('tut.ride.pc', { a }));
                break;
            }
            case 'egg': ttl = t('tut.egg.t'); html = span(t('tut.egg.h')); break;
            case 'pick': ttl = t('tut.pick.t'); html = span(t('tut.pick.h')); break;
            case 'home': ttl = t('tut.home.t'); html = span(t('tut.home.h')); break;
            case 'hatch':
                if (sub === 'ready') {
                    ttl = t('tut.hatch.t');
                    html = touch ? ic('touch-tap') + span(t('tut.hatch.touch', { a: t('nest.hatch') })) : span(t('tut.hatch.pc')) + key('KeyE') + span(q(t('nest.hatch')));
                } else { ttl = t('tut.wait.t'); html = span(t('tut.wait.h', { a: t('nest.ready') })); }
                break;
            case 'place':
                if (sub === 'modal') {
                    const s = GameState.state;
                    const free = s.ranchPets.length < s.slots;
                    ttl = t('tut.place.t');
                    html = span(t(free ? 'tut.place.h' : 'tut.next.h', { a: t(free ? 'hatch.place' : 'hatch.next') }));
                } else { ttl = t('tut.cine.t'); html = span(t('tut.cine.h')); }
                break;
            default: break;
        }
        ui.ttl.textContent = ttl;
        ui.hint.innerHTML = html;
        ui.bar.classList.toggle('show', this.step === 'move' || this.step === 'look');
        ui.skip.innerHTML = '<span>' + esc(t('tut.skip')) + '</span>' + (touch ? '' : key('Enter'));
        ui.skip.setAttribute('aria-label', t('tut.skip'));
        ui.sign.classList.remove('pop'); void ui.sign.offsetWidth; ui.sign.classList.add('pop');
        this._progress = -1;
    },

    /** Подсветка одной кнопки (предыдущая гаснет). */
    _setHighlight(el) {
        if (el === this.hlEl) return;
        if (this.hlEl) this.hlEl.classList.remove('tut-hl');
        this.hlEl = el;
        if (el) el.classList.add('tut-hl');
    },

    _removePin() {
        if (this.pin) { this.pin.bb.remove(); this.pin = null; }
    },

    _updateUi(dt) {
        const ui = this.ui;
        if (!ui) return;
        const touch = GameUI.touch;
        const sub = this._sub();
        const sig = this.step + '|' + sub + '|' + (touch ? 1 : 0) + '|' + Lang.code;
        if (sig !== this._sig) { this._sig = sig; this._renderText(sub, touch); }
        // указатель на кнопку: 10 раз в секунду (положение окна и HUD почти не меняется)
        this._uiT -= dt;
        if (this._uiT <= 0) {
            this._uiT = 0.1;
            if (typeof ui.sign.getBoundingClientRect === 'function') this._signBottom = ui.sign.getBoundingClientRect().bottom;
            const el = this._domTarget(sub);
            this._setHighlight(el);
            if (el && typeof el.getBoundingClientRect === 'function') {
                const r = el.getBoundingClientRect();
                const below = this.step === 'place' || r.top < 90;
                ui.pointer.classList.toggle('below', below);
                const u = GameUI.scale;
                ui.pointer.style.display = 'block';
                ui.pointer.style.transform = 'translate(' + Math.round(r.left + r.width / 2) + 'px,' + Math.round(below ? r.bottom + 6 * u : r.top - 56 * u - 4) + 'px)';
            } else ui.pointer.style.display = 'none';
            this._syncWorldTarget();
        }
        // цель в мире: стрелка над предметом (Billboard) и у границы экрана, когда предмета не видно
        const w = this._w;
        if (!w) return;
        this._edgeT -= dt;
        if (this._edgeT <= 0) { this._edgeT = 0.033; this._updateEdge(w); }
    },

    /** Цель в мире (раз в 0.1 с): указатель-Billboard над предметом создаётся и переносится здесь. */
    _syncWorldTarget() {
        const ui = this.ui;
        const w = this._worldTarget();
        this._w = w;
        if (!w) { this._removePin(); if (ui) ui.edge.style.display = 'none'; return; }
        if (!this.pin || this.pin.key !== w.key) {
            this._removePin();
            const html = (w.label ? '<span class="lb otx-s">' + GameUtil.esc(w.label) + '</span>' : '') +
                '<span class="tp"><span class="tut-chip">' + GameUI.icon('w-arrow-down') + '</span></span>';
            this.pin = { key: w.key, bb: Billboard.add({ x: w.x, y: w.y, h: w.h, html: '<span class="tut-pin">' + html + '</span>', className: 'tut-bb', maxDist: 9000 }) };
        } else this.pin.bb.setPos(w.x, w.y, w.h);
    },

    // Стрелка у границы безопасной области экрана (под табличкой, над кнопками HUD), если указателя цели в мире не видно:
    // цель за спиной, за краем или под табличкой. Направление — по проекции точки.
    _updateEdge(w) {
        const ui = this.ui;
        const view = Billboard.view;
        if (!ui || !view) return;
        const W = window.innerWidth || 800, H = window.innerHeight || 600;
        const u = GameUI.scale;
        const L = 40, R = W - 40, B = H - 110 * u;
        const T = Math.min(H * 0.6, this._signBottom + 80 * u);
        const p = view.projectToScreen(w.x, w.y, w.h);
        if (p.visible && p.x > L && p.x < R && p.y > T && p.y < B) { ui.edge.style.display = 'none'; return; }
        const cx = (L + R) / 2, cy = (T + B) / 2;
        let dx = p.x - cx, dy = p.y - cy;
        if (p.behind) { dx = -dx; dy = -dy; }
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1;
        let k = Infinity;
        if (dx > 0) k = Math.min(k, (R - cx) / dx); else if (dx < 0) k = Math.min(k, (L - cx) / dx);
        if (dy > 0) k = Math.min(k, (B - cy) / dy); else if (dy < 0) k = Math.min(k, (T - cy) / dy);
        ui.edge.style.display = 'block';
        ui.edge.style.transform = 'translate(' + Math.round(cx + dx * k) + 'px,' + Math.round(cy + dy * k) + 'px)';
        ui.edgeRot.style.transform = 'rotate(' + Math.atan2(dy, dx).toFixed(3) + 'rad)';
    },
};

Game.register(Tutorial);
