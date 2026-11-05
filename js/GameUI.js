// GameUI.js — интерфейс «Ранчо»: деревянные таблички, кремовый пергамент, толстые кнопки с чёрной обводкой,
// белый жирный текст с обводкой (шрифт RideFont). HUD как в референсе, панели и модалки, тосты и баннеры,
// боковые кнопки, подсказки взаимодействия (Interact), ввод (клавиатура, мышь, тач-джойстик).
//
// HUD (контейнеры в #hud, все — GameUI.hud.*):
//   сверху по центру — деревянная табличка-цель + ⚡ скорость          objective, speed
//   справа — кнопки «Яйца» (оранжевая, красный счётчик) и «Питомцы» (розовая) и ещё боковые   right
//   слева — боковые кнопки (магазин, подарок, колесо — фаза 2)                                 left
//   слева внизу — «Буст +0% [+]» и крупный счётчик денег с зелёной купюрой                     boost, cash
//   снизу по центру — подсказка действия (E / кнопка), корзина с яйцами, жёлтая «Сесть на питомца»   act, basket, ride
//   справа внизу — «через 6с ×10» (волна яиц) и солнце/луна с таймером суток                   wave, day
// Панель открыта — остальной HUD прячется (кроме денег), Esc закрывает, движение блокируется.
// Раскладка (layout()): классы корня touch, portrait, compact, short, stack (тач или портрет: таймеры волны/суток/погоды hud.br и левые
// кнопки hud.left лежат в контейнере hud.tl столбцом под табличкой цели и друг на друга не налезают), tight (в stack мало высоты: левые
// кнопки в два ряда), modal-open (открыто showModal/confirm: обучение сворачивает табличку), bk (несём яйца: пунктир джойстика скрыт).
// Крупные баннеры (banner) не рисуются поверх окон, панелей, паузы и кинематики вылупления (this.blocking): ждут в очереди и выходят
// после закрытия (UI_BANNER_QUEUE_MAX, UI_BANNER_MAX_WAIT).
//
// ПУБЛИЧНЫЙ API (docs/DESIGN.md §5):
//   GameUI.toast(text, kind)  banner(text, ms)  addSideButton({ id, side, icon, label, badge, onClick })  setBadge(id, n)
//   GameUI.openPanel({ id, title, build(el), onClose, wide })  closePanel(id?)  confirm({ title, text, ok, cancel })
//   GameUI.rewardButton(el, { id, label, onReward })   кнопка «За рекламу»: недоступна без рекламы, без двойного нажатия,
//                                                     награда один раз и только после await Platform.rewarded(id) === true
//   GameUI.icon(name) -> HTML <img>   GameUI.iconUrl(name)   GameUI.petIcon(species) -> HTML   GameUI.isTouch()
//   GameUI.setObjective(text) setSpeed(n) setWave(sec, n) setDay(night, sec) setBasket(items, opts) setRide(riding)
//   GameUI.input — состояние ввода для Player (moveX, moveY, jump, descend, camDX/camDY, zoom, consume(code))
//   Interact.register({ id, x, y, r, label: () => text, visible: () => bool, action: () => {} }) -> { remove() }
// Боковые кнопки «eggs» и «pets» создаёт GameUI; их нажатие — событие Game.events 'ui:side' {id} (и onClick, если
// модуль переопределил кнопку через addSideButton({ id: 'eggs', onClick })).

