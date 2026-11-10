// Constants.js — ВСЕ числа игры на Lory Engine: земля, камера, рендер, звук. Грузится
// ПЕРВЫМ: остальные модули читают эти глобалы. Правит редактор (_utils/editor): сервер
// патчит только строки `const ИМЯ = <число>;` — значения держать числовыми
// литералами (цвета — 0xRRGGBB), формулу редактор не тронет. Карты (размер, рельеф,
// объекты) — в Maps.js.
const ENGINE_NAME = 'Lory Engine';
const ENGINE_VERSION = '1.20';
const GAME_MODE = '3d';              // '3d' | '2d': renderer selected before boot
const WORLD2D_WIDTH = 960;            // logical viewport width (world pixels)
const WORLD2D_HEIGHT = 540;            // logical viewport height
const WORLD2D_PIXEL_RATIO = 2;         // maximum device pixel ratio
const LOADING_TIMEOUT_MS = 45000;    // ожидание готовности шейдеров/текстур; при ошибке — повтор
const FX_MAX_SYSTEMS = 48;           // одновременно живые слои частиц
const FX_MAX_PARTICLES = 6000;       // общий бюджет ёмкости систем на ПК
const FX_MOBILE_SCALE = 0.55;        // плотность и бюджет частиц на мобильных
const GAME_ID = 'master-of-ride-a-pet';          // латиница, цифры, -: имя архива dist/<GAME_ID>-<платформа>-<версия>.zip и ключей сохранений
const GAME_TITLE = 'Верхом на питомце';     // название игры: заголовок вкладки браузера
const GAME_VERSION = '0.2.2';         // версия билда: ?v= у скриптов (tools/build.mjs) и имя архива
const GAME_PLATFORM = 'pikabu';          // 'web' | 'yandex' | 'playables' — сборка ставит свою (build.bat yandex|playables)
const GAME_LANG = 'ru';               // язык интерфейса: сборка ставит ru (yandex) или en (playables); Lang.js
// Название игры по площадке: { <сборка>: 'Название' } — сборка ставит его в GAME_TITLE, <title> и заставку загрузки
// (tools/platforms.mjs platformTitle). Пикабу Игры: в названии нельзя иностранные слова.
/** @type {Record<string, string>} */
const GAME_TITLES = { pikabu: 'Верхом на питомце' };

// Шим localStorage: в sandbox-iframe и при запрете данных сайта прямой доступ бросает SecurityError.
// Все обращения к хранилищу — только через Store.
/** @satisfies {Record<string, any>} */
const Store = {
    get(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch (e) { /* нечего удалять */ }
    },
    // Разбор JSON без падения: битое значение = как будто сохранения нет.
    getJSON(key, fallback = null) {
        const raw = Store.get(key);
        if (raw === null) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : fallback;
        } catch (e) {
            console.warn('Store: повреждённое значение "' + key + '", сбрасываю.');
            Store.remove(key);
            return fallback;
        }
    }
};

// Телефон или планшет: user agent, iPad под видом Mac, тач на небольшом экране.
const IS_MOBILE = (() => {
    const userAgentMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasTouchScreen = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isSmallScreen = Math.max(window.innerWidth, window.innerHeight) <= 1366 &&
        Math.min(window.innerWidth, window.innerHeight) <= 1024;
    const isiPad = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return userAgentMobile || isiPad || (hasTouchScreen && isSmallScreen);
})();

// --- ЗЕМЛЯ (Terrain3D.js). Размер, текстура и рельеф — у каждой карты свои (Maps.js).
// Единицы мира — px: x вправо, y вниз по карте, высота вверх (скилл world3d, §Координаты). ---
const GROUND_TILE_SIZE = 512;           // px мира на один повтор текстуры земли
const TERRAIN_CELL = 96;                 // px: шаг сетки террейна (мобильные — не мельче 12)

// --- ЗВУК (Sound.js): громкость 0..1; выключенный звук игрок сохраняет сам (Store) ---
const SOUND_VOLUME = 0.8;               // эффекты
const MUSIC_VOLUME = 0.5;               // музыка

// --- ЯЗЫК (Lang.js) ---
const LANG_AUTO = 0;                    // 1 — язык платформы, если он есть в словаре; 0 — всегда GAME_LANG

