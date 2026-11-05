// Location3D.js — локация: 3D-вид (свет, небо, туман, тени), земля (Terrain3D) и
// объекты ОДНОЙ карты из Maps.js (GAME_MAPS). Карта задаёт размер, текстуру
// земли, рельеф и объекты: модели (FBX / OBJ / glTF), маркеры — точки для логики
// игры (спавн, враги, финиш; в игре невидимы, в редакторе — булавки). Карты
// расставляет и правит редактор. Смена карты — loadMap(map): вид (сцена, камера,
// свет) остаётся, земля и объекты пересобираются.
// Общая для игры (main.js) и редактора (_utils/editor/lab.js): оба зовут
// update(dt) каждый кадр — вращение частей моделей (def.anim). Свои объекты игра
// создаёт в location.view.scene и регистрирует World3D.addObject(location.view,
// mesh, 'actor' | 'prop'); ставить на землю — по location.terrain.heightAt(x, y).
//
// МАРКЕРЫ-ЗОНЫ карты (zone-flat, zone-raise, paint-<тип>, water) читает Terrain3D (см. его
// шапку): рельеф, покраска и вода пересобираются с землёй. Редактор правит их живо —
// placeObject / markerEdited / addObject / removeObject маркера ставят пересборку не чаще
// кадра (refreshZones: меняется только то, что изменилось — холмы пересобирают землю,
// покраска и вода — каждая себя). Для игры: groundTypeAt(x, y), waterAt(x, y).
//
// БАТЧИНГ ДЕКОРА (только игра: opts.batchDecor): объекты с моделью из папки природы
// (Location3D.DECOR_PREFIX) становятся thin instances — одна пара мешей на модель, а не
// по мешу на объект: draw calls не растут от числа деревьев. Тени работают (прототип —
// кастер), контур рёбер — на прототипе; обводка силуэта у инстансов — по DECOR_BATCH_OUTLINE
// (0 нет, 1 только ПК, 2 везде; по умолчанию нет: тон обводки у инстансов один на меш, и
// далёкие деревья «светились» бы контуром сквозь туман). В буфере инстансов — только объекты
// в пределах видимости от камеры (туман съедает остальное): _cullBatches, раз в 5% дальности.
// У такого объекта rec.mesh = null, rec.batch — пачка; placeObject/removeObject работают.
// В пачку идут и модели города и пропсов, что стоят на карте не меньше BATCH_MIN раз (скамейки, фонари, фонтаны, шипы,
// лавовые камни, руины); одиночные ориентиры — мешами. Части модели с несколькими цветными материалами склеиваются в один
// submesh с вершинными цветами (Location3D.mergeColors: draw call на деталь, не на материал). Тень пачки рисует отдельный
// меш-прокси (part.sh) только с инстансами у кадра солнца: основной меш в карту теней не ставится, пачка без инстансов у
// игрока тени не стоит. Игра склеивает цвета и у наездников (GameWorld.mergeActors, mergeColors live).

class Location3D {
    // opts: { assetBase?: '' — игра (пути от index.html) | '/' — редактор (от корня сервера),
    //         map?: запись GAME_MAPS (правится на месте: объекты — её objects),
    //         showMarkers?: булавки маркеров (редактор),
    //         batchDecor?: декор из папки природы — инстансами (игра), batchPrefix? — другая папка,
    //         onTerrain?: (terrain) => void — землю пересобрала правка зон (редактор: камере нужна новая) }
    constructor(opts) {
        this.opts = opts || {};
        this.view = World3D.createView({});
        this.terrain = null;
        /** @type {LocationObject[]} */
        this.objects = [];   // { def, mesh, error, loaded } — см. addObject
        /** @type {GameMap} */
        this.map = null;
        this._groundImage = null;
        this._groundIndex = -1;
        /** @type {Map<string, any>} */
        this._batches = new Map();   // 'модель|вид' -> пачка инстансов
        this._modelCounts = new Map();   // модель -> сколько раз стоит на карте
        this._dirtyBatches = new Set();
        this._placingAll = false;
        this._zoneQueued = false;
        /** @type {{ rel: string, paint: string, water: string } | null} */
        this._zoneSig = null;
        /** @type {Promise<any>} */
        this.ready = this.loadMap(this.opts.map || Location3D.newMap('map'));
    }

    // Размеры и рельеф — из карты; нет поля — дефолт (карта старше кода или пустая).
    get width() { return Math.max(64, Number(this.map && this.map.width) || 2048); }
    get height() { return Math.max(64, Number(this.map && this.map.height) || 2048); }

    // Показать карту: прежние объекты уходят, земля и объекты — по новой карте.
    // map правится на месте: addObject/removeObject держат map.objects в том же
    // порядке, что this.objects. Игре — копия (Location3D.copyMap), чтобы правки
    // во время игры не попадали в GAME_MAPS. Промис — как ready.
    /** @param {GameMap} map */
    loadMap(map) {
        for (const rec of this.objects.slice()) this._drop(rec);
        this.objects = [];
        this._batches.clear();
        this._dirtyBatches.clear();
        this.map = map;
        if (!Array.isArray(map.objects)) map.objects = [];
        this._modelCounts = this._countModels(map.objects);
        this.buildTerrain();
        let completed = 0;
        const models = map.objects.slice().map(def => this._add(def).loaded.then(rec => {
            completed++;
            if (this.opts.onProgress) this.opts.onProgress(completed, map.objects.length);
            return rec;
        }));
        // Готова — текстура земли и модели объектов пришли (или не нашлись) и шейдеры сцены
        // собраны. Не дольше READY_TIMEOUT: сломанный ассет не держит экран загрузки вечно.
        const view = this.view;
        this.ready = Promise.all([this.loadGround()].concat(models))
            .then(() => new Promise(resolve => {
                this._flushBatches();   // инстансы декора готовы до сборки шейдеров
                view.scene.executeWhenReady(() => resolve(undefined));
                setTimeout(resolve, Location3D.READY_TIMEOUT);
            }));
        return this.ready;
    }

