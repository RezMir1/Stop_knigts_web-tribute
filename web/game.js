"use strict";

const { atlases, levels: originalLevels } = globalThis.STOP_KNIGHTS_DATA;
const customLevels = loadCustomLevels(readProgress("custom-maps-v1"));
const levels = [...originalLevels, ...customLevels];
const knightWarnings = [
  { level: 3, wave: 4, card: "story1" },
  { level: 10, wave: 8, card: "story2" },
];
const levelOpeningCards = {
  1: "guide1", 2: "spirit", 3: "bat", 4: "dragon", 6: "bull",
  8: "boss", 9: "cyclops", 16: "bull_special", 18: "bat_special",
};
const tutorialCards = {
  guide1: ["tutorial_guide1", "Dracula guide: protect the crystal. Touch to continue."],
  guide2: ["tutorial_guide2", "Dracula guide: summon minions to stop the knights. Touch to continue."],
  story1: ["tutorial_story1", "Playtime is over! Now face our full force! Touch to continue."],
  story2: ["tutorial_story2", "We're bringing in the big boys now. You stand no chance! Touch to continue."],
  spirit: ["tutorial_spirit", "Spirit Bombs grant mana for a limited time and explode near enemies. Touch to continue."],
  bat: ["tutorial_bat", "Bat Bombers drop bombs from one floor above. Touch to continue."],
  dragon: ["tutorial_dragon", "Frostdragon slows enemies inside the castle. Touch to continue."],
  bull: ["tutorial_bull", "The Minotaur rolls over enemies and deals heavy damage. Touch to continue."],
  boss: ["tutorial_boss", "The Skeleboss is strong and durable, but slow. Touch to continue."],
  cyclops: ["tutorial_cyclops", "The Cyclops stays put and fires a long fiery laser. Touch to continue."],
  bull_special: ["bull_special_tutorial", "Only Minotaurs for this castle! Touch to continue."],
  bat_special: ["bat_special_tutorial", "Only Bats and Dragons for this! Touch to continue."],
};
const $ = (id) => document.getElementById(id);
const canvas = $("castle");
const ctx = canvas.getContext("2d");
const summonPreview = $("summon-preview");
const summonPreviewCtx = summonPreview.getContext("2d");
const manaVessel = $("mana-vessel");
const manaCtx = manaVessel.getContext("2d");
const tile = 20;
const view = { width: 480, height: 320 };
const images = {};
let campaignLoading;
let campaignReady = false;
let levelRequest = 0;
let loadingLevel = false;
let levelLoadError = "";
const clamp = (n, low, high) => Math.min(Math.max(n, low), high);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unitScale = .75;
const bullRollDistance = 48;
const crystalMaxHealth = 150;
const spiritLifetime = 19;
const spiritGlowTime = 16;
const spiritManaInterval = 2;
const baseManaPerSecond = 3;
const maxMana = 300;
const minotaurChallenge = { level: 16, startingMana: 300, incomingDamageMultiplier: .18 };
const dragonMouth = [[67, 34], [75, 38], [66, 37], [62, 36]];
const iceFlightTime = .26;
const draculaSpawnFps = 8;
const draculaAttackFps = 14;
const draculaRange = 46;
const draculaDamage = 24;
const draculaInterval = 3.2;

const defenders = {
  Skeleton: { icon: "skeleton", run: "skeleton_run", attack: "skeleton_attack", cost: 50, hp: 90, speed: 52, range: 30, damage: 18 },
  Spirit: { icon: "spirit", run: "spirit", cost: 50, hp: 45, speed: 22, hover: 12, range: 48, damage: 20 },
  Bat: { icon: "bat", run: "bat", cost: 50, hp: 65, speed: 0, hover: 20, range: 100, damage: 37 },
  Bull: { icon: "bull", run: "bull", cost: 100, hp: 125, speed: 90, range: 23, damage: 55 },
  FrostDragon: { icon: "dragon", run: "frost_dragon", cost: 75, hp: 105, speed: 0, hover: 18, range: 150, damage: 19 },
  Cyclops: { icon: "cyclops", run: "cyclops_walk1", attack: "cyclops_attack", cost: 250, hp: 165, speed: 0, range: 175, damage: 55 },
  SkeletonBoss: { icon: "boss", run: "skeletonBoss_idle", attack: "skeletonBoss_attack", cost: 150, hp: 380, speed: 25, range: 75, damage: 60 },
};
const hunters = {
  knight: { hp: 42, speed: 27, range: 26, damage: 9 },
  speedknight: { hp: 33, speed: 65, range: 26, damage: 9 },
  redknight: { hp: 94, speed: 33, range: 33, damage: 17 },
  whiteknight: { hp: 155, speed: 20, range: 38, damage: 24 },
  archer: { hp: 55, speed: 30, range: 110, damage: 13 },
};
const minionSlots = [...new Set(levels.flatMap((level) => level.minions))];
const defaultRules = {
  baseManaPerSecond, maxMana, crystalMaxHealth, spiritLifetime, spiritGlowTime,
  spiritManaInterval, spiritManaAmount: 5, draculaDamage, draculaRange, draculaInterval,
  iceFlightTime, iceSlowDuration: 2, iceSpeedMultiplier: .52,
  batRedMultiplier: 1.35, bullConfuseSeconds: .45, bullRollDistance,
  enemyAttackInterval: .9, crystalAttackInterval: 1,
  minionAttackInterval: .75, batAttackInterval: 1.4,
};
const defaultBalance = {
  version: 2,
  rules: defaultRules, defenders, hunters,
  levels: levels.map(defaultLevelBalance),
};

function defaultLevelBalance(map, index) {
  return {
    startingMana: index + 1 === minotaurChallenge.level ? minotaurChallenge.startingMana : 120,
    manaRate: null, manaLimit: null, crystalHealth: null,
    bullDamageMultiplier: index + 1 === minotaurChallenge.level ? minotaurChallenge.incomingDamageMultiplier : 1,
    minions: [...map.minions], startingMinions: {}, dracula: map.dracula,
    waves: map.waves.map((wave) => ({
      delay: wave.delay,
      groups: wave.events.flatMap((event) => {
        const groups = [];
        event.hunters.forEach((type, index) => {
          const last = groups.at(-1);
          if (last?.type === type) last.count++;
          else groups.push({ type, spawner: event.spawner, count: 1, offset: index * .6, spacing: .6 });
        });
        return groups;
      }),
    })),
  };
}
let balance = loadBalance(defaultBalance, readProgress("balance-v1"));
levels.forEach((map, index) => reconcileMapWaves(balance.levels[index], map));

function reconcileMapWaves(options, map) {
  const first = Object.keys(map.spawners)[0];
  for (const wave of options.waves) {
    for (const group of wave.groups) {
      if (!Object.hasOwn(map.spawners, group.spawner)) group.spawner = first;
    }
  }
}

function persistCustomLevels(updated, settings) {
  const previousSettings = settings && localStorage.getItem("stop-knights:balance-v1");
  if (settings) localStorage.setItem("stop-knights:balance-v1", JSON.stringify(settings));
  try {
    localStorage.setItem("stop-knights:custom-maps-v1", JSON.stringify(updated));
  } catch (error) {
    if (settings) {
      if (previousSettings === null) localStorage.removeItem("stop-knights:balance-v1");
      else localStorage.setItem("stop-knights:balance-v1", previousSettings);
    }
    throw error;
  }
}

function saveCustomLevel(index, map, settings) {
  const updated = customLevels.slice();
  updated[index] = map;
  persistCustomLevels(updated, settings);
  customLevels[index] = map;
  const levelIndex = originalLevels.length + index;
  levels[levelIndex] = map;
  defaultBalance.levels[levelIndex] = defaultLevelBalance(map, levelIndex);
  balance.levels[levelIndex] ??= structuredClone(defaultBalance.levels[levelIndex]);
  reconcileMapWaves(balance.levels[levelIndex], map);
  fillLevelSelect($("level"), levels);
  return levelIndex + 1;
}

function deleteCustomLevel(levelIndex) {
  const slot = levelIndex - originalLevels.length;
  if (slot < 0 || slot >= customLevels.length) throw new Error("Можно удалить только свою карту.");
  const updated = customLevels.filter((_, index) => index !== slot);
  const settings = { ...balance, levels: balance.levels.filter((_, index) => index !== levelIndex) };
  persistCustomLevels(updated, settings);
  customLevels.splice(slot, 1);
  levels.splice(levelIndex, 1);
  defaultBalance.levels.splice(levelIndex, 1);
  balance = settings;
  fillLevelSelect($("level"), levels);
  if (game.number === levelIndex + 1) init(Math.min(levelIndex + 1, levels.length));
  else {
    if (game.number > levelIndex + 1) game.number--;
    $("level").value = String(game.number);
    saveProgress("level", String(game.number));
  }
  return slot;
}
let game;
let selected = null;
let gesture = null;
let pointer = null;
let tutorialComplete = readProgress("tutorial-complete") === "1";