// --- КАМЕРА (CameraControl.js): цель на карте, азимут, наклон и зум. Зум —
// экранных px на мировой px в точке взгляда; расстояние выводится из него. ---
const CAMERA_FOV_DEG = 55;              // вертикальный угол обзора
const CAMERA_AZIMUTH_DEG = -90;         // куда смотрит камера по карте: −90 — север вверх, 0 — восток вверх
const CAMERA_PITCH_DEG = 57;            // наклон к земле: 90 — строго сверху, меньше — больше перспективы
const CAMERA_ZOOM = 1;                  // стартовый зум: ПК и планшеты
const CAMERA_ZOOM_MOBILE = 0.7;         // стартовый зум: телефоны (большая сторона экрана < 1024)
const CAMERA_ZOOM_MIN = 0.5;            // дальше колесо и щипок не отводят (ниже — в кадр попадёт край земли)
const CAMERA_ZOOM_MAX = 3;              // ближе не приближают
const CAMERA_ZOOM_WHEEL_STEP = 0.12;    // доля зума за один щелчок колеса
const CAMERA_ZOOM_LERP = 0.18;          // сглаживание зума: доля остатка за кадр
const CAMERA_FOLLOW_LERP = 0.05;        // слежение за объектом (follow): доля остатка за кадр
const CAMERA_PAN_KEY_SPEED = 900;       // WASD и стрелки: экранных px/с
const CAMERA_ORBIT = 1;                 // вращение камеры игроком (ПКМ): 0 — ориентация фиксирована, 1 — можно
const CAMERA_ORBIT_DEG_PER_PX = 0.3;    // градусов поворота на экранный px драга
const CAMERA_ORBIT_PITCH_MIN_DEG = 8;  // ниже к земле не опускается (предел поднимается и сам — край земли не в кадре)
const CAMERA_ORBIT_PITCH_MAX_DEG = 65;  // выше — почти строго сверху