    // (Пере)собрать землю по размерам и рельефу карты (редактор — живо).
    // Объекты карты встают на новую землю; свои объекты игры — забота владельца.
    buildTerrain() {
        if (this.terrain) this.terrain.dispose();
        const t = /** @type {any} */ ((this.map && this.map.terrain) || {});
        const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
        this.terrain = new Terrain3D(this.view, {
            worldW: this.width,
            worldH: this.height,
            groundImage: this._groundImage,
            noise: { amp: Math.max(0, num(t.amp, 40)), scale: num(t.scale, 800), seed: num(t.seed, 1), base: num(t.base, 0) },
            markers: this._markerDefs(),
            baseType: ['grass', 'sand', 'snow'][Math.max(0, Math.min(2, Math.round(Number(this.map && this.map.ground) || 0)))]
        });
        this._zoneSig = this._zoneSigs();
        this.placeObjects();
        return this.terrain;
    }

    // --- Зоны: маркеры zone-*, paint-*, water ------------------------------------------------

    _markerDefs() {
        return ((this.map && this.map.objects) || []).filter(d => d.kind === 'marker');
    }

    // Подписи (JSON полей) маркеров-зон по частям: rel — холмы и ровные участки (земля),
    // paint, water. Изменилась подпись — пересобирается своя часть.
    _zoneSigs() {
        const rel = [], paint = [], water = [];
        for (const d of this._markerDefs()) {
            const k = Terrain3D.zoneKind(d.name);
            if (!k) continue;
            (k.kind === 'paint' ? paint : k.kind === 'water' ? water : rel).push([d.name, d.x, d.y, d.h, d.rot, d.scale]);
        }
        return { rel: JSON.stringify(rel), paint: JSON.stringify(paint), water: JSON.stringify(water) };
    }

    // Правка маркера (редактор: сдвиг, размер, имя, добавление, удаление): сверка зон не чаще кадра.
    // Маркер мог СТАТЬ зоной или перестать ею быть (имя), поэтому ставим сверку для любого маркера:
    // не-зона и неизменившиеся зоны — ничего не пересобирается (подписи совпали).
    /** @param {LocationObject | LocationObjectDef} recOrDef */
    markerEdited(recOrDef) {
        const d = /** @type {any} */ (recOrDef).def || recOrDef;
        if (d && d.kind === 'marker') this.queueZones();
    }

    queueZones() {
        if (this._zoneQueued) return;
        this._zoneQueued = true;
        const run = () => { this._zoneQueued = false; if (this.view) this.refreshZones(); };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else if (typeof setTimeout === 'function') setTimeout(run, 0);
        else run();
    }

    // Пересобрать то, что изменилось в зонах: холмы и ровные участки — всю землю (и
    // воду, и объекты на ней), покраску и воду — только себя. true — что-то пересобрано.
    refreshZones() {
        if (!this.terrain || !this.map) return false;
        const now = this._zoneSigs(), was = this._zoneSig || { rel: '', paint: '', water: '' };
        if (now.rel !== was.rel) {
            this.buildTerrain();
            if (this.opts.onTerrain) this.opts.onTerrain(this.terrain);
            return true;
        }
        this._zoneSig = now;
        let changed = false;
        if (now.paint !== was.paint) { this.terrain.setPaints(this._markerDefs()); changed = true; }
        if (now.water !== was.water) { this.terrain.setWaters(this._markerDefs()); changed = true; }
        return changed;
    }

    // Тип земли под точкой для логики игры ('grass' | 'sand' | 'snow' — основа карты, или тип
    // покраски paint-<тип>: dirt, path, sand, snow, rock, dark, grass2, lava).
    /** @returns {string} */
    groundTypeAt(x, y) {
        return this.terrain ? this.terrain.groundTypeAt(x, y) : 'grass';
    }

    // Уровень воды под точкой (px) или null: точка внутри маркера water и земля под ней ниже воды.
    /** @returns {number | null} */
    waterAt(x, y) {
        return this.terrain ? this.terrain.waterAt(x, y) : null;
    }

    // --- Объекты карты --------------------------------------------------------------

    // Запись карты -> объект: { def, mesh, error, loaded }. Запись
    // возвращается сразу, меш появляется, когда модель догрузится (loaded —
    // промис). Нет файла — объект без меша (error), сцена не падает.
    // def: { name, model, kind, x, y, h, rot, scale, anim? } — поля живые: правка +
    // placeObject; anim читается каждый кадр (spinPart). kind 'marker' — маркер без модели.
    // at — место в списке (по умолчанию — в конец); def попадает и в map.objects.
    /** @param {LocationObjectDef} def @param {number} [at] @returns {LocationObject} */
    addObject(def, at) {
        const list = this.map.objects;
        const i = list.indexOf(def);
        if (i >= 0) list.splice(i, 1);
        const pos = at == null || at < 0 || at > this.objects.length ? this.objects.length : at;
        list.splice(pos, 0, def);
        if (def.kind !== 'marker' && typeof def.model === 'string') this._modelCounts.set(def.model, (this._modelCounts.get(def.model) || 0) + 1);
        const rec = this._add(def, pos);
        this.markerEdited(def);
        return rec;
    }