function readProgress(key) {
  try {
    return localStorage.getItem("stop-knights:" + key);
  } catch {
    return null;
  }
}

function saveProgress(key, value) {
  try {
    localStorage.setItem("stop-knights:" + key, value);
  } catch {
    // Some browsers disable storage for local files.
  }
}

function drawFrame(atlas, name, x, y, scale = 1, flip = false, anchor = "center", angle = 0) {
  const frame = atlases[atlas][name];
  if (!frame) return;
  const { width, height, originalHeight, offsetX, offsetY } = frame;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(flip ? -scale : scale, scale);
  const dy = anchor === "feet" ? -originalHeight / 2 : 0;
  ctx.drawImage(images[atlas], frame.x, frame.y, width, height,
    offsetX - width / 2, dy - offsetY - height / 2, width, height);
  ctx.restore();
}

function drawTiles(map) {
  const surface = document.createElement("canvas");
  surface.width = map.width * tile;
  surface.height = map.height * tile;
  const paint = surface.getContext("2d");
  const texture = images.castle_tiles;
  const columns = texture.width / tile;
  for (const layer of ["room", "interior", "curtain", "furniture", "stairs", "door", "wall"]) {
    map.layers[layer].forEach((gid, index) => {
      if (!gid) return;
      const id = (gid & 0x0fffffff) - 1;
      const x = (index % map.width) * tile;
      const y = Math.floor(index / map.width) * tile;
      paint.save();
      paint.translate(x + tile / 2, y + tile / 2);
      paint.scale(gid & 0x80000000 ? -1 : 1, gid & 0x40000000 ? -1 : 1);
      if (gid & 0x20000000) paint.transform(0, -1, -1, 0, 0, 0);
      paint.drawImage(texture, (id % columns) * tile, Math.floor(id / columns) * tile,
        tile, tile, -tile / 2, -tile / 2, tile, tile);
      paint.restore();
    });
  }
  return surface;
}

function findFloors(map) {
  const floors = [];
  const { room, balcony, door, stairs, crystal } = map.layers;
  const isDoor = (i) => door[i] >= 269 && door[i] <= 274;
  const walkable = (i) => room[i] || balcony[i] || crystal[i] ||
    isDoor(i) || (stairs[i] >= 85 && stairs[i] <= 104);
  for (let row = 0; row < map.height; row++) {
    const startIndex = row * map.width;
    const endIndex = startIndex + map.width;
    const hasFloor = room.slice(startIndex, endIndex).includes(106) ||
      balcony.slice(startIndex, endIndex).includes(106) ||
      door.slice(startIndex, endIndex).some((gid) => gid >= 269 && gid <= 274) ||
      crystal.slice(startIndex, endIndex).some((gid) => gid >= 109 && gid <= 112) ||
      stairs.slice(startIndex, endIndex).some((gid) => gid >= 85 && gid <= 104);
    if (!hasFloor) continue;
    for (let col = 0; col < map.width; col++) {
      if (!walkable(row * map.width + col)) continue;
      const start = col;
      while (col + 1 < map.width && walkable(row * map.width + col + 1)) col++;
      const floor = { left: start * tile, right: (col + 1) * tile, y: (row + 1) * tile, nodes: [], doors: [], rooms: [] };
      for (let c = start; c <= col; c++) {
        const index = row * map.width + c;
        if (!balcony[index]) {
          const last = floor.rooms.at(-1);
          if (last?.right === c * tile) last.right += tile;
          else floor.rooms.push({ left: c * tile, right: (c + 1) * tile });
        }
        const gid = door[index];
        if (gid === 269 || gid === 272) {
          floor.doors.push({ x: (c + 1.5) * tile, y: floor.y, floor, side: gid === 269 ? 1 : -1 });
        }
      }
      floors.push(floor);
    }
  }
  return floors;
}

function floorAt(floors, x, y) {
  return floors.find((floor) => floor.y === y && x >= floor.left && x < floor.right);
}

function findCrystals(map, floors, health) {
  return map.layers.crystal.flatMap((gid, i) => {
    if (gid !== 25) return [];
    const x = (i % map.width + 2) * tile;
    const y = (Math.floor(i / map.width) + 4) * tile;
    return [{ x, y, floor: floorAt(floors, x, y), hp: health }];
  });
}

function connectStairs(map, floors) {
  map.layers.stairs.forEach((gid, i) => {
    if (gid !== 1 && gid !== 17) return;
    // An isolated top tile can be decorative. A staircase has a matching foot.
    if (map.layers.stairs[i + 3 * map.width] !== gid + 84) return;
    const left = (i % map.width) * tile;
    const bottomY = (Math.floor(i / map.width) + 4) * tile;
    const bottomX = left + (gid === 1 ? 10 : 70);
    const topX = left + (gid === 1 ? 70 : 10);
    const bottom = floorAt(floors, bottomX, bottomY);
    const top = floorAt(floors, topX, bottomY - 5 * tile);
    if (!top || !bottom) return;
    const foot = { x: bottomX, y: bottom.y, floor: bottom };
    const head = { x: topX, y: top.y, floor: top };
    foot.stair = head;
    head.stair = foot;
    bottom.nodes.push(foot);
    top.nodes.push(head);
  });
}

function connectIsolatedFloors(floors, crystals) {
  const components = new Map();
  function mark(floor, id) {
    if (components.has(floor)) return;
    components.set(floor, id);
    for (const node of floor.nodes) mark(node.stair.floor, id);
  }
  floors.forEach(mark);
  const crossings = [];
  // Some original floors only have a balcony entrance and no internal stairs.
  // Join disconnected sections through the closest overlapping floors.
  const links = [];
  for (const top of floors) {
    for (const bottom of floors) {
      if (bottom.y <= top.y) continue;
      const left = Math.max(top.left, bottom.left) + 12;
      const right = Math.min(top.right, bottom.right) - 12;
      if (left > right) continue;
      const x = [left, right, (left + right) / 2].reduce((best, candidate) => {
        const clearance = (position) => crystals.reduce((score, crystal) =>
          crystal.floor === top || crystal.floor === bottom
            ? Math.min(score, Math.abs(crystal.x - position)) : score, 80);
        return clearance(candidate) > clearance(best) ? candidate : best;
      });
      links.push({ top, bottom, x });
    }
  }
  links.sort((a, b) => (a.bottom.y - a.top.y) - (b.bottom.y - b.top.y));
  for (const { top, bottom, x, endX = x } of [
    ...links,
    ...floors.flatMap((left) => floors.filter((right) =>
      left.y === right.y && left.right <= right.left).map((right) => ({
      top: left, bottom: right, x: left.right - 8, endX: right.left + 8,
    }))).sort((a, b) => (a.endX - a.x) - (b.endX - b.x)),
  ]) {
    const from = components.get(bottom);
    const to = components.get(top);
    if (from === to) continue;
    const foot = { x: endX, y: bottom.y, floor: bottom };
    const head = { x, y: top.y, floor: top };
    foot.stair = head;
    head.stair = foot;
    bottom.nodes.push(foot);
    top.nodes.push(head);
    crossings.push({ x, endX, top: top.y, bottom: bottom.y });
    for (const [floor, id] of components) if (id === from) components.set(floor, to);
  }
  return crossings;
}

function floorNear(point) {
  let best = null;
  let cost = Infinity;
  for (const floor of game.floors) {
    const x = clamp(point.x, floor.left + 5, floor.right - 5);
    const height = floor.y - point.y;
    const score = Math.abs(height - 30) * 1.6 + Math.abs(x - point.x)
      + (height < -6 ? 80 : 0);
    if (score >= cost) continue;
    best = { x, y: floor.y, floor };
    cost = score;
  }
  return best;
}

function findRoute(unit) {
  const destinations = game.crystals.filter((crystal) => crystal.hp > 0);
  const start = { x: unit.x, y: unit.y, floor: unit.floor };
  const scores = new Map([[start, 0]]);
  const previous = new Map();
  const pending = new Set([start]);
  while (pending.size) {
    const node = [...pending].reduce((best, item) => scores.get(item) < scores.get(best) ? item : best);
    pending.delete(node);
    if (destinations.includes(node)) {
      const steps = [];
      for (let step = node; step !== start; step = previous.get(step)) steps.unshift(step);
      return { target: node, steps };
    }
    const neighbors = [...node.floor.nodes, ...destinations.filter((target) => target.floor === node.floor)];
    if (node.stair) neighbors.push(node.stair);
    for (const next of neighbors) {
      const score = scores.get(node) + distance(node, next);
      if (score >= (scores.get(next) ?? Infinity)) continue;
      scores.set(next, score);
      previous.set(next, node);
      pending.add(next);
    }
  }
  return null;
}

