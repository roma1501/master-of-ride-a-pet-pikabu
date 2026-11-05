// PetModels.js — реестр файлов моделей, метаданных и иконок питомцев и пропсов.
// Пути ассетов — только строковыми литералами вида assets/… в кавычках (сканер сборщика видит лишь их) и только к
// существующим файлам. Реестр заполнен интеграцией (30 питомцев из tools/blender/pets, пропсы из tools/blender/props);
// питомец без записи рисуется запасной фигурой из примитивов (PetView.js) с процедурной иконкой.
//
//   PET_MODEL_FILES  = { snail: { model: 'путь .glb', meta: 'путь .json', icon: 'путь .webp' }, … }
//   PROP_MODEL_FILES = { stall_sell: { model: 'путь .glb', meta: 'путь .json' }, … }
//
// Метаданные питомца (JSON): { gait, ability, height, length, width, seat: [x, y, z], trail: [x, y, z],
//   head: [x, y, z], parts: [...] } — точки в координатах модели (x вперёд, y вверх, px).
// Метаданные пропса: { size, colliders: [{ type: 'circle', x, z, r } | { type: 'box', x, z, hx, hz, rot }],
//   notes, bounds } — коллайдеры в локальных координатах модели (x вперёд, z вбок, px).

/** @type {Record<string, { model: string, meta?: string, icon?: string }>} */
const PET_MODEL_FILES = {
    snail: { model: 'assets/models/pets/snail.glb', meta: 'assets/models/pets/snail.json', icon: 'assets/ui/pets/snail.webp' },
    turtle: { model: 'assets/models/pets/turtle.glb', meta: 'assets/models/pets/turtle.json', icon: 'assets/ui/pets/turtle.webp' },
    sloth: { model: 'assets/models/pets/sloth.glb', meta: 'assets/models/pets/sloth.json', icon: 'assets/ui/pets/sloth.webp' },
    axolotl: { model: 'assets/models/pets/axolotl.glb', meta: 'assets/models/pets/axolotl.json', icon: 'assets/ui/pets/axolotl.webp' },
    koala: { model: 'assets/models/pets/koala.glb', meta: 'assets/models/pets/koala.json', icon: 'assets/ui/pets/koala.webp' },
    capybara: { model: 'assets/models/pets/capybara.glb', meta: 'assets/models/pets/capybara.json', icon: 'assets/ui/pets/capybara.webp' },
    chicken: { model: 'assets/models/pets/chicken.glb', meta: 'assets/models/pets/chicken.json', icon: 'assets/ui/pets/chicken.webp' },
    pig: { model: 'assets/models/pets/pig.glb', meta: 'assets/models/pets/pig.json', icon: 'assets/ui/pets/pig.webp' },
    elephant: { model: 'assets/models/pets/elephant.glb', meta: 'assets/models/pets/elephant.json', icon: 'assets/ui/pets/elephant.webp' },
    panda: { model: 'assets/models/pets/panda.glb', meta: 'assets/models/pets/panda.json', icon: 'assets/ui/pets/panda.webp' },
    kangaroo: { model: 'assets/models/pets/kangaroo.glb', meta: 'assets/models/pets/kangaroo.json', icon: 'assets/ui/pets/kangaroo.webp' },
    deer: { model: 'assets/models/pets/deer.glb', meta: 'assets/models/pets/deer.json', icon: 'assets/ui/pets/deer.webp' },
    spider: { model: 'assets/models/pets/spider.glb', meta: 'assets/models/pets/spider.json', icon: 'assets/ui/pets/spider.webp' },
    crocodile: { model: 'assets/models/pets/crocodile.glb', meta: 'assets/models/pets/crocodile.json', icon: 'assets/ui/pets/crocodile.webp' },
    gorilla: { model: 'assets/models/pets/gorilla.glb', meta: 'assets/models/pets/gorilla.json', icon: 'assets/ui/pets/gorilla.webp' },
    snake: { model: 'assets/models/pets/snake.glb', meta: 'assets/models/pets/snake.json', icon: 'assets/ui/pets/snake.webp' },
    horse: { model: 'assets/models/pets/horse.glb', meta: 'assets/models/pets/horse.json', icon: 'assets/ui/pets/horse.webp' },
    wolf: { model: 'assets/models/pets/wolf.glb', meta: 'assets/models/pets/wolf.json', icon: 'assets/ui/pets/wolf.webp' },
    shark: { model: 'assets/models/pets/shark.glb', meta: 'assets/models/pets/shark.json', icon: 'assets/ui/pets/shark.webp' },
    lion: { model: 'assets/models/pets/lion.glb', meta: 'assets/models/pets/lion.json', icon: 'assets/ui/pets/lion.webp' },
    ostrich: { model: 'assets/models/pets/ostrich.glb', meta: 'assets/models/pets/ostrich.json', icon: 'assets/ui/pets/ostrich.webp' },
    fox: { model: 'assets/models/pets/fox.glb', meta: 'assets/models/pets/fox.json', icon: 'assets/ui/pets/fox.webp' },
    giraffe: { model: 'assets/models/pets/giraffe.glb', meta: 'assets/models/pets/giraffe.json', icon: 'assets/ui/pets/giraffe.webp' },
    cheetah: { model: 'assets/models/pets/cheetah.glb', meta: 'assets/models/pets/cheetah.json', icon: 'assets/ui/pets/cheetah.webp' },
    unicorn: { model: 'assets/models/pets/unicorn.glb', meta: 'assets/models/pets/unicorn.json', icon: 'assets/ui/pets/unicorn.webp' },
    trex: { model: 'assets/models/pets/trex.glb', meta: 'assets/models/pets/trex.json', icon: 'assets/ui/pets/trex.webp' },
    phoenix: { model: 'assets/models/pets/phoenix.glb', meta: 'assets/models/pets/phoenix.json', icon: 'assets/ui/pets/phoenix.webp' },
    cerberus: { model: 'assets/models/pets/cerberus.glb', meta: 'assets/models/pets/cerberus.json', icon: 'assets/ui/pets/cerberus.webp' },
    kitsune: { model: 'assets/models/pets/kitsune.glb', meta: 'assets/models/pets/kitsune.json', icon: 'assets/ui/pets/kitsune.webp' },
    dragon: { model: 'assets/models/pets/dragon.glb', meta: 'assets/models/pets/dragon.json', icon: 'assets/ui/pets/dragon.webp' },
};