    /** @param {LocationObjectDef} def @param {number} [at] @returns {LocationObject} */
    _add(def, at) {
        /** @type {LocationObject} */
        const rec = { def, mesh: null, error: null, loaded: null };
        this.objects.splice(at == null ? this.objects.length : at, 0, rec);
        if (def.kind === 'marker') {
            if (this.opts.showMarkers) {
                rec.mesh = Location3D.markerMesh(this.view.scene, def.name || 'marker');
                rec.mesh.metadata = { locationObject: rec };
                this.placeObject(rec);
            }
            rec.loaded = Promise.resolve(rec);
            return rec;
        }
        if (this._batchable(def)) return this._addBatched(rec);
        rec.loaded = Model3D.load((this.opts.assetBase || '') + def.model).then((model) => {
            if (this.objects.indexOf(rec) < 0 || !this.view) return rec;   // сняли, пока грузилась
            rec.mesh = Model3D.build(model, this.view.scene, { name: def.name || 'object' });
            rec.mesh.metadata = { locationObject: rec };
            World3D.addObject(this.view, rec.mesh, def.kind);
            this.placeObject(rec);
            return rec;
        }).catch((e) => {
            rec.error = (e && e.message) || String(e);
            console.warn('Location3D: не загрузилась модель ' + def.model + ' — ' + rec.error);
            return rec;
        });
        return rec;
    }

    // Меш — по полям def: позиция на земле + h; rot — [x, y, z] градусы (y — курс по
    // карте, как heading: rotation.y = −y; x, z — наклон); scale — [x, y, z]. Старая
    // запись с числами (rot — только курс, scale — равномерный) тоже читается.
    /** @param {LocationObject} rec */
    placeObject(rec) {
        const m = rec.mesh, d = rec.def;
        if (rec.batch) { this._dirtyBatches.add(rec.batch); return; }   // инстанс: матрицу пересоберёт flush
        if (!this._placingAll && d.kind === 'marker') this.markerEdited(d);   // зона — пересборка земли
        if (!m) return;
        const x = Number(d.x) || 0, y = Number(d.y) || 0, D = Math.PI / 180;
        const r = Array.isArray(d.rot) ? d.rot : [0, d.rot, 0];
        const s = Array.isArray(d.scale) ? d.scale : [d.scale, d.scale, d.scale];
        const k = (v) => (Number(v) > 0 ? Number(v) : 1);
        m.position.set(x, (this.terrain ? this.terrain.heightAt(x, y) : 0) + (Number(d.h) || 0), y);
        m.rotationQuaternion = null;   // кватернион (его может поставить гизмо) перекрыл бы rotation
        m.rotation.set((Number(r[0]) || 0) * D, -(Number(r[1]) || 0) * D, (Number(r[2]) || 0) * D);
        m.scaling.set(k(s[0]), k(s[1]), k(s[2]));
    }

    placeObjects() {
        this._placingAll = true;   // маркеры-зоны не просят пересборку: земля только что собрана
        try { for (const rec of this.objects) this.placeObject(rec); } finally { this._placingAll = false; }
    }

    // --- Батчинг декора (opts.batchDecor) -----------------------------------------------------

    // Объект идёт в инстансы: модель из папки природы (всегда) или из папок города и пропсов (Location3D.BATCH_REPEATED —
    // только если эта модель стоит на карте не меньше BATCH_MIN раз: у одиночного объекта пачка ничего не экономит и
    // отсекается по кадру хуже). Объект с анимацией части (её вращают у меша) остаётся мешем.
    /** @param {LocationObjectDef} def */
    _batchable(def) {
        if (!this.opts.batchDecor || def.kind === 'marker' || def.anim || typeof def.model !== 'string') return false;
        const prefix = this.opts.batchPrefix || Location3D.DECOR_PREFIX;
        if (def.model.indexOf(prefix) === 0) return true;
        if (this.opts.batchPrefix) return false;
        return Location3D.BATCH_REPEATED.some(p => def.model.indexOf(p) === 0) && (this._modelCounts.get(def.model) || 0) >= Location3D.BATCH_MIN;
    }

    // Сколько раз каждая модель стоит на карте (для решения «в пачку или мешем»).
    /** @param {LocationObjectDef[]} list */
    _countModels(list) {
        const counts = new Map();
        for (const d of list) if (d.kind !== 'marker' && typeof d.model === 'string') counts.set(d.model, (counts.get(d.model) || 0) + 1);
        return counts;
    }

    // Объект -> пачка своей модели. Модель грузится один раз (Model3D.load кэширует); меши
    // прототипа строятся при первом объекте пачки, инстансы собирает _flushBatch.
    /** @param {LocationObject} rec */
    _addBatched(rec) {
        const def = rec.def, kind = def.kind === 'actor' ? 'actor' : 'prop';
        const key = def.model + '|' + kind;
        let batch = this._batches.get(key);
        if (!batch) {
            batch = { key, model: def.model, kind, recs: [], parts: null };
            this._batches.set(key, batch);
        }
        batch.recs.push(rec);
        rec.batch = batch;
        rec.loaded = Model3D.load((this.opts.assetBase || '') + def.model).then((model) => {
            if (rec.dead || !this.view) return rec;   // сняли, пока грузилась
            if (!batch.parts) this._buildBatch(batch, model);
            this._dirtyBatches.add(batch);
            return rec;
        }).catch((e) => {
            rec.error = (e && e.message) || String(e);
            console.warn('Location3D: не загрузилась модель ' + def.model + ' — ' + rec.error);
            this._dirtyBatches.add(batch);
            return rec;
        });
        return rec;
    }