function findEntrance(source) {
  const side = source.x < game.surface.width / 2 ? 1 : -1;
  const edge = side === 1 ? 0 : game.surface.width;
  const doors = game.floors.flatMap((floor) => floor.doors);
  if (source.doorX !== undefined) {
    return doors.find((door) => door.x === source.doorX && door.y === source.doorY);
  }
  const facingDoors = doors.filter((door) => door.side === side);
  const entrances = facingDoors.length ? facingDoors : doors;
  const height = game.surface.height - source.y + 60;
  if (source.type === "ground") {
    return [...doors].sort((a, b) => b.y - a.y ||
      Number(b.side === side) - Number(a.side === side) ||
      Math.abs(a.x - edge) - Math.abs(b.x - edge))[0];
  }
  return entrances.reduce((best, door) =>
    Math.abs(door.y - height) < Math.abs(best.y - height) ? door : best);
}

function loadImage(name, filename) {
  const image = new Image();
  image.src = "assets/" + filename;
  return image.decode().then(() => [name, image]);
}

function loadCampaignMaps() {
  const cached = globalThis.STOP_KNIGHTS_CAMPAIGN_MAPS;
  if (cached?.length === originalLevels.length - 1) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "assets/campaign-maps.js";
    script.onload = () => {
      script.remove();
      const maps = globalThis.STOP_KNIGHTS_CAMPAIGN_MAPS;
      if (maps?.length === originalLevels.length - 1) resolve(maps);
      else reject(new Error("Файл остальных карт неполный."));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Не удалось загрузить карты кампании."));
    };
    document.head.append(script);
  });
}

function loadCampaign() {
  campaignLoading ??= Promise.all([
    loadCampaignMaps(),
    Promise.all(["castle_tiles", "units", "ui"].map((name) => loadImage(name, name + ".webp"))),
  ]).then(([maps, atlasImages]) => {
    maps.forEach((layers, index) => { originalLevels[index + 1].layers = layers; });
    Object.assign(images, Object.fromEntries(atlasImages));
    campaignReady = true;
  }).catch((error) => {
    campaignLoading = null;
    throw error;
  });
  return campaignLoading;
}

function needsCampaign(number) {
  const options = balance.levels[number - 1];
  return number !== 1 || options.dracula >= 0 ||
    options.minions.some((type) => type !== "Skeleton") ||
    Object.entries(options.startingMinions).some(([type, count]) => type !== "Skeleton" && count > 0) ||
    options.waves.some((wave) => wave.groups.some((group) => group.type !== "knight"));
}

function init(number) {
  const request = ++levelRequest;
  levelLoadError = "";
  if (campaignReady || !needsCampaign(number)) {
    loadingLevel = false;
    return initLoadedLevel(number);
  }
  loadingLevel = true;
  $("status").textContent = "Загрузка уровня…";
  return loadCampaign().then(() => {
    if (request !== levelRequest) return;
    loadingLevel = false;
    initLoadedLevel(number);
  }).catch((error) => {
    if (request !== levelRequest) return;
    loadingLevel = false;
    if (game) {
      levelLoadError = "Не удалось загрузить уровень. Попробуй выбрать его ещё раз.";
      $("level").value = String(game.number);
      console.error(error);
    } else throw error;
  });
}

function initLoadedLevel(number) {
  saveProgress("level", String(number));
  const options = balance.levels[number - 1];
  const rules = {
    ...balance.rules,
    baseManaPerSecond: options.manaRate ?? balance.rules.baseManaPerSecond,
    maxMana: options.manaLimit ?? balance.rules.maxMana,
    crystalMaxHealth: options.crystalHealth ?? balance.rules.crystalMaxHealth,
  };
  const map = { ...levels[number - 1], minions: options.minions, waves: options.waves, dracula: options.dracula };
  const roofIndex = map.layers.wall.findIndex(Boolean);
  const roofRow = Math.max(0, Math.floor(roofIndex / map.width));
  const roofTiles = map.layers.wall.slice(roofRow * map.width, (roofRow + 1) * map.width);
  const roof = {
    x: (roofTiles.findIndex(Boolean) + roofTiles.findLastIndex(Boolean) + 1) * tile / 2,
    y: roofRow * tile,
  };
  const surface = drawTiles(map);
  const floors = findFloors(map);
  const crystals = findCrystals(map, floors, rules.crystalMaxHealth);
  connectStairs(map, floors);
  const crossings = [...connectWoodLadders(map, floors), ...connectIsolatedFloors(floors, crystals)];
  const focus = crystals[0] ?? { x: surface.width / 2, y: surface.height - 30 };
  const rooms = floors.flatMap((floor) => floor.rooms
    .filter((room) => room.right - room.left >= 80)
    .map((room) => ({ ...room, floor })))
    .sort((a, b) => b.floor.y - a.floor.y || a.left - b.left);
  const room = map.dracula >= 0 ? rooms[map.dracula] : null;
  const marker = map.draculaPosition;
  const markedFloor = marker && floorAt(floors, marker.x, marker.y);
  const position = markedFloor ? { ...marker, floor: markedFloor }
    : room ? { x: (room.left + room.right) / 2, y: room.floor.y, floor: room.floor } : null;
  const dracula = position ? {
    ...position,
    facing: 1, spawnTime: 0, strike: null, readyAt: 0,
  } : null;
  game = {
    number, map, surface, floors, crystals, dracula, crossings, roof, rules, options,
    intro: number === 5 && Boolean(dracula),
    tutorial: number === 1 && (tutorialComplete || !map.minions.includes("Skeleton") ||
      Math.min(options.startingMana, rules.maxMana) < balance.defenders.Skeleton.cost)
      ? null : levelOpeningCards[number] ?? null,
    camera: { x: 0, y: 0 },
    time: 0, mana: Math.min(options.startingMana, rules.maxMana),
    wave: 0, nextWave: map.waves[0]?.delay ?? Infinity,
    queue: [], enemies: [], allies: [], effects: [], kills: 0,
    paused: false, result: null, defendUntil: 0, bannerUntil: 0,
  };
  game.entrances = Object.fromEntries(Object.entries(map.spawners)
    .map(([id, source]) => [id, findEntrance(source)]));
  const entrance = Object.entries(map.spawners).find(([, source]) => source.type === "ground");
  const door = entrance && game.entrances[entrance[0]];
  const focusX = door ? door.x * .55 + focus.x * .45 : focus.x;
  resizeView();
  moveCamera((dracula?.x ?? focusX) - view.width * .5,
    (dracula?.y ?? focus.y) - view.height * (dracula ? .6 : .76));
  selected = null;
  gesture = null;
  $("level").value = number;
  $("next").hidden = true;
  $("pause-menu").hidden = true;
  $("dracula-intro").hidden = !game.intro;
  if (game.intro) $("dracula-intro-continue").focus();
  $("pause").disabled = false;
  $("pause").setAttribute("aria-label", "Пауза");
  $("pause").title = "Пауза";
  buildMinions();
  showTutorialStep(game.tutorial);
  for (const [id, units] of Object.entries(map.rooms)) {
    const rooms = floors.filter((floor) => floor.right - floor.left >= 80)
      .sort((a, b) => b.y - a.y || a.left - b.left);
    const floor = rooms[Number(id)] ?? rooms[0];
    if (!floor) continue;
    for (const unit of units) {
      const x = clamp(floor.left + Number(unit.slot) * 40, floor.left + 10, floor.right - 10);
      summon(unit.type, { x, y: floor.y, floor }, false);
    }
  }
  for (const [type, count] of Object.entries(options.startingMinions)) {
    const positions = crystals.filter((crystal) => crystal.floor?.rooms.length);
    if (!positions.length) break;
    for (let i = 0; i < count; i++) summon(type, positions[i % positions.length], false);
  }
}

function moveCamera(x, y) {
  game.camera.x = clamp(x, 0, Math.max(0, game.surface.width - view.width));
  game.camera.y = clamp(y, 0, Math.max(0, game.surface.height - view.height));
}

