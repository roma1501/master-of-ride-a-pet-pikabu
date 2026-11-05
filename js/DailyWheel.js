// DailyWheel.js — Подарок дня (Daily Gift, 7 дней) и колесо фортуны.
//
// ПОДАРОК ДНЯ. Цикл из 7 дней по календарю УСТРОЙСТВА (локальная дата). Пропуск дня цикл не сбрасывает: при следующем
// заходе открывается следующий день. Забрать можно раз в календарный день; получение защищено от повтора (дата ставится
// ДО выдачи). Дни 1-6 — лапки, бусты (cash2x / luck2x), предметы магазина (Cosmetics.randomShopItem + grant; уже имеющийся
// предмет заменяется лапками) по нарастающей, рядом «×2 за рекламу» (rewarded `daily-x2`, удвоение только после true;
// базовую награду можно забрать и без рекламы). День 7 — эксклюзивный наряд из Cosmetics.EXCLUSIVE (1-й, 2-й, 3-й круг;
// дальше — крупная награда лапками), виден в окне как цель, без «×2».
//
// КОЛЕСО. 8 секторов (семь сумм лапок и один предмет магазина, эксклюзивы не выпадают). 1 бесплатное вращение в день +
// WHEEL_AD_SPINS за рекламу (rewarded `wheel-spin`). Результат выбирается ДО анимации и начисляется сразу (один раз, даже если
// вкладку свернули посреди вращения); анимация — только украшение, колесо встаёт точно на выпавший сектор.
//
// ИНТЕРФЕЙС. Боковые кнопки «Подарок» и «Колесо» слева (GameUI.addSideButton) со значком, когда что-то доступно. Окно подарка
// само предлагается один раз в день, только когда: туториал пройден и не идёт, нет панелей/окон, корзина пуста, игрок у своего
// ранчо, титульный экран (Menus) не показан. Иначе — только значок на кнопке.
//
// API:
//   DailyWheel.openDaily(opts) / openWheel()             окна (opts.auto — автопредложение)
//   DailyWheel.canClaimDaily() / nextDay() / claimedDays()   календарь подарка
//   DailyWheel.claimDaily(mult) -> { day, cycle, mult, got[] } | null      выдать подарок (mult 2 — «×2», кроме дня 7)
//   DailyWheel.wheelFreeAvailable() / wheelAdLeft() / spinWheel(kind, rng) -> { index, offset, prize, ... } | null
//   DailyWheel.badgeCount()                              для меню: сколько «красных точек» (подарок + бесплатное колесо)
//   DailyWheel.blockers                                  массив функций () => bool: true — автопредложение подождёт (Menus и др.)
// События (Game.events): daily:claimed { day, cycle, mult, got }, wheel:spin { kind, index, prize }.
// Cosmetics подключается мягко (typeof): нет модуля или метода — вместо предметов выдаются лапки.

Lang.add({
    ru: {
        'dw.giftBtn': 'Подарок', 'dw.wheelBtn': 'Колесо',
        'dw.gift.title': 'Подарок дня',
        'dw.gift.sub': 'Заходи каждый день: на седьмой день тебя ждёт особый наряд!',
        'dw.gift.subAfter': 'Подарок на сегодня получен. Завтра тебя ждёт день {n}!',
        'dw.day': 'День {n}', 'dw.tagToday': 'Сегодня', 'dw.tagTomorrow': 'Завтра',
        'dw.claim': 'Забрать', 'dw.claimX2': '×2 за рекламу', 'dw.close': 'Хорошо',
        'dw.cap.base': 'Награда: {r}', 'dw.cap.x2': 'С рекламой: {r}',
        'dw.noX2': 'Особый наряд выдаётся один раз — без удвоения',
        'dw.adOff': 'Реклама сейчас недоступна. Награду можно забрать и без неё.',
        'dw.r.paws': 'Лапки: {n}', 'dw.r.cash': 'Деньги ×2 на {n} мин', 'dw.r.luck': 'Удача ×2 на {n} мин',
        'dw.r.item': 'Предмет магазина', 'dw.r.items': 'Предметы магазина: {n}',
        'dw.r.exclusive': 'Эксклюзивный наряд', 'dw.r.big': 'Крупная награда: лапки {n}',
        'dw.s.cash': 'Деньги ×2', 'dw.s.luck': 'Удача ×2', 'dw.s.min': '{n} мин',
        'dw.s.item': 'Предмет', 'dw.s.items': 'Предметы ×{n}', 'dw.s.shop': 'из магазина', 'dw.s.plusItem': '+ предмет', 'dw.s.big': 'Крупная награда',
        'dw.exclusive': 'Эксклюзив', 'dw.exclusive.hint': 'Нигде больше не продаётся', 'dw.exclusive.mystery': 'Эксклюзивный наряд',
        'dw.got.title': 'Получено!',
        'dw.got.paws': 'Лапки: +{n}', 'dw.got.cash': 'Деньги ×2 на {n} мин', 'dw.got.luck': 'Удача ×2 на {n} мин',
        'dw.got.item': 'Новый предмет: {name}', 'dw.got.exclusive': 'Эксклюзив: {name}', 'dw.got.dup': 'Такой предмет уже есть — лапки: +{n}',
        'dw.great': 'Отлично!', 'dw.equip': 'Надеть', 'dw.equipped': 'Надето!',
        'dw.wheel.title': 'Колесо фортуны',
        'dw.wheel.free': 'Крутить бесплатно', 'dw.wheel.freeIn': 'Бесплатно через {t}',
        'dw.wheel.ad': 'Ещё вращение за рекламу', 'dw.wheel.spinning': 'Крутится…',
        'dw.wheel.hAd': 'Вращений за рекламу сегодня: {a} из {b}',
        'dw.wheel.hNone': 'На сегодня вращения закончились. Приходи завтра!',
        'dw.wheel.hFree': 'Одно бесплатное вращение в день',
        'dw.wheel.win': 'Выигрыш!', 'dw.wheel.winPaws': 'Лапки: +{n}', 'dw.wheel.winItem': 'Новый предмет: {name}',
        'dw.wheel.toast': 'Колесо фортуны: лапки +{n}', 'dw.wheel.toastItem': 'Колесо фортуны: {name}',
        'dw.wheel.itemSector': 'Предмет из магазина',
    },
    en: {
        'dw.giftBtn': 'Gift', 'dw.wheelBtn': 'Wheel',
        'dw.gift.title': 'Daily Gift',
        'dw.gift.sub': 'Come back every day: on day 7 a special outfit is waiting for you!',
        'dw.gift.subAfter': "Today's gift is claimed. Tomorrow is day {n}!",
        'dw.day': 'Day {n}', 'dw.tagToday': 'Today', 'dw.tagTomorrow': 'Tomorrow',
        'dw.claim': 'Claim', 'dw.claimX2': '×2: watch ad', 'dw.close': 'OK',
        'dw.cap.base': 'Reward: {r}', 'dw.cap.x2': 'With ad: {r}',
        'dw.noX2': 'The special outfit is given once, no doubling',
        'dw.adOff': 'Ads are not available right now. You can still claim the reward without one.',
        'dw.r.paws': 'Paws: {n}', 'dw.r.cash': 'Cash ×2 for {n} min', 'dw.r.luck': 'Luck ×2 for {n} min',
        'dw.r.item': 'Shop item', 'dw.r.items': 'Shop items: {n}',
        'dw.r.exclusive': 'Exclusive outfit', 'dw.r.big': 'Big reward: {n} paws',
        'dw.s.cash': 'Cash ×2', 'dw.s.luck': 'Luck ×2', 'dw.s.min': '{n} min',
        'dw.s.item': 'Item', 'dw.s.items': 'Items ×{n}', 'dw.s.shop': 'from the shop', 'dw.s.plusItem': '+ an item', 'dw.s.big': 'Big reward',
        'dw.exclusive': 'Exclusive', 'dw.exclusive.hint': 'Not sold anywhere else', 'dw.exclusive.mystery': 'Exclusive outfit',
        'dw.got.title': 'You got it!',
        'dw.got.paws': 'Paws: +{n}', 'dw.got.cash': 'Cash ×2 for {n} min', 'dw.got.luck': 'Luck ×2 for {n} min',
        'dw.got.item': 'New item: {name}', 'dw.got.exclusive': 'Exclusive: {name}', 'dw.got.dup': 'You already have this item — paws: +{n}',
        'dw.great': 'Great!', 'dw.equip': 'Equip', 'dw.equipped': 'Equipped!',
        'dw.wheel.title': 'Wheel of Fortune',
        'dw.wheel.free': 'Spin for free', 'dw.wheel.freeIn': 'Free in {t}',
        'dw.wheel.ad': 'Watch ad: spin again', 'dw.wheel.spinning': 'Spinning…',
        'dw.wheel.hAd': 'Ad spins today: {a} of {b}',
        'dw.wheel.hNone': 'No spins left today. Come back tomorrow!',
        'dw.wheel.hFree': 'One free spin every day',
        'dw.wheel.win': 'You won!', 'dw.wheel.winPaws': 'Paws: +{n}', 'dw.wheel.winItem': 'New item: {name}',
        'dw.wheel.toast': 'Wheel of Fortune: paws +{n}', 'dw.wheel.toastItem': 'Wheel of Fortune: {name}',
        'dw.wheel.itemSector': 'Shop item',
    },
});

// Секторов колеса и угол одного сектора.
const DW_SECTORS = 8;
const DW_STEP = 360 / DW_SECTORS;
// Порядок призов по кругу (от стрелки по часовой): номер суммы WHEEL_PAWS_n или 0 — сектор с предметом магазина.
const DW_ORDER = [2, 5, 1, 6, 3, 0, 4, 7];
// Относительные веса сумм 1..7 (чем крупнее приз, тем реже); индекс 0 не используется. Сектор с предметом — WHEEL_ITEM_PERCENT.
const DW_WEIGHTS = [0, 24, 22, 18, 12, 8, 5, 3];
const DW_SECTOR_COLORS = ['#ffe9a0', '#ffb84a'];
const DW_ITEM_COLOR = '#ff8fc8';
const DW_CONFETTI_COLORS = ['#ffd21f', '#ff4fa3', '#43c431', '#3d9cf0', '#ff7a2a', '#ffffff', '#b46cff'];