    // Прототип пачки: меши модели без родителя и без собственного положения — положение каждого
    // экземпляра (и положение части в модели) несёт матрица инстанса. Контур рёбер и тени —
    // штатные World3D.addObject; обводка силуэта — по DECOR_BATCH_OUTLINE.
    // Тень пачки — отдельный меш-«прокси» на тех же вершинах (part.sh): в него попадают только инстансы, задевающие кадр
    // солнца (_cullShadow), а основной меш в карту теней не ставится. Так в карте теней рисуются не все деревья в
    // дальности тумана, а те, что рядом, и пачка без инстансов у игрока не стоит draw call. Прокси спрятан от камеры маской слоя.
    _buildBatch(batch, model) {
        const scene = this.view.scene;
        const root = Model3D.build(model, scene, { name: batch.model.split('/').pop() });
        const level = typeof DECOR_BATCH_OUTLINE !== 'undefined' ? DECOR_BATCH_OUTLINE : 0;
        const outline = level >= 2 || (level >= 1 && !IS_MOBILE);
        const decor = batch.model.indexOf(this.opts.batchPrefix || Location3D.DECOR_PREFIX) === 0;
        // Радиус модели от её начала координат (инстанс стоит началом на земле): по дальнему углу габарита.
        const ext = (a, b) => Math.max(Math.abs(a), Math.abs(b));
        batch.radius = model.min && model.max && Number.isFinite(model.min[0]) ? Math.hypot(ext(model.min[0], model.max[0]), ext(model.min[1], model.max[1]), ext(model.min[2], model.max[2])) : 200;
        batch.parts = [];
        for (const mesh of root.getChildMeshes(true)) {
            Location3D.mergeColors(mesh);   // части с несколькими цветными материалами — один draw call (и в тенях тоже)
            mesh.computeWorldMatrix(true);
            const local = mesh.getWorldMatrix().clone();   // корень в начале координат: часть в системе модели
            mesh.parent = null;
            mesh.isPickable = false;
            const proxied = this.opts.shadowProxies !== false && !!mesh.geometry;
            World3D.addObject(this.view, mesh, batch.kind, { outline, castShadow: !proxied });
            // decor — растительность и камни природы (игра на низком уровне снимает с них тени и контур рёбер), batched — любая пачка
            mesh.metadata = Object.assign({}, mesh.metadata, { decor, batched: true });
            const part = { mesh, local, full: null, out: null, sh: null };
            if (proxied) {
                const proxy = new BABYLON.Mesh(mesh.name + '/sh', scene);
                mesh.geometry.applyToMesh(proxy);
                proxy.material = mesh.material;
                proxy.layerMask = Location3D.SHADOW_LAYER;   // камера мира его не видит, карта теней (явный список кастеров) — рисует
                proxy.isPickable = false;
                proxy.receiveShadows = false;
                proxy.metadata = { decor, batched: true, shadowProxy: true };
                proxy.setEnabled(false);
                this.view.addShadowCaster(proxy, false);
                part.sh = { mesh: proxy, out: null };
            }
            batch.parts.push(part);
        }
        root.dispose(true, false);
    }

    // Матрица экземпляра: масштаб × поворот × положение — та же, что placeObject даёт мешу
    // (rotation.y = −rot[1], Euler YXZ), высота — по земле.
    /** @param {LocationObject} rec */
    _instanceMatrix(rec) {
        const d = rec.def, D = Math.PI / 180;
        const x = Number(d.x) || 0, y = Number(d.y) || 0;
        const r = Array.isArray(d.rot) ? d.rot : [0, d.rot, 0];
        const s = Array.isArray(d.scale) ? d.scale : [d.scale, d.scale, d.scale];
        const k = (v) => (Number(v) > 0 ? Number(v) : 1);
        const q = BABYLON.Quaternion.RotationYawPitchRoll(-(Number(r[1]) || 0) * D, (Number(r[0]) || 0) * D, (Number(r[2]) || 0) * D);
        return BABYLON.Matrix.Compose(new BABYLON.Vector3(k(s[0]), k(s[1]), k(s[2])), q,
            new BABYLON.Vector3(x, (this.terrain ? this.terrain.heightAt(x, y) : 0) + (Number(d.h) || 0), y));
    }

    // Пересобрать пачку по её живым объектам: полные массивы матриц (по одному на часть модели —
    // part.full) и позиции для отсечения (batch.pos); в видеобуфер (part.out) попадает то, что
    // не дальше видимости от камеры (_cullBatch).
    _flushBatch(batch) {
        this._dirtyBatches.delete(batch);
        if (!batch.parts) return;
        const recs = batch.recs.filter(r => !r.dead && !r.error), n = recs.length;
        batch.n = n;
        batch.pos = new Float32Array(n * 2);
        batch.pos3 = new Float32Array(n * 3);   // x, высота, z центра инстанса — для отсечения теней
        batch.rad = new Float32Array(n);        // радиус инстанса (радиус модели × наибольший масштаб)
        const base = new Float32Array(n * 16);
        for (let i = 0; i < n; i++) {
            const d = recs[i].def, s = Array.isArray(d.scale) ? d.scale : [d.scale, d.scale, d.scale];
            this._instanceMatrix(recs[i]).copyToArray(base, i * 16);
            batch.pos[i * 2] = Number(d.x) || 0;
            batch.pos[i * 2 + 1] = Number(d.y) || 0;
            batch.pos3[i * 3] = base[i * 16 + 12];
            batch.pos3[i * 3 + 1] = base[i * 16 + 13];
            batch.pos3[i * 3 + 2] = base[i * 16 + 14];
            batch.rad[i] = (batch.radius || 200) * Math.max(Number(s[0]) || 1, Number(s[1]) || 1, Number(s[2]) || 1);
        }
        for (const part of batch.parts) {
            if (!n) { part.mesh.setEnabled(false); if (part.sh) part.sh.mesh.setEnabled(false); continue; }
            if (part.local.isIdentity()) part.full = base;
            else {
                part.full = new Float32Array(n * 16);
                for (let i = 0; i < n; i++) part.local.multiply(BABYLON.Matrix.FromArray(base, i * 16)).copyToArray(part.full, i * 16);
            }
            part.out = new Float32Array(n * 16);
            part.mesh.thinInstanceSetBuffer('matrix', part.out, 16, false);
            if (part.sh) {
                part.sh.out = new Float32Array(n * 16);
                part.sh.mesh.thinInstanceSetBuffer('matrix', part.sh.out, 16, false);
            }
        }
        batch.cull = null;
        batch.shCull = null;
        this._cullBatch(batch, ...this._cullCenter());
        this._cullShadow(batch);
    }