/** @type {Record<string, { model: string, meta?: string }>} */
const PROP_MODEL_FILES = {
    bone_pile: { model: 'assets/models/props/bone_pile.glb', meta: 'assets/models/props/bone_pile.json' },
    cave_entrance: { model: 'assets/models/props/cave_entrance.glb', meta: 'assets/models/props/cave_entrance.json' },
    crystal_cluster: { model: 'assets/models/props/crystal_cluster.glb', meta: 'assets/models/props/crystal_cluster.json' },
    fence_post: { model: 'assets/models/props/fence_post.glb', meta: 'assets/models/props/fence_post.json' },
    fence_post_stone: { model: 'assets/models/props/fence_post_stone.glb', meta: 'assets/models/props/fence_post_stone.json' },
    fence_post_white: { model: 'assets/models/props/fence_post_white.glb', meta: 'assets/models/props/fence_post_white.json' },
    fence_rail: { model: 'assets/models/props/fence_rail.glb', meta: 'assets/models/props/fence_rail.json' },
    fence_rail_stone: { model: 'assets/models/props/fence_rail_stone.glb', meta: 'assets/models/props/fence_rail_stone.json' },
    fence_rail_white: { model: 'assets/models/props/fence_rail_white.glb', meta: 'assets/models/props/fence_rail_white.json' },
    giant_tree: { model: 'assets/models/props/giant_tree.glb', meta: 'assets/models/props/giant_tree.json' },
    hub_statue: { model: 'assets/models/props/hub_statue.glb', meta: 'assets/models/props/hub_statue.json' },
    ice_spike: { model: 'assets/models/props/ice_spike.glb', meta: 'assets/models/props/ice_spike.json' },
    lava_rock: { model: 'assets/models/props/lava_rock.glb', meta: 'assets/models/props/lava_rock.json' },
    nest: { model: 'assets/models/props/nest.glb', meta: 'assets/models/props/nest.json' },
    pyramid: { model: 'assets/models/props/pyramid.glb', meta: 'assets/models/props/pyramid.json' },
    pyramid_ruin_blocks: { model: 'assets/models/props/pyramid_ruin_blocks.glb', meta: 'assets/models/props/pyramid_ruin_blocks.json' },
    pyramid_ruin_broken: { model: 'assets/models/props/pyramid_ruin_broken.glb', meta: 'assets/models/props/pyramid_ruin_broken.json' },
    pyramid_ruin_obelisk: { model: 'assets/models/props/pyramid_ruin_obelisk.glb', meta: 'assets/models/props/pyramid_ruin_obelisk.json' },
    pyramid_ruin_pillar: { model: 'assets/models/props/pyramid_ruin_pillar.glb', meta: 'assets/models/props/pyramid_ruin_pillar.json' },
    ranch_gate: { model: 'assets/models/props/ranch_gate.glb', meta: 'assets/models/props/ranch_gate.json' },
    ranch_sign: { model: 'assets/models/props/ranch_sign.glb', meta: 'assets/models/props/ranch_sign.json' },
    signpost: { model: 'assets/models/props/signpost.glb', meta: 'assets/models/props/signpost.json' },
    stall_food: { model: 'assets/models/props/stall_food.glb', meta: 'assets/models/props/stall_food.json' },
    stall_gears: { model: 'assets/models/props/stall_gears.glb', meta: 'assets/models/props/stall_gears.json' },
    stall_sell: { model: 'assets/models/props/stall_sell.glb', meta: 'assets/models/props/stall_sell.json' },
    stall_track: { model: 'assets/models/props/stall_track.glb', meta: 'assets/models/props/stall_track.json' },
    upgrade_board: { model: 'assets/models/props/upgrade_board.glb', meta: 'assets/models/props/upgrade_board.json' },
    volcano_crater: { model: 'assets/models/props/volcano_crater.glb', meta: 'assets/models/props/volcano_crater.json' },
    waterfall_cliff: { model: 'assets/models/props/waterfall_cliff.glb', meta: 'assets/models/props/waterfall_cliff.json' },
};