const UI_CSS = `
#game-ui{--s:1;--u:calc(var(--s)*1px);position:fixed;inset:0;z-index:20;pointer-events:none;font-family:RideFont,system-ui,sans-serif;font-weight:800;color:#fff;
 -webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;touch-action:none;overflow:hidden}
#game-ui *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
#game-ui img{-webkit-user-drag:none;user-select:none;pointer-events:none}
#game-ui button{font-family:inherit}
.otx{color:#fff;-webkit-text-stroke:calc(var(--u)*5) #0d0602;paint-order:stroke fill;text-shadow:0 calc(var(--u)*2.5) 0 #0d0602;letter-spacing:.01em}
.otx-s{color:#fff;-webkit-text-stroke:calc(var(--u)*3.5) #0d0602;paint-order:stroke fill;text-shadow:0 calc(var(--u)*1.5) 0 #0d0602}
.ico{display:inline-block;width:1.15em;height:1.15em;object-fit:contain;vertical-align:-.22em;filter:drop-shadow(0 calc(var(--u)*1.5) 0 rgba(0,0,0,.45))}
.pi{display:inline-block;object-fit:contain;image-rendering:auto}
/* дерево и пергамент */
.wood{background:
 radial-gradient(circle at calc(var(--u)*11) 50%,#f1d3a6 0 calc(var(--u)*1.6),#8b5a2b calc(var(--u)*2.2) calc(var(--u)*3.4),transparent calc(var(--u)*3.8)),
 radial-gradient(circle at calc(100% - var(--u)*11) 50%,#f1d3a6 0 calc(var(--u)*1.6),#8b5a2b calc(var(--u)*2.2) calc(var(--u)*3.4),transparent calc(var(--u)*3.8)),
 repeating-linear-gradient(92deg,rgba(0,0,0,.07) 0 calc(var(--u)*3),rgba(255,230,180,.045) calc(var(--u)*3) calc(var(--u)*8),rgba(0,0,0,0) calc(var(--u)*8) calc(var(--u)*15)),
 linear-gradient(#92592a,#7b4a24 45%,#5b3417);
 border:calc(var(--u)*3.5) solid #1c0f06;border-radius:calc(var(--u)*13);
 box-shadow:inset 0 calc(var(--u)*2.5) 0 rgba(255,225,170,.4),inset 0 calc(var(--u)*-4) 0 rgba(0,0,0,.3),0 calc(var(--u)*4) 0 rgba(0,0,0,.5),0 calc(var(--u)*9) calc(var(--u)*12) rgba(0,0,0,.28)}
.parch{background:radial-gradient(ellipse at 50% 35%,#fff7da,#fff1c8 55%,#f0d89a);border:calc(var(--u)*4) solid #1c0f06;border-radius:calc(var(--u)*14);
 box-shadow:inset 0 0 0 calc(var(--u)*3) rgba(150,100,45,.35),inset 0 0 calc(var(--u)*28) rgba(150,100,45,.32);color:#4a2a12;font-weight:800;-webkit-text-stroke:0;text-shadow:none}
.parch .otx,.parch .otx-s{color:#fff}
/* кнопки */
.gb{--c1:#82ee62;--c2:#43c431;--c3:#2b9620;position:relative;appearance:none;-webkit-appearance:none;pointer-events:auto;cursor:pointer;
 border:calc(var(--u)*3.5) solid #120904;border-radius:calc(var(--u)*15);background:linear-gradient(var(--c1),var(--c2) 48%,var(--c3));
 color:#fff;font-weight:900;font-size:calc(var(--u)*20);line-height:1.05;padding:calc(var(--u)*9) calc(var(--u)*20);
 -webkit-text-stroke:calc(var(--u)*5) #0d0602;paint-order:stroke fill;text-shadow:0 calc(var(--u)*2.5) 0 #0d0602;
 box-shadow:inset 0 calc(var(--u)*3) 0 rgba(255,255,255,.5),inset 0 calc(var(--u)*-4.5) 0 rgba(0,0,0,.2),0 calc(var(--u)*4.5) 0 #120904,0 calc(var(--u)*9) calc(var(--u)*11) rgba(0,0,0,.3);
 transition:transform .07s,filter .12s;display:inline-flex;align-items:center;justify-content:center;gap:calc(var(--u)*7);white-space:nowrap;touch-action:manipulation}
.gb::after{content:'';position:absolute;left:9%;right:9%;top:7%;height:30%;border-radius:999px;background:linear-gradient(rgba(255,255,255,.5),rgba(255,255,255,0));pointer-events:none}
.gb:hover{filter:brightness(1.08)}
.gb:active,.gb.press{transform:translateY(calc(var(--u)*3.5));box-shadow:inset 0 calc(var(--u)*2) 0 rgba(255,255,255,.4),inset 0 calc(var(--u)*-3) 0 rgba(0,0,0,.2),0 calc(var(--u)*1) 0 #120904}
.gb:disabled,.gb.off{filter:grayscale(.9) brightness(.82);cursor:not-allowed}
.gb.yellow{--c1:#fff067;--c2:#ffd21f;--c3:#e29f00}
.gb.red{--c1:#ff7a6a;--c2:#e8392f;--c3:#a91e17}
.gb.orange{--c1:#ffcb58;--c2:#ffae1a;--c3:#dd7d06}
.gb.pink{--c1:#ff8fc8;--c2:#ff4fa3;--c3:#c52b7c}
.gb.blue{--c1:#7fd0ff;--c2:#3d9cf0;--c3:#256cc0}
.gb.wood-b{--c1:#a56a34;--c2:#7b4a24;--c3:#5b3417}
.gb.big{font-size:calc(var(--u)*28);padding:calc(var(--u)*12) calc(var(--u)*30);border-radius:calc(var(--u)*20)}
.gb.small{font-size:calc(var(--u)*15);padding:calc(var(--u)*6) calc(var(--u)*13);border-radius:calc(var(--u)*11)}
.key{display:inline-flex;align-items:center;justify-content:center;min-width:1.45em;height:1.45em;padding:0 .28em;border-radius:.32em;background:linear-gradient(#fff,#dcdcdc);
 color:#1c1c1c;border:calc(var(--u)*2.2) solid #111;box-shadow:0 calc(var(--u)*2.4) 0 #111;font-size:.78em;font-weight:900;-webkit-text-stroke:0;text-shadow:none;paint-order:normal}
.badge{position:absolute;top:calc(var(--u)*-9);right:calc(var(--u)*-9);min-width:calc(var(--u)*27);height:calc(var(--u)*27);padding:0 calc(var(--u)*6);border-radius:999px;
 background:linear-gradient(#ff6b5e,#e0261b);border:calc(var(--u)*3) solid #120904;display:flex;align-items:center;justify-content:center;font-size:calc(var(--u)*15);
 -webkit-text-stroke:calc(var(--u)*3) #3a0a06;paint-order:stroke fill;z-index:2}
.badge.hide{display:none}
/* HUD */
#hud{position:absolute;inset:0;pointer-events:none;padding:max(env(safe-area-inset-top),calc(var(--u)*8)) max(env(safe-area-inset-right),calc(var(--u)*10)) max(env(safe-area-inset-bottom),calc(var(--u)*8)) max(env(safe-area-inset-left),calc(var(--u)*10));
 display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
#hud>*{position:absolute}
/* HUD — сетка из двух рядов: табличка цели (ряд 1, по центру) и «стопка» левого верхнего угла (ряд 2, раскладка stack): всё остальное — absolute */
#hud>.hud-top{position:relative;justify-self:center}
.hud-top{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*4);max-width:calc(100vw - var(--u)*190)}
.hud-tl{display:contents}
.hud-tl>.hud-left,.hud-tl>.hud-br{position:absolute}
.sign{padding:calc(var(--u)*8) calc(var(--u)*30);text-align:center;font-size:calc(var(--u)*20);line-height:1.12;font-weight:900;max-width:100%}
.sign.pop{animation:signpop .5s cubic-bezier(.2,1.6,.4,1)}
@keyframes signpop{0%{transform:scale(.88)}100%{transform:scale(1)}}
.speed{display:flex;align-items:center;gap:calc(var(--u)*5);font-size:calc(var(--u)*27);font-weight:900;line-height:1}
.speed .ico{width:1.05em;height:1.05em}
.side{display:flex;flex-direction:column;gap:calc(var(--u)*13);align-items:center}
.hud-right{right:max(env(safe-area-inset-right),calc(var(--u)*10));top:50%;transform:translateY(-58%)}
.hud-left{left:max(env(safe-area-inset-left),calc(var(--u)*10));top:50%;transform:translateY(-58%)}
.sbtn{position:relative;width:calc(var(--u)*76);height:calc(var(--u)*76);padding:0;border-radius:calc(var(--u)*17);display:flex;flex-direction:column;align-items:center;justify-content:flex-start}
.sbtn .ico{width:calc(var(--u)*42);height:calc(var(--u)*42);margin-top:calc(var(--u)*6);filter:drop-shadow(0 calc(var(--u)*2.5) 0 rgba(0,0,0,.4))}
.sbtn .lb{font-size:calc(var(--u)*14.5);line-height:1;margin-top:calc(var(--u)*1);-webkit-text-stroke:calc(var(--u)*4) #0d0602}
.hud-bl{left:max(env(safe-area-inset-left),calc(var(--u)*10));bottom:max(env(safe-area-inset-bottom),calc(var(--u)*8));display:flex;flex-direction:column;align-items:flex-start;gap:calc(var(--u)*9)}
.boostchip{display:flex;align-items:center;gap:calc(var(--u)*6);padding:calc(var(--u)*5) calc(var(--u)*6) calc(var(--u)*5) calc(var(--u)*15);font-size:calc(var(--u)*19);cursor:pointer;pointer-events:auto;border-radius:999px}
.boostchip .plus{width:calc(var(--u)*30);height:calc(var(--u)*30);border-radius:50%;padding:0;font-size:calc(var(--u)*25);line-height:1;-webkit-text-stroke:calc(var(--u)*4) #0d0602}
.boostchip.on{--c1:#fff067;--c2:#ffd21f;--c3:#e29f00;animation:glow 1.3s ease-in-out infinite alternate}
@keyframes glow{from{filter:brightness(1)}to{filter:brightness(1.18)}}
.cashbar{display:flex;align-items:center;gap:calc(var(--u)*9);padding:calc(var(--u)*5) calc(var(--u)*26) calc(var(--u)*5) calc(var(--u)*13);border-radius:999px;font-size:calc(var(--u)*34);font-weight:900;line-height:1.1;min-width:calc(var(--u)*150)}
.cashbar .ico{width:calc(var(--u)*50);height:calc(var(--u)*50)}
.cashbar.bump{animation:bump .22s ease-out}
@keyframes bump{0%{transform:scale(1)}40%{transform:scale(1.09)}100%{transform:scale(1)}}
.hud-bc{left:0;right:0;bottom:max(env(safe-area-inset-bottom),calc(var(--u)*8));display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*10)}
.ride{font-size:calc(var(--u)*29);padding:calc(var(--u)*11) calc(var(--u)*36);border-radius:calc(var(--u)*20);min-width:calc(var(--u)*270)}
.ride .key{font-size:.52em;margin-right:calc(var(--u)*2)}
.act{display:none;font-size:calc(var(--u)*23);padding:calc(var(--u)*8) calc(var(--u)*24)}
.act.show{display:inline-flex;animation:signpop .25s cubic-bezier(.2,1.6,.4,1)}
.basket{display:none;flex-direction:column;align-items:center;gap:calc(var(--u)*6);padding:calc(var(--u)*7) calc(var(--u)*14);max-width:calc(100vw - var(--u)*40)}
.basket.show{display:flex}
.bk-row{display:flex;align-items:flex-start;gap:calc(var(--u)*10);flex-wrap:wrap;justify-content:center}
.bk-act{display:flex;justify-content:center}
.bk-warn{width:100%;text-align:center;font-size:calc(var(--u)*17);color:#ffe14a;animation:warnblink .7s ease-in-out infinite alternate}
@keyframes warnblink{from{opacity:.55}to{opacity:1}}
.bk-egg{position:relative;width:calc(var(--u)*50);height:calc(var(--u)*62);display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*3)}
.bk-egg .ico,.bk-egg .pi{width:calc(var(--u)*40);height:calc(var(--u)*46)}
.bk-egg .bar{width:100%;height:calc(var(--u)*9);border-radius:999px;background:#2b190b;border:calc(var(--u)*2) solid #120904;overflow:hidden}
.bk-egg .bar i{display:block;height:100%;background:linear-gradient(#9cf07a,#43c431);transition:width .3s linear}
.bk-egg.warn .bar i{background:linear-gradient(#ff8b7d,#e8392f)}
.bk-egg.empty{opacity:.4;filter:grayscale(1)}
.hud-br{right:max(env(safe-area-inset-right),calc(var(--u)*10));bottom:max(env(safe-area-inset-bottom),calc(var(--u)*8));display:flex;flex-direction:column;align-items:flex-end;gap:calc(var(--u)*9)}
.chip{display:flex;align-items:center;gap:calc(var(--u)*8);padding:calc(var(--u)*6) calc(var(--u)*16);font-size:calc(var(--u)*19);line-height:1.1;white-space:nowrap}
.chip .ico{width:calc(var(--u)*28);height:calc(var(--u)*28)}
.chip .n{font-size:calc(var(--u)*17);color:#ffe9a8}
.chip.night{filter:hue-rotate(205deg) saturate(.7) brightness(.95)}
/* панели */
#panel-layer{position:absolute;inset:0;pointer-events:none;z-index:6}
.pl-dim{position:absolute;inset:0;background:rgba(18,9,3,.58);pointer-events:auto;display:flex;align-items:center;justify-content:center;padding:max(env(safe-area-inset-top),calc(var(--u)*10)) max(env(safe-area-inset-right),calc(var(--u)*10)) max(env(safe-area-inset-bottom),calc(var(--u)*10)) max(env(safe-area-inset-left),calc(var(--u)*10));animation:fadein .16s ease-out}
@keyframes fadein{from{opacity:0}to{opacity:1}}
.panel{position:relative;display:flex;flex-direction:column;width:min(calc(var(--u)*760),100%);max-height:100%;padding:calc(var(--u)*34) calc(var(--u)*12) calc(var(--u)*12);animation:panelin .22s cubic-bezier(.2,1.4,.4,1)}
.panel.wide{width:min(calc(var(--u)*1040),100%)}
@keyframes panelin{from{transform:scale(.9) translateY(calc(var(--u)*14));opacity:.4}to{transform:none;opacity:1}}
.panel-head{position:absolute;left:50%;top:calc(var(--u)*-22);transform:translateX(-50%);min-width:calc(var(--u)*260);max-width:calc(100% - var(--u)*110);padding:calc(var(--u)*7) calc(var(--u)*30);text-align:center;font-size:calc(var(--u)*27);font-weight:900;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.panel-x{position:absolute;right:calc(var(--u)*-12);top:calc(var(--u)*-16);width:calc(var(--u)*50);height:calc(var(--u)*50);padding:0;border-radius:calc(var(--u)*14);font-size:calc(var(--u)*27);z-index:3}
.panel-body{flex:1 1 auto;min-height:0;overflow:auto;padding:calc(var(--u)*16);-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;font-size:calc(var(--u)*17);line-height:1.25}
.panel-body h3{margin:0 0 calc(var(--u)*8);font-size:calc(var(--u)*21);font-weight:900;color:#6b3a17}
.row{display:flex;align-items:center;gap:calc(var(--u)*12);padding:calc(var(--u)*9) calc(var(--u)*6);border-bottom:calc(var(--u)*2) dashed rgba(120,80,40,.3)}
.row:last-child{border-bottom:0}
.row .grow{flex:1;min-width:0}
.row .ttl{font-size:calc(var(--u)*19);font-weight:900;color:#5b3417}
.row .sub{font-size:calc(var(--u)*14.5);color:#7a5a38;font-weight:700}
.modal-text{text-align:center;font-size:calc(var(--u)*20);padding:calc(var(--u)*6) calc(var(--u)*8) calc(var(--u)*14)}
.modal-btns{display:flex;gap:calc(var(--u)*14);justify-content:center;flex-wrap:wrap}
/* тосты и баннеры */
#toast-layer{position:absolute;left:50%;top:max(calc(var(--u)*92),calc(env(safe-area-inset-top) + var(--u)*86));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*7);pointer-events:none;z-index:8;max-width:calc(100vw - var(--u)*24)}
.toast{padding:calc(var(--u)*7) calc(var(--u)*22);font-size:calc(var(--u)*18);font-weight:900;text-align:center;line-height:1.12;max-width:100%;animation:toastin .26s cubic-bezier(.2,1.5,.4,1)}
.toast.out{opacity:0;transform:translateY(calc(var(--u)*-10));transition:opacity .3s,transform .3s}
.toast.good{border-color:#103d0a}.toast.good{background-blend-mode:normal;box-shadow:inset 0 calc(var(--u)*2.5) 0 rgba(180,255,150,.5),inset 0 calc(var(--u)*-4) 0 rgba(10,70,0,.45),0 calc(var(--u)*4) 0 rgba(0,0,0,.5)}
.toast.bad{box-shadow:inset 0 calc(var(--u)*2.5) 0 rgba(255,170,150,.5),inset 0 calc(var(--u)*-4) 0 rgba(110,10,0,.5),0 calc(var(--u)*4) 0 rgba(0,0,0,.5)}
@keyframes toastin{from{transform:translateY(calc(var(--u)*-16)) scale(.9);opacity:0}to{transform:none;opacity:1}}
#banner-layer{position:absolute;left:0;right:0;top:36%;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*8);pointer-events:none;z-index:9}
.banner{padding:calc(var(--u)*12) calc(var(--u)*44);font-size:calc(var(--u)*36);font-weight:900;text-align:center;line-height:1.1;max-width:calc(100vw - var(--u)*24);animation:bannerin .5s cubic-bezier(.2,1.7,.4,1)}
.banner.out{opacity:0;transform:scale(.9) translateY(calc(var(--u)*-14));transition:opacity .45s,transform .45s}
@keyframes bannerin{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
/* подписи над миром */
#billboards{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.bb{position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none;will-change:transform;font-size:calc(var(--u)*17);font-weight:900;line-height:1.1;-webkit-text-stroke:calc(var(--u)*4.5) #0d0602;paint-order:stroke fill;text-shadow:0 calc(var(--u)*2) 0 #0d0602;color:#fff;text-align:center}
.bb .ico{width:1.1em;height:1.1em}
/* пауза */
.pause-ov{position:absolute;inset:0;background:rgba(18,9,3,.66);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--u)*20);pointer-events:auto;z-index:12;animation:fadein .15s}
.pause-ov .sign{font-size:calc(var(--u)*38);padding:calc(var(--u)*12) calc(var(--u)*60)}
/* мобильное управление */
#touch-controls{position:absolute;inset:0;pointer-events:none;z-index:3;display:none}
#game-ui.touch #touch-controls{display:block}
.joy{position:absolute;width:calc(var(--u)*128);height:calc(var(--u)*128);margin:calc(var(--u)*-64) 0 0 calc(var(--u)*-64);border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.2),rgba(255,255,255,.1) 60%,rgba(255,255,255,.04));border:calc(var(--u)*4) solid rgba(255,255,255,.55);box-shadow:0 0 0 calc(var(--u)*2) rgba(0,0,0,.35);display:none;pointer-events:none}
.joy.on{display:block}
.joy i{position:absolute;left:50%;top:50%;width:calc(var(--u)*58);height:calc(var(--u)*58);margin:calc(var(--u)*-29) 0 0 calc(var(--u)*-29);border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#d8d8d8);border:calc(var(--u)*3.5) solid #1c1c1c;box-shadow:0 calc(var(--u)*3) 0 rgba(0,0,0,.4)}
.joy-hint{position:absolute;left:max(env(safe-area-inset-left),calc(var(--u)*30));bottom:max(env(safe-area-inset-bottom),calc(var(--u)*134));width:calc(var(--u)*96);height:calc(var(--u)*96);border-radius:50%;border:calc(var(--u)*3.5) dashed rgba(255,255,255,.4);opacity:.7;pointer-events:none}
.joy-hint.gone,#game-ui.bk .joy-hint{display:none}
.tbtn{position:absolute;pointer-events:auto;width:calc(var(--u)*84);height:calc(var(--u)*84);border-radius:50%;padding:0;font-size:calc(var(--u)*15);flex-direction:column;gap:0}
.tbtn .ico{width:calc(var(--u)*38);height:calc(var(--u)*38)}
.tjump{right:max(env(safe-area-inset-right),calc(var(--u)*22));bottom:max(env(safe-area-inset-bottom),calc(var(--u)*22))}
.tdown{right:max(env(safe-area-inset-right),calc(var(--u)*118));bottom:max(env(safe-area-inset-bottom),calc(var(--u)*22));width:calc(var(--u)*66);height:calc(var(--u)*66);display:none}
.tdown.show{display:flex}
/* раскладка по размерам. Классы корня (GameUI.layout): touch, portrait, compact (мелкий экран), short (низкий альбомный),
   stack = touch или portrait: таймеры волны/суток/погоды и левые кнопки идут одним столбцом в левом верхнем углу ПОД табличкой цели
   и друг на друга не налезают; tight (только в stack) — мало высоты: левые кнопки в два ряда */
#game-ui.stack .hud-tl{display:flex;flex-direction:column;align-items:flex-start;gap:calc(var(--u)*9);position:relative;justify-self:start;align-self:start;margin-top:calc(var(--u)*7)}
#game-ui.stack .hud-tl>*{position:static;transform:none;left:auto;right:auto;top:auto;bottom:auto}
#game-ui.stack .hud-br{align-items:flex-start}
#game-ui.compact.stack .hud-tl{gap:calc(var(--u)*6);margin-top:calc(var(--u)*5)}
#game-ui.compact.stack .hud-br{gap:calc(var(--u)*6)}
#game-ui.stack.tight .hud-left{display:grid;grid-template-columns:repeat(2,auto);gap:calc(var(--u)*9)}
#game-ui.touch .act{position:fixed;right:max(env(safe-area-inset-right),calc(var(--u)*22));bottom:max(env(safe-area-inset-bottom),calc(var(--u)*112));min-width:calc(var(--u)*96);flex-direction:column}
#game-ui.touch .hud-bc{bottom:max(env(safe-area-inset-bottom),calc(var(--u)*8))}
#game-ui.touch .ride{font-size:calc(var(--u)*23);min-width:calc(var(--u)*190);padding:calc(var(--u)*9) calc(var(--u)*20)}
#game-ui.touch .ride .key,#game-ui.touch .act .key{display:none}
#game-ui.portrait .hud-top{max-width:calc(100vw - var(--u)*160)}
#game-ui.portrait .sign{font-size:calc(var(--u)*17);padding:calc(var(--u)*7) calc(var(--u)*26)}
#game-ui.portrait .hud-bc{bottom:max(env(safe-area-inset-bottom),calc(var(--u)*150))}
#game-ui.portrait.touch .hud-bc{bottom:max(env(safe-area-inset-bottom),calc(var(--u)*182))}
#game-ui.portrait .tjump{bottom:max(env(safe-area-inset-bottom),calc(var(--u)*30))}
#game-ui.portrait .act{bottom:max(env(safe-area-inset-bottom),calc(var(--u)*130));right:max(env(safe-area-inset-right),calc(var(--u)*16))}
#game-ui.portrait .tdown{bottom:max(env(safe-area-inset-bottom),calc(var(--u)*44))}
#game-ui.compact .sbtn{width:calc(var(--u)*64);height:calc(var(--u)*64)}
#game-ui.compact .sbtn .ico{width:calc(var(--u)*34);height:calc(var(--u)*34);margin-top:calc(var(--u)*4)}
#game-ui.compact .sbtn .lb{font-size:calc(var(--u)*12.5)}
#game-ui.compact .cashbar{font-size:calc(var(--u)*29)}
#game-ui.compact .cashbar .ico{width:calc(var(--u)*42);height:calc(var(--u)*42)}
#game-ui.compact .speed{font-size:calc(var(--u)*23)}
#game-ui.compact .hud-right{top:calc(var(--u)*72);transform:none}
#game-ui.compact:not(.stack) .hud-left{top:calc(var(--u)*58);transform:none}
#game-ui.compact .side,#game-ui.stack.tight .hud-left{gap:calc(var(--u)*9)}
#game-ui.compact .toast{font-size:calc(var(--u)*16)}
#game-ui.compact .panel{padding-top:calc(var(--u)*28)}
#game-ui.compact .panel-head{font-size:calc(var(--u)*22);top:calc(var(--u)*-18)}
#game-ui.short .sign{font-size:calc(var(--u)*17);padding:calc(var(--u)*5) calc(var(--u)*24)}
#game-ui.short .hud-top{gap:calc(var(--u)*2)}
#game-ui.short .ride{font-size:calc(var(--u)*23);padding:calc(var(--u)*8) calc(var(--u)*24);min-width:calc(var(--u)*210)}
#game-ui.short .boostchip{font-size:calc(var(--u)*16)}
#game-ui.short .chip{font-size:calc(var(--u)*15);padding:calc(var(--u)*4) calc(var(--u)*12)}
#game-ui.short .chip .ico{width:calc(var(--u)*22);height:calc(var(--u)*22)}
#game-ui.short:not(.stack) .hud-left{top:calc(var(--u)*56)}
#game-ui.stack:not(.portrait) .joy-hint{left:calc(max(env(safe-area-inset-left),calc(var(--u)*10)) + var(--u)*240);bottom:calc(var(--u)*14);width:calc(var(--u)*72);height:calc(var(--u)*72)}
#game-ui.panel-open .hud-top,#game-ui.panel-open .hud-right,#game-ui.panel-open .hud-left,#game-ui.panel-open .hud-bc,#game-ui.panel-open .hud-br,#game-ui.panel-open #touch-controls,#game-ui.panel-open .boostchip{visibility:hidden}
#game-ui.panel-open #toast-layer{top:auto;bottom:max(env(safe-area-inset-bottom),calc(var(--u)*12));flex-direction:column-reverse}
#game-ui.panel-open #banner-layer{visibility:hidden}
.pl-dim.light{background:rgba(18,9,3,.32)}
.hatch-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:7;transition:opacity .12s ease-out}
.hatch-flash.out{transition:opacity .7s ease-in}
.boostchip .bl{display:flex;flex-direction:column;align-items:flex-start;line-height:1.05}
.boostchip .bl .b2{font-size:.78em}
/* значки клавиш и ввода (assets/ui/icons/input) вместо букв: в русской сборке латиницы на клавишах нет */
.kimg{display:inline-block;height:calc(var(--u)*30);width:auto;vertical-align:middle;object-fit:contain;filter:drop-shadow(0 calc(var(--u)*2) 0 rgba(0,0,0,.5))}
.ride .kimg,.act .kimg{height:calc(var(--u)*32);margin-right:calc(var(--u)*2)}
#game-ui.touch .ride .kimg,#game-ui.touch .act .kimg{display:none}
/* кнопка паузы в правом верхнем углу */
.pausebtn{position:absolute;right:max(env(safe-area-inset-right),calc(var(--u)*10));top:max(env(safe-area-inset-top),calc(var(--u)*8));width:calc(var(--u)*58);height:calc(var(--u)*58);padding:0;border-radius:calc(var(--u)*16);z-index:2}
.pausebtn .ico{width:calc(var(--u)*30);height:calc(var(--u)*30)}
.pausebtn::before{content:'';position:absolute;inset:-6px}
/* титульный экран и обучение прячут часть интерфейса */
#game-ui.title-open #hud,#game-ui.title-open #touch-controls,#game-ui.title-open #billboards,#game-ui.title-open #toast-layer,#game-ui.title-open #banner-layer{visibility:hidden}
#game-ui.tut .hud-top,#game-ui.tut .hud-right,#game-ui.tut .hud-left,#game-ui.tut .hud-br,#game-ui.tut .boostchip{visibility:hidden}
#game-ui.tut #toast-layer{top:calc(var(--u)*168)}
#game-ui.tut.portrait #toast-layer{top:calc(var(--u)*206)}
`;