    _flushBatches() {
        for (const b of Array.from(this._dirtyBatches)) this._flushBatch(b);
    }

    // Дальность видимости декора (px): дальше туман сцены съедает ~93% цвета (линии контура рёбер в тумане не гаснут) — инстансы за ней
    // не рисуются (иначе контур рёбер далёких деревьев светился бы сквозь туман, а вершины
    // всей карты считались бы каждый кадр). Нет тумана — дальняя плоскость камеры.
    _visibleRadius() {
        const scene = this.view.scene, cam = this.view.camera;
        const far = cam && cam.maxZ > 0 ? cam.maxZ : 9000, rho = scene.fogDensity;
        let d = far;
        if (scene.fogEnabled) {
            if (scene.fogMode === BABYLON.Scene.FOGMODE_EXP2 && rho > 0) d = 1.7 / rho;
            else if (scene.fogMode === BABYLON.Scene.FOGMODE_EXP && rho > 0) d = 2.8 / rho;
            else if (scene.fogMode === BABYLON.Scene.FOGMODE_LINEAR) d = scene.fogEnd;
        }
        return Math.max(1500, Math.min(far, d)) + 300;   // + запас на размер дерева
    }

    // [x, y, r] отсечения: камера и дальность видимости; нет камеры — без отсечения.
    _cullCenter() {
        const cam = this.view && this.view.camera;
        if (!cam) return [0, 0, Infinity];
        return [cam.position.x, cam.position.z, this._visibleRadius()];
    }

    // Отсечение по расстоянию: в буфер инстансов — только объекты не дальше r от точки (x, y).
    _cullBatch(batch, x, y, r) {
        if (!batch.parts || !batch.n) return;
        const n = batch.n, pos = batch.pos, r2 = r * r, parts = batch.parts;
        let k = 0;
        for (let i = 0; i < n; i++) {
            const dx = pos[i * 2] - x, dy = pos[i * 2 + 1] - y;
            if (dx * dx + dy * dy > r2) continue;
            for (const part of parts) Location3D.copy16(part.out, k * 16, part.full, i * 16);
            k++;
        }
        batch.visible = k;
        batch.cull = { x, y, r };
        for (const part of parts) {
            const mesh = part.mesh;
            mesh.thinInstanceCount = k;
            mesh.setEnabled(k > 0);
            if (k > 0) {
                mesh.thinInstanceBufferUpdated('matrix');
                mesh.thinInstanceRefreshBoundingInfo(true);
            }
        }
    }

    // Отсечение для карты теней: в буфер теневого прокси (part.sh) — только инстансы, чья сфера задевает ортокадр солнца и его
    // диапазон глубины (те же оси и запас, что у View3D.shadowCasters: lightBasis, WORLD3D_SHADOW_CULL_PAD). Нет инстансов у
    // игрока — прокси выключен и draw call в карте теней не тратится. Основной меш в тени не участвует.
    _cullShadow(batch) {
        const view = this.view, at = view && view._lightAt, b = view && view._lightBasis;
        if (!batch.parts || !batch.n || !at || !b || !batch.parts.some(p => p.sh)) return;
        const pad = (view._shadowCullPad || 0) + Location3D.SHADOW_RECULL;   // + запас на кадр отставания: камера идёт после update
        const H = b.H + pad, D = b.D + pad;
        const n = batch.n, p3 = batch.pos3, rad = batch.rad, parts = batch.parts;
        const ax = at.x, ay = at.h, az = at.y;
        let k = 0;
        for (let i = 0; i < n; i++) {
            const r = rad[i];
            const vx = p3[i * 3] - ax, vy = p3[i * 3 + 1] - ay, vz = p3[i * 3 + 2] - az;
            if (Math.abs(vx * b.rx + vz * b.rz) > H + r) continue;
            if (Math.abs(vx * b.ux + vy * b.uy + vz * b.uz) > H + r) continue;
            if (Math.abs(vx * b.dx + vy * b.dy + vz * b.dz) > D + r) continue;
            for (const part of parts) if (part.sh) Location3D.copy16(part.sh.out, k * 16, part.full, i * 16);
            k++;
        }
        batch.shVisible = k;
        batch.shCull = { x: ax, z: az, h: ay, H: b.H };
        for (const part of parts) {
            const sh = part.sh;
            if (!sh) continue;
            sh.mesh.thinInstanceCount = k;
            sh.mesh.setEnabled(k > 0);
            if (k > 0) {
                sh.mesh.thinInstanceBufferUpdated('matrix');
                sh.mesh.thinInstanceRefreshBoundingInfo(true);
            }
        }
    }