// Все настройки читаются при каждом обращении (редактор констант правит Constants.js на лету).
function dwCfg() {
    const U = 'undefined';
    return {
        paws1: typeof DAILY_PAWS_DAY1 !== U ? DAILY_PAWS_DAY1 : 20,
        boostCash: typeof DAILY_BOOST_CASH_MIN !== U ? DAILY_BOOST_CASH_MIN : 10,
        paws3: typeof DAILY_PAWS_DAY3 !== U ? DAILY_PAWS_DAY3 : 50,
        boostLuck: typeof DAILY_BOOST_LUCK_MIN !== U ? DAILY_BOOST_LUCK_MIN : 10,
        paws6: typeof DAILY_PAWS_DAY6 !== U ? DAILY_PAWS_DAY6 : 120,
        dupPaws: typeof DAILY_DUP_PAWS !== U ? DAILY_DUP_PAWS : 50,
        bigPaws: typeof DAILY_BIG_PAWS !== U ? DAILY_BIG_PAWS : 600,
        offerDelay: typeof DAILY_OFFER_DELAY !== U ? DAILY_OFFER_DELAY : 1.5,
        offerMargin: typeof DAILY_OFFER_RANCH_MARGIN !== U ? DAILY_OFFER_RANCH_MARGIN : 700,
        adSpins: typeof WHEEL_AD_SPINS !== U ? WHEEL_AD_SPINS : 3,
        spinSec: typeof WHEEL_SPIN_SECONDS !== U ? WHEEL_SPIN_SECONDS : 5.5,
        turns: typeof WHEEL_TURNS !== U ? WHEEL_TURNS : 6,
        itemPercent: typeof WHEEL_ITEM_PERCENT !== U ? WHEEL_ITEM_PERCENT : 8,
        wheelDup: typeof WHEEL_DUP_PAWS !== U ? WHEEL_DUP_PAWS : 75,
        wheelPaws: [0,
            typeof WHEEL_PAWS_1 !== U ? WHEEL_PAWS_1 : 10, typeof WHEEL_PAWS_2 !== U ? WHEEL_PAWS_2 : 20,
            typeof WHEEL_PAWS_3 !== U ? WHEEL_PAWS_3 : 30, typeof WHEEL_PAWS_4 !== U ? WHEEL_PAWS_4 : 50,
            typeof WHEEL_PAWS_5 !== U ? WHEEL_PAWS_5 : 75, typeof WHEEL_PAWS_6 !== U ? WHEEL_PAWS_6 : 100,
            typeof WHEEL_PAWS_7 !== U ? WHEEL_PAWS_7 : 150],
    };
}

const dwNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Cosmetics мягко: объект или null (модуль строит другой агент, API: isOwned, grant, equip, randomShopItem, EXCLUSIVE, thumb). */
function dwCos() { return typeof Cosmetics !== 'undefined' ? /** @type {any} */ (Cosmetics) : null; }