/** @satisfies {Record<string, any>} */
const PetModels = {
    /** @type {Map<string, Promise<any>>} */
    _meta: new Map(),

    /** Есть ли у питомца модель в реестре. */
    has(species) { return !!(PET_MODEL_FILES[species] && PET_MODEL_FILES[species].model); },
    /** Запись реестра питомца или null. */
    pet(species) { return PET_MODEL_FILES[species] || null; },
    /** Путь иконки питомца (webp) или null — тогда UI рисует процедурную (GameUI.petIcon). */
    icon(species) { return (PET_MODEL_FILES[species] && PET_MODEL_FILES[species].icon) || null; },
    /** Запись реестра пропса по id или по пути модели. */
    prop(idOrModel) {
        if (PROP_MODEL_FILES[idOrModel]) return PROP_MODEL_FILES[idOrModel];
        for (const k of Object.keys(PROP_MODEL_FILES)) if (PROP_MODEL_FILES[k].model === idOrModel) return PROP_MODEL_FILES[k];
        return null;
    },

    /**
     * JSON метаданных по пути (кэш; ошибка или нет файла — null, игра не падает).
     * @param {string} url
     * @returns {Promise<any>}
     */
    loadMeta(url) {
        if (!url) return Promise.resolve(null);
        let p = this._meta.get(url);
        if (!p) {
            p = fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
            this._meta.set(url, p);
        }
        return p;
    },
    /** Метаданные питомца. */
    petMeta(species) { const f = PET_MODEL_FILES[species]; return f && f.meta ? this.loadMeta(f.meta) : Promise.resolve(null); },
    /** Метаданные пропса (id или путь модели). */
    propMeta(idOrModel) { const f = this.prop(idOrModel); return f && f.meta ? this.loadMeta(f.meta) : Promise.resolve(null); },
};