    // Каждый кадр: камера сдвинулась больше 5% дальности (или дальность изменилась — туман) — пачки отсекаются заново;
    // кадр теней сдвинулся больше Location3D.SHADOW_RECULL (или сменился размер) — заново набираются инстансы теневых прокси.
    _cullBatches() {
        if (!this.view) return;
        const [x, y, r] = this._cullCenter();
        const at = this.view._lightAt, lb = this.view._lightBasis;
        for (const b of this._batches.values()) {
            const c = b.cull;
            if (!c || Math.hypot(x - c.x, y - c.y) > 0.05 * r || Math.abs(r - c.r) > 0.05 * r) this._cullBatch(b, x, y, r);
            const s = b.shCull;
            if (at && lb && (!s || Math.hypot(at.x - s.x, at.y - s.z) > Location3D.SHADOW_RECULL * 0.5 || Math.abs(at.h - s.h) > 120 || s.H !== lb.H)) this._cullShadow(b);
        }
    }

    // Что собрано батчингом: пачек (моделей), мешей и инстансов — для замеров draw calls.
    // visible — инстансов в основном буфере (в дальности видимости), shadow — в буферах теней (у игрока).
    batchStats() {
        let instances = 0, meshes = 0, visible = 0, shadow = 0;
        for (const b of this._batches.values()) {
            instances += b.recs.filter(r => !r.dead && !r.error).length;
            meshes += b.parts ? b.parts.length : 0;
            visible += b.visible || 0;
            shadow += b.shVisible || 0;
        }
        return { batches: this._batches.size, meshes, instances, visible, shadow };
    }

    // Снять пачку: меши и материалы прототипа (как Model3D.dispose у одиночного объекта).
    _disposeBatch(batch) {
        this._batches.delete(batch.key);
        this._dirtyBatches.delete(batch);
        if (!batch.parts || !this.view) return;
        for (const { mesh, sh } of batch.parts) {
            const mats = new Set();
            if (mesh.material) { mats.add(mesh.material); for (const sm of mesh.material.subMaterials || []) if (sm) mats.add(sm); }
            if (sh) { this.view.removeShadowCaster(sh.mesh); sh.mesh.dispose(false, false); }   // вершины общие с мешем: уйдут вместе с ним
            World3D.removeObject(this.view, mesh);
            for (const m of mats) m.dispose(false, false);
        }
        batch.parts = null;
    }

    // Маркеры карты для логики игры: записи с kind 'marker' и именем name или
    // name-2, name-3… (так их нумерует редактор). Без имени — все маркеры.
    // Запись: { name, x, y, h, rot: [x, курс, z], scale } — поля карты как есть.
    /** @param {string} [name] @returns {LocationObjectDef[]} */
    markers(name) {
        const all = this.map.objects.filter(d => d.kind === 'marker');
        if (!name) return all;
        return all.filter(d => d.name === name || String(d.name).startsWith(name + '-'));
    }

    /** @param {string} name @returns {LocationObjectDef | null} */
    marker(name) {
        return this.markers(name)[0] || null;
    }

    // Кадр анимации объектов — до World3D.renderFrame().
    update(dt) {
        dt = Math.min(0.1, Math.max(0, dt || 0));
        if (this.terrain) this.terrain.update(dt);   // время воды
        for (const rec of this.objects) this.spinPart(rec, dt);
        if (this._dirtyBatches.size) this._flushBatches();
        if (this._batches.size) this._cullBatches();
    }

    // def.anim = { part, axis, speed, dir }: часть модели (объект FBX) вращается вокруг
    // своего центра (origin из Blender) по своей оси axis — 'x' | 'y' | 'z', с минусом —
    // обратный конец; speed — об/мин; dir — 'cw' | 'ccw', по/против часовой, если
    // смотреть с конца оси. Сняли анимацию или сменили часть — прежняя встаёт на место.
    /** @param {LocationObject} rec @param {number} dt */
    spinPart(rec, dt) {
        const a = rec.def.anim;
        const name = a && rec.mesh ? String(a.part || '') : '';
        let s = rec.spin;
        if (s && (s.name !== name || s.root !== rec.mesh)) {
            if (s.mesh && !s.mesh.isDisposed()) {
                s.mesh.rotationQuaternion = null;
                s.mesh.setPivotPoint(BABYLON.Vector3.Zero());
            }
            s = rec.spin = null;
        }
        if (!name) return;
        if (!s) {
            const mesh = rec.mesh.getChildMeshes(true).find(m => m.metadata && m.metadata.part === name) || null;
            s = rec.spin = { name, root: rec.mesh, mesh, angle: 0, axis: new BABYLON.Vector3(), q: new BABYLON.Quaternion() };
            if (mesh) mesh.setPivotPoint(BABYLON.Vector3.FromArray(mesh.metadata.pivot));
        }
        if (!s.mesh) return;
        const axis = String(a.axis || 'y'), dirs = s.mesh.metadata.axes;
        const v = dirs[axis.slice(-1)] || dirs.y, sign = axis[0] === '-' ? -1 : 1;
        s.axis.set(v[0] * sign, v[1] * sign, v[2] * sign);
        // Сцена правосторонняя: положительный угол — против часовой с конца оси.
        const turn = Math.max(0, Number(a.speed) || 0) * Math.PI / 30 * (a.dir === 'ccw' ? 1 : -1);
        s.angle = (s.angle + turn * dt) % (2 * Math.PI);
        BABYLON.Quaternion.RotationAxisToRef(s.axis, s.angle, s.q);
        s.mesh.rotationQuaternion = s.q;
    }