const DW_CSS = `
/* ---- общее ---- */
.dw-note{font-size:max(11px,calc(var(--u)*14));line-height:1.2;color:#a04a1a;text-align:center;font-weight:800}
.dw-note:empty{display:none}
.dw-cap{font-size:max(11px,calc(var(--u)*14.5));line-height:1.15;color:#7a5a38;text-align:center;font-weight:800}
.dw-cv{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:7}
.sbtn .lb.dw-tm{font-size:max(10px,calc(var(--u)*12.5))}
#game-ui.compact .sbtn .lb.dw-tm{font-size:max(10px,calc(var(--u)*10.5))}
/* ---- подарок дня ---- */
.dw-daily{display:flex;flex-direction:column;gap:calc(var(--u)*11);max-width:calc(var(--u)*800);margin:0 auto}
.dw-sub{text-align:center;font-size:max(12px,calc(var(--u)*16.5));line-height:1.2;color:#7a5a38;font-weight:800;padding:0 calc(var(--u)*6)}
.dw-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(0,1.55fr);grid-template-areas:"d1 d2 d3 d7" "d4 d5 d6 d7";gap:calc(var(--u)*14) calc(var(--u)*10);padding-top:calc(var(--u)*9)}
#game-ui.portrait .dw-grid{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-areas:"d1 d2 d3" "d4 d5 d6" "d7 d7 d7"}
.dw-card{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--u)*1);padding:calc(var(--u)*10) calc(var(--u)*4) calc(var(--u)*7);min-height:calc(var(--u)*108);min-width:0;
 border:calc(var(--u)*3.5) solid #7a4a22;border-radius:calc(var(--u)*14);background:linear-gradient(#fffbea,#ffeab0);
 box-shadow:inset 0 calc(var(--u)*-4) 0 rgba(150,100,45,.22),0 calc(var(--u)*3) 0 rgba(0,0,0,.2);text-align:center}
.dw-d{font-size:max(11px,calc(var(--u)*13.5));line-height:1;color:#8a5a2a;font-weight:900}
.dw-ic{display:flex;align-items:center;justify-content:center;gap:calc(var(--u)*1);height:calc(var(--u)*40)}
.dw-ic .ico{width:calc(var(--u)*38);height:calc(var(--u)*38);margin:0}
.dw-ic.two .ico{width:calc(var(--u)*27);height:calc(var(--u)*27)}
.dw-n{font-size:max(14px,calc(var(--u)*19));line-height:1.05;font-weight:900;max-width:100%;overflow-wrap:anywhere}
.dw-s{font-size:max(10.5px,calc(var(--u)*12.5));line-height:1.05;color:#7a5a38;font-weight:800;max-width:100%}
.dw-card.locked{filter:saturate(.6) brightness(.98)}
.dw-card.claimed{border-color:#3f8a2a;background:linear-gradient(#eaf9d8,#c3e8a0)}
.dw-card.claimed .dw-ic,.dw-card.claimed .dw-n,.dw-card.claimed .dw-s{opacity:.55}
.dw-card.today{border-color:#d98a00;background:linear-gradient(#fff9cf,#ffd95c);
 box-shadow:0 0 0 calc(var(--u)*3) #ffd21f,0 0 calc(var(--u)*20) rgba(255,190,0,.85),inset 0 calc(var(--u)*-4) 0 rgba(200,120,0,.25);animation:dwpulse .9s ease-in-out infinite alternate}
@keyframes dwpulse{from{transform:scale(1)}to{transform:scale(1.045)}}
.dw-card.next{border-style:dashed}
.dw-chk{position:absolute;right:calc(var(--u)*-8);top:calc(var(--u)*-10);width:calc(var(--u)*30);height:calc(var(--u)*30);border-radius:50%;background:linear-gradient(#82ee62,#2b9620);border:calc(var(--u)*3) solid #120904;display:flex;align-items:center;justify-content:center;z-index:2}
.dw-chk .ico{width:calc(var(--u)*17);height:calc(var(--u)*17);margin:0}
.dw-lock{position:absolute;right:calc(var(--u)*5);top:calc(var(--u)*5);width:calc(var(--u)*19);height:calc(var(--u)*19);opacity:.7}
.dw-lock .ico{width:100%;height:100%;margin:0}
.dw-tag{position:absolute;top:calc(var(--u)*-13);left:50%;transform:translateX(-50%);padding:calc(var(--u)*1) calc(var(--u)*11);border-radius:999px;border:calc(var(--u)*3) solid #120904;background:linear-gradient(#ff8fc8,#e0398c);font-size:max(10.5px,calc(var(--u)*12.5));line-height:1.15;white-space:nowrap;z-index:3}
.dw-tag.tm{background:linear-gradient(#7fd0ff,#256cc0)}
.dw-card.big{background:radial-gradient(circle at 50% 28%,#b57a3c,#7b4a24 55%,#5b3417);border-color:#1c0f06;color:#fff;gap:calc(var(--u)*4);padding:calc(var(--u)*16) calc(var(--u)*8) calc(var(--u)*10);min-height:calc(var(--u)*150);
 box-shadow:inset 0 calc(var(--u)*3) 0 rgba(255,225,170,.4),inset 0 calc(var(--u)*-4) 0 rgba(0,0,0,.3),0 calc(var(--u)*4) 0 rgba(0,0,0,.4)}
.dw-card.big.today{box-shadow:0 0 0 calc(var(--u)*3.5) #ffd21f,0 0 calc(var(--u)*24) rgba(255,200,40,.9),inset 0 calc(var(--u)*3) 0 rgba(255,225,170,.4),inset 0 calc(var(--u)*-4) 0 rgba(0,0,0,.3)}
.dw-card.big.claimed{background:radial-gradient(circle at 50% 28%,#7fb35a,#4a8a32 60%,#2f6a22)}
.dw-card.big .dw-d{color:#ffe9a8;font-size:max(12px,calc(var(--u)*15))}
.dw-big-in{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*4);min-width:0;max-width:100%}
#game-ui.portrait .dw-big-in{flex-direction:row;gap:calc(var(--u)*14)}
.dw-bt{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*3);min-width:0}
#game-ui.portrait .dw-bt{align-items:flex-start;text-align:left}
.dw-prev{width:calc(var(--u)*92);height:calc(var(--u)*92);flex:none;border-radius:50%;border:calc(var(--u)*4) solid #1c0f06;background:radial-gradient(circle at 50% 40%,#fffbe0,#ffd45a 70%,#e8a21a);display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 0 calc(var(--u)*16) rgba(255,214,90,.7)}
.dw-prev>*{max-width:100%;max-height:100%}
.dw-prev .ico{width:58%;height:58%;margin:0}
.dw-prev.paws{flex-direction:column;gap:0}
.dw-prev.paws .ico{width:44%;height:44%}
.dw-bname{font-size:max(14px,calc(var(--u)*18));line-height:1.08;max-width:100%;overflow-wrap:anywhere}
.dw-bhint{font-size:max(11px,calc(var(--u)*12.5));line-height:1.1;color:#ffe9a8;font-weight:800}
.dw-ribbon{position:absolute;top:calc(var(--u)*-13);left:50%;transform:translateX(-50%);padding:calc(var(--u)*1) calc(var(--u)*13);border-radius:999px;border:calc(var(--u)*3) solid #120904;background:linear-gradient(#ffe36a,#e29f00);font-size:max(11px,calc(var(--u)*13));line-height:1.15;white-space:nowrap;z-index:3}
.dw-actions{display:flex;gap:calc(var(--u)*18);justify-content:center;align-items:flex-start;flex-wrap:wrap;padding-top:calc(var(--u)*4)}
.dw-act{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*5);max-width:calc(var(--u)*320)}
.dw-act .gb{font-size:max(15px,calc(var(--u)*24));padding:calc(var(--u)*10) calc(var(--u)*26);white-space:normal;text-align:center}
.dw-act .gb .ico{width:1.1em;height:1.1em}
.dw-wait{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*8)}
.dw-got{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*8);padding:calc(var(--u)*11) calc(var(--u)*12);border-radius:calc(var(--u)*14);border:calc(var(--u)*3.5) solid #3f8a2a;background:linear-gradient(#f1fbe3,#cdeca6);animation:dwpop .4s cubic-bezier(.2,1.6,.4,1)}
@keyframes dwpop{0%{transform:scale(.8);opacity:0}100%{transform:scale(1);opacity:1}}
.dw-got-t{font-size:max(17px,calc(var(--u)*25));line-height:1.1}
.dw-grow{display:flex;align-items:center;gap:calc(var(--u)*10);justify-content:center;flex-wrap:wrap;font-size:max(13px,calc(var(--u)*18));color:#4a2a12;font-weight:900;text-align:center;line-height:1.15}
.dw-grow .ico{width:calc(var(--u)*34);height:calc(var(--u)*34)}
.dw-gthumb{width:calc(var(--u)*64);height:calc(var(--u)*64);border-radius:50%;border:calc(var(--u)*3.5) solid #1c0f06;background:radial-gradient(circle at 50% 40%,#fffbe0,#ffd45a 75%);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none}
.dw-gthumb>*{max-width:100%;max-height:100%}
.dw-gthumb .ico{width:60%;height:60%}
.dw-grow .gb{font-size:max(12px,calc(var(--u)*16));padding:calc(var(--u)*6) calc(var(--u)*14)}
.dw-got .gb.great{font-size:max(15px,calc(var(--u)*22));padding:calc(var(--u)*8) calc(var(--u)*26)}
/* ---- колесо ---- */
.dw-wheelbox{display:flex;align-items:center;justify-content:center;gap:calc(var(--u)*24);max-width:calc(var(--u)*860);margin:0 auto;padding-top:calc(var(--u)*18)}
#game-ui.portrait .dw-wheelbox{flex-direction:column;gap:calc(var(--u)*16)}
.dw-ww{--ws:min(calc(var(--u)*336),calc(100vh - var(--u)*150));position:relative;width:var(--ws);height:var(--ws);flex:none}
#game-ui.portrait .dw-ww{--ws:min(76vw,44vh)}
.dw-ring{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 50% 30%,#b57a3c,#7b4a24 55%,#5b3417);border:calc(var(--ws)*.014) solid #1c0f06;
 box-shadow:inset 0 calc(var(--ws)*.008) 0 rgba(255,225,170,.45),inset 0 calc(var(--ws)*-.012) 0 rgba(0,0,0,.35),0 calc(var(--ws)*.016) 0 rgba(0,0,0,.4),0 calc(var(--ws)*.04) calc(var(--ws)*.05) rgba(0,0,0,.28)}
.dw-nail{position:absolute;left:50%;top:50%;width:calc(var(--ws)*.03);height:calc(var(--ws)*.03);margin:calc(var(--ws)*-.015) 0 0 calc(var(--ws)*-.015);border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3c8,#e0a93a 60%,#8b5a2b);box-shadow:0 calc(var(--ws)*.004) 0 rgba(0,0,0,.5)}
.dw-ww.spinning .dw-nail:nth-child(odd){animation:dwblink .32s steps(1) infinite}
.dw-ww.spinning .dw-nail:nth-child(even){animation:dwblink .32s steps(1) infinite reverse}
@keyframes dwblink{0%{filter:none}50%{filter:brightness(1.7) saturate(1.3)}}
.dw-disc{position:absolute;inset:7%;border-radius:50%;border:calc(var(--ws)*.014) solid #1c0f06;overflow:hidden;will-change:transform;
 background:repeating-conic-gradient(from -23.7deg,rgba(43,25,11,.92) 0 2.4deg,rgba(0,0,0,0) 2.4deg 45deg),radial-gradient(circle,rgba(255,255,255,.4),rgba(255,255,255,0) 62%),var(--sec,#ffe9a0)}
.dw-lab{position:absolute;left:50%;top:50%;width:0;height:0}
.dw-lab-in{position:absolute;left:0;top:calc(var(--ws)*-.395);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:calc(var(--ws)*.002);width:calc(var(--ws)*.22)}
.dw-lab-in .ico{width:calc(var(--ws)*.1);height:calc(var(--ws)*.1);margin:0;filter:drop-shadow(0 calc(var(--ws)*.006) 0 rgba(0,0,0,.4))}
.dw-lab-n{font-size:calc(var(--ws)*.082);line-height:1;color:#fff;font-weight:900;-webkit-text-stroke:calc(var(--ws)*.017) #2b190b;paint-order:stroke fill;text-shadow:0 calc(var(--ws)*.006) 0 #2b190b}
.dw-lab-th{width:calc(var(--ws)*.13);height:calc(var(--ws)*.13);border-radius:50%;border:calc(var(--ws)*.008) solid #2b190b;background:radial-gradient(circle at 50% 40%,#fffbe0,#ffd45a);display:flex;align-items:center;justify-content:center;overflow:hidden}
.dw-lab-th>*{max-width:100%;max-height:100%}
.dw-lab-th .ico{width:62%;height:62%;filter:none}
.dw-lab.win .dw-lab-in{animation:dwwin .45s ease-in-out infinite alternate}
@keyframes dwwin{from{transform:translateX(-50%) scale(1)}to{transform:translateX(-50%) scale(1.22)}}
.dw-hub{position:absolute;left:50%;top:50%;width:calc(var(--ws)*.19);height:calc(var(--ws)*.19);margin:calc(var(--ws)*-.095) 0 0 calc(var(--ws)*-.095);border-radius:50%;
 background:radial-gradient(circle at 38% 30%,#fff3c8,#e0a93a 55%,#9a6a1a);border:calc(var(--ws)*.016) solid #1c0f06;box-shadow:0 calc(var(--ws)*.012) 0 rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}
.dw-hub .ico{width:58%;height:58%;margin:0}
.dw-ptr{position:absolute;left:50%;top:calc(var(--ws)*-.035);width:calc(var(--ws)*.13);height:calc(var(--ws)*.17);margin-left:calc(var(--ws)*-.065);transform-origin:50% 16%;z-index:3;filter:drop-shadow(0 calc(var(--ws)*.01) 0 rgba(0,0,0,.4))}
.dw-ptr svg{display:block;width:100%;height:100%}
.dw-side{display:flex;flex-direction:column;align-items:stretch;gap:calc(var(--u)*10);min-width:0;flex:1 1 calc(var(--u)*250);max-width:calc(var(--u)*330)}
#game-ui.portrait .dw-side{flex:none;width:100%;max-width:calc(var(--u)*420)}
.dw-side .gb{font-size:max(14px,calc(var(--u)*22));padding:calc(var(--u)*10) calc(var(--u)*16);white-space:normal;text-align:center;line-height:1.1}
.dw-side .gb .ico{width:1.1em;height:1.1em}
.dw-line{font-size:max(11.5px,calc(var(--u)*15.5));line-height:1.2;color:#7a5a38;text-align:center;font-weight:800}
.dw-res{display:none;flex-direction:column;align-items:center;gap:calc(var(--u)*6);padding:calc(var(--u)*9) calc(var(--u)*12);border-radius:calc(var(--u)*14);border:calc(var(--u)*3.5) solid #c98a0a;background:linear-gradient(#fff6c2,#ffe07a);text-align:center}
.dw-res.show{display:flex;animation:dwpop .4s cubic-bezier(.2,1.6,.4,1)}
.dw-res-t{font-size:max(16px,calc(var(--u)*24));line-height:1.1}
/* ---- низкий экран (телефон в альбомной ориентации): плотнее, чтобы окно помещалось без прокрутки ---- */
#game-ui.short .dw-daily{gap:calc(var(--u)*8)}
#game-ui.short .dw-grid{gap:calc(var(--u)*12) calc(var(--u)*8);padding-top:calc(var(--u)*7)}
#game-ui.short .dw-card{min-height:calc(var(--u)*90);padding-top:calc(var(--u)*8);padding-bottom:calc(var(--u)*5)}
#game-ui.short .dw-card.big{min-height:calc(var(--u)*118)}
#game-ui.short .dw-gthumb{width:calc(var(--u)*50);height:calc(var(--u)*50)}
#game-ui.short .dw-got{flex-direction:row;flex-wrap:wrap;justify-content:center;gap:calc(var(--u)*4) calc(var(--u)*16);padding:calc(var(--u)*6) calc(var(--u)*10)}
#game-ui.short .dw-daily.got .dw-sub{display:none}
#game-ui.short .dw-actions{padding-top:0}
#game-ui.short .dw-wheelbox{padding-top:calc(var(--u)*8)}
#game-ui.short .dw-side{gap:calc(var(--u)*6)}
#game-ui.short .dw-side .gb{padding:calc(var(--u)*7) calc(var(--u)*14)}
#game-ui.short .dw-res{gap:calc(var(--u)*3);padding:calc(var(--u)*5) calc(var(--u)*10)}
#game-ui.short .dw-res .dw-grow{gap:calc(var(--u)*6)}
#game-ui.short .dw-res .dw-grow .ico{width:calc(var(--u)*26);height:calc(var(--u)*26)}
@media (prefers-reduced-motion:reduce){.dw-card.today,.dw-lab.win .dw-lab-in,.dw-ww.spinning .dw-nail{animation:none}}
`;