// --- РЕНДЕР (World3D.js): свет, тени, небо, материалы, toon и контур. Читает
// World3D.cfg(), редактор применяет правки к живой сцене. ---
// Солнце одно на весь мир. Азимут — КУДА падает тень по карте (0 — вправо, 90 — вниз).
const WORLD3D_SUN_AZIMUTH_DEG = 32;
const WORLD3D_SUN_ELEVATION_DEG = 41;   // высота солнца над горизонтом
const WORLD3D_SUN_INTENSITY = 0.8;      // сила солнца (с небом в сумме ~1.0 на ровной земле — краска текстуры без изменений)
const WORLD3D_SUN_COLOR = 0xffedc7;     // цвет солнца
const WORLD3D_SKYLIGHT_INTENSITY = 0.45; // рассеянный свет неба (полусферический источник)
const WORLD3D_SKYLIGHT_COLOR = 0xb1d8f7; // цвет света неба (грани, смотрящие вверх)
const WORLD3D_GROUNDLIGHT_COLOR = 0xc2c7ad; // подсветка снизу (отражение от земли)
const WORLD3D_SKY_COLOR = 0x8fd0ff;     // цвет неба и тумана
const WORLD3D_FOG_DENSITY = 0.00011;    // экспоненциальный туман к горизонту (0 — выключить)
// Тени: один цвет на все (красит toon-плагин, Babylon даёт только видимость солнца)
const WORLD3D_SHADOW_COLOR = 0x0f3a4d;  // цвет тени
const WORLD3D_SHADOW_STRENGTH = 0.52;    // сила тени 0..1: поверхность в тени умножается на смесь белого и цвета тени
const WORLD3D_SHADOW_SOFT = 2;          // край: 0 — жёсткий (под toon), 1..3 — PCF низкое/среднее/высокое (мобильные — не выше 1)
const WORLD3D_SHADOW_MAP = 1024;        // размер карты теней (мобильные — вдвое меньше); действует с новой сцены
const WORLD3D_SHADOW_RADIUS = 840;      // px: ПРЕДЕЛ полуразмера ортокадра теней; сам кадр ужимается по объектам в кадре
const WORLD3D_SHADOW_BIAS = 0.001;     // смещение глубины против «акне» (полосы тени на освещённых гранях)
const WORLD3D_SHADOW_NORMAL_BIAS = 0.8; // смещение вдоль нормали против «акне» (полосы и «пила» на гранях под острым углом к солнцу), в текселях карты теней сверх радиуса сглаживания края (его прибавляет движок)
const WORLD3D_SHADOW_CULL = 1;          // 1 — в карту теней рисуются только кастеры, задевающие ортокадр солнца (меньше draw calls), 0 — все
const WORLD3D_SHADOW_CULL_PAD = 160;    // px: запас к кадру теней при отсечении кастеров (мягкий край, смещение по нормали)
const WORLD3D_SHADOW_MIN_SIZE = 7;      // px: меши с радиусом габарита меньше (глаза наездников и прочая мелочь) тень не отбрасывают — меньше draw calls
// Материалы по группам (блик — доля 0..1, размер — показатель степени: больше — блик мельче)
const WORLD3D_GROUND_SPECULAR = 0;      // блик земли (0 — матовая)
const WORLD3D_GROUND_SPEC_POWER = 1;    // размер блика земли
const WORLD3D_OUTER_TINT = 1;           // яркость земли ЗА краем локации (меньше 1 — граница локации видна)
const WORLD3D_PROP_SPECULAR = 0.05;     // блик окружения (группа 'prop')
const WORLD3D_PROP_SPEC_POWER = 7;     // размер блика окружения
const WORLD3D_ACTOR_SPECULAR = 0;       // блик главных объектов (группа 'actor'); под toon — яркость «зайчика»
const WORLD3D_ACTOR_SPEC_POWER = 23;    // размер блика главных объектов
// Toon-шейдер (LoryToonPlugin): свет всех источников (солнце + небо, с тенью) квантуется в ступени
const WORLD3D_TOON = 1;                 // 1 — toon-затенение и обводка силуэта, 0 — обычное плавное без обводки
const WORLD3D_TOON_BANDS = 4;           // ступеней света (2..6)
const WORLD3D_TOON_SOFT = 0.02;         // мягкость границы ступени (0 — резко, 0.5 — почти плавно)
const WORLD3D_TOON_LOW = 0.48;          // яркость самой тёмной ступени (доля от полной)
const WORLD3D_TOON_GROUND = 1;          // 1 — ступени и на земле, 0 — земля затеняется плавно
const WORLD3D_TOON_GROUND_BANDS = 6;    // ступеней света на земле (0 — как у объектов): на склонах гор крупные тёмные пятна дробятся на мелкие шаги
const WORLD3D_TOON_GROUND_SOFT = 0.18;  // мягкость границ ступеней земли (отрицательное — как у объектов)
const WORLD3D_TOON_GROUND_LOW = 0.64;   // яркость самой тёмной ступени земли: склон, отвёрнутый от солнца, не чернеет (отрицательное — как у объектов)
const WORLD3D_TOON_SPEC = 0.25;            // сила блика-«зайчика» (0 — без блика)
const WORLD3D_TOON_SPEC_SIZE = 0.075;    // порог блика (меньше — крупнее пятно)
const WORLD3D_TOON_RIM = 0.28;           // светлый ободок по краю силуэта объектов (0 — нет)
const WORLD3D_TOON_RIM_WIDTH = 0.24;    // ширина ободка
// Контур рёбер (EdgesRenderer): рёбра, изломанные круче порога
const WORLD3D_TOON_INK = 2;             // 0 — нет, 1 — главные объекты, 2 — и окружение
const WORLD3D_TOON_INK_WIDTH = 25;      // толщина линии (≈ мировых px × 100; тоньше с удалением камеры)
const WORLD3D_TOON_INK_COLOR = 0x171717; // цвет чернил: контур рёбер и обводка силуэта
const WORLD3D_TOON_INK_ANGLE = 40;      // °: ребро рисуется, если грани изломаны круче
const WORLD3D_TOON_INK_MAX_TRIS = 20000; // часть модели тяжелее (треугольников) — без контура рёбер; 0 — без предела
// Обводка внешнего силуэта: постэффект (HighlightLayer, isStroke), толщина — в экранных px
const WORLD3D_TOON_OUTLINE = 2;         // 0 — нет, 1 — главные объекты, 2 — и окружение (только при WORLD3D_TOON = 1)
const WORLD3D_TOON_OUTLINE_ACTOR_WIDTH = 1.5;   // экранных px: обводка главных объектов
const WORLD3D_TOON_OUTLINE_PROP_WIDTH = 1;  // экранных px: обводка окружения (его в кадре много — тоньше)