function summon(type, spot, pay = true) {
  const spec = balance.defenders[type];
  const room = spot.floor.rooms.reduce((best, candidate) => {
    const gap = (span) => Math.abs(spot.x - clamp(spot.x, span.left, span.right));
    return !best || gap(candidate) < gap(best) ? candidate : best;
  }, null);
  if (!room) return false;
  const inset = Math.min(8, (room.right - room.left) / 2);
  const bounds = { left: room.left + inset, right: room.right - inset };
  if (pay) {
    if (game.mana < spec.cost) return false;
    game.mana -= spec.cost;
  }
  game.allies.push({
    ...spec, type, ...spot, x: clamp(spot.x, bounds.left, bounds.right), bounds, hpMax: spec.hp, facing: 1, cooldown: 0,
    age: 0, hitUntil: 0, nextManaAt: game.rules.spiritManaInterval,
  });
  return true;
}

function enqueueWave() {
  const wave = game.map.waves[game.wave++];
  game.defendUntil = game.wave === 1 ? game.time + .85 : game.time;
  for (const group of wave.groups) {
    for (let i = 0; i < group.count; i++) {
      game.queue.push({
        type: group.type, source: game.map.spawners[group.spawner], entrance: game.entrances[group.spawner],
        at: game.defendUntil + group.offset + i * group.spacing, stats: group.stats,
      });
    }
  }
  game.nextWave += game.map.waves[game.wave]?.delay ?? Infinity;
  game.bannerUntil = game.defendUntil + 2;
}

function spawn({ type, source, entrance, stats }) {
  const spec = { ...balance.hunters[type], ...stats };
  const airborne = source.type === "air";
  const outside = entrance.side === 1 ? entrance.floor.left : entrance.floor.right;
  const x = outside - entrance.side * (airborne ? 78 : 65);
  const landing = airborne ? { x: outside + entrance.side * 7, y: entrance.y } : null;
  game.enemies.push({
    ...spec, x, y: airborne ? Math.min(game.surface.height - source.y, entrance.y - 8) : entrance.y,
    type, facing: entrance.side, hpMax: spec.hp, cooldown: 0, age: 0,
    hitUntil: 0, slowUntil: 0, airborne, landing, entrance, floor: null,
    target: null, route: [], routeFailed: false,
  });
}

function walk(unit, target, dt, speed = unit.speed) {
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  if (Math.abs(dx) > 1) unit.facing = Math.sign(dx);
  const length = Math.hypot(dx, dy);
  if (unit.type === "Bull" && length > 0) {
    const traveledX = dx * Math.min(1, speed * dt / length);
    const turn = 2 * Math.PI;
    unit.roll = ((unit.roll ?? 0) + traveledX / game.rules.bullRollDistance * turn) % turn;
  }
  if (length <= speed * dt) {
    unit.x = target.x;
    unit.y = target.y;
    return true;
  }
  unit.x += dx / length * speed * dt;
  unit.y += dy / length * speed * dt;
  return false;
}

function attack(unit, target, delay, kind = null, damage = unit.damage) {
  if (unit.cooldown > 0) return;
  unit.facing = Math.sign(target.x - unit.x) || unit.facing;
  unit.cooldown = delay;
  unit.hitUntil = game.time + .42;
  if (kind === "ice") {
    game.effects.push({ kind, ...dragonMouthPosition(unit), target, damage,
      until: game.time + game.rules.iceFlightTime });
    return;
  }
  target.hp -= damage;
  if (kind) game.effects.push({ kind, x: unit.x, y: unit.y - 19,
    tx: target.x, ty: target.y - 18, until: game.time + (kind === "bomb" ? .58 : .26), source: unit });
}

function updateEnemy(enemy, dt) {
  if (enemy.confusedUntil > game.time) return;
  const speed = enemy.slowUntil > game.time ? enemy.speed * game.rules.iceSpeedMultiplier : enemy.speed;
  if (enemy.landing) {
    if (walk(enemy, enemy.landing, dt, 92)) {
      enemy.landing = null;
      enemy.airborne = false;
    }
    return;
  }
  if (enemy.entrance) {
    if (walk(enemy, enemy.entrance, dt, speed)) {
      enemy.floor = enemy.entrance.floor;
      enemy.entrance = null;
    }
    return;
  }

  // Finish a flight of stairs before retargeting or attacking on the next floor.
  if (!enemy.floor) {
    advanceRoute(enemy, dt, speed);
    return;
  }
  if ((!enemy.target || enemy.target.hp <= 0) && !enemy.routeFailed) {
    const route = findRoute(enemy);
    enemy.target = route?.target ?? null;
    enemy.route = route?.steps ?? [];
    enemy.routeFailed = !route;
  }
  const opponent = game.allies.find((ally) => ally.hp > 0 &&
    ally.floor === enemy.floor && Math.abs(ally.x - enemy.x) < enemy.range);
  if (opponent) {
    const damage = opponent.type === "Bull"
      ? Math.ceil(enemy.damage * game.options.bullDamageMultiplier) : enemy.damage;
    attack(enemy, opponent, enemy.attackInterval ?? game.rules.enemyAttackInterval,
      enemy.type === "archer" ? "arrow" : null, damage);
    return;
  }
  if (!enemy.target) {
    patrol(enemy, dt, speed);
    return;
  }
  if (enemy.target.floor === enemy.floor && Math.abs(enemy.target.x - enemy.x) < enemy.range) {
    attack(enemy, enemy.target, enemy.crystalAttackInterval ?? game.rules.crystalAttackInterval,
      enemy.type === "archer" ? "arrow" : null);
    return;
  }
  advanceRoute(enemy, dt, speed);
}

function advanceRoute(enemy, dt, speed) {
  const step = enemy.route[0];
  if (!step) return;
  if (step.floor !== enemy.floor) enemy.floor = null;
  if (walk(enemy, step, dt, speed)) {
    enemy.floor = step.floor;
    enemy.route.shift();
  }
}

function patrol(unit, dt, speed = unit.speed) {
  if (!speed || unit.hitUntil > game.time) return;
  const left = unit.bounds?.left ?? unit.floor.left + 7;
  const right = unit.bounds?.right ?? unit.floor.right - 7;
  if (right <= left) return;
  const x = unit.facing > 0 ? right : left;
  if (walk(unit, { x, y: unit.floor.y }, dt, speed)) unit.facing *= -1;
}

function updateBull(bull, dt) {
  const fromX = bull.x;
  const direction = bull.facing;
  patrol(bull, dt);
  if (bull.x === fromX) return;

  bull.rolledOver ??= new WeakSet();
  const left = Math.min(fromX, bull.x) - bull.range;
  const right = Math.max(fromX, bull.x) + bull.range;
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0 || enemy.floor !== bull.floor || enemy.x < left || enemy.x > right ||
        bull.rolledOver.has(enemy)) continue;
    bull.rolledOver.add(enemy);
    enemy.hp -= bull.damage;
    enemy.confusedUntil = game.time + game.rules.bullConfuseSeconds;
    if (game.time >= (bull.nextImpactAt ?? 0)) {
      game.effects.push({ kind: "impact", tx: enemy.x, ty: enemy.y - 18, until: game.time + .26 });
      bull.nextImpactAt = game.time + .1;
    }
  }
  if (bull.facing !== direction) bull.rolledOver = new WeakSet();
}

function updateAlly(ally, dt) {
  const { type } = ally;
  const rules = game.rules;
  if (type === "Bull") {
    updateBull(ally, dt);
    return;
  }
  if (type === "Spirit") {
    if (ally.age >= rules.spiritLifetime) {
      ally.hp = 0;
      return;
    }
    if (ally.age >= rules.spiritGlowTime) {
      patrol(ally, dt, ally.speed * .55);
      return;
    }
    if (ally.age >= ally.nextManaAt) {
      ally.nextManaAt += rules.spiritManaInterval;
      const amount = Math.max(0, Math.min(rules.spiritManaAmount, rules.maxMana - game.mana));
      game.mana += amount;
      if (amount > 0) {
        game.effects.push({ kind: "mana", amount, x: ally.x, y: ally.y - 42, until: game.time + .7 });
      }
    }
  }
  const targets = game.enemies.filter((enemy) => {
    if (enemy.hp <= 0 || !enemy.floor) return false;
    if (type === "Bat") {
      const below = enemy.y - ally.y;
      return below > 0 && below <= 140 && !game.floors.some((floor) =>
        floor.y > ally.y && floor.y < enemy.y && enemy.x >= floor.left && enemy.x < floor.right);
    }
    if (type === "FrostDragon" && !enemy.floor.rooms.some((room) =>
      enemy.x >= room.left && enemy.x < room.right)) return false;
    return ally.floor === enemy.floor;
  });
  targets.sort((a, b) => Math.abs(ally.x - a.x) - Math.abs(ally.x - b.x));
  const enemy = targets[0];
  if (!enemy) {
    patrol(ally, dt);
    return;
  }
  if (Math.abs(ally.x - enemy.x) <= ally.range) {
    if (type === "Spirit") {
      enemy.hp -= ally.damage;
      ally.hp = 0;
      return;
    }
    const effect = { Bat: "bomb", FrostDragon: "ice", Cyclops: "fire" }[type];
    const damage = type === "Bat" && enemy.type === "redknight"
      ? Math.round(ally.damage * rules.batRedMultiplier) : ally.damage;
    const interval = ally.attackInterval ?? (type === "Bat" ? rules.batAttackInterval : rules.minionAttackInterval);
    attack(ally, enemy, interval, effect, damage);
    return;
  }
  if (type === "Spirit") {
    patrol(ally, dt);
    return;
  }
  if (ally.speed) walk(ally, {
    x: clamp(enemy.x, ally.bounds.left, ally.bounds.right), y: ally.y,
  }, dt);
}