/**
 * Мини-конфетти на canvas поверх окна: пул частиц фиксированного размера (без аллокаций в кадре), шаг по игровому
 * времени (на паузе стоит вместе с игрой).
 */
class DwConfetti {
    constructor(max = 90) {
        this.max = max;
        this.x = new Float32Array(max); this.y = new Float32Array(max);
        this.vx = new Float32Array(max); this.vy = new Float32Array(max);
        this.rot = new Float32Array(max); this.vr = new Float32Array(max);
        this.life = new Float32Array(max); this.span = new Float32Array(max);
        this.size = new Float32Array(max); this.col = new Uint8Array(max);
        this.alive = 0;
        /** @type {HTMLCanvasElement | null} */
        this.cv = null;
        /** @type {CanvasRenderingContext2D | null} */
        this.ctx = null;
        this.dpr = 1;
    }

    /** Холст поверх host (размер host в CSS px). */
    attach(host) {
        if (!this.cv) {
            this.cv = /** @type {HTMLCanvasElement} */ (document.createElement('canvas'));
            this.cv.className = 'dw-cv';
        }
        if (this.cv.parentNode !== host) host.appendChild(this.cv);
        this.dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.max(1, host.clientWidth || 1), h = Math.max(1, host.clientHeight || 1);
        const cw = Math.round(w * this.dpr), ch = Math.round(h * this.dpr);
        if (this.cv.width !== cw) this.cv.width = cw;
        if (this.cv.height !== ch) this.cv.height = ch;
        this.ctx = this.cv.getContext('2d');
    }

    detach() {
        this.alive = 0;
        this.life.fill(0);
        if (this.cv && this.cv.parentNode) this.cv.parentNode.removeChild(this.cv);
        this.ctx = null;
    }

    /** Залп из точки (x, y) CSS px холста: count частиц, power — скорость разлёта. */
    burst(x, y, count = 48, power = 1) {
        let n = 0;
        for (let i = 0; i < this.max && n < count; i++) {
            if (this.life[i] > 0) continue;
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.5, v = (260 + Math.random() * 380) * power;
            this.x[i] = x + (Math.random() - 0.5) * 24; this.y[i] = y;
            this.vx[i] = Math.cos(a) * v; this.vy[i] = Math.sin(a) * v;
            this.rot[i] = Math.random() * 6.28; this.vr[i] = (Math.random() - 0.5) * 16;
            this.span[i] = this.life[i] = 1.5 + Math.random() * 1.1;
            this.size[i] = 6 + Math.random() * 8;
            this.col[i] = Math.floor(Math.random() * DW_CONFETTI_COLORS.length);
            n++;
        }
        this.alive += n;
    }

    update(dt) {
        if (this.alive <= 0 || !this.ctx || !this.cv) return;
        const g = this.ctx, d = this.dpr;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, this.cv.width, this.cv.height);
        let alive = 0;
        for (let i = 0; i < this.max; i++) {
            if (this.life[i] <= 0) continue;
            this.life[i] -= dt;
            if (this.life[i] <= 0) continue;
            alive++;
            this.vy[i] += 980 * dt;
            this.vx[i] *= 1 - 1.3 * dt; this.vy[i] *= 1 - 0.55 * dt;
            this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
            this.rot[i] += this.vr[i] * dt;
            const c = Math.cos(this.rot[i]) * d, s = Math.sin(this.rot[i]) * d;
            g.setTransform(c, s, -s, c, this.x[i] * d, this.y[i] * d);
            g.globalAlpha = Math.min(1, this.life[i] / (this.span[i] * 0.3));
            g.fillStyle = DW_CONFETTI_COLORS[this.col[i]];
            const z = this.size[i];
            g.fillRect(-z / 2, -z * 0.3, z, z * 0.6);
        }
        g.globalAlpha = 1;
        g.setTransform(1, 0, 0, 1, 0, 0);
        this.alive = alive;
        if (!alive) g.clearRect(0, 0, this.cv.width, this.cv.height);
    }
}