// --- МАСТЕР ПИТОМЦЕВ (игра): баланс, мир, ранчо, управление, камера от третьего лица ---
// Яйца и волны (Eggs.js): волна раз в EGG_WAVE_SECONDS по EGG_WAVE_COUNT яиц, живых не больше EGG_LIVE_MAX.
const EGG_WAVE_SECONDS = 45;            // период волны яиц, с
const EGG_WAVE_COUNT = 10;              // яиц в волне
const EGG_LIVE_MAX = 40;                // живых яиц в мире не больше
const EGG_LIFETIME_SECONDS = 360;       // неподобранное яйцо исчезает через, с
const EGG_WARN_SECONDS = 4;            // за сколько секунд до разбивания яйцо в корзине «тикает» и его можно спасти за рекламу, с
const EGG_RESCUE_SECONDS = 8;          // спасение яйца за рекламу: сколько секунд добавить (один раз на яйцо)
const EGG_PICKUP_RADIUS = 90;           // подбор яйца касанием: запас к радиусу игрока, px
// Ранчо (Ranch.js). Участок — прямоугольник вокруг маркера ranch: RANCH_W — полный размер вдоль
// локальной оси +X (вход смотрит на хаб), RANCH_D — поперёк (локальная ось Y карты), px.
const RANCH_W = 1700;                   // размер участка вдоль входной оси, px
const RANCH_D = 2100;                   // размер участка поперёк, px
const RANCH_GATE_WIDTH = 480;           // ширина въезда на ранчо (проём в заборе), px
const NEST_SPACING = 260;               // шаг между гнёздами в ряду на ранчо, px
const RANCH_RING_RADIUS = 3800;         // радиус кольца ранчо вокруг хаба, px (карта Maps.js — по маркерам)
const HUB_RADIUS = 1500;                // радиус площади хаба «Загон», px
// Время суток (GameWorld.js)
const DAY_SECONDS = 240;                // длина дня, с
const NIGHT_SECONDS = 120;              // длина ночи, с
const DAY_TRANSITION_SECONDS = 30;      // плавный закат и рассвет (вокруг границы), с
// Экономика
const OFFLINE_MAX_SECONDS = 7200;       // офлайн-доход считается не больше чем за, с
const OFFLINE_RATE = 0.5;               // доля дохода за офлайн-время
const SELL_SECONDS = 120;               // цена продажи питомца = доход в секунду × это число
const PET_EXP_RANCH = 2;                // опыт питомца на ранчо, в секунду
const PET_EXP_RIDE = 1;                 // опыт питомца под седлом, в секунду движения
const SAVE_DEBOUNCE_MS = 1500;          // сохранение: задержка после изменения, мс
const SAVE_PLAYGAMA_COALESCE_MS = 400;  // Playgama: сохранения одного действия склеиваются в одну запись storage, мс
// Скорость питомца: v = clamp(SPEED_BASE_PX + SPEED_LOG_PX · log10(показанная скорость), SPEED_BASE_PX, SPEED_MAX_PX)
const SPEED_BASE_PX = 520;              // реальная скорость при показанной скорости 1, px/с
const SPEED_LOG_PX = 230;               // прирост реальной скорости на порядок показанной, px/с
const SPEED_MAX_PX = 2600;              // потолок реальной скорости, px/с
// Наездник и управление (Player.js)
const PLAYER_WALK_SPEED = 430;          // пешком, px/с
const PLAYER_RADIUS = 38;               // радиус столкновений пешком, px (верхом — по размеру питомца)
const PLAYER_JUMP_SPEED = 820;          // начальная скорость прыжка, px/с
const PLAYER_GRAVITY = 2600;            // сила тяжести, px/с²
const PLAYER_JUMP_BOOST = 1.7;          // множитель прыжка у питомцев со способностью jump
const PLAYER_GLIDE_FALL = 170;          // предельная скорость падения при планировании (glide), px/с
const PLAYER_FLY_SPEED = 760;           // вертикальная скорость в полёте (Пробел вверх, Shift вниз), px/с
const PLAYER_MAX_SLOPE = 1.2;           // самый крутой подъём пешком и верхом (тангенс угла)
const PLAYER_RIDE_COOLDOWN = 1;         // с, пауза между посадкой и спешиванием (кнопка «Сесть/Слезть», клавиша R)
const VENDOR_GREET_RADIUS = 650;         // px: продавец за прилавком машет и здоровается, когда игрок ближе
const VENDOR_LOOK_RADIUS = 1100;         // px: продавец поворачивается к игроку
const VENDOR_GREET_COOLDOWN = 12;        // с: не чаще одного приветствия продавца
// Супер-награда (SuperRewards.js): открывается за SUPER_VIEWS просмотров рекламы, даёт временные бусты
const SUPER_VIEWS = 5;                   // просмотров рекламы до супер-награды (прогресс сохраняется)
const SUPER_DURATION = 600;              // с: длительность супер-буста (повтор продлевает)
const SUPER_MAX_DURATION = 1800;         // с: верхний предел накопленного супер-буста
const SUPER_CASH_MULT = 3;               // ×деньги
const SUPER_LUCK_MULT = 3;               // ×удача вылупления
const SUPER_SPEED_MULT = 1.25;           // ×скорость езды и ходьбы
const SUPER_EGG_TIME_MULT = 1.75;        // ×время до разбивания яйца в корзине (+75%)
const SUPER_HATCH_MULT = 2;              // ×скорость инкубации в гнёздах
const SUPER_PAWS_MULT = 2;               // ×лапки за вылупление
// Камера от третьего лица: орбита вокруг игрока (наклон — CAMERA_ORBIT_PITCH_MIN/MAX_DEG)
const PLAYER_CAM_DIST = 620;            // расстояние камеры от игрока, px
const PLAYER_CAM_DIST_MIN = 240;        // ближе колесо и щипок не приближают, px
const PLAYER_CAM_DIST_MAX = 1700;       // дальше не отводят, px
const PLAYER_CAM_LOOK_HEIGHT = 130;     // на какой высоте над игроком цель взгляда, px
const PLAYER_CAM_PITCH_DEG = 22;        // стартовый наклон камеры к земле, градусы
const PLAYER_CAM_LERP = 9;              // сглаживание следования камеры, 1/с
const PLAYER_CAM_ALIGN_DELAY = 2.2;     // сколько секунд после ручного поворота камера не выравнивается за спину
const PLAYER_CAM_ALIGN_SPEED = 1.5;     // скорость выравнивания камеры за спину, 1/с
const PLAYER_CAM_SPEED_FOV = 8;         // на сколько градусов растёт FOV на предельной скорости
// Подписи над миром, стрелки-гид (GameUtil.js — Billboard, GameWorld.js — Guide)
const BILLBOARD_MAX_DIST = 2600;        // дальше подписи над миром скрываются, px
const GUIDE_ARROWS = 14;                // стрелок в цепочке гида
const GUIDE_SPACING = 130;              // шаг между стрелками гида, px