function update(dt) {
  if (loadingLevel || game.paused || game.result || game.intro || game.tutorial || location.hash === "#settings" ||
      location.hash === "#maps") return;
  if (draculaSpawning()) {
    game.dracula.spawnTime = Math.min(9 / draculaSpawnFps, game.dracula.spawnTime + dt);
    return;
  }
  game.time += dt;
  game.mana += game.rules.baseManaPerSecond * dt;
  if (game.time >= game.nextWave) {
    const warning = knightWarnings.find(({ level, wave }) => level === game.number && wave === game.wave + 1);
    if (warning && !game.warningShown) {
      game.warningShown = true;
      gesture = null;
      showTutorialStep(warning.card);
      return;
    }
    enqueueWave();
  }
  game.queue = game.queue.filter((item) => {
    if (item.at > game.time) return true;
    spawn(item);
    return false;
  });
  for (const unit of [...game.allies, ...game.enemies]) {
    unit.age += dt;
    unit.cooldown -= dt;
  }
  for (const ally of game.allies) if (ally.hp > 0) updateAlly(ally, dt);
  game.mana = Math.min(game.rules.maxMana, game.mana);
  for (const enemy of game.enemies) if (enemy.hp > 0) updateEnemy(enemy, dt);
  updateDracula();
  game.effects = game.effects.filter((effect) => {
    if (effect.until > game.time) return true;
    if (effect.kind === "ice" && effect.target.hp > 0) {
      effect.target.hp -= effect.damage;
      effect.target.slowUntil = game.time + game.rules.iceSlowDuration;
    }
    return false;
  });
  game.kills += game.enemies.filter((enemy) => enemy.hp <= 0).length;
  game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
  game.allies = game.allies.filter((ally) => {
    if (ally.hp > 0) return true;
    if (ally.type === "Spirit" && ally.age < game.rules.spiritLifetime) {
      game.effects.push({ kind: "spirit-explosion", x: ally.x,
        y: ally.y - hoverLift(ally) - 16, until: game.time + .4 });
    }
    return false;
  });
  if (game.crystals.every((crystal) => crystal.hp <= 0)) game.result = "defeat";
  else if (game.wave === game.map.waves.length && !game.queue.length && !game.enemies.length) game.result = "victory";
  if (game.result) {
    $("next").hidden = game.result !== "victory" || game.number >= levels.length;
    $("pause").disabled = true;
  }
}

function draculaSpawning() {
  return game.dracula && game.dracula.spawnTime < 9 / draculaSpawnFps;
}

function updateDracula() {
  const dracula = game.dracula;
  if (!dracula) return;
  const active = (enemy) => enemy.hp > 0 && enemy.floor === dracula.floor &&
    Math.abs(enemy.x - dracula.x) <= game.rules.draculaRange;
  const strike = dracula.strike;
  if (strike) {
    const elapsed = game.time - strike.start;
    if (!strike.hit && elapsed >= 2 / draculaAttackFps) {
      strike.hit = true;
      if (active(strike.target)) strike.target.hp -= game.rules.draculaDamage;
    }
    if (elapsed >= 8 / draculaAttackFps) dracula.strike = null;
    return;
  }
  if (game.time < dracula.readyAt) return;
  const target = game.enemies.filter(active).reduce((nearest, enemy) =>
    !nearest || Math.abs(enemy.x - dracula.x) < Math.abs(nearest.x - dracula.x) ? enemy : nearest, null);
  if (!target) return;
  dracula.facing = Math.sign(target.x - dracula.x) || dracula.facing;
  dracula.strike = { target, start: game.time, hit: false };
  dracula.readyAt = game.time + game.rules.draculaInterval;
}

function drawDracula() {
  const dracula = game.dracula;
  if (!dracula || game.intro) return;
  let name;
  if (draculaSpawning()) {
    name = "spawn" + (1 + Math.floor(dracula.spawnTime * draculaSpawnFps));
  } else if (dracula.strike) {
    name = "attack" + Math.min(8, 1 + Math.floor((game.time - dracula.strike.start) * draculaAttackFps));
  } else {
    name = "idle" + (1 + Math.floor(game.time * 6) % 5);
  }
  drawFrame("units", "dracula_" + name + ".png", dracula.x, dracula.y,
    unitScale, dracula.facing < 0, "feet");
}

const animations = new Map();

function animation(prefix) {
  if (!animations.has(prefix)) {
    const exact = prefix + ".png";
    const frames = Object.keys(atlases.units).filter((name) =>
      name === exact || (name.startsWith(prefix) && /^\d+\.png$/.test(name.slice(prefix.length))));
    frames.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    animations.set(prefix, frames);
  }
  return animations.get(prefix);
}

function hoverLift(unit) {
  return unit.hover ? unit.hover + Math.sin(unit.age * 5) * 2 : 0;
}

function dragonFrame(unit) {
  return Math.floor(unit.age * 12) % dragonMouth.length;
}

function dragonMouthPosition(dragon) {
  const index = dragonFrame(dragon);
  const frame = atlases.units["frost_dragon" + (index + 1) + ".png"];
  const [mouthX, mouthY] = dragonMouth[index];
  return {
    x: dragon.x + dragon.facing * unitScale * (mouthX + frame.offsetX - frame.width / 2),
    y: dragon.y - hoverLift(dragon) + unitScale *
      (mouthY - frame.originalHeight / 2 - frame.offsetY - frame.height / 2),
  };
}

function drawUnit(unit, friendly) {
  const attacking = unit.hitUntil > game.time;
  const prefix = friendly
    ? (attacking && unit.attack ? unit.attack : unit.run)
    : unit.type + (attacking ? "_attack" : "_run");
  const frames = animation(prefix);
  const index = Math.floor((attacking ? .42 - (unit.hitUntil - game.time) : unit.age) * 12);
  if (unit.airborne) {
    const bird = 1 + Math.floor(unit.age * 13) % 4;
    drawFrame("units", "bird_fly" + bird + ".png", unit.x, unit.y - 36, .9, unit.facing < 0);
  }
  const lift = hoverLift(unit);
  if (unit.type === "Bull") {
    const radius = atlases.units["bull.png"].height * unitScale / 2;
    drawFrame("units", "bull.png", unit.x, unit.y - radius, unitScale, false, "center", unit.roll);
  } else if (unit.type === "FrostDragon") {
    drawFrame("units", "frost_dragon" + (dragonFrame(unit) + 1) + ".png",
      unit.x, unit.y - lift, unitScale, unit.facing < 0, "feet");
  } else if (unit.type === "Spirit") {
    const dark = unit.age >= game.rules.spiritGlowTime;
    // The original atlas names the flame frames "spiritdark".
    const name = (dark ? "spirit" : "spiritdark") + (1 + Math.floor(unit.age * 10) % 4) + ".png";
    ctx.save();
    if (dark) ctx.globalAlpha = clamp(game.rules.spiritLifetime - unit.age, 0, 1);
    drawFrame("units", name, unit.x, unit.y - lift, unitScale, unit.facing < 0, "feet");
    ctx.restore();
  } else if (frames.length) {
    drawFrame("units", frames[index % frames.length] ?? frames[0],
      unit.x, unit.y - lift, unitScale, unit.facing < 0, "feet");
  }
  if (unit.hp < unit.hpMax) {
    ctx.fillStyle = "#20141b";
    ctx.fillRect(unit.x - 14, unit.y + 3, 28, 3);
    ctx.fillStyle = friendly ? "#8cd67e" : "#ef785e";
    ctx.fillRect(unit.x - 14, unit.y + 3, 28 * unit.hp / unit.hpMax, 3);
  }
}