/** @satisfies {Record<string, any>} */
const DailyWheel = {
    id: 'dailywheel',
    /** @type {LoryApp | null} */
    app: null,
    /** Функции () => bool: true — автопредложение подарка ждёт (титульный экран, внешние окна). */
    blockers: /** @type {Array<() => boolean>} */ ([]),
    _t: 0,
    _offerT: 0,
    /** Последние показанные значения HUD (чтобы не трогать DOM зря). */
    _hud: { gift: -1, wheel: -1, label: '', hidden: null, labelEl: null },
    /** Открытое окно: { kind: 'daily' | 'wheel', rec, el, … } или null. @type {any} */
    _ui: null,
    /** Идущее вращение колеса: { from, to, t, dur, res, idx } или null. @type {any} */
    _anim: null,
    _angle: 0,
    _flap: 0,
    _lastTick: -9,
    /** @type {DwConfetti | null} */
    _confetti: null,

    // =============================================================================================
    // Календарь
    // =============================================================================================
    /** Дата устройства «ГГГГ-ММ-ДД» (GameState.now() — часы игры, в тестах подменяются). */
    dateKey(ms) {
        const d = new Date(ms == null ? GameState.now() : ms);
        const p2 = (n) => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    },
    today() { return this.dateKey(); },
    /** Секунд до ближайшей полуночи по часам устройства (когда вернётся бесплатное вращение и подарок). */
    secondsToMidnight() {
        const now = new Date(GameState.now());
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        return Math.max(0, (next.getTime() - now.getTime()) / 1000);
    },

    // =============================================================================================
    // Подарок дня: логика
    // =============================================================================================
    /** Приведённое к допустимому виду сохранение подарка. */
    daily() {
        const s = GameState.state;
        let d = s.daily;
        if (!d || typeof d !== 'object') d = s.daily = { day: 0, lastClaimDate: '', cycle: 0, offered: '' };
        d.day = GameUtil.clamp(Math.floor(dwNum(d.day)), 0, 7);
        d.cycle = Math.max(0, Math.floor(dwNum(d.cycle)));
        if (typeof d.lastClaimDate !== 'string') d.lastClaimDate = '';
        if (typeof d.offered !== 'string') d.offered = '';
        return d;
    },
    /** Подарок на сегодня ещё не получен? */
    canClaimDaily() { return this.daily().lastClaimDate !== this.today(); },
    /** Какой день круга выдаётся следующим (1..7). */
    nextDay() { return this.daily().day % 7 + 1; },
    /** Сколько дней текущего круга закрашены как «получено» (после 7-го дня новый круг начинается со следующего захода). */
    claimedDays() {
        const d = this.daily();
        return d.day === 7 && this.canClaimDaily() ? 0 : d.day;
    },
    /** Номер круга (с нуля), к которому относятся карточки в окне: пока 7-й день получен сегодня, это только что пройденный круг. */
    displayCycle() {
        const d = this.daily();
        return d.day === 7 && !this.canClaimDaily() ? Math.max(0, d.cycle - 1) : d.cycle;
    },

    /** id эксклюзивных нарядов по порядку кругов (Cosmetics.EXCLUSIVE — массив id / определений или объект). */
    exclusiveList() {
        const C = dwCos();
        const e = C ? C.EXCLUSIVE : null;
        if (!e) return [];
        if (Array.isArray(e)) return e.map(x => (typeof x === 'string' ? x : x && x.id)).filter(Boolean);
        if (typeof e === 'object') return Object.keys(e).map(k => (e[k] && typeof e[k] === 'object' && e[k].id) || k);
        return [];
    },
    isExclusive(id) { return this.exclusiveList().includes(id); },
    exclusiveFor(cycle) { return this.exclusiveList()[cycle] || null; },

    /** Награда дня как данные (без случайности): { day, parts, exclusive }. Части: paws {n}, boost {id, min}, item {count}, exclusive {id}. */
    rewardFor(day, cycle) {
        const c = dwCfg();
        /** @type {any[]} */
        let parts;
        let exclusive = null;
        switch (day) {
            case 1: parts = [{ type: 'paws', n: c.paws1 }]; break;
            case 2: parts = [{ type: 'boost', id: 'cash2x', min: c.boostCash }]; break;
            case 3: parts = [{ type: 'paws', n: c.paws3 }]; break;
            case 4: parts = [{ type: 'boost', id: 'luck2x', min: c.boostLuck }]; break;
            case 5: parts = [{ type: 'item', count: 1 }]; break;
            case 6: parts = [{ type: 'paws', n: c.paws6 }, { type: 'item', count: 1 }]; break;
            default: {
                exclusive = this.exclusiveFor(cycle);   // кончились эксклюзивы (или нет Cosmetics) — крупная награда лапками
                parts = exclusive ? [{ type: 'exclusive', id: exclusive }] : [{ type: 'paws', n: c.bigPaws, big: true }];
            }
        }
        return { day, parts, exclusive };
    },
    /** Удвоить награду («×2 за рекламу»): лапки, минуты бустов и число предметов ×mult. */
    scaleParts(parts, mult) {
        if (!(mult > 1)) return parts;
        return parts.map(p => (p.type === 'paws' ? { ...p, n: p.n * mult }
            : p.type === 'boost' ? { ...p, min: p.min * mult }
            : p.type === 'item' ? { ...p, count: p.count * mult } : p));
    },

    // --- Предметы магазина (Cosmetics) ----------------------------------------------------------
    isOwned(id) {
        const C = dwCos();
        if (!C || typeof C.isOwned !== 'function') return false;
        try { return !!C.isOwned(id); } catch (e) { return false; }
    },
    /** Случайный предмет магазина, которого у игрока ещё нет и который не эксклюзив; null — нечего выдать. */
    pickShopItem() {
        const C = dwCos();
        if (!C || typeof C.randomShopItem !== 'function' || typeof C.grant !== 'function') return null;
        for (let i = 0; i < 6; i++) {
            let r;
            try { r = C.randomShopItem(); } catch (e) { return null; }
            const id = typeof r === 'string' ? r : r && r.id;
            if (!id || this.isExclusive(id) || this.isOwned(id)) continue;
            return String(id);
        }
        return null;
    },
    /** Выдать предмет; true — теперь он у игрока. */
    grantItem(id) {
        const C = dwCos();
        if (!id || !C || typeof C.grant !== 'function') return false;
        try {
            if (C.grant(id) === false) return false;
        } catch (e) { return false; }
        return typeof C.isOwned === 'function' ? this.isOwned(id) : true;
    },
    equipItem(id) {
        const C = dwCos();
        if (!id || !C || typeof C.equip !== 'function') return false;
        try { return C.equip(id) !== false; } catch (e) { return false; }
    },
    canEquip() { const C = dwCos(); return !!C && typeof C.equip === 'function'; },
    /** Название предмета на языке сборки (API Cosmetics разных видов — запасной вариант: сам id). */
    itemName(id) {
        const C = dwCos();
        const fromDef = (def) => {
            if (!def) return '';
            if (typeof def === 'string') return def;
            const n = def.name != null ? def.name : def.title;
            if (typeof n === 'string') return Lang.has(n) ? Lang.t(n) : n;
            if (n && typeof n === 'object') return n[Lang.code] || n.en || '';
            return def.key && Lang.has(def.key) ? Lang.t(def.key) : '';
        };
        if (C) {
            for (const fn of ['itemName', 'nameOf', 'name', 'label']) {
                if (typeof C[fn] === 'function') { try { const r = C[fn](id); if (r && typeof r === 'string') return r; } catch (e) { /* дальше */ } }
            }
            for (const fn of ['get', 'item', 'def', 'find']) {
                if (typeof C[fn] === 'function') { try { const r = fromDef(C[fn](id)); if (r) return r; } catch (e) { /* дальше */ } }
            }
            for (const map of [C.ITEMS, C.items, C.byId, C.CATALOG]) {
                if (!map) continue;
                const def = Array.isArray(map) ? map.find(x => x && x.id === id) : map[id];
                const r = fromDef(def);
                if (r) return r;
            }
        }
        for (const k of ['cos.' + id, 'cosm.' + id, 'item.' + id]) if (Lang.has(k)) return Lang.t(k);
        return String(id);
    },
    /** Узел превью предмета (Cosmetics.thumb возвращает HTML, адрес картинки или узел) или null. */
    thumbNode(id, size = 96) {
        const C = dwCos();
        if (!id || !C || typeof C.thumb !== 'function') return null;
        let r;
        try { r = C.thumb(id, size); } catch (e) { return null; }
        if (!r) return null;
        if (typeof r === 'string') {
            const box = document.createElement('div');
            if (r.trim().charAt(0) === '<') box.innerHTML = r;
            else { const im = document.createElement('img'); im.src = r; im.alt = ''; im.draggable = false; box.appendChild(im); }
            box.style.display = 'contents';
            return box;
        }
        return r.nodeType ? r : null;
    },

    /** Выдать часть награды; в got — что получил игрок: paws {n}, boost {id, min}, item {id}, exclusive {id}, dup {n} (лапки вместо предмета). */
    _grantPart(part, got, reason) {
        const c = dwCfg();
        if (part.type === 'paws') {
            GameState.addPaws(part.n, reason);
            got.push({ type: 'paws', n: part.n, big: !!part.big });
        } else if (part.type === 'boost') {
            GameState.addBoost(part.id, part.min * 60);
            got.push({ type: 'boost', id: part.id, min: part.min });
        } else if (part.type === 'item') {
            for (let i = 0; i < part.count; i++) {
                const id = this.pickShopItem();
                if (id && this.grantItem(id)) got.push({ type: 'item', id });
                else { GameState.addPaws(c.dupPaws, reason); got.push({ type: 'dup', n: c.dupPaws }); }
            }
        } else if (part.type === 'exclusive') {
            if (!this.isOwned(part.id) && this.grantItem(part.id)) got.push({ type: 'exclusive', id: part.id });
            else { GameState.addPaws(c.bigPaws, reason); got.push({ type: 'paws', n: c.bigPaws, big: true }); }
        }
    },

    /**
     * Забрать подарок дня. mult 2 — «×2» (только после подтверждённой рекламы; на 7-м дне удвоения нет). Повтор в тот же день
     * вернёт null и ничего не выдаст: дата ставится до выдачи. Возвращает { day, cycle, mult, got } или null.
     */
    claimDaily(mult = 1) {
        const d = this.daily();
        const today = this.today();
        if (d.lastClaimDate === today) return null;
        const day = d.day % 7 + 1;
        const cycle = d.cycle;
        const m = day === 7 || !(typeof mult === 'number' && mult >= 2) ? 1 : 2;
        const reward = this.rewardFor(day, cycle);
        d.day = day;
        d.lastClaimDate = today;
        if (day === 7) d.cycle = cycle + 1;
        GameState.markDirty();
        /** @type {any[]} */
        const got = [];
        for (const part of this.scaleParts(reward.parts, m)) this._grantPart(part, got, 'daily');
        GameState.saveNow();
        const res = { day, cycle, mult: m, got };
        Game.events.emit('daily:claimed', res);
        this._hudTick(true);
        return res;
    },

    // =============================================================================================
    // Колесо: логика
    // =============================================================================================
    /** Счётчики колеса на сегодня (на новый день сбрасываются). */
    wheel() {
        const s = GameState.state;
        let w = s.wheel;
        if (!w || typeof w !== 'object') w = s.wheel = { date: '', freeUsed: false, adSpins: 0, item: '' };
        const today = this.today();
        if (w.date !== today) {
            w.date = today; w.freeUsed = false; w.adSpins = 0; w.item = '';
            GameState.markDirty();
        }
        w.freeUsed = !!w.freeUsed;
        w.adSpins = GameUtil.clamp(Math.floor(dwNum(w.adSpins)), 0, 999);
        if (typeof w.item !== 'string') w.item = '';
        return w;
    },
    wheelFreeAvailable() { return !this.wheel().freeUsed; },
    wheelAdLeft() { return Math.max(0, dwCfg().adSpins - this.wheel().adSpins); },
    /** «Красные точки» для меню: подарок можно забрать + бесплатное вращение готово. */
    badgeCount() { return (this.canClaimDaily() ? 1 : 0) + (this.wheelFreeAvailable() ? 1 : 0); },

    /**
     * 8 секторов колеса: { kind: 'paws', n } или { kind: 'item', id }; dup: true — вместо предмета лапки (предмета нет или уже есть).
     * Предмет сектора выбирается один раз на день и хранится в сохранении (wheel.item), эксклюзивы не берутся.
     */
    wheelSectors() {
        const c = dwCfg(), w = this.wheel();
        if (!w.item) { w.item = this.pickShopItem() || '-'; GameState.markDirty(); }
        const id = w.item !== '-' && !this.isOwned(w.item) && !this.isExclusive(w.item) ? w.item : '';
        let sum = 0;
        for (const k of DW_ORDER) if (k) sum += DW_WEIGHTS[k];
        const scale = Math.max(0, 100 - c.itemPercent) / sum;
        return DW_ORDER.map((k) => {
            if (k) return { kind: 'paws', n: c.wheelPaws[k], w: DW_WEIGHTS[k] * scale };
            return id ? { kind: 'item', id, w: c.itemPercent } : { kind: 'paws', n: c.wheelDup, dup: true, w: c.itemPercent };
        });
    },
    /** Индекс сектора по весам; rng — () => 0..1. */
    pickSector(sectors, rng) {
        let total = 0;
        for (const s of sectors) total += s.w;
        let r = rng() * total;
        for (let i = 0; i < sectors.length; i++) { r -= sectors[i].w; if (r < 0) return i; }
        return sectors.length - 1;
    },
    /** Сектор под стрелкой (сверху) при повороте колеса на angle градусов по часовой. */
    sectorUnder(angle) {
        const a = (((-angle) % 360) + 360) % 360;
        return Math.floor((a + DW_STEP / 2) / DW_STEP) % DW_SECTORS;
    },
    /** Конечный угол колеса: сектор index (со сдвигом offset сектора) окажется под стрелкой после не менее turns оборотов вперёд. */
    targetAngle(from, index, offset, turns) {
        const base = -(index + offset) * DW_STEP;
        const min = from + Math.max(0, turns) * 360;
        return base + Math.ceil((min - base) / 360) * 360;
    },

    /**
     * Вращение колеса: kind 'free' (раз в день) или 'ad' (до WHEEL_AD_SPINS в день; рекламу показывает вызывающий и зовёт это
     * только после true). Результат выбирается ЗДЕСЬ, приз начисляется сразу и один раз; анимацию потом играет окно.
     * Возвращает { kind, index, offset, prize } или null (вращений нет). prize: paws {n} | item {id} | dup {n}.
     */
    spinWheel(kind, rng) {
        const next = rng || Math.random;
        const c = dwCfg(), w = this.wheel();
        if (kind === 'free') { if (w.freeUsed) return null; w.freeUsed = true; }
        else if (kind === 'ad') { if (w.adSpins >= c.adSpins) return null; w.adSpins++; }
        else return null;
        const sectors = this.wheelSectors();
        const index = this.pickSector(sectors, next);
        const sec = sectors[index];
        const offset = (next() * 2 - 1) * 0.32;   // куда внутри сектора встанет стрелка (доля сектора, не у самой границы)
        let prize;
        if (sec.kind === 'item') {
            if (!this.isOwned(sec.id) && this.grantItem(sec.id)) prize = { type: 'item', id: sec.id };
            else { GameState.addPaws(c.wheelDup, 'wheel'); prize = { type: 'dup', n: c.wheelDup }; }
        } else {
            GameState.addPaws(sec.n, 'wheel');
            prize = { type: sec.dup ? 'dup' : 'paws', n: sec.n };
        }
        GameState.markDirty();
        GameState.saveNow();
        const res = { kind, index, offset, prize };
        Game.events.emit('wheel:spin', res);
        this._hudTick(true);
        return res;
    },

    // =============================================================================================
    // Состояние игры вокруг окон
    // =============================================================================================
    _tutorialActive() {
        const T = typeof Tutorial !== 'undefined' ? /** @type {any} */ (Tutorial) : null;
        return !!T && (!!T.active || (typeof T.isActive === 'function' && !!T.isActive()));
    },
    _titleShown() {
        const M = typeof Menus !== 'undefined' ? /** @type {any} */ (Menus) : null;
        if (M) {
            if (M.titleShown || M.titleOpen || M.titleActive) return true;
            if (typeof M.isTitleOpen === 'function' && M.isTitleOpen()) return true;
        }
        for (const fn of this.blockers) { try { if (fn()) return true; } catch (e) { /* чужой блокировщик не ломает игру */ } }
        return false;
    },
    /** Можно ли сейчас само предложить подарок. */
    _offerOk() {
        const s = GameState.state;
        if (!s.tutorialDone || this._tutorialActive() || this._titleShown()) return false;
        if (!this.canClaimDaily() || this.daily().offered === this.today()) return false;
        if (GameUI.blocking || Pause.active) return false;
        if (typeof Eggs !== 'undefined' && Eggs.basket && Eggs.basket.length) return false;
        const P = typeof Player !== 'undefined' ? /** @type {any} */ (Player) : null;
        if (!P || P.cine || typeof Ranch === 'undefined' || !Ranch.player) return false;
        return !!Ranch.player.inside(P.x, P.y, dwCfg().offerMargin);
    },

    // =============================================================================================
    // Модуль Game
    // =============================================================================================
    init(app) {
        this.app = app;
        GameUI.addCss('dailywheel', DW_CSS);
        GameUI.addSideButton({ id: 'gift', side: 'left', icon: 'gift', label: Lang.t('dw.giftBtn'), color: 'pink', onClick: () => { this.openDaily(); } });
        GameUI.addSideButton({ id: 'wheel', side: 'left', icon: 'wheel', label: Lang.t('dw.wheelBtn'), color: 'blue', onClick: () => { this.openWheel(); } });
        this._hud = { gift: -1, wheel: -1, label: '', hidden: null, labelEl: null };
        this._confetti = new DwConfetti();
    },

    onLoad() {
        this._anim = null;
        this._offerT = 0;
        this._hud = { gift: -1, wheel: -1, label: '', hidden: null, labelEl: null };
        this.daily(); this.wheel();
        this._hudTick(true);
    },

    ready() { this._hudTick(true); },

    update(dt) {
        if (this._anim) this._stepSpin(dt);
        if (this._confetti && this._confetti.alive > 0) this._confetti.update(dt);
        if (this._flap > 0) this._stepFlap(dt);
        this._t += dt;
        if (this._t < 0.25) return;
        const step = this._t;
        this._t = 0;
        this._hudTick(false);
        if (this._ui && this._ui.tick) this._ui.tick();
        if (this._offerOk()) {
            this._offerT += step;
            if (this._offerT >= dwCfg().offerDelay) { this._offerT = 0; this.openDaily({ auto: true }); }
        } else this._offerT = 0;
    },

    // --- HUD: значки и таймер на боковых кнопках ------------------------------------------------
    _hudTick(force) {
        const h = this._hud;
        const tut = this._tutorialActive();
        if (force || tut !== h.hidden) {
            h.hidden = tut;
            GameUI.showSideButton('gift', !tut);
            GameUI.showSideButton('wheel', !tut);
        }
        const gift = this.canClaimDaily() ? 1 : 0;
        if (force || gift !== h.gift) { h.gift = gift; GameUI.setBadge('gift', gift); }
        const free = this.wheelFreeAvailable();
        const wheel = free ? 1 : 0;
        if (force || wheel !== h.wheel) { h.wheel = wheel; GameUI.setBadge('wheel', wheel); }
        // подпись колеса: «Колесо» или таймер до бесплатного вращения (часы:минуты:секунды)
        const label = free ? Lang.t('dw.wheelBtn') : GameUtil.fmtClock(this.secondsToMidnight());
        if (force || label !== h.label) {
            h.label = label;
            const rec = GameUI.sideButtons ? GameUI.sideButtons.wheel : null;
            if (rec && rec.el) {
                if (!h.labelEl || !h.labelEl.isConnected) h.labelEl = typeof rec.el.querySelector === 'function' ? rec.el.querySelector('.lb') : null;
                if (h.labelEl) { h.labelEl.textContent = label; h.labelEl.classList.toggle('dw-tm', !free); }
            }
        }
    },

    // =============================================================================================
    // Звук и конфетти
    // =============================================================================================
    _sound(name, opts) {
        if (typeof Sound === 'undefined') return;
        if (name === 'tick') Sound.play('assets/sounds/wheel-tick.ogg', opts);
        else if (name === 'win') Sound.play('assets/sounds/wheel-win.ogg', opts);
        else if (name === 'claim') Sound.play('assets/sounds/daily-claim.ogg', opts);
    },
    /** Залп конфетти из середины элемента from (или из центра окна). */
    _confettiBurst(from, count = 56, power = 1) {
        const ui = this._ui, cf = this._confetti;
        if (!ui || !cf || !ui.rec || !ui.rec.panelEl) return;
        const host = ui.rec.panelEl;
        cf.attach(host);
        let x = (host.clientWidth || 0) / 2, y = (host.clientHeight || 0) * 0.45;
        if (from && from.getBoundingClientRect) {
            const a = from.getBoundingClientRect(), b = host.getBoundingClientRect();
            const sx = host.clientWidth && b.width ? host.clientWidth / b.width : 1;
            x = (a.left + a.width / 2 - b.left) * sx; y = (a.top + a.height / 2 - b.top) * sx;
        }
        cf.burst(x, y, count, power);
    },

    // =============================================================================================
    // Окно «Подарок дня»
    // =============================================================================================
    openDaily(opts = {}) {
        if (GameUI.blocking || this._tutorialActive()) return false;
        if (opts.auto) { this.daily().offered = this.today(); GameState.markDirty(); }
        GameUI.openPanel({
            id: 'daily', title: Lang.t('dw.gift.title'), wide: true,
            onClose: () => this._closeUi('daily'),
            build: (el, rec) => {
                this._ui = { kind: 'daily', rec, el, handles: [], got: null, sig: '', note: null, x2: null, tick: () => this._tickDaily() };
                this._renderDaily();
            },
        });
        return true;
    },

    _closeUi(kind) {
        const ui = this._ui;
        if (!ui || ui.kind !== kind) return;
        if (kind === 'wheel' && this._anim) {   // закрыли окно посреди вращения: приз уже начислен, просто сообщаем о нём
            const res = this._anim.res;
            this._anim = null;
            this._announceSpin(res);
        }
        for (const h of ui.handles || []) h.destroy();
        if (this._confetti) this._confetti.detach();
        this._ui = null;
        this._hudTick(true);
    },

    _tickDaily() {
        const ui = this._ui;
        if (!ui || ui.kind !== 'daily') return;
        const sig = this.today() + '|' + this.daily().day + '|' + this.daily().lastClaimDate;
        if (sig !== ui.sig && !ui.got) { this._renderDaily(); return; }   // сменились сутки или подарок забрали извне
        const ads = GameUI.adsAvailable();
        if (ui.x2) ui.x2.refresh();
        if (ui.note) ui.note.textContent = !ads && this.canClaimDaily() && this.nextDay() !== 7 && !ui.got ? Lang.t('dw.adOff') : '';
    },

    /** Что внутри части награды, одной строкой («Лапки: 50 + Предмет магазина»). */
    _describe(parts) {
        const out = [];
        for (const p of parts) {
            if (p.type === 'paws') out.push(p.big ? Lang.t('dw.r.big', { n: GameUtil.fmtInt(p.n) }) : Lang.t('dw.r.paws', { n: GameUtil.fmtInt(p.n) }));
            else if (p.type === 'boost') out.push(Lang.t(p.id === 'cash2x' ? 'dw.r.cash' : 'dw.r.luck', { n: p.min }));
            else if (p.type === 'item') out.push(p.count > 1 ? Lang.t('dw.r.items', { n: p.count }) : Lang.t('dw.r.item'));
            else if (p.type === 'exclusive') out.push(Lang.t('dw.r.exclusive') + ': ' + this.itemName(p.id));
        }
        return out.join(' + ');
    },

    /** Значок, главная и малая строка карточки дня. */
    _cardFace(parts) {
        const icon = GameUI.icon.bind(GameUI);
        const p0 = parts[0];
        if (parts.length === 2 && p0.type === 'paws') {
            return { ic: icon('paw') + icon('gift'), two: true, n: '+' + GameUtil.fmtInt(p0.n), s: Lang.t('dw.s.plusItem') };
        }
        if (p0.type === 'paws') return { ic: icon('paw'), n: '+' + GameUtil.fmtInt(p0.n), s: p0.big ? Lang.t('dw.s.big') : '' };
        if (p0.type === 'boost') {
            const cash = p0.id === 'cash2x';
            return { ic: icon(cash ? 'banknote' : 'clover'), n: Lang.t(cash ? 'dw.s.cash' : 'dw.s.luck'), s: Lang.t('dw.s.min', { n: p0.min }) };
        }
        if (p0.type === 'item') return { ic: icon('gift'), n: p0.count > 1 ? Lang.t('dw.s.items', { n: p0.count }) : Lang.t('dw.s.item'), s: Lang.t('dw.s.shop') };
        return { ic: icon('crown'), n: '', s: '' };
    },

    _dayCard(day, ctx) {
        const E = GameUtil.el;
        const claimed = day <= ctx.claimed;
        const isNext = !claimed && day === ctx.nextDay;
        const state = claimed ? 'claimed' : isNext ? (ctx.can ? 'today' : 'next') : 'locked';
        const reward = this.rewardFor(day, ctx.cycle);
        const card = E('div', { class: 'dw-card ' + state + (day === 7 ? ' big' : ''), style: { gridArea: 'd' + day }, 'data-day': day });
        if (isNext) card.appendChild(E('div', { class: 'dw-tag otx-s' + (ctx.can ? '' : ' tm'), text: Lang.t(ctx.can ? 'dw.tagToday' : 'dw.tagTomorrow') }));
        if (day === 7) {
            card.appendChild(E('div', { class: 'dw-ribbon otx-s', text: Lang.t('dw.exclusive') }));
            const ex = reward.exclusive;
            const prev = E('div', { class: 'dw-prev' });
            const node = ex ? this.thumbNode(ex, 96) : null;
            let name, hint;
            if (ex) {
                if (node) prev.appendChild(node); else prev.innerHTML = GameUI.icon('crown');
                name = this.itemName(ex); hint = Lang.t('dw.exclusive.hint');
            } else if (reward.parts[0].type === 'paws') {   // эксклюзивы кончились (или Cosmetics нет): крупная награда
                prev.classList.add('paws');
                prev.innerHTML = GameUI.icon('crown') + '<span class="dw-n otx-s">+' + GameUtil.fmtInt(reward.parts[0].n) + '</span>';
                name = Lang.t('dw.s.big'); hint = Lang.t('dw.r.paws', { n: GameUtil.fmtInt(reward.parts[0].n) });
            } else {
                prev.innerHTML = GameUI.icon('crown'); name = Lang.t('dw.exclusive.mystery'); hint = Lang.t('dw.exclusive.hint');
            }
            const txt = E('div', { class: 'dw-bt' },
                E('div', { class: 'dw-d otx-s', text: Lang.t('dw.day', { n: day }) }),
                E('div', { class: 'dw-bname otx-s', text: name }),
                E('div', { class: 'dw-bhint', text: hint }));
            card.appendChild(E('div', { class: 'dw-big-in' }, prev, txt));
        } else {
            const face = this._cardFace(reward.parts);
            card.appendChild(E('div', { class: 'dw-d', text: Lang.t('dw.day', { n: day }) }));
            card.appendChild(E('div', { class: 'dw-ic' + (face.two ? ' two' : ''), html: face.ic }));
            if (face.n) card.appendChild(E('div', { class: 'dw-n otx-s', text: face.n }));
            if (face.s) card.appendChild(E('div', { class: 'dw-s', text: face.s }));
        }
        if (claimed) card.appendChild(E('div', { class: 'dw-chk', html: GameUI.icon('w-check') }));
        else if (!isNext) card.appendChild(E('div', { class: 'dw-lock', html: GameUI.icon('lock') }));
        return card;
    },

    /** Собрать окно подарка заново (при открытии, после получения, на новые сутки). */
    _renderDaily() {
        const ui = this._ui;
        if (!ui || ui.kind !== 'daily') return;
        const E = GameUtil.el;
        for (const h of ui.handles) h.destroy();
        ui.handles = []; ui.x2 = null; ui.note = null;
        GameUtil.clear(ui.el);
        const can = this.canClaimDaily();
        const d = this.daily();
        const ctx = { can, claimed: this.claimedDays(), nextDay: this.nextDay(), cycle: this.displayCycle() };
        ui.sig = this.today() + '|' + d.day + '|' + d.lastClaimDate;
        const root = E('div', { class: 'dw-daily' + (ui.got ? ' got' : '') });
        root.appendChild(E('div', { class: 'dw-sub', text: can || ui.got ? Lang.t('dw.gift.sub') : Lang.t('dw.gift.subAfter', { n: ctx.nextDay }) }));
        const grid = E('div', { class: 'dw-grid' });
        for (let day = 1; day <= 7; day++) grid.appendChild(this._dayCard(day, ctx));
        root.appendChild(grid);

        if (ui.got) root.appendChild(this._gotBlock(ui.got));
        else if (can) {
            const day = ctx.nextDay;
            const reward = this.rewardFor(day, d.cycle);
            const actions = E('div', { class: 'dw-actions' });
            const claim = E('button', { class: 'gb', type: 'button', text: Lang.t('dw.claim') });
            GameUI._press(claim, () => {
                if (GameUI._adBusy) return;
                const res = this.claimDaily(1);
                if (res) this._onClaimed(res);
            });
            actions.appendChild(E('div', { class: 'dw-act' }, claim, E('div', { class: 'dw-cap', text: Lang.t('dw.cap.base', { r: this._describe(reward.parts) }) })));
            if (day !== 7) {
                const x2 = E('button', { type: 'button' });
                ui.x2 = GameUI.rewardButton(x2, {
                    id: 'daily-x2', label: Lang.t('dw.claimX2'), cls: 'blue',
                    onReward: () => { const res = this.claimDaily(2); if (res) this._onClaimed(res); },
                });
                ui.handles.push(ui.x2);
                actions.appendChild(E('div', { class: 'dw-act' }, x2, E('div', { class: 'dw-cap', text: Lang.t('dw.cap.x2', { r: this._describe(this.scaleParts(reward.parts, 2)) }) })));
            }
            root.appendChild(actions);
            ui.note = E('div', { class: 'dw-note' });
            if (day === 7) ui.note.textContent = Lang.t('dw.noX2');
            root.appendChild(ui.note);
            if (day !== 7) this._tickDaily();
        } else {
            const ok = E('button', { class: 'gb', type: 'button', text: Lang.t('dw.close') });
            GameUI._press(ok, () => GameUI.closePanel('daily'));
            root.appendChild(E('div', { class: 'dw-wait' }, ok));
        }
        ui.el.appendChild(root);
    },

    /** Подарок получен: показать результат в окне (или тостом, если окно уже закрыли). */
    _onClaimed(res) {
        this._sound('claim', { volume: 0.8 });
        const ui = this._ui;
        if (!ui || ui.kind !== 'daily' || ui.rec.closed) {
            GameUI.toast(this._gotText(res.got[0]), 'good', 3600);
            return;
        }
        ui.got = res;
        this._renderDaily();
        const card = ui.el.querySelector('.dw-card[data-day="' + res.day + '"]');
        this._confettiBurst(card, res.day === 7 ? 80 : 56, res.day === 7 ? 1.25 : 1);
    },

    _gotText(g) {
        if (!g) return '';
        if (g.type === 'paws') return Lang.t('dw.got.paws', { n: GameUtil.fmtInt(g.n) });
        if (g.type === 'boost') return Lang.t(g.id === 'cash2x' ? 'dw.got.cash' : 'dw.got.luck', { n: g.min });
        if (g.type === 'dup') return Lang.t('dw.got.dup', { n: GameUtil.fmtInt(g.n) });
        if (g.type === 'exclusive') return Lang.t('dw.got.exclusive', { name: this.itemName(g.id) });
        return Lang.t('dw.got.item', { name: this.itemName(g.id) });
    },

    /** Строка «что получено» с превью и кнопкой «Надеть» для предметов. */
    _gotRow(g) {
        const E = GameUtil.el;
        const row = E('div', { class: 'dw-grow' });
        if (g.type === 'item' || g.type === 'exclusive') {
            const th = E('div', { class: 'dw-gthumb' });
            const node = this.thumbNode(g.id, 64);
            if (node) th.appendChild(node); else th.innerHTML = GameUI.icon(g.type === 'exclusive' ? 'crown' : 'gift');
            row.appendChild(th);
        } else {
            row.innerHTML = GameUI.icon(g.type === 'boost' ? (g.id === 'cash2x' ? 'banknote' : 'clover') : 'paw');
        }
        row.appendChild(E('span', { class: 'otx-s', text: this._gotText(g) }));
        if ((g.type === 'item' || g.type === 'exclusive') && this.canEquip()) {
            const eq = /** @type {HTMLButtonElement} */ (E('button', { class: 'gb yellow', type: 'button', text: Lang.t('dw.equip') }));
            GameUI._press(eq, () => {
                if (this.equipItem(g.id)) { GameUI.toast(Lang.t('dw.equipped'), 'good'); eq.disabled = true; eq.classList.add('off'); }
            });
            row.appendChild(eq);
        }
        return row;
    },

    _gotBlock(res) {
        const E = GameUtil.el;
        const box = E('div', { class: 'dw-got' }, E('div', { class: 'dw-got-t otx', text: Lang.t('dw.got.title') }));
        for (const g of res.got) box.appendChild(this._gotRow(g));
        const ok = E('button', { class: 'gb great', type: 'button', text: Lang.t('dw.great') });
        GameUI._press(ok, () => GameUI.closePanel('daily'));
        box.appendChild(ok);
        return box;
    },

    // =============================================================================================
    // Окно «Колесо фортуны»
    // =============================================================================================
    openWheel() {
        if (GameUI.blocking || this._tutorialActive()) return false;
        GameUI.openPanel({
            id: 'wheel', title: Lang.t('dw.wheel.title'), wide: true,
            onClose: () => this._closeUi('wheel'),
            build: (el, rec) => this._buildWheel(el, rec),
        });
        return true;
    },

    _buildWheel(el, rec) {
        const E = GameUtil.el;
        const sectors = this.wheelSectors();
        /** @type {any} */
        const ui = this._ui = { kind: 'wheel', rec, el, handles: [], sectors, tick: () => this._tickWheel(), labs: [], sig: this.today() };
        // колесо: деревянный обод с гвоздями, вращающийся диск с секторами, втулка и стрелка
        const wrap = E('div', { class: 'dw-ww' });
        const ring = E('div', { class: 'dw-ring' });
        for (let i = 0; i < 16; i++) ring.appendChild(E('i', { class: 'dw-nail', style: { transform: 'rotate(' + (i * 22.5) + 'deg) translateY(calc(var(--ws) * -0.466))' } }));
        const disc = E('div', { class: 'dw-disc' });
        const stops = [];
        sectors.forEach((s, i) => {
            const col = s.kind === 'item' || s.dup ? DW_ITEM_COLOR : DW_SECTOR_COLORS[i % 2];
            stops.push(col + ' ' + (i * DW_STEP) + 'deg ' + ((i + 1) * DW_STEP) + 'deg');
            const lab = E('div', { class: 'dw-lab', style: { transform: 'rotate(' + (i * DW_STEP) + 'deg)' } });
            const inn = E('div', { class: 'dw-lab-in' });
            if (s.kind === 'item') {
                const th = E('div', { class: 'dw-lab-th' });
                const node = this.thumbNode(s.id, 64);
                if (node) th.appendChild(node); else th.innerHTML = GameUI.icon('gift');
                inn.appendChild(th);
            } else {
                inn.innerHTML = GameUI.icon(s.dup ? 'gift' : 'paw') + '<span class="dw-lab-n">' + GameUtil.esc(GameUtil.fmtInt(s.n)) + '</span>';
            }
            lab.appendChild(inn);
            disc.appendChild(lab);
            ui.labs.push(lab);
        });
        disc.style.setProperty('--sec', 'conic-gradient(from -' + (DW_STEP / 2) + 'deg, ' + stops.join(',') + ')');
        disc.style.transform = 'rotate(' + this._angle.toFixed(2) + 'deg)';
        const hub = E('div', { class: 'dw-hub', html: GameUI.icon('paw') });
        const ptr = E('div', { class: 'dw-ptr', html: '<svg viewBox="0 0 40 52" aria-hidden="true"><path d="M20 50 L3 11 Q1 3 9 3 H31 Q39 3 37 11 Z" fill="#e8392f" stroke="#120904" stroke-width="4" stroke-linejoin="round"/><circle cx="20" cy="15" r="5.5" fill="#ffd21f" stroke="#120904" stroke-width="3"/></svg>' });
        wrap.append(ring, disc, hub, ptr);
        ui.wrap = wrap; ui.disc = disc; ui.ptr = ptr;

        // управление: бесплатное вращение, вращение за рекламу, строки состояния, результат
        const hint = E('div', { class: 'dw-line' });
        const free = /** @type {HTMLButtonElement} */ (E('button', { class: 'gb', type: 'button' }));
        GameUI._press(free, () => {
            if (this._anim || GameUI._adBusy) return;
            const res = this.spinWheel('free');
            if (res) this._playSpin(res);
        });
        const adBtn = E('button', { type: 'button' });
        const adH = GameUI.rewardButton(adBtn, {
            id: 'wheel-spin', label: Lang.t('dw.wheel.ad'), cls: 'blue',
            onReward: () => { const res = this.spinWheel('ad'); if (res) this._playSpin(res); },
        });
        ui.handles.push(adH);
        const adLine = E('div', { class: 'dw-cap' });
        const note = E('div', { class: 'dw-note' });
        const result = E('div', { class: 'dw-res' });
        Object.assign(ui, { free, adBtn, adH, adLine, note, result, hint });
        const side = E('div', { class: 'dw-side' }, result, free, hint, adBtn, adLine, note);
        el.appendChild(E('div', { class: 'dw-wheelbox' }, wrap, side));
        this._tickWheel(true);
    },

    /** Обновить состояние кнопок и подписей колеса. */
    _tickWheel(first) {
        const ui = this._ui;
        if (!ui || ui.kind !== 'wheel') return;
        if (!first && !this._anim && ui.sig !== this.today()) {   // сменились сутки: предмет сектора и счётчики новые — собрать колесо заново
            for (const h of ui.handles) h.destroy();
            GameUtil.clear(ui.el);
            this._buildWheel(ui.el, ui.rec);
            return;
        }
        const c = dwCfg();
        const freeOk = this.wheelFreeAvailable(), adLeft = this.wheelAdLeft(), spinning = !!this._anim;
        const ads = GameUI.adsAvailable();
        // бесплатная кнопка: «Крутить бесплатно» или таймер до следующего бесплатного вращения
        let label = spinning ? Lang.t('dw.wheel.spinning') : freeOk ? Lang.t('dw.wheel.free') : Lang.t('dw.wheel.freeIn', { t: GameUtil.fmtClock(this.secondsToMidnight()) });
        if (label !== ui.freeLabel) { ui.freeLabel = label; ui.free.innerHTML = GameUI.icon(freeOk && !spinning ? 'wheel' : 'hourglass') + '<span>' + GameUtil.esc(label) + '</span>'; }
        const freeOff = !freeOk || spinning;
        ui.free.disabled = freeOff;
        ui.free.classList.toggle('off', freeOff);
        ui.hint.textContent = Lang.t('dw.wheel.hFree');
        // кнопка за рекламу
        ui.adH.refresh();
        const adOff = adLeft <= 0 || spinning;
        if (adOff) { ui.adBtn.disabled = true; ui.adBtn.classList.add('off'); }
        const adText = adLeft > 0 ? Lang.t('dw.wheel.hAd', { a: adLeft, b: c.adSpins }) : Lang.t('dw.wheel.hNone');
        if (ui.adLine.textContent !== adText) ui.adLine.textContent = adText;
        const noteText = !ads && adLeft > 0 ? Lang.t('dw.adOff') : '';
        if (ui.note.textContent !== noteText) ui.note.textContent = noteText;
    },

    /** Запустить анимацию вращения к уже выбранному сектору. */
    _playSpin(res) {
        const ui = this._ui;
        if (!ui || ui.kind !== 'wheel' || ui.rec.closed) { this._announceSpin(res); return; }
        const c = dwCfg();
        const from = this._angle;
        this._anim = { from, to: this.targetAngle(from, res.index, res.offset, c.turns), t: 0, dur: Math.max(0.5, c.spinSec), res, idx: this.sectorUnder(from) };
        ui.wrap.classList.add('spinning');
        for (const l of ui.labs) l.classList.remove('win');
        ui.result.classList.remove('show');
        this._tickWheel();
    },

    _setAngle(a) {
        this._angle = a;
        const ui = this._ui;
        if (ui && ui.kind === 'wheel') ui.disc.style.transform = 'rotate(' + a.toFixed(2) + 'deg)';
    },

    /** Кадр вращения (игровое время: на паузе колесо стоит). */
    _stepSpin(dt) {
        const a = this._anim;
        a.t += dt;
        const k = Math.min(1, a.t / a.dur);
        const e = 1 - Math.pow(1 - k, 3);   // замедление к концу
        const ang = a.from + (a.to - a.from) * e;
        this._setAngle(ang);
        const idx = this.sectorUnder(ang);
        if (idx !== a.idx) {
            a.idx = idx;
            this._flap = 1;
            if (Game.time - this._lastTick > 0.055) {
                this._lastTick = Game.time;
                this._sound('tick', { volume: 0.35 + 0.35 * (1 - k), detune: 0.05 });
            }
        }
        if (k >= 1) this._endSpin();
    },

    _stepFlap(dt) {
        this._flap = Math.max(0, this._flap - dt * 7);
        const ui = this._ui;
        if (ui && ui.kind === 'wheel' && ui.ptr) ui.ptr.style.transform = this._flap > 0.02 ? 'rotate(' + (-this._flap * 24).toFixed(1) + 'deg)' : '';
    },

    /** Колесо встало: подсветка сектора, звук, конфетти и строка с призом (приз начислен ещё при выборе). */
    _endSpin() {
        const a = this._anim;
        this._anim = null;
        const res = a.res;
        this._setAngle(((a.to % 360) + 360) % 360);
        const ui = this._ui;
        this._sound('win', { volume: 0.85 });
        GameUI.toast(this._spinText(res, true), 'good', 3000);
        if (!ui || ui.kind !== 'wheel' || ui.rec.closed) return;
        ui.wrap.classList.remove('spinning');
        ui.labs[res.index].classList.add('win');
        this._showSpinResult(res);
        this._confettiBurst(ui.wrap, res.prize.type === 'item' ? 90 : 60, res.prize.type === 'item' ? 1.3 : 1);
        this._tickWheel();
    },

    _spinText(res, short) {
        const p = res.prize;
        if (p.type === 'item') return Lang.t(short ? 'dw.wheel.toastItem' : 'dw.wheel.winItem', { name: this.itemName(p.id) });
        return Lang.t(short ? 'dw.wheel.toast' : 'dw.wheel.winPaws', { n: GameUtil.fmtInt(p.n) });
    },

    /** Окно закрыли (или его нет), а приз выпал: тост и звук. */
    _announceSpin(res) {
        this._sound('win', { volume: 0.7 });
        GameUI.toast(this._spinText(res, true), 'good', 3200);
    },

    _showSpinResult(res) {
        const ui = this._ui;
        const E = GameUtil.el;
        const box = ui.result;
        GameUtil.clear(box);
        box.appendChild(E('div', { class: 'dw-res-t otx', text: Lang.t('dw.wheel.win') }));
        const p = res.prize;
        const row = E('div', { class: 'dw-grow' });
        if (p.type === 'item') {
            const th = E('div', { class: 'dw-gthumb' });
            const node = this.thumbNode(p.id, 64);
            if (node) th.appendChild(node); else th.innerHTML = GameUI.icon('gift');
            row.appendChild(th);
        } else row.innerHTML = GameUI.icon('paw');
        row.appendChild(E('span', { class: 'otx-s', text: p.type === 'dup' ? Lang.t('dw.got.dup', { n: GameUtil.fmtInt(p.n) }) : this._spinText(res, false) }));
        if (p.type === 'item' && this.canEquip()) {
            const eq = /** @type {HTMLButtonElement} */ (E('button', { class: 'gb yellow', type: 'button', text: Lang.t('dw.equip') }));
            GameUI._press(eq, () => { if (this.equipItem(p.id)) { GameUI.toast(Lang.t('dw.equipped'), 'good'); eq.disabled = true; eq.classList.add('off'); } });
            row.appendChild(eq);
        }
        box.appendChild(row);
        box.classList.remove('show');
        void box.offsetWidth;
        box.classList.add('show');
    },
};

Game.register(DailyWheel);