// --- РАСШИРЕНИЯ ДВИЖКА ИГРЫ ---
// Зоны рельефа, покраска земли, вода и батчинг декора (Terrain3D.js, Location3D.js). Все — от маркеров
// карты: zone-flat, zone-raise, paint-<тип>, water (формат — js/Maps.js и скилл world3d).
const TERRAIN_ZONE_BLEND = 0.35;        // zone-flat: ширина плавного перехода за кромкой — доля радиуса (внутри радиуса земля ровная)
const TERRAIN_PAINT_TEXEL = 14;         // покраска земли: мировых px на пиксель карты красок (телефоны — вдвое грубее)
const TERRAIN_PAINT_MAX = 2048;         // покраска земли: предел стороны карты красок, px (телефоны — не больше 1024)
const TERRAIN_PAINT_SOFT = 0.3;         // покраска земли: мягкий край — доля меньшей полуоси зоны
const TERRAIN_PAINT_DETAIL = 0.5;       // покраска земли: сколько рисунка тайла травы (по светлоте) остаётся поверх краски, 0..1
const WATER_SHALLOW_COLOR = 0x62dcd8;   // вода: цвет мелководья
const WATER_DEEP_COLOR = 0x2a78d0;      // вода: цвет глубины
const WATER_ALPHA_SHALLOW = 0.42;       // вода: непрозрачность у берега 0..1
const WATER_ALPHA_DEEP = 0.9;           // вода: непрозрачность на глубине 0..1
const WATER_DEPTH_FULL = 260;           // вода: глубина (px), на которой цвет и прозрачность становятся «глубокими»
const WATER_WAVE_SPEED = 1;             // вода: скорость волн и бликов (0 — стоячая)
const WATER_FOAM = 1;                   // вода: пена у берега 0..1
const DECOR_BATCH_OUTLINE = 0;          // батчинг декора (игра): обводка силуэта у инстансов — 0 нет (только контур рёбер), 1 ПК, 2 и телефоны; тон обводки у инстансов один на меш: вдали видны «призраки» контура
// Уровни графики (GameWorld.applyTier, NPC.js): на слабом железе рисуется только то, что рядом с игроком.
const PERF_SHADOW_RADIUS_LOW = 460;     // низкий уровень графики: предел полуразмера кадра теней, px (0 — не сужать); дальние кастеры в тень не попадают
const PERF_NPC_DIST_LOW = 0.55;         // низкий уровень: дальность показа NPC и их питомцев — доля от NPC_FAR_DIST и NPC_PET_DIST
const PERF_NPC_DIST_MID = 0.8;          // средний уровень: то же
const PERF_PROP_DIST_LOW = 2600;        // низкий уровень: продавцы хаба (мелкие статичные актёры) дальше этого от игрока не рисуются, px (0 — всегда)
const PERF_PROP_DIST_MID = 3400;        // средний уровень: то же (с ранчо игрока хаб — 3800 px, и продавцов оттуда не видно)
const PERF_PROP_DIST_HIGH = 0;          // высокий уровень: то же (0 — без ограничения)