function drawEffect(effect) {
  const { kind, tx, ty, until, source } = effect;
  const { x, y } = effect;
  if (kind === "mana" || kind === "spirit-explosion") {
    const progress = clamp(1 - (until - game.time) / (kind === "mana" ? .7 : .4), 0, 1);
    if (kind === "mana") {
      if (effect.amount === 5) {
        drawFrame("units", "mana.png", x, y - 17 * progress, .64);
      } else {
        ctx.save();
        ctx.font = "bold 13px system-ui";
        ctx.textAlign = "center";
        ctx.fillStyle = "#aee6ff";
        ctx.fillText("+" + Number(effect.amount.toFixed(1)), x, y - 17 * progress);
        ctx.restore();
      }
    } else {
      const frame = Math.min(5, 1 + Math.floor(progress * 5));
      drawFrame("units", "effects_spiritexplosion_" + frame + ".png", x, y, .65);
    }
    return;
  }
  if (kind === "ice") {
    const dx = effect.target.x - x;
    const dy = effect.target.y - 18 - y;
    const progress = clamp(1 - (until - game.time) / game.rules.iceFlightTime, 0, 1);
    drawFrame("units", "ice-laser.png", x + dx * progress, y + dy * progress,
      .42, false, "center", Math.atan2(dy, dx));
    return;
  }
  const remaining = until - game.time;
  const bombImpact = kind === "bomb" && remaining <= .32;
  const t = clamp(1 - (remaining - (kind === "bomb" ? .32 : 0)) / .26, 0, 1);
  if (kind === "impact" || bombImpact) {
    const progress = bombImpact ? clamp(1 - remaining / .32, 0, 1) : t;
    const frame = Math.min(4, Math.floor(progress * 4) + 1);
    drawFrame("units", "effects_explosion" + frame + ".png", tx, ty, bombImpact ? .9 : .42);
    return;
  }
  if (kind === "arrow" || kind === "bomb") {
    const image = kind === "arrow" ? "arrow.png" : "bomb.png";
    drawFrame("units", image, x + (tx - x) * t, y + (ty - y) * t, .8, tx < x);
    return;
  }
  if (kind === "fire") {
    drawCyclopsBeam(source, tx, ty, t);
  }
}

function drawCyclopsBeam(cyclops, tx, ty, progress) {
  const frameNumber = 1 + Math.floor((.42 - (cyclops.hitUntil - game.time)) * 12) % 3;
  const frame = atlases.units["cyclops_attack" + frameNumber + ".png"];
  const x = cyclops.x + cyclops.facing * unitScale * (44 + frame.offsetX - frame.width / 2);
  const y = cyclops.y + unitScale * (28 - frame.originalHeight / 2 - frame.offsetY - frame.height / 2);
  const length = Math.hypot(tx - x, ty - y);
  if (!length) return;

  const height = 19 * (1 - .35 * progress);
  const tip = atlases.units["laser_beam_start.png"];
  const shaft = atlases.units["laser_beam.png"];
  const tipWidth = Math.min(length, height * tip.width / tip.height);
  const shaftWidth = length - tipWidth;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(ty - y, tx - x));
  ctx.globalAlpha *= 1 - .65 * progress;
  if (shaftWidth > 0) {
    ctx.drawImage(images.units, shaft.x, shaft.y, shaft.width, shaft.height,
      0, -height / 2, shaftWidth, height);
  }
  ctx.drawImage(images.units, tip.x, tip.y, tip.width, tip.height,
    shaftWidth, -height / 2, tipWidth, height);
  ctx.restore();
}

function crystalFrame(healthRatio, time) {
  if (healthRatio <= .2) return "crystalball_damage2.png";
  if (healthRatio <= .5) return "crystalball_damage1.png";
  return "crystalball" + (1 + Math.floor(time * 5) % 4) + ".png";
}

function drawSky() {
  const sky = atlases.environment["environment_sky.jpg"];
  ctx.drawImage(images.environment, sky.x, sky.y, sky.width, sky.height,
    0, 0, view.width, view.height);

  const { x, y } = game.camera;
  const moonX = clamp(view.width * .23 - x * .10, 56, view.width - 56);
  const moonY = clamp(view.height * .27 - y * .05, 60, view.height * .33);
  drawFrame("environment", "environment_moon.png", moonX, moonY, .43);

  const cloudWidth = view.width + 440;
  const drift = game.time * 4 - x * .23;
  const cloudX = (offset) => ((offset + drift) % cloudWidth + cloudWidth) % cloudWidth - 220;
  const cloudY = Math.min(y * .10, 42);
  drawFrame("environment", "environment_cloud.png", cloudX(view.width * .72 + 220),
    view.height * .29 - cloudY, .59);
  drawFrame("environment", "environment_cloud2.png", cloudX(view.width * .28 + 220),
    view.height * .44 - cloudY, .65);
  drawFrame("environment", "environment_cloud2.png", cloudX(view.width * .91 + 185),
    view.height * .17 - cloudY, .42, true);
  drawFrame("environment", "environment_cloud.png", cloudX(view.width * .09 + 175),
    view.height * .13 - cloudY, .36, true);
}

function drawRoofClouds() {
  const { x, y } = game.roof;
  const time = game.time;
  ctx.save();
  ctx.globalAlpha = .58;
  drawFrame("environment", "environment_cloud.png",
    x - 75 + Math.sin(time * .08 + .7) * 110, y + 20, .48);
  ctx.globalAlpha = .46;
  drawFrame("environment", "environment_cloud2.png",
    x + 100 + Math.sin(time * .11 + 2) * 75, y + 43, .52, true);
  ctx.restore();
}

function drawManaVessel() {
  const draw = (name, x, y) => {
    const frame = atlases.ui[name + ".png"];
    manaCtx.drawImage(images.ui, frame.x, frame.y, frame.width, frame.height,
      x, y, frame.width, frame.height);
  };
  manaCtx.clearRect(0, 0, manaVessel.width, manaVessel.height);
  if (game.mana > 0) {
    const wave = 1 + Math.floor(game.time * 8) % 4;
    const level = game.mana / game.rules.maxMana;
    draw("mana_" + wave, 4, 63 - Math.round(level * 63));
    manaCtx.globalCompositeOperation = "destination-out";
    draw("mana_mask", 4, 0);
    manaCtx.globalCompositeOperation = "destination-over";
  }
  draw("mana_container", 0, 0);
  manaCtx.globalCompositeOperation = "source-over";
}

function drawWaveCountdown() {
  if (game.intro || game.tutorial || draculaSpawning()) return false;
  if (game.time < game.defendUntil) {
    const frame = atlases.ui["countdown_defend.png"];
    const scale = Math.min(view.width * .85 / frame.width, view.height * .76 / frame.height);
    ctx.fillStyle = "#120d1844";
    ctx.fillRect(0, 0, view.width, view.height);
    drawFrame("ui", "countdown_defend.png", view.width / 2, view.height / 2, scale);
    return true;
  }
  if (game.wave !== 0) return false;
  const seconds = Math.ceil(game.nextWave - game.time);
  if (seconds < 1 || seconds > 3) return false;
  const size = Math.min(view.width, view.height) * .48;
  ctx.fillStyle = "#120d1844";
  ctx.fillRect(0, 0, view.width, view.height);
  drawFrame("ui", "countdown_" + seconds + ".png",
    view.width / 2, view.height / 2, size / 111);
  return true;
}

function render() {
  ctx.setTransform(canvas.width / view.width, 0, 0, canvas.height / view.height, 0, 0);
  drawSky();
  ctx.save();
  ctx.translate(-Math.round(game.camera.x), -Math.round(game.camera.y));
  for (const [id, source] of Object.entries(game.map.spawners)) {
    if (source.type !== "ground") continue;
    const door = game.entrances[id];
    const edge = door.side === 1 ? door.floor.left : door.floor.right;
    const col = Math.floor(edge / tile) - (door.side === 1 ? 1 : 0);
    const row = Math.round(door.y / tile);
    const gid = game.map.layers.wall[row * game.map.width + col] || 115;
    const index = gid - 1;
    const columns = images.castle_tiles.width / tile;
    for (let i = 0; i < 5; i++) {
      const x = door.side === 1 ? edge - (i + 1) * tile : edge + i * tile;
      ctx.drawImage(images.castle_tiles, index % columns * tile, Math.floor(index / columns) * tile,
        tile, tile, x, door.y, tile, tile);
    }
  }
  ctx.drawImage(game.surface, 0, 0);
  drawRoofClouds();
  for (const { x, endX, top, bottom } of game.crossings) {
    ctx.fillStyle = "#3e281d";
    if (top === bottom) {
      ctx.fillRect(x, top, endX - x, 7);
      ctx.fillStyle = "#a88051";
      for (let plank = x; plank < endX; plank += 10) {
        ctx.fillRect(plank, top, Math.min(8, endX - plank), 3);
      }
      continue;
    }
    ctx.fillRect(x - 8, top, 3, bottom - top);
    ctx.fillRect(x + 5, top, 3, bottom - top);
    ctx.fillStyle = "#a88051";
    for (let y = top + 5; y < bottom; y += 9) ctx.fillRect(x - 7, y, 14, 2);
  }
  for (const crystal of game.crystals) {
    if (crystal.hp <= 0) continue;
    const healthRatio = crystal.hp / game.rules.crystalMaxHealth;
    drawFrame("units", crystalFrame(healthRatio, game.time),
      crystal.x, crystal.y - 40);
    ctx.fillStyle = "#332127";
    ctx.fillRect(crystal.x - 17, crystal.y + 2, 34, 4);
    ctx.fillStyle = "#f8b14d";
    ctx.fillRect(crystal.x - 17, crystal.y + 2, 34 * healthRatio, 4);
  }
  drawDracula();
  for (const ally of game.allies) drawUnit(ally, true);
  for (const enemy of game.enemies) drawUnit(enemy, false);
  for (const effect of game.effects) drawEffect(effect);
  ctx.restore();

  if (game.result || game.paused) {
    ctx.fillStyle = "#120d18ad";
    ctx.fillRect(0, 0, view.width, view.height);
    if (game.result === "victory" || game.result === "defeat") {
      drawFrame("ui", "endlevel_" + game.result + ".png", view.width / 2, view.height / 2);
    }
  } else if (!drawWaveCountdown() && game.time < game.bannerUntil && game.wave > 0) {
    const name = game.wave === game.map.waves.length ? "notification_finalwave.png" : "notification_wave.png";
    drawFrame("ui", name, view.width / 2, 30, .82);
  }
  drawManaVessel();
}