    // Снять объект со сцены и из карты.
    /** @param {LocationObject} rec */
    removeObject(rec) {
        const i = this.map ? this.map.objects.indexOf(rec.def) : -1;
        if (i >= 0) this.map.objects.splice(i, 1);
        this._drop(rec);
    }

    /** @param {LocationObject} rec */
    _drop(rec) {
        const i = this.objects.indexOf(rec);
        if (i >= 0) this.objects.splice(i, 1);
        if (rec.batch) {
            const batch = rec.batch;
            rec.dead = true;
            rec.batch = null;
            if (!batch.recs.some(r => !r.dead)) this._disposeBatch(batch);
            else this._dirtyBatches.add(batch);
            return;
        }
        if (rec.mesh && this.view) {
            if (rec.def.kind === 'marker') rec.mesh.dispose(false, true);
            else Model3D.dispose(this.view, rec.mesh);
        }
        rec.mesh = null;
        if (rec.def.kind === 'marker' && !this._placingAll) this.markerEdited(rec.def);
    }

    // Текстура земли по map.ground. Пути — ЛИТЕРАЛАМИ в GROUNDS: сканер
    // сборщика (tools/asset-scan.mjs) находит ассеты только так. Нет файла —
    // земля остаётся ровного цвета, сцена не падает.
    loadGround() {
        const list = Location3D.GROUNDS;
        const n = Number(this.map && this.map.ground) || 0;
        const idx = Math.max(0, Math.min(list.length - 1, Math.round(n) || 0));
        if (idx === this._groundIndex && this._groundImage) return Promise.resolve(this._groundImage);
        this._groundIndex = idx;
        const url = (this.opts.assetBase || '') + list[idx];
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                if (this._groundIndex === idx) {
                    this._groundImage = img;
                    if (this.terrain) this.terrain.setGroundImage(img);
                }
                resolve(img);
            };
            img.onerror = () => {
                console.warn('Location3D: не загрузилась текстура земли ' + url);
                resolve(null);
            };
            img.src = url;
        });
    }

    applyRenderConstants() {
        World3D.applyRenderConstants(this.view);
    }

    dispose() {
        this.objects = [];   // меши и материалы умирают со сценой
        if (this.terrain) this.terrain.dispose();
        this.terrain = null;
        if (this.view) this.view.dispose();
        this.view = null;
    }

    // Новая пустая карта (редактор — «Новая карта»; игра без Maps.js).
    /** @param {string} id @param {string} [name] @returns {GameMap} */
    static newMap(id, name) {
        return { id, name: name || id, width: 2048, height: 2048, ground: 0,
            terrain: { amp: 40, scale: 800, seed: 1, base: 0 }, objects: [] };
    }

    // Глубокая копия карты: игра правит её, GAME_MAPS остаётся как в файле.
    /** @param {GameMap} map @returns {GameMap} */
    static copyMap(map) {
        return JSON.parse(JSON.stringify(map));
    }

    // Булавка маркера (редактор): шест, шар и стрелка курса вдоль +X. Без света
    // и теней — toon не квантует, тень не падает; в карту теней не ставится.
    static markerMesh(scene, name) {
        const B = BABYLON.MeshBuilder;
        const pole = B.CreateCylinder('pole', { height: 70, diameter: 5, tessellation: 8 }, scene);
        pole.position.y = 35;
        const head = B.CreateSphere('head', { diameter: 22, segments: 8 }, scene);
        head.position.y = 76;
        const arrow = B.CreateCylinder('arrow', { height: 34, diameterTop: 0, diameterBottom: 14, tessellation: 3 }, scene);
        arrow.rotation.z = -Math.PI / 2;
        arrow.position.set(20, 3, 0);
        const ring = B.CreateTorus('ring', { diameter: 40, thickness: 3, tessellation: 24 }, scene);
        ring.position.y = 1;
        const mesh = BABYLON.Mesh.MergeMeshes([pole, head, arrow, ring], true, true);
        mesh.name = 'marker:' + name;
        const mat = new BABYLON.StandardMaterial('marker-mat:' + name, scene);
        mat.disableLighting = true;
        mat.emissiveColor = World3D.hexColor3(Location3D.markerColor(name));
        mat.diffuseColor = BABYLON.Color3.Black();
        mat.specularColor = BABYLON.Color3.Black();
        mat.metadata = { toon: false };
        mesh.material = mat;
        mesh.renderingGroupId = World3D.LAYER.ACTOR;
        return mesh;
    }

    // Копия матрицы 4×4 (16 чисел) между буферами инстансов — без временных subarray: отсечение идёт почти каждый кадр.
    /** @param {Float32Array} dst @param {number} di @param {Float32Array} src @param {number} si */
    static copy16(dst, di, src, si) {
        for (let j = 0; j < 16; j++) dst[di + j] = src[si + j];
    }

    // Часть модели с несколькими простыми цветными материалами -> один submesh с вершинными цветами: один draw call на
    // деталь вместо draw call на материал, и в основном проходе, и в карте теней. Картинка та же: цвет материала уходит в
    // вершины, у нового материала diffuseColor белый (свет × цвет вершины × цвет материала). Условия: все материалы —
    // StandardMaterial без текстур, прозрачности и собственного свечения, с одинаковыми backFaceCulling и бликом, а вершина
    // не делится материалами разного цвета (иначе меш остаётся как был). true — склеено.
    // opts.live: прежние материалы остаются «держателями цвета» — присваивание m.diffuseColor = цвет (так красит наездника
    // RiderView.setLook) перекрашивает вершины части на месте; изменение цвета ПО МЕСТУ (m.diffuseColor.r = …, copyFrom)
    // не видно. Без live цвета запечены насовсем, прежние материалы удаляются.
    /** @param {any} mesh @param {{ live?: boolean }} [opts] @returns {boolean} */
    static mergeColors(mesh, opts) {
        const live = !!(opts && opts.live);
        const mm = mesh && mesh.material, subs = mm && mm.subMaterials;
        if (!subs || subs.length < 2 || !mesh.subMeshes || mesh.subMeshes.length < 2) return false;
        const first = subs[0];
        for (const m of subs) {
            if (!m || !(m instanceof BABYLON.StandardMaterial) || m.diffuseTexture || m.emissiveTexture || m.opacityTexture || m.bumpTexture ||
                m.reflectionTexture || m.alpha < 1 || m.disableLighting || m.backFaceCulling !== first.backFaceCulling ||
                !m.emissiveColor.equals(first.emissiveColor) || !m.specularColor.equals(first.specularColor) || m.specularPower !== first.specularPower) return false;
        }
        const idx = mesh.getIndices(), nv = mesh.getTotalVertices();
        if (!idx || !nv) return false;
        const old = mesh.getVerticesData(BABYLON.VertexBuffer.ColorKind);
        const stride = old ? Math.round(old.length / nv) : 0;
        const col = new Float32Array(nv * 4).fill(1), owner = new Int16Array(nv).fill(-1);
        if (old) for (let v = 0; v < nv; v++) for (let k = 0; k < 4; k++) col[v * 4 + k] = k < stride ? old[v * stride + k] : 1;
        const base = old ? col.slice() : null;
        const paint = (v, c) => {
            col[v * 4] = c.r * (base ? base[v * 4] : 1);
            col[v * 4 + 1] = c.g * (base ? base[v * 4 + 1] : 1);
            col[v * 4 + 2] = c.b * (base ? base[v * 4 + 2] : 1);
        };
        for (const sm of mesh.subMeshes) {
            const c = subs[sm.materialIndex].diffuseColor;
            for (let k = sm.indexStart, e = sm.indexStart + sm.indexCount; k < e; k++) {
                const v = idx[k], o = owner[v];
                if (o === sm.materialIndex) continue;
                if (o >= 0 && !subs[o].diffuseColor.equals(c)) return false;   // вершину делят материалы разного цвета
                owner[v] = sm.materialIndex;
                paint(v, c);
            }
        }
        const scene = mesh.getScene();
        const mat = new BABYLON.StandardMaterial(mesh.name + '/merged', scene);
        mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        mat.specularColor = first.specularColor.clone();
        mat.specularPower = first.specularPower;
        mat.emissiveColor = first.emissiveColor.clone();
        mat.backFaceCulling = first.backFaceCulling;
        if (first.metadata) mat.metadata = Object.assign({}, first.metadata);
        mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, col, live, 4);
        mesh.releaseSubMeshes();
        mesh.material = mat;
        new BABYLON.SubMesh(0, 0, nv, 0, idx.length, mesh);
        if (live) {
            const ids = subs.map(() => /** @type {number[]} */ ([]));
            for (let v = 0; v < nv; v++) if (owner[v] >= 0) ids[owner[v]].push(v);
            subs.forEach((sm, mi) => {
                let cur = sm.diffuseColor;
                Object.defineProperty(sm, 'diffuseColor', {
                    configurable: true, enumerable: true,
                    get: () => cur,
                    set: (c) => {
                        cur = c;
                        for (const v of ids[mi]) paint(v, c);
                        mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, col);
                    }
                });
            });
        } else {
            for (const m of subs) m.dispose(false, false);
        }
        mm.dispose(false, false);
        return true;
    }

    // Цвет булавки — по имени без номера: у всех spawn-N один цвет.
    static markerColor(name) {
        const stem = String(name || '').replace(/-\d+$/, '');
        let h = 0;
        for (let i = 0; i < stem.length; i++) h = (h * 31 + stem.charCodeAt(i)) >>> 0;
        return Location3D.MARKER_COLORS[h % Location3D.MARKER_COLORS.length];
    }
}