// --- ЛАВКИ, ИНДЕКС, ПЕРЕРОЖДЕНИЕ, МАГАЗИН ЯИЦ ЗА РЕКЛАМУ (Shops.js, GameData.js) ---
const GEARS_RESTOCK_SECONDS = 180;      // лавка Gears: период обновления запаса радаров, с (по игровому времени)
const INDEX_REWARD_SECONDS = 120;       // Индекс: награда за нового питомца деньгами = его доход в секунду × это число
const INDEX_REWARD_PAWS_MULT = 2;       // Индекс: награда лапками = лапки за вылупление этой редкости × это число
const HUGE_PET_WEIGHT = 1.9;            // ОГРОМНЫЙ питомец (Гигантское яйцо): вес-фактор при создании
const HUGE_PET_INCOME_MULT = 3;         // ОГРОМНЫЙ питомец: множитель дохода (поверх веса)
const HUGE_PET_KG_MULT = 2;             // ОГРОМНЫЙ питомец: множитель веса в кг (поверх веса-фактора)
const REBIRTH_SKIP_VIEWS = 5;           // Перерождение «Пропустить»: сколько просмотров рекламы нужно (прогресс сохраняется)

// --- ЖИВОЙ МИР: ПОГОДА, МУТАЦИИ, NPC-СОСЕДИ, ЭФФЕКТЫ И ЗВУК (Weather.js, NPC.js, FX.js, PetView.js) ---
// Расписание событий (периоды и длительности — GameData.WEATHER_RULES): первое событие после запуска, шанс мутации от удара.
const WEATHER_FIRST_DELAY = 150;        // первое погодное событие после запуска игры, с
const WEATHER_MUTATION_CHANCE = 0.6;    // шанс, что удар молнии по питомцу или яйцу даёт мутацию, 0..1
const WEATHER_RAIN_RATE = 900;          // капель дождя в секунду на высоком уровне графики (ниже — по уровню)
const WEATHER_STRIKE_RANGE = 6500;      // дальше этого от игрока удары по NPC-питомцам не выбираются, px
const WEATHER_GROUND_STRIKES = 0.25;    // доля ударов «в никуда» (декор вокруг игрока) при наличии целей, 0..1
const MUTATION_FX_DIST = 3200;          // мутации (искры, дуги, свечение) рисуются у питомцев не дальше, px
// NPC-соседи (NPC.js): наездники по уровню графики, скорость, правила яиц
const NPC_RIDERS_LOW = 2;               // NPC-наездников на низком уровне графики
const NPC_RIDERS_MID = 3;               // NPC-наездников на среднем уровне графики
const NPC_RIDERS_HIGH = 5;              // NPC-наездников на высоком уровне графики
const NPC_SPEED_SCALE = 0.62;           // скорость NPC-наездника = скорость питомца × это число (чтобы игрок успевал)
const NPC_PICKUP_CHANCE = 0.35;         // шанс, что NPC, доехавший до живого яйца, подберёт его, 0..1
const NPC_RARE_EGG_CHANCE = 0.06;       // шанс, что NPC посягнёт на яйцо редкости epic и выше, 0..1
const NPC_PET_DIST = 2800;              // питомцы NPC-ранчо рисуются не дальше этого от игрока, px
const NPC_EGG_GRACE = 1400;             // NPC не берёт яйцо ближе этого к игроку (игрок, скорее всего, едет к нему сам), px
const NPC_FAR_DIST = 6000;              // дальше этого от игрока NPC обновляются реже и не рисуются, px
const NPC_PETS_MIN = 3;                 // питомцев на NPC-ранчо: от
const NPC_PETS_MAX = 6;                 // питомцев на NPC-ранчо: до
// NPC: навигация и поведение (NPC.js) — маршруты через ворота, «усы», застревание, выбор яиц, приветствия
const NPC_STUCK_TIME = 1.5;             // застрял: столько секунд почти без продвижения до отступления и нового маршрута
const NPC_LOOKAHEAD = 420;              // «усы»: на сколько вперёд NPC видит препятствия, px
const NPC_SEPARATION = 260;             // дистанция, на которой NPC огибает игрока и других NPC (боковой уход и торможение), px
const NPC_GATE_LEAD = 320;              // отступ путевых точек у ворот ранчо (внутри и снаружи), px
const NPC_PLOT_MARGIN = 260;            // запас при обходе ранчо по углам, px
const NPC_EGG_TIME_SAFETY = 0.8;        // NPC берёт яйцо, только если довезёт до ворот за эту долю таймера разбивания, 0..1
const NPC_EGG_MAX_TRIP = 45;            // дальше этого времени в пути (с) NPC за яйцом не едет
const NPC_HOME_CHANCE = 0.2;            // шанс, что NPC вместо выезда объедет своё ранчо, 0..1
const NPC_GREET_DIST = 900;             // NPC машет рукой игроку, когда тот ближе, px (0 — не здороваются)
const NPC_GREET_COOLDOWN = 40;          // не чаще одного приветствия игроку за столько секунд
// Эффекты и звук (FX.js, GameWorld.js)
const FX_BUTTERFLIES = 14;              // бабочек у ранчо днём (высокий уровень графики)
const FX_FIREFLIES = 22;                // светлячков у ранчо ночью (высокий уровень графики)
const FX_LEAVES_RATE = 7;               // падающих листьев в секунду в лесу (высокий уровень графики)
const FX_AMBIENT_VOLUME = 0.55;         // громкость фоновых петель (ветер, дождь, ночь), 0..1
const FX_MUSIC_VOLUME = 0.7;            // громкость музыки игры внутри MUSIC_VOLUME (у файла пики ~1.2, держим ниже 1), 0..1
const GAME_STARS = 360;                 // звёзд на ночном небе (высокий уровень графики)