function buildMinions() {
  $("minions").replaceChildren();
  for (const type of minionSlots) {
    const { icon, cost } = balance.defenders[type];
    const available = game.map.minions.includes(type);
    const button = document.createElement("button");
    const frame = atlases.ui["icon_" + (available ? icon : "lock") + ".png"];
    const image = document.createElement("i");
    const dimension = Math.max(frame.width, frame.height);
    const size = (pixels) => `calc(var(--minion-icon-size) * ${pixels / dimension})`;
    Object.assign(image.style, {
      backgroundImage: "url('" + images.ui.src + "')",
      backgroundPosition: `${size(-frame.x)} ${size(-frame.y)}`,
      backgroundSize: `${size(images.ui.width)} ${size(images.ui.height)}`,
      width: size(frame.width),
      height: size(frame.height),
    });
    if (available && type === "Bat") {
      image.style.backgroundImage = "url('assets/bat-icon.png')";
      image.style.backgroundPosition = "0 0";
      image.style.backgroundSize = "100% 100%";
    }
    button.type = "button";
    button.dataset.type = type;
    button.title = available ? type + " · " + cost : type + " · Недоступен на этом уровне";
    button.setAttribute("aria-label", button.title);
    button.append(image);
    if (available && cost !== defenders[type].cost) {
      const price = document.createElement("span");
      price.className = "custom-minion-price";
      price.textContent = cost;
      button.append(price);
    }
    if (!available) {
      button.disabled = true;
      button.classList.add("locked");
      $("minions").append(button);
      continue;
    }
    button.addEventListener("click", () => { selected = selected === type ? null : type; });
    button.addEventListener("pointerdown", (event) => {
      gesture = { type, x: event.clientX, y: event.clientY, id: event.pointerId };
      pointer = event;
      button.setPointerCapture(event.pointerId);
    });
    $("minions").append(button);
  }
}

function localPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * view.width / rect.width,
    y: (event.clientY - rect.top) * view.height / rect.height,
  };
}

function placementSpot(type, point) {
  if (loadingLevel || game.paused || game.result || game.intro || draculaSpawning() || !type) return null;
  if (!game.map.minions.includes(type) || game.mana < balance.defenders[type].cost) return null;
  if (game.tutorial && game.tutorial !== "summon") return null;
  if (point.x < 0 || point.x >= view.width || point.y < 0 || point.y >= view.height) return null;
  const world = { x: point.x + game.camera.x, y: point.y + game.camera.y };
  const spot = floorNear(world);
  return spot?.floor.rooms.length && distance(spot, world) <= 86 ? spot : null;
}

function place(type, point) {
  const spot = placementSpot(type, point);
  if (!spot || !summon(type, spot)) return false;
  selected = null;
  if (game.tutorial === "summon") {
    tutorialComplete = true;
    saveProgress("tutorial-complete", "1");
    showTutorialStep(null);
  }
  return true;
}

function cursorOverCastle(event) {
  return document.elementFromPoint(event.clientX, event.clientY) === canvas;
}

function updateSummonPreview() {
  const dragging = gesture?.type && gesture.moved;
  const mouse = pointer?.pointerType === "mouse";
  const type = dragging ? gesture.type : mouse ? selected : null;
  const visible = pointer && type && !game.result && !game.paused && !game.intro &&
    (!game.tutorial || game.tutorial === "summon") && !draculaSpawning();
  summonPreview.hidden = !visible;
  if (!visible) return;

  const screenScale = canvas.getBoundingClientRect().height / view.height;
  const iconName = "dragicon_" + defenders[type].icon;
  const iconFrame = atlases.ui[iconName + ".png"];
  const unitFrame = atlases.units[type === "Spirit" ? "spiritdark1.png" : animation(defenders[type].run)[0]];
  const iconHeight = iconFrame.height * Math.min(1, 54 / Math.max(iconFrame.width, iconFrame.height));
  const previewScale = screenScale * unitScale * .88 * (unitFrame?.height ?? iconHeight) / iconHeight;
  summonPreview.style.width = (summonPreview.width * previewScale) + "px";
  summonPreview.style.height = (summonPreview.height * previewScale) + "px";
  summonPreview.style.left = (pointer.clientX + (mouse ? 30 * previewScale : 0)) + "px";
  summonPreview.style.top = (pointer.clientY - (mouse ? 23 * previewScale : 0)) + "px";
  const draw = (name, centerX, centerY, scale, maxSize) => {
    const frame = atlases.ui[name + ".png"];
    const ratio = Math.min(scale, maxSize / Math.max(frame.width, frame.height));
    const width = frame.width * ratio;
    const height = frame.height * ratio;
    summonPreviewCtx.drawImage(images.ui, frame.x, frame.y, frame.width, frame.height,
      centerX - width / 2, centerY - height / 2, width, height);
  };
  summonPreviewCtx.clearRect(0, 0, 72, 72);
  draw(iconName, 36, 36, 1, 54);
  if (!cursorOverCastle(pointer) || !placementSpot(type, localPoint(pointer))) {
    draw("drag_cross", 54, 54, .65, 29);
  }
}

canvas.addEventListener("pointerdown", (event) => {
  if (!game || game.paused || game.intro || isTutorialCard(game.tutorial) || draculaSpawning()) return;
  const point = localPoint(event);
  gesture = { id: event.pointerId, point, camera: { ...game.camera }, moved: false };
  canvas.setPointerCapture(event.pointerId);
});

window.addEventListener("pointermove", (event) => {
  if (gesture && gesture.id !== event.pointerId) return;
  pointer = event;
  if (gesture?.type) {
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) gesture.moved = true;
    return;
  }
  if (!gesture?.point) return;
  const point = localPoint(event);
  const dx = point.x - gesture.point.x;
  const dy = point.y - gesture.point.y;
  if (Math.hypot(dx, dy) > 5) gesture.moved = true;
  if (gesture.moved) moveCamera(gesture.camera.x - dx, gesture.camera.y - dy);
});

window.addEventListener("pointerup", (event) => {
  if (gesture?.id !== event.pointerId) return;
  pointer = event.pointerType === "mouse" ? event : null;
  const point = localPoint(event);
  if (gesture.type) {
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) {
      const type = gesture.type;
      const button = event.target.closest("button");
      if (button) {
        const suppressClick = (click) => click.stopImmediatePropagation();
        button.addEventListener("click", suppressClick, { capture: true, once: true });
        setTimeout(() => button.removeEventListener("click", suppressClick, true), 0);
      }
      if (cursorOverCastle(event)) place(type, point);
    }
  } else if (gesture.moved && game.tutorial === "camera") {
    showTutorialStep("summon");
  } else if (!gesture.moved) place(selected, point);
  gesture = null;
});

window.addEventListener("pointercancel", (event) => {
  if (gesture?.id === event.pointerId) {
    gesture = null;
    pointer = null;
  }
});
window.addEventListener("pointerout", (event) => {
  if (!event.relatedTarget && !gesture) pointer = null;
});
window.addEventListener("blur", () => {
  gesture = null;
  pointer = null;
});
canvas.addEventListener("wheel", (event) => {
  if (!game || game.paused || game.intro || isTutorialCard(game.tutorial) || draculaSpawning()) return;
  event.preventDefault();
  moveCamera(game.camera.x + event.deltaX + (event.shiftKey ? event.deltaY : 0),
    game.camera.y + (event.shiftKey ? 0 : event.deltaY));
  if (game.tutorial === "camera" && (event.deltaX || event.deltaY)) showTutorialStep("summon");
}, { passive: false });