// Текстуры земли по map.ground: 0 — трава, 1 — песок, 2 — снег.
Location3D.GROUNDS = [
    'assets/ground_texture_g.jpg',
    'assets/ground_texture_d.jpg',
    'assets/ground_texture_s.jpg'
];

// Папка декора для батчинга (opts.batchDecor): префикс пути модели. Собран из кусков — сканер
// сборщика видит ссылкой любой литерал пути ассета, а папка может ещё не существовать.
Location3D.DECOR_PREFIX = 'assets/' + 'models/nature/';

// Папки города и пропсов: в пачку идут модели, которые стоят на карте не меньше BATCH_MIN раз (скамейки, фонари,
// фонтаны, ледяные шипы, лавовые камни, руины) — одиночные ориентиры остаются отдельными мешами.
Location3D.BATCH_REPEATED = ['assets/' + 'models/town/', 'assets/' + 'models/props/'];
Location3D.BATCH_MIN = 2;

// Теневой прокси пачки (см. _buildBatch): маска слоя, которой нет у камеры мира, и сдвиг кадра теней (px), после которого
// прокси набирает инстансы заново (запас в отсечении — вдвое больше сдвига).
Location3D.SHADOW_LAYER = 0x10000000;
Location3D.SHADOW_RECULL = 64;

// ms: дольше карта «готовой» не ждёт (шейдеры, текстуры) — игра стартует и так.
Location3D.READY_TIMEOUT = 15000;

// Цвета булавок маркеров в редакторе.
Location3D.MARKER_COLORS = [0xffb020, 0x35d0ff, 0xff5a8a, 0x7cff6b, 0xb58cff, 0xffef5a];