// Иконки — пути ТОЛЬКО литералами (сборщик берёт в архив ассеты, на которые есть литерал).
/** @type {Record<string, string>} */
const UI_ICONS = {
    // ImageGen artwork; literal paths are included by the build scanner.
    'food-grass': 'assets/ui/food/grass.webp',
    'food-carrot': 'assets/ui/food/carrot.webp',
    'food-bone': 'assets/ui/food/bone.webp',
    'food-meat': 'assets/ui/food/meat.webp',
    'food-apple': 'assets/ui/food/apple.webp',
    'food-dragonfruit': 'assets/ui/food/dragonfruit.webp',
    'radar-advanced': 'assets/ui/radars/advanced.webp',
    'radar-jewel': 'assets/ui/radars/jewel.webp',
    'radar-royal': 'assets/ui/radars/royal.webp',
    'radar-magic': 'assets/ui/radars/magic.webp',
    'radar-angelic': 'assets/ui/radars/angelic.webp',
    'radar-eternal': 'assets/ui/radars/eternal.webp',
    'radar-celestial': 'assets/ui/radars/celestial.webp',
    'upg-luck': 'assets/ui/upgrades/luck.webp',
    'upg-nests': 'assets/ui/upgrades/nests.webp',
    'upg-slots': 'assets/ui/upgrades/slots.webp',

    apple: 'assets/ui/icons/color/apple.webp', backpack: 'assets/ui/icons/color/backpack.webp',
    banknote: 'assets/ui/icons/color/banknote.webp', bolt: 'assets/ui/icons/color/bolt.webp',
    book: 'assets/ui/icons/color/book.webp', check: 'assets/ui/icons/color/check.webp',
    cloud: 'assets/ui/icons/color/cloud.webp', clover: 'assets/ui/icons/color/clover.webp',
    coin: 'assets/ui/icons/color/coin.webp', cross: 'assets/ui/icons/color/cross.webp',
    crown: 'assets/ui/icons/color/crown.webp', diamond: 'assets/ui/icons/color/diamond.webp',
    dollar: 'assets/ui/icons/color/dollar.webp', 'egg-cracked': 'assets/ui/icons/color/egg-cracked.webp',
    egg: 'assets/ui/icons/color/egg.webp', fire: 'assets/ui/icons/color/fire.webp',
    flag: 'assets/ui/icons/color/flag.webp', gift: 'assets/ui/icons/color/gift.webp',
    heart: 'assets/ui/icons/color/heart.webp', home: 'assets/ui/icons/color/home.webp',
    hourglass: 'assets/ui/icons/color/hourglass.webp', leaf: 'assets/ui/icons/color/leaf.webp',
    lock: 'assets/ui/icons/color/lock.webp', magnifier: 'assets/ui/icons/color/magnifier.webp',
    moon: 'assets/ui/icons/color/moon.webp', paw: 'assets/ui/icons/color/paw.webp',
    pin: 'assets/ui/icons/color/pin.webp', play: 'assets/ui/icons/color/play.webp',
    plus: 'assets/ui/icons/color/plus.webp', radar: 'assets/ui/icons/color/radar.webp',
    ranch: 'assets/ui/icons/color/ranch.webp', rebirth: 'assets/ui/icons/color/rebirth.webp',
    settings: 'assets/ui/icons/color/settings.webp', shield: 'assets/ui/icons/color/shield.webp',
    shop: 'assets/ui/icons/color/shop.webp', skull: 'assets/ui/icons/color/skull.webp',
    snowflake: 'assets/ui/icons/color/snowflake.webp', star: 'assets/ui/icons/color/star.webp',
    storm: 'assets/ui/icons/color/storm.webp', sun: 'assets/ui/icons/color/sun.webp',
    sword: 'assets/ui/icons/color/sword.webp', tag: 'assets/ui/icons/color/tag.webp',
    trophy: 'assets/ui/icons/color/trophy.webp', wheel: 'assets/ui/icons/color/wheel.webp',
    wrench: 'assets/ui/icons/color/wrench.webp',
    // белые глифы (красятся маской или кладутся на цветную кнопку)
    'w-arrow-up': 'assets/ui/icons/arrow-up.webp', 'w-arrow-down': 'assets/ui/icons/arrow-down.webp',
    'w-arrow-left': 'assets/ui/icons/arrow-left.webp', 'w-arrow-right': 'assets/ui/icons/arrow-right.webp',
    'w-pause': 'assets/ui/icons/pause.webp', 'w-play': 'assets/ui/icons/play.webp',
    'w-menu': 'assets/ui/icons/menu.webp', 'w-sound-on': 'assets/ui/icons/sound-on.webp',
    'w-sound-off': 'assets/ui/icons/sound-off.webp', 'w-music': 'assets/ui/icons/music.webp',
    'w-music-off': 'assets/ui/icons/music-off.webp', 'w-question': 'assets/ui/icons/question.webp',
    'w-info': 'assets/ui/icons/info.webp', 'w-check': 'assets/ui/icons/check.webp',
    'w-cross': 'assets/ui/icons/cross.webp', 'w-plus': 'assets/ui/icons/plus.webp',
    'w-minus': 'assets/ui/icons/minus.webp', 'w-refresh': 'assets/ui/icons/refresh.webp',
    'w-trash': 'assets/ui/icons/trash.webp', 'w-bolt': 'assets/ui/icons/bolt.webp',
    'w-paw': 'assets/ui/icons/paw.webp', 'w-egg': 'assets/ui/icons/egg.webp',
    'w-star': 'assets/ui/icons/star.webp', 'w-lock': 'assets/ui/icons/lock.webp',
    'w-home': 'assets/ui/icons/home.webp', 'w-book': 'assets/ui/icons/book.webp',
    'w-leaderboard': 'assets/ui/icons/leaderboard.webp', 'w-gift': 'assets/ui/icons/gift.webp',
    'w-wheel': 'assets/ui/icons/wheel.webp', 'w-shop': 'assets/ui/icons/shop.webp',
};