function isTutorialCard(step) {
  return Object.hasOwn(tutorialCards, step);
}

function showTutorialStep(step) {
  game.tutorial = step;
  $("level-tutorial").hidden = !isTutorialCard(step);
  $("tutorial-camera").hidden = step !== "camera" || game.paused;
  $("tutorial-mana").hidden = $("tutorial-drag").hidden = step !== "summon" || game.paused;
  if (isTutorialCard(step)) {
    const image = $("tutorial-guide");
    const [file, caption] = tutorialCards[step];
    image.src = "assets/tutorial/" + file + ".png";
    image.classList.toggle("story-card", !step.startsWith("guide"));
    image.alt = caption;
    $("tutorial-continue").focus();
  }
}

$("tutorial-continue").addEventListener("click", () => {
  if (game.tutorial === "guide1") showTutorialStep("guide2");
  else showTutorialStep(game.tutorial === "guide2" ? "camera" : null);
});

function togglePause() {
  if (!game || game.result || game.intro || isTutorialCard(game.tutorial)) return;
  game.paused = !game.paused;
  gesture = null;
  $("pause-menu").hidden = !game.paused;
  showTutorialStep(game.tutorial);
  $(game.paused ? "resume" : "pause").focus();
  const label = game.paused ? "Продолжить" : "Пауза";
  $("pause").setAttribute("aria-label", label);
  $("pause").title = label;
}

$("pause").addEventListener("click", togglePause);
$("dracula-intro-continue").addEventListener("click", () => {
  game.intro = false;
  $("dracula-intro").hidden = true;
});
$("resume").addEventListener("click", togglePause);
$("pause-restart").addEventListener("click", () => {
  init(game.number);
  if (!game.tutorial) $("pause").focus();
});
$("pause-forfeit").addEventListener("click", () => {
  if (!game?.paused) return;
  togglePause();
  game.result = "forfeit";
  showTutorialStep(null);
  $("pause").disabled = true;
  $("level").focus();
});
$("level").addEventListener("change", () => init(Number($("level").value)));
$("restart").addEventListener("click", () => { if (game) init(game.number); });
$("next").addEventListener("click", () => init(game.number + 1));
$("find-enemy").addEventListener("click", () => {
  if (!game || game.paused || game.result) return;
  const index = game.enemies.indexOf(game.inspectedEnemy);
  const enemy = game.enemies[(index + 1) % game.enemies.length];
  if (!enemy) return;
  game.inspectedEnemy = enemy;
  moveCamera(enemy.x - view.width / 2, enemy.y - view.height / 2);
});
document.addEventListener("keydown", (event) => {
  if (event.repeat || location.hash === "#settings" || location.hash === "#maps") return;
  const pauseKey = event.code === "Escape" || event.code === "KeyP";
  const spaceKey = event.code === "Space" && !event.target.matches("button, select");
  if (!pauseKey && !spaceKey) return;
  event.preventDefault();
  togglePause();
});

function resizeView() {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const cx = (game?.camera.x ?? 0) + view.width / 2;
  const cy = (game?.camera.y ?? 0) + view.height / 2;
  const scale = Math.max(Math.min(width, height) / 320,
    game ? width / game.surface.width : 0, game ? height / game.surface.height : 0);
  const density = Math.min(window.devicePixelRatio || 1, 2);
  view.width = width / scale;
  view.height = height / scale;
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(height * density);
  if (game) moveCamera(cx - view.width / 2, cy - view.height / 2);
}

$("fullscreen").hidden = !document.fullscreenEnabled;
$("fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    $("fullscreen").hidden = true;
  }
});
document.addEventListener("fullscreenchange", () => {
  $("fullscreen").textContent = document.fullscreenElement ? "Выйти из полного экрана" : "На весь экран";
});
window.addEventListener("resize", resizeView);

function refreshControls() {
  const health = game.crystals.reduce((sum, crystal) => sum + Math.max(0, crystal.hp), 0);
  const metrics = {
    mana: Math.floor(game.mana),
    crystals: Math.ceil(health),
    wave: game.wave + "/" + game.map.waves.length,
    timer: game.result || game.tutorial ? "—" : Number.isFinite(game.nextWave)
      ? Math.max(0, Math.ceil(game.nextWave - game.time)) + " с"
      : game.enemies.length + game.queue.length,
    status: loadingLevel ? "Загрузка уровня…" : levelLoadError ||
      ({ victory: "Победа", defeat: "Поражение", forfeit: "Попытка завершена" }[game.result] ?? ""),
  };
  $("timer-label").textContent = Number.isFinite(game.nextWave) ? "До волны" : "Осталось врагов";
  $("find-enemy").hidden = Boolean(game.result || Number.isFinite(game.nextWave));
  $("find-enemy").disabled = game.paused || !game.enemies.length;
  for (const [id, value] of Object.entries(metrics)) {
    if ($(id).textContent !== String(value)) $(id).textContent = value;
  }
  for (const button of $("minions").children) {
    button.disabled = Boolean(!game.map.minions.includes(button.dataset.type) ||
      game.result || game.paused || game.intro || draculaSpawning() ||
      (game.tutorial && game.tutorial !== "summon") ||
      game.mana < balance.defenders[button.dataset.type].cost);
    button.setAttribute("aria-pressed", selected === button.dataset.type);
  }
}

function setupEditors() {
  let pendingMap = null;
  const mapEditor = setupMapEditor({
    originals: originalLevels, maps: customLevels, texture: images.castle_tiles,
    units: images.units, unitFrames: atlases.units,
    drawTiles, findFloors, findCrystals, connectStairs, connectIsolatedFloors, save: saveCustomLevel,
    openLevel: init,
    editBalance: (slot, map) => {
      const index = originalLevels.length + slot;
      const defaults = defaultLevelBalance(map, index);
      const options = structuredClone(balance.levels[index] ?? defaults);
      reconcileMapWaves(options, map);
      pendingMap = { slot, index, map, options, defaults };
    },
  });
  setupBalanceEditor({
    defaults: defaultBalance,
    maps: levels,
    portraitImage: images.units,
    portraitFrames: atlases.units,
    read: () => balance,
    currentLevel: () => game.number,
    pending: () => pendingMap,
    cancelPending: () => { pendingMap = null; },
    deleteMap: (index) => mapEditor.markDeleted(deleteCustomLevel(index)),
    apply: (draft, number) => {
      if (pendingMap) {
        saveCustomLevel(pendingMap.slot, pendingMap.map, draft);
        mapEditor.markSaved(pendingMap.slot, pendingMap.map);
        pendingMap = null;
      } else {
        saveProgress("balance-v1", JSON.stringify(draft));
      }
      balance = draft;
      init(number);
    },
  });
}

async function start() {
  const savedLevel = Number(readProgress("level"));
  const initialLevel = Number.isInteger(savedLevel) && savedLevel >= 1 && savedLevel <= levels.length ? savedLevel : 1;
  const useFullAssets = needsCampaign(initialLevel);
  const initialImages = useFullAssets ? ["environment"] : ["castle_tiles", "environment", "units", "ui"];
  const first = Promise.all(initialImages.map((name) => loadImage(name, name + "-first.webp")));
  if (useFullAssets) await Promise.all([first, loadCampaign()]);
  Object.assign(images, Object.fromEntries(await first));

  fillLevelSelect($("level"), levels);
  resizeView();
  initLoadedLevel(initialLevel);

  let editorsReady = false;
  async function openEditor() {
    if (editorsReady || !["#settings", "#maps"].includes(location.hash)) return;
    $("status").textContent = "Загрузка редактора…";
    try {
      await loadCampaign();
      if (editorsReady || !["#settings", "#maps"].includes(location.hash)) return;
      setupEditors();
      editorsReady = true;
    } catch (error) {
      $("status").textContent = error.message;
    }
  }
  window.addEventListener("hashchange", openEditor);
  void openEditor();

  let previous = performance.now();
  function tick(now) {
    update(Math.min((now - previous) / 1000, .06));
    previous = now;
    if (location.hash !== "#settings" && location.hash !== "#maps") {
      render();
      refreshControls();
      updateSummonPreview();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    void loadCampaign().catch((error) => console.warn("Фоновая загрузка кампании:", error));
  }));
}

start().catch((error) => {
  $("status").textContent = "Ошибка загрузки: " + error.message;
  console.error(error);
});