// --- ПОДАРОК ДНЯ И КОЛЕСО ФОРТУНЫ (DailyWheel.js) ---
// Подарок дня: 7 дней по календарю устройства (пропуск дня цикл не сбрасывает). Дни 1-6 — лапки, бусты, предметы магазина
// (с «×2 за рекламу»); день 7 — эксклюзивный наряд (Cosmetics.EXCLUSIVE: 1-й, 2-й, 3-й круг), дальше — крупная награда лапками.
const DAILY_PAWS_DAY1 = 20;             // день 1: лапок
const DAILY_BOOST_CASH_MIN = 10;        // день 2: буст «×2 деньги», минут
const DAILY_PAWS_DAY3 = 50;             // день 3: лапок
const DAILY_BOOST_LUCK_MIN = 10;        // день 4: буст «×2 удача», минут
const DAILY_PAWS_DAY6 = 120;            // день 6: лапок (вместе со случайным предметом магазина)
const DAILY_DUP_PAWS = 50;              // вместо предмета, который у игрока уже есть (или недоступен), лапок
const DAILY_BIG_PAWS = 600;             // день 7 после всех эксклюзивных нарядов: крупная награда, лапок
const DAILY_OFFER_DELAY = 1.5;          // автопредложение подарка: сколько секунд подряд должны выполняться условия, с
const DAILY_OFFER_RANCH_MARGIN = 700;   // автопредложение: «у ранчо» — не дальше этого от забора, px
// Колесо фортуны: 8 секторов — семь сумм лапок и один предмет магазина; 1 бесплатное вращение в день + вращения за рекламу.
const WHEEL_AD_SPINS = 3;               // вращений за рекламу в день (сверх бесплатного)
const WHEEL_SPIN_SECONDS = 5.5;         // длительность вращения колеса, с
const WHEEL_TURNS = 6;                  // полных оборотов до остановки (минимум)
const WHEEL_ITEM_PERCENT = 8;           // шанс сектора с предметом магазина, % (остальное делят суммы лапок)
const WHEEL_DUP_PAWS = 75;              // вместо предмета, который уже есть у игрока (или недоступен), лапок
const WHEEL_PAWS_1 = 10;                // сектор 1: лапок (самый частый)
const WHEEL_PAWS_2 = 20;                // сектор 2: лапок
const WHEEL_PAWS_3 = 30;                // сектор 3: лапок
const WHEEL_PAWS_4 = 50;                // сектор 4: лапок
const WHEEL_PAWS_5 = 75;                // сектор 5: лапок
const WHEEL_PAWS_6 = 100;               // сектор 6: лапок
const WHEEL_PAWS_7 = 150;               // сектор 7: лапок (самый редкий)