/** @type {Record<string, string>} */
const UI_ICON_FALLBACKS = {
    "food-grass": "leaf",
    "food-carrot": "apple",
    "food-bone": "heart",
    "food-meat": "fire",
    "food-apple": "star",
    "food-dragonfruit": "diamond",
    "radar-advanced": "radar",
    "radar-jewel": "radar",
    "radar-royal": "radar",
    "radar-magic": "radar",
    "radar-angelic": "radar",
    "radar-eternal": "radar",
    "radar-celestial": "radar",
    "upg-luck": "clover",
    "upg-nests": "egg",
    "upg-slots": "paw"
};

// Значки ввода (белые клавиши с буквой, мышь, касания, джойстик) — пути литералами.
/** @type {Record<string, string>} */
const INPUT_ICONS = {
    w: 'assets/ui/icons/input/key-w.webp', a: 'assets/ui/icons/input/key-a.webp', s: 'assets/ui/icons/input/key-s.webp',
    d: 'assets/ui/icons/input/key-d.webp', e: 'assets/ui/icons/input/key-e.webp', r: 'assets/ui/icons/input/key-r.webp',
    p: 'assets/ui/icons/input/key-p.webp', q: 'assets/ui/icons/input/key-q.webp',
    up: 'assets/ui/icons/input/key-up.webp', down: 'assets/ui/icons/input/key-down.webp',
    left: 'assets/ui/icons/input/key-left.webp', right: 'assets/ui/icons/input/key-right.webp',
    arrows: 'assets/ui/icons/input/key-arrows.webp', space: 'assets/ui/icons/input/key-space.webp',
    shift: 'assets/ui/icons/input/key-shift.webp', esc: 'assets/ui/icons/input/key-esc.webp',
    enter: 'assets/ui/icons/input/key-enter.webp',
    mouse: 'assets/ui/icons/input/mouse.webp', 'mouse-left': 'assets/ui/icons/input/mouse-left.webp',
    'mouse-right': 'assets/ui/icons/input/mouse-right.webp', 'mouse-move': 'assets/ui/icons/input/mouse-move.webp',
    'mouse-scroll': 'assets/ui/icons/input/mouse-scroll.webp',
    joystick: 'assets/ui/icons/input/joystick.webp', 'joystick-stick': 'assets/ui/icons/input/joystick-stick.webp',
    'touch-drag': 'assets/ui/icons/input/touch-drag.webp', 'touch-tap': 'assets/ui/icons/input/touch-tap.webp',
    'touch-hold': 'assets/ui/icons/input/touch-hold.webp', 'touch-finger': 'assets/ui/icons/input/touch-finger.webp',
    'touch-swipe': 'assets/ui/icons/input/touch-swipe.webp', 'touch-pinch-in': 'assets/ui/icons/input/touch-pinch-in.webp',
    'touch-pinch-out': 'assets/ui/icons/input/touch-pinch-out.webp', 'touch-two-fingers': 'assets/ui/icons/input/touch-two-fingers.webp',
};
/** Код клавиши (KeyboardEvent.code) -> имя значка. Остальные клавиши — текстовая плашка. */
/** @type {Record<string, string>} */
const KEY_CODE_ICON = {
    KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyE: 'e', KeyR: 'r', KeyP: 'p', KeyQ: 'q',
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    Space: 'space', ShiftLeft: 'shift', ShiftRight: 'shift', Escape: 'esc', Enter: 'enter',
};

// Звуки интерфейса — тоже литералами.
/** @type {Record<string, string>} */
const UI_SOUNDS = {
    // open/close (свист при открытии и закрытии окон) убраны по просьбе пользователя: sfx('open'|'close') молчит
    click: 'assets/sounds/ui-click.ogg',
    error: 'assets/sounds/ui-error.ogg', buy: 'assets/sounds/buy.ogg', cash: 'assets/sounds/cash.ogg',
    cashBig: 'assets/sounds/cash-big.ogg', announce: 'assets/sounds/announce.ogg', unlock: 'assets/sounds/unlock.ogg',
    levelUp: 'assets/sounds/level-up.ogg', mount: 'assets/sounds/mount.ogg', dismount: 'assets/sounds/dismount.ogg',
    jump: 'assets/sounds/jump.ogg', land: 'assets/sounds/land.ogg', step: 'assets/sounds/step.ogg', splash: 'assets/sounds/splash.ogg',
    wing: 'assets/sounds/wing-flap.ogg', pickup: 'assets/sounds/egg-pickup.ogg', place: 'assets/sounds/egg-place.ogg',
    timerWarn: 'assets/sounds/timer-warn.ogg', eggBreak: 'assets/sounds/egg-break.ogg',
    crack: 'assets/sounds/egg-crack.ogg', reveal: 'assets/sounds/hatch-reveal.ogg', revealRare: 'assets/sounds/hatch-rare.ogg',
};

// --- Interact: контекстное действие (E на ПК, кнопка действия на телефоне) -------------------
/** @satisfies {Record<string, any>} */
const Interact = {
    /** @type {any[]} */
    zones: [],
    /** @type {any} */
    current: null,
    _label: '',

    /**
     * @param {{ id: string, x: number, y: number, r: number, label: () => string, visible?: () => boolean, action: () => void }} z
     */
    register(z) {
        if (!z || typeof z.action !== 'function') throw new Error('Interact.register: нужен action');
        const old = this.zones.findIndex(q => q.id === z.id);
        if (old >= 0) this.zones.splice(old, 1);
        this.zones.push(z);
        return { remove: () => this.unregister(z.id), zone: z };
    },
    unregister(id) {
        const i = this.zones.findIndex(q => q.id === id);
        if (i >= 0) this.zones.splice(i, 1);
        if (this.current && this.current.id === id) this.current = null;
    },
    /** Ближайшая видимая зона, в радиус которой вошёл игрок. */
    find(px, py) {
        let best = null, bd = Infinity;
        for (const z of this.zones) {
            const d = Math.hypot(px - z.x, py - z.y);
            if (d > z.r || d >= bd) continue;
            if (z.visible && !z.visible()) continue;
            best = z; bd = d;
        }
        return best;
    },
    /** Каждый кадр: подсветить подсказку у ближайшей зоны (GameUI). */
    update(px, py, blocked) {
        const z = blocked ? null : this.find(px, py);
        this.current = z;
        const text = z ? String(z.label()) : '';
        if (text !== this._label || (!z) !== (!this._label)) { this._label = text; GameUI.showAction(z ? text : null); }
    },
    /** Выполнить действие текущей зоны (клавиша E, кнопка действия). */
    trigger() {
        const z = this.current;
        if (!z) return false;
        try { z.action(); } catch (e) { console.error('Interact action:', e); }
        return true;
    },
};