// --- ОБУЧЕНИЕ, ТИТУЛЬНЫЙ ЭКРАН И РЕКОРДЫ (Tutorial.js, Menus.js) ---
const TUTORIAL_MOVE_DISTANCE = 350;     // обучение, шаг «иди»: сколько px нужно пройти, чтобы шаг засчитался
const TUTORIAL_LOOK_PIXELS = 260;       // обучение, шаг «осмотрись»: сколько px драга камерой (или стрелок) нужно набрать
const TUTORIAL_NEAR_EGG = 750;          // обучение: ближе этого к яйцу (px) подсказка «следуй за стрелками» меняется на «подбери»
const TUTORIAL_HATCH_WAIT = 8;          // обучение: яйцо в гнезде вылупляется не позже, чем через столько секунд
const TITLE_ORBIT_DEG = 9;              // титульный экран: скорость облёта камеры вокруг игрока, градусов в секунду
const TITLE_CAM_DIST = 980;             // титульный экран: расстояние камеры от игрока, px
const TITLE_CAM_PITCH_DEG = 17;         // титульный экран: наклон камеры, градусы
const TITLE_CAM_LOOK = 190;             // титульный экран: на какую высоту над землёй смотрит камера, px
const RECORDS_CACHE_SECONDS = 60;       // таблица рекордов: сколько секунд не перезапрашивать у платформы (лимит запросов Яндекса)
const UI_BANNER_QUEUE_MAX = 3;          // интерфейс: сколько крупных баннеров (яйца, погода) ждут, пока открыто окно; лишние старые отбрасываются
const UI_BANNER_MAX_WAIT = 30;          // интерфейс: баннер, прождавший закрытия окна дольше стольких секунд, уже не показывается (устарел)

// --- ГАРДЕРОБ: КОСМЕТИКА ЗА ЛАПКИ И РЕКЛАМУ (Cosmetics.js) ---
// Цена предмета зависит от редкости: за лапки покупаются обычные…эпические, за рекламу — любые (чем ценнее, тем больше просмотров).
const COS_PAWS_COMMON = 15;             // гардероб: цена обычного предмета, лапок
const COS_PAWS_UNCOMMON = 40;           // гардероб: цена необычного предмета, лапок
const COS_PAWS_RARE = 90;               // гардероб: цена редкого предмета, лапок
const COS_PAWS_EPIC = 200;              // гардероб: цена эпического предмета, лапок
const COS_SKIN_PAWS = 600;              // гардероб: цена мифического скина «67» (единственный скин за лапки), лапок
const COS_ADS_COMMON = 1;               // гардероб: просмотров рекламы для обычного предмета
const COS_ADS_UNCOMMON = 2;             // гардероб: просмотров рекламы для необычного предмета
const COS_ADS_RARE = 3;                 // гардероб: просмотров рекламы для редкого предмета
const COS_ADS_EPIC = 4;                 // гардероб: просмотров рекламы для эпического предмета
const COS_ADS_LEGENDARY = 5;            // гардероб: просмотров рекламы для легендарного предмета
const COS_TRAIL_RATE = 1;               // гардероб: плотность следов за питомцем (множитель к частицам в секунду; общий бюджет — FX_MAX_*, FX_MOBILE_SCALE)
const COS_THUMB_PX = 128;               // гардероб: размер превью предметов в карточках, px (рисуются один раз и кэшируются)
const COS_CAM_DIST = 1;                 // гардероб: множитель расстояния камеры при примерке (1 — как задумано, больше — дальше от наездника)