/** @satisfies {Record<string, any>} */
const GameUI = {
    id: 'ui',
    /** @type {LoryApp | null} */
    app: null,
    /** @type {any} */
    hud: {},
    /** @type {HTMLElement | null} */
    root: null,
    touch: false,
    portrait: false,
    /** Раскладка «стопка» (тач или портрет) и «тесная» (мало высоты): классы stack и tight корня, см. layout(). */
    stack: false,
    tight: false,
    scale: 1,
    ICONS: UI_ICONS,
    SOUNDS: UI_SOUNDS,
    /** @type {Record<string, any>} */
    sideButtons: {},
    _lastClick: 0,      // время последнего щелчка интерфейса: щелчок не звучит дважды за 120 мс
    // Экранное мобильное управление всегда видно и работает мышью (сборка Playables — требование пользователя;
    // локально — адрес с ?touchui). Клавиатура при этом тоже работает.
    alwaysTouch: false,
    /** @type {any} */
    panel: null,
    /** @type {any[]} */
    modals: [],
    paused: false,
    /** Счётчик блокировок ввода кинематографией (вылупление): > 0 — ввод игрока заблокирован. */
    lock: 0,
    _adBusy: false,
    _shownCash: 0,
    _cashText: '',
    _bkSig: '',
    _boostSig: '',
    _boostTick: 0,
    _targetCash: 0,
    _speedText: '',
    _toasts: [],
    /** Баннеры на экране: { el, text, ms, opts, until, t1, t2 }. @type {any[]} */
    _banners: [],
    /** Баннеры, ждущие закрытия окна: { text, ms, opts, t }. @type {any[]} */
    _bannerQueue: [],
    /** @type {Record<string, string>} */
    _petIcons: {},
    input: {
        /** @type {Set<string>} */
        keys: new Set(),
        /** @type {Set<string>} */
        pressed: new Set(),
        moveX: 0, moveY: 0,
        jump: false, descend: false,
        camDX: 0, camDY: 0, zoom: 0, rotKey: 0,
        /** Сколько экранных px драга камерой (и эквивалент стрелок ← →) набрано за всё время: обучение сравнивает приращение. */
        lookTotal: 0,
        joyX: 0, joyY: 0, joyActive: false,
        touchJump: false, touchDown: false,
        /** Был ли «край» нажатия кода с прошлого вызова (и сбросить его). */
        consume(code) { const had = this.pressed.has(code); this.pressed.delete(code); return had; },
        reset() {
            this.keys.clear(); this.pressed.clear();
            this.moveX = this.moveY = 0; this.jump = this.descend = false; this.camDX = this.camDY = this.zoom = this.rotKey = 0;
            this.joyX = this.joyY = 0; this.joyActive = false; this.touchJump = this.touchDown = false;
        },
    },
    /** @type {Map<number, any>} */
    _pointers: new Map(),
    _pinchDist: 0,

    // =============================================================================================
    // Помощники
    // =============================================================================================
    isTouch() { return this.touch; },
    /** Путь иконки по имени (см. UI_ICONS) или пустая строка. */
    /** Canvas/glyph fallbacks are evaluated only if an artwork file fails to load. */
    /** @type {Map<string, () => string>} */
    _artFallbacks: new Map(),
    /** @type {Set<string>} */
    _artFailed: new Set(),
    _artListening: false,
    artUrl(src, fallback) {
        if (!src || this._artFailed.has(src)) return fallback();
        this._artFallbacks.set(src, fallback);
        if (!this._artListening && typeof document !== 'undefined' && document.addEventListener) {
            this._artListening = true;
            // Resource errors do not bubble; capture them for every UI/sign image.
            document.addEventListener('error', event => {
                const img = /** @type {HTMLImageElement} */ (event.target);
                if (!img || img.tagName !== 'IMG') return;
                const path = img.getAttribute('src'), draw = this._artFallbacks.get(path);
                if (!draw) return;
                this._artFailed.add(path);
                const url = draw();
                for (const el of document.querySelectorAll('img')) {
                    if (el.getAttribute('src') === path) el.src = url;
                }
            }, true);
        }
        return src;
    },
    iconUrl(name) {
        const src = UI_ICONS[name], legacy = UI_ICON_FALLBACKS[name];
        return src && legacy ? this.artUrl(src, () => UI_ICONS[legacy] || '') : src || '';
    },
    /** HTML иконки: GameUI.icon('egg') -> <img class="ico">. */
    icon(name, cls) {
        const src = this.iconUrl(name);
        return src ? '<img class="ico' + (cls ? ' ' + cls : '') + '" src="' + src + '" alt="">' : '';
    },
    /** HTML значка ввода по имени (INPUT_ICONS): GameUI.inputIcon('mouse-move'). Пустая строка, если значка нет. */
    inputIcon(name, cls) {
        const src = INPUT_ICONS[name];
        return src ? '<img class="kimg' + (cls ? ' ' + cls : '') + '" src="' + src + '" alt="">' : '';
    },
    /**
     * HTML клавиши по KeyboardEvent.code. Буквы и стрелки — значок клавиши (в русской сборке латиницы на экране нет);
     * Пробел, Шифт, Выход, Ввод в русской сборке — текстовая плашка «Пробел» и т. п., в английской — значок.
     */
    keyHtml(code) {
        const name = KEY_CODE_ICON[code];
        const textual = code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight' || code === 'Escape' || code === 'Enter';
        if (name && !(textual && GameUtil.lang() === 'ru')) return this.inputIcon(name);
        return '<span class="key">' + GameUtil.esc(GameUtil.keyName(code)) + '</span>';
    },
    sfx(name, opts) {
        if (name === 'click') {   // один щелчок на нажатие: общий обработчик кнопок и _press не звучат дважды
            const now = performance.now();
            if (now - this._lastClick < 120) return;
            this._lastClick = now;
        }
        const url = UI_SOUNDS[name];
        if (url && typeof Sound !== 'undefined') Sound.play(url, opts || { volume: 0.7 });
    },
    t(key, params) { return Lang.t(key, params); },

    /** Реклама с наградой сейчас возможна: SDK умеет формат; локально — только с ?mockads. */
    adsAvailable() {
        if (typeof Platform === 'undefined') return false;
        if (!Platform.rewardedSupported()) return false;
        if (Platform.name === 'local') return /[?&#]mockads\b/.test(location.search + location.hash);
        return true;
    },

    // =============================================================================================
    // Инициализация
    // =============================================================================================
    init(app) {
        this.app = app;
        this.alwaysTouch = (typeof GAME_PLATFORM !== 'undefined' && String(GAME_PLATFORM) === 'playables') || /[?&]touchui/.test(location.search);
        if (this.alwaysTouch) this.touch = true;
        // Щелчок на любой кнопке интерфейса (окна, лавки, гардероб, меню…), даже если модуль повесил свой обработчик без звука.
        // Кнопке с data-nosfx — без щелчка. Фаза перехвата: звук раньше обработчика, который может остановить всплытие.
        document.addEventListener('click', (e) => {
            const t = /** @type {HTMLElement} */ (e.target);
            const b = t && t.closest ? /** @type {HTMLButtonElement} */ (t.closest('button, .gb, [role="button"]')) : null;
            if (b && !b.disabled && !(b.dataset && b.dataset.nosfx)) this.sfx('click', { volume: 0.55 });
        }, true);
        const style = document.createElement('style');
        style.id = 'game-ui-style';
        style.textContent = UI_CSS;
        document.head.appendChild(style);

        let root = document.getElementById('game-ui');
        if (!root) { root = GameUtil.el('div', { id: 'game-ui' }); document.body.appendChild(root); }
        this.root = root;
        const mk = (id, parent) => {
            let el = document.getElementById(id);
            if (!el) { el = GameUtil.el('div', { id }); (parent || root).appendChild(el); }
            return el;
        };
        const bb = mk('billboards'), hud = mk('hud'), tc = mk('touch-controls'), pl = mk('panel-layer'), tl = mk('toast-layer'), bl = mk('banner-layer');
        this._buildHud(hud);
        this._buildTouch(tc);
        this.hud.panelLayer = pl; this.hud.toastLayer = tl; this.hud.bannerLayer = bl; this.hud.billboards = bb;
        if (app.location) Billboard.init(app.location.view, bb);
        this.layout();
        window.addEventListener('resize', () => this.layout());
        window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 200));
        this._bindInput(app);
        window.addEventListener('lory-release-input', () => {
            this.input.reset();
            this._pointers.clear();
            if (this.hud.joy) this.hud.joy.classList.remove('on');
        });
        // События игры -> HUD
        Game.events.on('cash', (e) => { this._targetCash = e.value; if (e.delta > 0 && e.reason !== 'offline') this._bumpCash(); });
        Game.events.on('state:loaded', () => { this._targetCash = GameState.state.cash; this._shownCash = GameState.state.cash; this._cashText = ''; });
        Game.events.on('boost', () => this.refreshBoost());
        Game.events.on('boost:end', () => this.refreshBoost());
        Game.events.on('ride', (e) => this.setRide(!!e.on));
        Game.events.on('pet:aged', (e) => {
            if (!e || !e.pet) return;
            this.toast(Lang.t('pet.aged', { name: GameData.petName(e.pet.species), age: e.age }), 'good');
            this.sfx('levelUp', { volume: 0.5 });
        });
        this.setObjective(Lang.t('hud.objective'));
        this._targetCash = this._shownCash = GameState.state.cash;
    },

    onLoad() {
        this._targetCash = this._shownCash = GameState.state.cash;
        this.refreshBoost();
    },

    ready() {
        this.layout();
        this.refreshBoost();
        if (GameState.readOnly) this.toast(Lang.t('ui.loadFail'), 'bad', 6000);
    },

    // =============================================================================================
    // Верстка HUD
    // =============================================================================================
    _buildHud(hud) {
        const E = GameUtil.el;
        const h = this.hud;
        // верх: табличка-цель и скорость
        h.objective = E('div', { class: 'sign wood otx' });
        h.speedVal = E('span', { text: '0' });
        h.speed = E('div', { class: 'speed otx', html: this.icon('bolt') });
        h.speed.appendChild(h.speedVal);
        h.top = E('div', { class: 'hud-top' }, h.objective, h.speed);
        // справа и слева: боковые кнопки
        h.right = E('div', { class: 'hud-right side' });
        h.left = E('div', { class: 'hud-left side' });
        // слева внизу: буст и деньги
        h.boostLabel = E('span', { class: 'otx', text: '' });
        h.boostPlus = E('button', { class: 'gb plus', type: 'button', 'aria-label': Lang.t('boost.title'), text: '+' });
        h.boost = E('div', { class: 'boostchip wood' }, h.boostLabel, h.boostPlus);
        h.cashVal = E('span', { class: 'otx', text: '0' });
        h.cash = E('div', { class: 'cashbar wood' });
        h.cash.innerHTML = this.icon('banknote');
        h.cash.appendChild(h.cashVal);
        h.bl = E('div', { class: 'hud-bl' }, h.boost, h.cash);
        // снизу по центру: действие, корзина, «Сесть на питомца»
        h.act = E('button', { class: 'gb act', type: 'button' });
        h.basket = E('div', { class: 'basket wood' });
        h.bkWarn = E('div', { class: 'bk-warn otx-s' });
        h.bkWarn.style.display = 'none';
        h.bkRow = E('div', { class: 'bk-row' });
        h.bkAct = E('div', { class: 'bk-act' });
        h.bkAct.style.display = 'none';
        h.basket.append(h.bkWarn, h.bkRow, h.bkAct);
        h.ride = E('button', { class: 'gb yellow ride', type: 'button' });
        h.bc = E('div', { class: 'hud-bc' }, h.act, h.basket, h.ride);
        // справа внизу: волна яиц и сутки
        h.waveText = E('span', { class: 'otx', text: '' });
        h.waveCount = E('span', { class: 'n otx-s', text: '' });
        h.wave = E('div', { class: 'chip wood' });
        h.wave.innerHTML = this.icon('egg');
        h.wave.append(h.waveText, h.waveCount);
        h.dayIcon = E('span', { html: this.icon('sun') });
        h.dayText = E('span', { class: 'otx', text: '' });
        h.day = E('div', { class: 'chip wood' }, h.dayIcon, h.dayText);
        h.br = E('div', { class: 'hud-br' }, h.wave, h.day);
        // левый верх: таймеры и левые кнопки в одном контейнере (в раскладке stack — столбцом друг под другом, см. UI_CSS)
        h.tl = E('div', { class: 'hud-tl' }, h.br, h.left);
        // кнопка паузы в правом верхнем углу: открывает меню паузы (Esc и P — то же)
        h.pause = E('button', { class: 'gb wood-b pausebtn', type: 'button', 'aria-label': Lang.t('pause.title'), html: this.icon('w-pause') });
        hud.append(h.top, h.right, h.tl, h.bl, h.bc, h.pause);
        this._press(h.pause, () => { if (!this.blocking || this.paused) this.setPaused(!this.paused); });

        this._press(h.ride, () => { if (typeof Player !== 'undefined') Player.toggleRide(); });
        this._press(h.act, () => { Interact.trigger(); });
        this._press(h.boostPlus, () => this.openBoostPanel());
        this._press(h.boost, () => this.openBoostPanel(), true);
        this.setRide(false);
        // стандартные боковые кнопки
        this.addSideButton({ id: 'eggs', side: 'right', icon: 'egg', label: Lang.t('hud.eggs'), color: 'orange' });
        this.addSideButton({ id: 'pets', side: 'right', icon: 'paw', label: Lang.t('hud.pets'), color: 'pink' });
        this.setDay(false, DAY_SECONDS_DEFAULT());
        this.setWave(EGG_WAVE_DEFAULT(), EGG_COUNT_DEFAULT());
    },

    // Кнопка: звук, обработка нажатия по pointerdown не нужна — click, но с защитой от залипания фокуса.
    _press(el, fn, noSound) {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!noSound) this.sfx('click');
            if (/** @type {HTMLButtonElement} */ (el).disabled) return;
            fn(e);
            if (typeof el.blur === 'function') el.blur();
        });
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
    },

    // Размер интерфейса и классы раскладки (портрет/ландшафт, компактный, низкий).
    layout() {
        const root = this.root;
        if (!root) return;
        const w = window.innerWidth || 1280, h = window.innerHeight || 720;
        const s = GameUtil.clamp(Math.min(w / 620, h / 560), 0.62, 1.2);
        this.scale = s;
        this.portrait = h > w * 1.05;
        root.style.setProperty('--s', s.toFixed(3));
        root.classList.toggle('portrait', this.portrait);
        root.classList.toggle('compact', Math.min(w, h) < 520 || s < 0.8 || h / s < 640);
        root.classList.toggle('short', h < 430 && !this.portrait);
        root.classList.toggle('touch', this.touch);
        // stack: таймеры и левые кнопки столбцом в левом верхнем углу (на тач-устройствах и в портрете правый нижний угол занят кнопками).
        // tight (только в stack): высоты (в единицах интерфейса) не хватает на столбец из трёх таймеров и четырёх кнопок над деньгами и бустом.
        // Низкое окно (меньше 640 единиц) делает интерфейс compact: кнопки мельче, боковые колонки прижаты к верху.
        const stack = this.touch || this.portrait;
        this.stack = stack;
        this.tight = stack && h / s < (this.portrait ? 900 : 800);
        root.classList.toggle('stack', stack);
        root.classList.toggle('tight', this.tight);
    },

    setTouch(on) {
        on = !!on || this.alwaysTouch;
        if (on === this.touch) return;
        this.touch = on;
        if (this.root) this.root.classList.toggle('touch', on);
        if (!on) { this.input.joyActive = false; this.input.joyX = this.input.joyY = 0; this.input.touchJump = this.input.touchDown = false; }
        this.layout();
    },

    // =============================================================================================
    // Боковые кнопки
    // =============================================================================================
    /**
     * Боковая кнопка HUD (повторный вызов с тем же id обновляет её).
     * @param {{ id: string, side?: 'left' | 'right', icon?: string, label?: string, badge?: number, onClick?: () => void, color?: string }} o
     */
    addSideButton(o) {
        let rec = this.sideButtons[o.id];
        const E = GameUtil.el;
        if (!rec) {
            const btn = E('button', { class: 'gb sbtn ' + (o.color || 'orange'), type: 'button', 'data-id': o.id });
            const badge = E('span', { class: 'badge hide', text: '0' });
            rec = { id: o.id, el: btn, badge, onClick: null, side: o.side || 'right' };
            this.sideButtons[o.id] = rec;
            this._press(btn, () => {
                if (rec.onClick) rec.onClick(); else Game.events.emit('ui:side', { id: o.id });
            });
            (rec.side === 'left' ? this.hud.left : this.hud.right).appendChild(btn);
        }
        if (o.color) rec.el.className = 'gb sbtn ' + o.color;
        if (o.onClick) rec.onClick = o.onClick;
        if (o.icon != null || o.label != null) {
            rec.icon = o.icon != null ? o.icon : rec.icon;
            rec.label = o.label != null ? o.label : rec.label;
            rec.el.innerHTML = this.icon(rec.icon || 'star') + '<span class="lb otx">' + GameUtil.esc(rec.label || '') + '</span>';
            rec.el.appendChild(rec.badge);
        }
        if (o.badge != null) this.setBadge(o.id, o.badge);
        return rec.el;
    },
    removeSideButton(id) {
        const rec = this.sideButtons[id];
        if (rec) { rec.el.remove(); delete this.sideButtons[id]; }
    },
    /** Красный счётчик на кнопке (0 — скрыт). */
    setBadge(id, n) {
        const rec = this.sideButtons[id];
        if (!rec) return;
        n = Math.max(0, Math.floor(Number(n) || 0));
        rec.badge.textContent = n > 99 ? '99+' : String(n);
        rec.badge.classList.toggle('hide', n <= 0);
    },
    /** Показать/спрятать боковую кнопку (например, до туториала). */
    showSideButton(id, on) {
        const rec = this.sideButtons[id];
        if (rec) rec.el.style.display = on ? '' : 'none';
    },

    // =============================================================================================
    // HUD: значения
    // =============================================================================================
    setObjective(text, pulse = true) {
        const o = this.hud.objective;
        if (!o || o.textContent === text) return;
        o.textContent = text;
        if (pulse) { o.classList.remove('pop'); void o.offsetWidth; o.classList.add('pop'); }
    },
    /** Показанная скорость ⚡ (число). */
    setSpeed(shown) {
        const t = GameUtil.fmt(shown);
        if (t !== this._speedText) { this._speedText = t; this.hud.speedVal.textContent = t; }
    },
    _bumpCash() {
        const c = this.hud.cash;
        if (!c) return;
        c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
    },
    /** Таймер волны яиц: «через 6с ×10». */
    setWave(seconds, count) {
        const h = this.hud;
        if (!h.waveText) return;
        const t = Lang.t('hud.wave', { t: GameUtil.fmtTime(seconds) });
        if (h.waveText.textContent !== t) h.waveText.textContent = t;
        const c = '×' + count;
        if (h.waveCount.textContent !== c) h.waveCount.textContent = c;
    },
    /** Солнце/луна и таймер до смены: night — сейчас ночь, seconds — до смены. */
    setDay(night, seconds) {
        const h = this.hud;
        if (!h.dayText) return;
        if (h.day.classList.contains('night') !== night) {
            h.day.classList.toggle('night', night);
            h.dayIcon.innerHTML = this.icon(night ? 'moon' : 'sun');
        }
        const t = Lang.t('hud.dayTimer', { t: GameUtil.fmtTime(seconds) });
        if (h.dayText.textContent !== t) h.dayText.textContent = t;
    },
    /** Кнопка «Сесть на питомца» / «Слезть». */
    setRide(riding) {
        const r = this.hud.ride;
        if (!r) return;
        r.innerHTML = this.keyHtml('KeyR') + GameUtil.esc(Lang.t(riding ? 'hud.dismount' : 'hud.ride'));
    },
    showRide(on) { if (this.hud.ride) this.hud.ride.style.display = on ? '' : 'none'; },
    /** Показать подсказку действия (E / контекстная кнопка) или спрятать (null). */
    showAction(label) {
        const a = this.hud.act;
        if (!a) return;
        if (label == null) { a.classList.remove('show'); return; }
        a.innerHTML = this.keyHtml('KeyE') + GameUtil.esc(label);
        a.classList.add('show');
    },
    /** Кнопка «Буст +N%» и таймеры активных бустов (деньги ×2, удача ×2) — обновляется раз в секунду и по событиям. */
    refreshBoost() {
        const h = this.hud;
        if (!h.boostLabel) return;
        const p = GameState.boostPercent();
        const cashLeft = GameState.boostLeft('cash2x'), luckLeft = GameState.boostLeft('luck2x');
        const line1 = Lang.t('hud.boost', { n: p }) + (cashLeft > 0 ? ' ' + GameUtil.fmtClock(cashLeft) : '');
        const line2 = luckLeft > 0 ? Lang.t('hud.boostLuck', { t: GameUtil.fmtClock(luckLeft) }) : '';
        const sig = line1 + '|' + line2;
        if (sig !== this._boostSig) {
            this._boostSig = sig;
            h.boostLabel.innerHTML = '<span class="bl"><span>' + GameUtil.esc(line1) + '</span>' + (line2 ? '<span class="b2">' + GameUtil.esc(line2) + '</span>' : '') + '</span>';
        }
        h.boost.classList.toggle('on', cashLeft > 0 || luckLeft > 0);
    },
    /**
     * Корзина с яйцами (HUD над кнопкой «Сесть»): items — [{ html?, frac (0..1 осталось), warn?, empty? }], cap — вместимость.
     * opts.warning — строка предупреждения («Яйцо скоро разобьётся!»). Пустой список без cap — спрятать.
     * Обновляется на месте: структура (число ячеек, иконки) пересобирается только при изменении, полосы — каждый вызов.
     */
    setBasket(items, opts = {}) {
        const h = this.hud, b = h.basket;
        if (!b) return;
        const cap = Math.max(items.length, opts.cap || 0);
        if (!cap) {
            if (b.classList.contains('show')) { b.classList.remove('show'); if (this.root) this.root.classList.remove('bk'); }
            this._bkSig = '';
            return;
        }
        const E = GameUtil.el;
        const sig = cap + '|' + items.map(it => (it ? (it.html || '') : '-')).join('|');
        if (sig !== this._bkSig) {
            this._bkSig = sig;
            GameUtil.clear(h.bkRow);
            h.bkCells = [];
            for (let i = 0; i < cap; i++) {
                const it = items[i];
                const cell = E('div', { class: 'bk-egg' + (!it ? ' empty' : '') });
                cell.innerHTML = (it && it.html) || this.icon('egg');
                const fill = E('i');
                cell.appendChild(E('div', { class: 'bar' }, fill));
                h.bkRow.appendChild(cell);
                h.bkCells.push({ cell, fill, w: -1, warn: false });
            }
        }
        for (let i = 0; i < h.bkCells.length; i++) {
            const it = items[i], c = h.bkCells[i];
            const w = Math.round(GameUtil.clamp(it ? it.frac : 0, 0, 1) * 100);
            if (w !== c.w) { c.w = w; c.fill.style.width = w + '%'; }
            const warn = !!(it && it.warn);
            if (warn !== c.warn) { c.warn = warn; c.cell.classList.toggle('warn', warn); }
        }
        const wt = opts.warning || '';
        if (h.bkWarn.textContent !== wt) h.bkWarn.textContent = wt;
        h.bkWarn.style.display = wt ? '' : 'none';
        b.classList.add('show');
        if (this.root && !this.root.classList.contains('bk')) this.root.classList.add('bk');
    },
    /** Дополнительный элемент под корзиной (кнопка «+60 с за рекламу»); null — убрать. */
    setBasketAction(el) {
        const h = this.hud;
        if (!h.bkAct) return;
        const cur = h.bkAct.firstChild;
        if (cur === el || (!cur && !el)) return;
        GameUtil.clear(h.bkAct);
        if (el) h.bkAct.appendChild(el);
        h.bkAct.style.display = el ? '' : 'none';
    },

    // =============================================================================================
    // Тосты и баннеры
    // =============================================================================================
    /** Короткое сообщение под табличкой цели. kind: info | good | bad. */
    toast(text, kind = 'info', ms = 2600) {
        const layer = this.hud.toastLayer;
        if (!layer || !text) return null;
        const el = GameUtil.el('div', { class: 'toast wood otx-s ' + kind, text });
        layer.appendChild(el);
        while (layer.children.length > 4) layer.removeChild(layer.firstChild);
        setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
        if (kind === 'bad') this.sfx('error', { volume: 0.5 });
        return el;
    },
    /**
     * Крупный баннер по центру (редкие яйца, события). Окно, панель, пауза или кинематика вылупления открыты (this.blocking) —
     * баннер не рисуется поверх них, а ждёт в очереди (UI_BANNER_QUEUE_MAX штук, не дольше UI_BANNER_MAX_WAIT с) и появляется
     * после закрытия; тогда возвращается null. Показанный баннер, под которым открылось окно, убирается и возвращается в очередь.
     * На экране не больше двух баннеров: следующие тоже ждут в очереди, а не вытесняют показанные.
     */
    banner(text, ms = 3200, opts = {}) {
        if (!this.hud.bannerLayer || !text) return null;
        if (this._bannerHeld() || this._banners.length >= 2 || this._bannerQueue.length) { this._queueBanner({ text, ms, opts, t: Date.now() }); return null; }
        return this._showBanner({ text, ms, opts });
    },
    _bannerHeld() { return this.blocking; },
    _queueBanner(rec) {
        const q = this._bannerQueue;
        const dup = q.findIndex(r => r.text === rec.text);
        if (dup >= 0) q.splice(dup, 1);
        q.push(rec);
        const max = typeof UI_BANNER_QUEUE_MAX !== 'undefined' ? UI_BANNER_QUEUE_MAX : 3;
        while (q.length > Math.max(1, max)) q.shift();
    },
    _showBanner(rec) {
        const layer = this.hud.bannerLayer;
        const el = GameUtil.el('div', { class: 'banner wood otx', text: rec.text });
        if (rec.opts && rec.opts.color) el.style.color = rec.opts.color;
        layer.appendChild(el);
        const shown = this._banners;
        const b = { el, text: rec.text, ms: rec.ms, opts: rec.opts || {}, until: Date.now() + rec.ms, t1: 0, t2: 0 };
        shown.push(b);
        while (shown.length > 2) this._dropBanner(shown[0]);
        if (!rec.opts || rec.opts.sound !== false) this.sfx('announce', { volume: 0.7 });
        b.t1 = setTimeout(() => {
            el.classList.add('out');
            b.t2 = setTimeout(() => this._dropBanner(b), 500);
        }, rec.ms);
        return el;
    },
    _dropBanner(b) {
        clearTimeout(b.t1); clearTimeout(b.t2);
        b.el.remove();
        const i = this._banners.indexOf(b);
        if (i >= 0) this._banners.splice(i, 1);
    },
    /** Раз в кадр и при открытии окон: под окном баннеров нет (показанные — в очередь), после закрытия очередь выходит по одному-двум. */
    _pumpBanners() {
        const shown = this._banners, q = this._bannerQueue;
        if (!shown.length && !q.length) return;
        if (this._bannerHeld()) {
            const now = Date.now();
            for (const b of shown.slice().reverse()) {
                const left = b.until - now;
                this._dropBanner(b);
                if (left > 600) this._queueBanner({ text: b.text, ms: Math.max(left, 2000), opts: Object.assign({}, b.opts, { sound: false }), t: now });
            }
            return;
        }
        const wait = (typeof UI_BANNER_MAX_WAIT !== 'undefined' ? UI_BANNER_MAX_WAIT : 30) * 1000;
        const now = Date.now();
        while (q.length && shown.length < 2) {
            const r = q.shift();
            if (now - r.t <= wait) this._showBanner(r);
        }
    },

    // =============================================================================================
    // Панели и модалки
    // =============================================================================================
    get blocking() { return !!this.panel || this.modals.length > 0 || this.paused || this.lock > 0; },

    /**
     * Открыть панель (одна за раз: открытая закрывается). Остальной HUD прячется, движение блокируется.
     * @param {{ id: string, title: string, build?: (el: HTMLElement, panel: any) => void, onClose?: () => void, wide?: boolean, keepOpen?: boolean, width?: string, cls?: string }} o
     */
    openPanel(o) {
        if (this.panel) this.closePanel();
        const E = GameUtil.el;
        const body = E('div', { class: 'panel-body parch' + (o.cls ? ' ' + o.cls : '') });
        const close = E('button', { class: 'gb red panel-x', type: 'button', 'aria-label': Lang.t('ui.close'), text: '✕' });
        const head = E('div', { class: 'panel-head wood otx', text: o.title || '' });
        const panel = E('div', { class: 'panel wood' + (o.wide ? ' wide' : '') }, head, close, body);
        if (o.width) panel.style.width = o.width;
        const dim = E('div', { class: 'pl-dim' }, panel);
        const rec = { id: o.id, el: body, root: dim, panelEl: panel, headEl: head, onClose: o.onClose || null, closed: false,
            setTitle: (t) => { head.textContent = t; }, close: () => this.closePanel(o.id) };
        dim.addEventListener('pointerdown', (e) => e.stopPropagation());
        dim.addEventListener('click', (e) => { if (e.target === dim) { this.sfx('close'); this.closePanel(o.id); } });
        this._press(close, () => this.closePanel(o.id), true);
        close.addEventListener('click', () => this.sfx('close'));
        this.hud.panelLayer.appendChild(dim);
        this.panel = rec;
        this.root.classList.add('panel-open');
        this.input.reset();
        this._pumpBanners();
        this.sfx('open');
        if (o.build) { try { o.build(body, rec); } catch (e) { console.error('openPanel build:', e); } }
        Game.events.emit('ui:panel', { id: o.id, open: true });
        return rec;
    },
    /** Закрыть панель (id — только если открыта именно эта). */
    closePanel(id) {
        const p = this.panel;
        if (!p || (id && p.id !== id)) return false;
        this.panel = null;
        p.closed = true;
        p.root.remove();
        this.root.classList.remove('panel-open');
        if (p.onClose) { try { p.onClose(); } catch (e) { console.error('panel onClose:', e); } }
        Game.events.emit('ui:panel', { id: p.id, open: false });
        return true;
    },
    isPanelOpen(id) { return !!this.panel && (!id || this.panel.id === id); },
    /** Класс корня modal-open, пока открыто хоть одно модальное окно (showModal, confirm): обучение сворачивает свою табличку. */
    _syncModals() { if (this.root) this.root.classList.toggle('modal-open', this.modals.length > 0); },

    /**
     * Окно подтверждения: Promise<boolean>.
     * @param {{ title?: string, text?: string, ok?: string, cancel?: string | null, color?: string }} o
     */
    confirm(o = {}) {
        return new Promise((resolve) => {
            const E = GameUtil.el;
            const ok = E('button', { class: 'gb ' + (o.color || 'green'), type: 'button', text: o.ok || Lang.t('ui.ok') });
            const btns = E('div', { class: 'modal-btns' });
            const cancel = o.cancel === null ? null : E('button', { class: 'gb red', type: 'button', text: o.cancel || Lang.t('ui.cancel') });
            if (cancel) btns.appendChild(cancel);
            btns.appendChild(ok);
            const body = E('div', { class: 'panel-body parch' }, E('div', { class: 'modal-text', text: o.text || '' }), btns);
            const head = E('div', { class: 'panel-head wood otx', text: o.title || '' });
            const panel = E('div', { class: 'panel wood', style: { width: 'min(calc(var(--u)*520),100%)' } }, head, body);
            const dim = E('div', { class: 'pl-dim', style: { zIndex: '2' } }, panel);
            const rec = { dim, done: false, finish: (v) => { if (rec.done) return; rec.done = true; dim.remove(); const i = this.modals.indexOf(rec); if (i >= 0) this.modals.splice(i, 1); this._syncModals(); resolve(v); } };
            dim.addEventListener('pointerdown', (e) => e.stopPropagation());
            this._press(ok, () => rec.finish(true));
            if (cancel) this._press(cancel, () => rec.finish(false), false);
            this.modals.push(rec);
            this._syncModals();
            this.hud.panelLayer.appendChild(dim);
            this.input.reset();
            this._pumpBanners();
        });
    },

    /**
     * Модальное окно поверх игры (результат вылупления, «Яйцо разбилось», приветствие): деревянная табличка и пергамент.
     * Входит в this.modals: ввод игрока заблокирован, Esc закрывает, если не noEsc. rec.finish(v) / rec.close() закрывают.
     * @param {{ title?: string, build?: (el: HTMLElement, rec: any) => void, onClose?: (v: any) => void, noEsc?: boolean, light?: boolean, cls?: string, width?: string }} o
     */
    showModal(o) {
        const E = GameUtil.el;
        const body = E('div', { class: 'panel-body parch' + (o.cls ? ' ' + o.cls : '') });
        const head = E('div', { class: 'panel-head wood otx', text: o.title || '' });
        const panel = E('div', { class: 'panel wood', style: { width: o.width || 'min(calc(var(--u)*560),100%)' } }, head, body);
        const dim = E('div', { class: 'pl-dim' + (o.light ? ' light' : ''), style: { zIndex: '2' } }, panel);
        const rec = {
            el: body, dim, panelEl: panel, headEl: head, noEsc: !!o.noEsc, done: false,
            setTitle: (t) => { head.textContent = t; },
            finish: (v) => {
                if (rec.done) return;
                rec.done = true;
                dim.remove();
                const i = this.modals.indexOf(rec);
                if (i >= 0) this.modals.splice(i, 1);
                this._syncModals();
                if (o.onClose) { try { o.onClose(v); } catch (e) { console.error('modal onClose:', e); } }
            },
            close: () => rec.finish(true),
        };
        dim.addEventListener('pointerdown', (e) => e.stopPropagation());
        this.modals.push(rec);
        this._syncModals();
        this.hud.panelLayer.appendChild(dim);
        this.input.reset();
        this._pumpBanners();
        this.sfx('open', { volume: 0.5 });
        if (o.build) { try { o.build(body, rec); } catch (e) { console.error('showModal build:', e); } }
        return rec;
    },

    /** Вспышка на весь экран (вылупление): color — css-цвет, ms — длительность затухания. */
    flash(color = '#fff', ms = 700) {
        const E = GameUtil.el;
        const el = E('div', { class: 'hatch-flash' });
        el.style.background = color;
        this.root.appendChild(el);
        void el.offsetWidth;
        el.style.opacity = '0.95';
        setTimeout(() => { el.classList.add('out'); el.style.transitionDuration = ms + 'ms'; el.style.opacity = '0'; setTimeout(() => el.remove(), ms + 80); }, 110);
    },

    /** Добавить CSS модуля один раз (id — ключ): GameUI.addCss('eggs', '.x{…}'). */
    addCss(id, css) {
        const key = 'css-' + id;
        if (document.getElementById(key)) return;
        const st = document.createElement('style');
        st.id = key;
        st.textContent = css;
        document.head.appendChild(st);
    },

    // =============================================================================================
    // Кнопка «За рекламу»
    // =============================================================================================
    /**
     * Превратить элемент в кнопку награды за рекламу. Награда — один раз и только после
     * await Platform.rewarded(id) === true; без рекламы кнопка неактивна; повторное нажатие во время показа игнорируется.
     * @param {HTMLElement} el
     * @param {{ id: string, label?: string, onReward: () => any, cls?: string }} o
     */
    rewardButton(el, o) {
        el.classList.add('gb', 'reward');
        if (o.cls) el.classList.add(...o.cls.split(' '));
        else if (!/\b(green|yellow|red|orange|pink|blue)\b/.test(el.className)) el.classList.add('blue');
        const handle = {
            el, id: o.id, busy: false, label: o.label || '',
            setLabel(t) { handle.label = t; handle.render(); },
            render() {
                el.innerHTML = GameUI.icon('play') + '<span class="rb-t">' + GameUtil.esc(handle.label || Lang.t('ad.watch')) + '</span>';
            },
            refresh() {
                const ok = GameUI.adsAvailable() && !handle.busy;
                /** @type {HTMLButtonElement} */ (el).disabled = !ok;
                el.classList.toggle('off', !ok);
                el.title = GameUI.adsAvailable() ? '' : Lang.t('ad.unavailable');
            },
            destroy() { el.removeEventListener('click', onClick); },
        };
        const onClick = async (e) => {
            e.stopPropagation();
            if (handle.busy || GameUI._adBusy || !GameUI.adsAvailable()) return;
            handle.busy = true; GameUI._adBusy = true;
            handle.refresh();
            try {
                const ok = await Platform.rewarded(o.id);
                if (ok === true) { await o.onReward(); } else this.toast(Lang.t('ad.fail'), 'bad');
            } catch (err) { console.error('rewardButton:', err); } finally {
                handle.busy = false; GameUI._adBusy = false;
                handle.refresh();
            }
        };
        el.addEventListener('click', onClick);
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
        handle.render();
        handle.refresh();
        return handle;
    },

    // Панель бустов (кнопка «Буст +0% [+]»): ×2 денег на 10 минут и ×2 удачи на 5 минут за рекламу.
    openBoostPanel() {
        if (this.blocking) return;
        const E = GameUtil.el;
        let timer = 0;
        const rows = [
            { id: 'cash2x', icon: 'banknote', title: 'boost.cash', desc: 'boost.cash.desc', secs: 600, ad: 'boost-cash' },
            { id: 'luck2x', icon: 'clover', title: 'boost.luck', desc: 'boost.luck.desc', secs: 300, ad: 'boost-luck' },
        ];
        this.openPanel({
            id: 'boost', title: Lang.t('boost.title'),
            onClose: () => clearInterval(timer),
            build: (body) => {
                const timers = [];
                for (const r of rows) {
                    const st = E('div', { class: 'sub' });
                    const btn = E('button', { class: 'gb', type: 'button' });
                    this.rewardButton(btn, { id: r.ad, label: Lang.t('boost.get', { n: r.secs / 60 }), cls: 'green', onReward: () => {
                        GameState.addBoost(r.id, r.secs);
                        GameState.saveNow();
                        this.sfx('unlock');
                        this.toast(Lang.t('boost.on', { name: Lang.t(r.title) }), 'good');
                        upd();
                    } });
                    body.appendChild(E('div', { class: 'row' },
                        E('div', { html: this.icon(r.icon), style: { fontSize: 'calc(var(--u)*44)' } }),
                        E('div', { class: 'grow' }, E('div', { class: 'ttl', text: Lang.t(r.title) }), E('div', { class: 'sub', text: Lang.t(r.desc) }), st),
                        btn));
                    timers.push([r.id, st]);
                }
                const upd = () => {
                    for (const [id, st] of timers) {
                        const left = GameState.boostLeft(id);
                        st.textContent = left > 0 ? Lang.t('boost.left', { t: GameUtil.fmtTime(left) }) : '';
                    }
                    this.refreshBoost();
                };
                upd();
                timer = window.setInterval(upd, 500);
            },
        });
    },

    // =============================================================================================
    // Пауза
    // =============================================================================================
    setPaused(on) {
        on = !!on;
        if (on === this.paused) return;
        this.paused = on;
        if (typeof Pause !== 'undefined') Pause.set('manual', on);
        this.input.reset();
        this._pumpBanners();
        // Меню паузы рисует Menus (панель «Пауза»); запасная табличка — только если модуля нет.
        const menus = /** @type {any} */ (typeof Menus !== 'undefined' ? Menus : null);
        if (menus && typeof menus.showPause === 'function') {
            if (on) menus.showPause(); else menus.hidePause();
        } else if (on) {
            const E = GameUtil.el;
            const resume = E('button', { class: 'gb big', type: 'button', text: Lang.t('pause.resume') });
            this._press(resume, () => this.setPaused(false));
            const ov = E('div', { class: 'pause-ov' }, E('div', { class: 'sign wood otx', text: Lang.t('pause.title') }), resume);
            ov.addEventListener('pointerdown', (e) => e.stopPropagation());
            this.hud.pauseOverlay = ov;
            this.root.appendChild(ov);
        } else if (this.hud.pauseOverlay) {
            this.hud.pauseOverlay.remove();
            this.hud.pauseOverlay = null;
        }
        Game.events.emit('pause', { on });
    },

    // =============================================================================================
    // Процедурная иконка питомца (пока нет webp из реестра)
    // =============================================================================================
    /** URL картинки иконки питомца: файл из реестра моделей или нарисованная на canvas. */
    petIconUrl(species) {
        const f = PetModels.icon(species);
        if (f) return f;
        if (this._petIcons[species]) return this._petIcons[species];
        const url = typeof PetView !== 'undefined' ? PetView.drawIcon(species, 128) : '';
        this._petIcons[species] = url;
        return url;
    },
    /** HTML иконки питомца: <img class="pi" ...>; size — px (в CSS-единицах интерфейса). */
    petIcon(species, size = 56) {
        const src = this.petIconUrl(species);
        return src ? '<img class="pi" src="' + src + '" alt="" style="width:calc(var(--u)*' + size + ');height:calc(var(--u)*' + size + ')">' : '';
    },

    // =============================================================================================
    // Мобильные кнопки
    // =============================================================================================
    _buildTouch(tc) {
        const E = GameUtil.el;
        const h = this.hud;
        h.joy = E('div', { class: 'joy' }, E('i'));
        h.joyHint = E('div', { class: 'joy-hint' });
        h.tjump = E('button', { class: 'gb yellow tbtn tjump', type: 'button' });
        h.tjump.innerHTML = this.icon('w-arrow-up') + '<span>' + GameUtil.esc(Lang.t('hud.jump')) + '</span>';
        h.tdown = E('button', { class: 'gb orange tbtn tdown', type: 'button' });
        h.tdown.innerHTML = this.icon('w-arrow-down');
        tc.append(h.joyHint, h.joy, h.tjump, h.tdown);
        const hold = (el, key) => {
            const on = (e) => { e.preventDefault(); e.stopPropagation(); this.input[key] = true; if (key === 'touchJump') this.input.pressed.add('Space'); el.classList.add('press'); };
            const off = (e) => { e.stopPropagation(); this.input[key] = false; el.classList.remove('press'); };
            el.addEventListener('pointerdown', on);
            el.addEventListener('pointerup', off);
            el.addEventListener('pointercancel', off);
            el.addEventListener('pointerleave', off);
        };
        hold(h.tjump, 'touchJump');
        hold(h.tdown, 'touchDown');
    },

    // =============================================================================================
    // Ввод
    // =============================================================================================
    _bindInput(app) {
        const inp = this.input;
        const canvas = /** @type {HTMLElement} */ (document.getElementById('world3d'));
        const gameKey = (c) => /^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Space|ShiftLeft|ShiftRight|KeyE|KeyR|KeyQ)$/.test(c);
        window.addEventListener('keydown', (e) => {
            if (GameUtil.isField(e.target)) return;
            this.setTouch(false);
            if (e.code === 'Escape' || e.code === 'KeyP') {
                if (e.repeat || (typeof Pause !== 'undefined' && Pause.has('loading'))) return;
                // Esc нельзя глушить preventDefault (требование Playables: хост сам ловит Esc); P — наша клавиша паузы.
                if (e.code !== 'Escape') e.preventDefault();
                // Титульный экран и пауза платформы: Menus решает сам (true — клавиша обработана).
                const menus = /** @type {any} */ (typeof Menus !== 'undefined' ? Menus : null);
                if (menus && typeof menus.onEscape === 'function' && menus.onEscape(e.code)) return;
                if (this.modals.length) { const m = this.modals[this.modals.length - 1]; if (!m.noEsc) m.finish(false); return; }
                if (this.panel) { this.sfx('close'); this.closePanel(); return; }
                if (e.code === 'KeyP' || e.code === 'Escape') this.setPaused(!this.paused);
                return;
            }
            if (this.blocking) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (!gameKey(e.code)) return;
            e.preventDefault();
            if (!inp.keys.has(e.code)) inp.pressed.add(e.code);
            inp.keys.add(e.code);
            if (e.repeat) return;
            if (e.code === 'KeyE') Interact.trigger();
            if (e.code === 'KeyR' && typeof Player !== 'undefined' && Player.ready) { this.sfx('click', { volume: 0.4 }); Player.toggleRide(); }
            inp.pressed.delete('KeyE'); inp.pressed.delete('KeyR');
        });
        window.addEventListener('keyup', (e) => { inp.keys.delete(e.code); });
        window.addEventListener('blur', () => inp.reset());
        // тип ввода по факту нажатия
        window.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') this.setTouch(true);
            else if (e.pointerType === 'mouse') this.setTouch(false);
        }, true);
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        canvas.addEventListener('wheel', (e) => {
            if (this.blocking) return;
            e.preventDefault();
            inp.zoom += GameUtil.clamp(e.deltaY / 100, -2, 2);
        }, { passive: false });

        // середина игрового поля (на ПК оно может быть уже окна — ограничение 2:1, см. index.html .cap21)
        const rootRect = () => (this.root ? this.root.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth || 800 });
        const half = () => { const r = rootRect(); return r.left + r.width / 2; };
        const R = () => 56 * this.scale;
        const joyEl = () => this.hud.joy;
        canvas.addEventListener('pointerdown', (e) => {
            if (this.blocking) return;
            const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
            // мышь левой кнопкой на левой половине — джойстик, если экранное управление включено и на ПК (Playables)
            const mouseJoy = this.alwaysTouch && e.pointerType === 'mouse' && e.button === 0;
            if (!touch && e.button !== 0 && e.button !== 2) return;
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* синтетическое событие */ }
            let kind = 'cam';
            if ((touch || mouseJoy) && e.clientX < half() && !inp.joyActive) {
                kind = 'joy';
                inp.joyActive = true;
                const j = joyEl();
                const rr = rootRect();
                j.style.left = (e.clientX - rr.left) + 'px'; j.style.top = (e.clientY - rr.top) + 'px';
                j.classList.add('on');
                /** @type {HTMLElement} */ (j.firstChild).style.transform = 'translate(0,0)';
                this.hud.joyHint.classList.add('gone');
            }
            this._pointers.set(e.pointerId, { kind, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, touch });
            if (kind === 'cam') {
                const cams = [...this._pointers.values()].filter(p => p.kind === 'cam');
                if (cams.length === 2) this._pinchDist = Math.hypot(cams[0].x - cams[1].x, cams[0].y - cams[1].y);
            }
            e.preventDefault();
        });
        canvas.addEventListener('pointermove', (e) => {
            const p = this._pointers.get(e.pointerId);
            if (!p) return;
            const dx = e.clientX - p.x, dy = e.clientY - p.y;
            p.x = e.clientX; p.y = e.clientY;
            if (p.kind === 'joy') {
                let jx = p.x - p.ox, jy = p.y - p.oy;
                const len = Math.hypot(jx, jy), r = R();
                if (len > r) { jx = jx / len * r; jy = jy / len * r; }
                /** @type {HTMLElement} */ (joyEl().firstChild).style.transform = 'translate(' + jx.toFixed(1) + 'px,' + jy.toFixed(1) + 'px)';
                const m = Math.min(1, len / r);
                const dz = 0.14;
                const mag = m < dz ? 0 : (m - dz) / (1 - dz);
                const dl = Math.max(len, 1e-6), kx = (p.x - p.ox) / dl, ky = (p.y - p.oy) / dl;
                inp.joyX = len > 0 ? kx * mag : 0;
                inp.joyY = len > 0 ? -ky * mag : 0;
            } else {
                const cams = [...this._pointers.values()].filter(q => q.kind === 'cam');
                if (cams.length >= 2) {
                    const d = Math.hypot(cams[0].x - cams[1].x, cams[0].y - cams[1].y);
                    if (this._pinchDist > 1 && d > 1) inp.zoom += Math.log(this._pinchDist / d) * 4;
                    this._pinchDist = d;
                } else {
                    inp.camDX += dx; inp.camDY += dy;
                    inp.lookTotal += Math.abs(dx) + Math.abs(dy);
                }
            }
        });
        const up = (e) => {
            const p = this._pointers.get(e.pointerId);
            if (!p) return;
            this._pointers.delete(e.pointerId);
            if (p.kind === 'joy') {
                inp.joyActive = false; inp.joyX = inp.joyY = 0;
                joyEl().classList.remove('on');
            }
            this._pinchDist = 0;
        };
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
    },

    // Состояние ввода за кадр: клавиатура + джойстик -> moveX/moveY (+1 вперёд / вправо), поворот стрелками.
    _poll() {
        const inp = this.input, k = inp.keys;
        if (this.blocking) { inp.moveX = inp.moveY = 0; inp.jump = inp.descend = false; inp.rotKey = 0; return; }
        let x = 0, y = 0;
        if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
        if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
        if (k.has('KeyD')) x += 1;
        if (k.has('KeyA')) x -= 1;
        if (x || y) { const l = Math.hypot(x, y); x /= l; y /= l; }
        if (inp.joyActive && (inp.joyX || inp.joyY)) { x = inp.joyX; y = inp.joyY; }
        inp.moveX = x; inp.moveY = y;
        inp.rotKey = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
        inp.jump = k.has('Space') || inp.touchJump;
        inp.descend = k.has('ShiftLeft') || k.has('ShiftRight') || inp.touchDown;
    },

    // =============================================================================================
    // Кадр
    // =============================================================================================
    update(dt) {
        this._poll();
        this._pumpBanners();
        if (this.input.rotKey) this.input.lookTotal += 300 * dt;
        if (typeof Player !== 'undefined') {
            Interact.update(Player.x, Player.y, this.blocking);
            this.setSpeed(Player.speedShown());
            const fly = Player.canFly();
            this.hud.tdown.classList.toggle('show', fly && this.touch);
        }
        // Счётчик денег: плавно догоняет значение.
        const diff = this._targetCash - this._shownCash;
        if (Math.abs(diff) > 0.4) this._shownCash += diff * Math.min(1, dt * 11);
        else this._shownCash = this._targetCash;
        const text = GameUtil.fmt(this._shownCash);
        if (text !== this._cashText) { this._cashText = text; this.hud.cashVal.textContent = text; }
        // Таймер буста на кнопке
        this._boostTick += dt;
        if (this._boostTick > 1) { this._boostTick = 0; this.refreshBoost(); }
    },
};

// Дефолты таймеров HUD до первого обновления модулями (константы Constants.js через typeof).
function DAY_SECONDS_DEFAULT() { return typeof DAY_SECONDS !== 'undefined' ? DAY_SECONDS : 240; }
function EGG_WAVE_DEFAULT() { return typeof EGG_WAVE_SECONDS !== 'undefined' ? EGG_WAVE_SECONDS : 45; }
function EGG_COUNT_DEFAULT() { return typeof EGG_WAVE_COUNT !== 'undefined' ? EGG_WAVE_COUNT : 10; }

Game.register(GameUI);
