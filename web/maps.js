"use strict";

const mapLayerLabels = {
  room: "Комнаты", interior: "Интерьер", curtain: "Шторы", furniture: "Мебель",
  crystal: "Кристаллы", stairs: "Лестницы", door: "Двери", wall: "Стены и пол", balcony: "Балконы",
};
const castleBlocks = {
  "room-window": ["Комната с окном", 4, 5],
  "room-curtain": ["Комната со шторами", 4, 5],
  "room-curtain-books": ["Комната со шторой и книгами", 4, 5],
  "room-shelf": ["Комната со шкафом", 4, 5],
  "room-armor": ["Комната с доспехами и черепом", 4, 5],
  "room-arch": ["Комната с аркой", 4, 5],
  "stairs-right": ["Каменная лестница ↗", 4, 5],
  "stairs-left": ["Каменная лестница ↖", 4, 5],
  balcony: ["Балкон слева · без спауна", 4, 8],
  "balcony-right": ["Балкон справа · без спауна", 4, 8],
  "spawn-air-left": ["Балкон · воздушный вход слева", 7, 8],
  "spawn-air-right": ["Балкон · воздушный вход справа", 7, 8],
  "spawn-ground-left": ["Вход с земли слева", 4, 5],
  "spawn-ground-right": ["Вход с земли справа", 4, 5],
  "roof-peak": ["Высокая крыша", 13, 8],
  "roof-strip": ["Карниз верхнего этажа", 8, 3],
  "roof-strip-small": ["Карниз на одну комнату", 4, 3],
  crystal: ["Кристалл", 4, 4],
  "wood-ladder": ["Деревянная лестница", 1, 6],
  dracula: ["Дракула", 2, 4],
};

function loadCustomLevels(saved) {
  try {
    const maps = JSON.parse(saved);
    if (Array.isArray(maps) && maps.every((map) => map?.name && Number.isInteger(map.width) &&
      Number.isInteger(map.height) && map.spawners && map.waves && map.minions && map.rooms &&
      Object.keys(mapLayerLabels).every((layer) => map.layers?.[layer]?.length === map.width * map.height))) {
      return maps;
    }
  } catch {
    // A missing or unreadable local copy starts with an empty map list.
  }
  return [];
}

function fillLevelSelect(select, maps) {
  const previous = Number(select.value);
  select.replaceChildren();
  maps.forEach((map, index) => select.add(new Option(map.name ? (index + 1) + " · " + map.name
    : String(index + 1), String(index + 1))));
  if (previous >= 1 && previous <= maps.length) select.value = String(previous);
}

function blankCastleMap(name, width, height) {
  return {
    name, width, height,
    layers: Object.fromEntries(Object.keys(mapLayerLabels).map((layer) => [layer, Array(width * height).fill(0)])),
    spawners: {}, waves: [], minions: ["Skeleton", "Spirit"], rooms: {}, dracula: -1,
  };
}

function resizeCastleMap(map, width, height) {
  const resized = blankCastleMap(map.name, width, height);
  for (const [name, destination] of Object.entries(resized.layers)) {
    for (let row = 0; row < Math.min(map.height, height); row++) {
      for (let col = 0; col < Math.min(map.width, width); col++) {
        destination[row * width + col] = map.layers[name][row * map.width + col];
      }
    }
  }
  const spawners = Object.fromEntries(Object.entries(map.spawners).filter(([, source]) =>
    source.doorX < width * 20 && source.doorY <= height * 20
  ).map(([id, source]) => [id, { ...source, y: source.y + (height - map.height) * 20 }]));
  const inside = (x, y) => x < width * 20 && y <= height * 20;
  return { ...map, width, height, layers: resized.layers, spawners,
    placedBlocks: (map.placedBlocks ?? []).map((block) => ({ ...block,
      cells: block.cells.filter((cell) => cell.x < width && cell.y < height),
    })).filter((block) => block.cells.length),
    woodLadders: (map.woodLadders ?? []).filter((ladder) => inside(ladder.x, ladder.bottom)),
    draculaPosition: map.draculaPosition && inside(map.draculaPosition.x, map.draculaPosition.y)
      ? map.draculaPosition : undefined };
}

function growCastleMapUp(map, rows) {
  const shift = rows * 20;
  const translate = (item, keys) => ({ ...item, ...Object.fromEntries(keys.map((key) => [key, item[key] + shift])) });
  return {
    ...map,
    height: map.height + rows,
    layers: Object.fromEntries(Object.entries(map.layers).map(([key, cells]) =>
      [key, Array(map.width * rows).fill(0).concat(cells)])),
    spawners: Object.fromEntries(Object.entries(map.spawners).map(([id, source]) =>
      [id, translate(source, ["doorY"])])),
    placedBlocks: (map.placedBlocks ?? []).map((block) => ({ ...block, y: block.y + rows,
      cells: block.cells.map((cell) => ({ ...cell, y: cell.y + rows })),
    })),
    woodLadders: (map.woodLadders ?? []).map((ladder) => translate(ladder, ["top", "bottom"])),
    draculaPosition: map.draculaPosition && translate(map.draculaPosition, ["y"]),
  };
}

function addCastleSpawn(map, type, door) {
  const nextId = Math.max(map.nextSpawnId ?? 0, Math.max(-1, ...Object.keys(map.spawners).map(Number)) + 1);
  const id = String(nextId);
  map.nextSpawnId = nextId + 1;
  map.spawners[id] = {
    type, x: door.x - door.side * 65, y: map.height * 20 - door.y + (type === "air" ? 50 : 0),
    doorX: door.x, doorY: door.y,
  };
  return id;
}

function stampCastle(map, tool, x, y) {
  const legacy = {
    room: [8, 5], "door-left": [3, 3], "door-right": [3, 3], crystal: [4, 4],
    "stairs-left": [4, 5], "stairs-right": [4, 5],
  };
  const [width, height] = legacy[tool] ?? castleBlocks[tool].slice(1);
  if (x < 0 || y < 0 || x + width > map.width || y + height > map.height) return false;
  if (tool.startsWith("spawn-")) {
    const air = tool.includes("-air-");
    const left = tool.endsWith("-left");
    const doorX = x + (air ? (left ? 4 : 0) : (left ? 0 : 1));
    if (air) stampCastle(map, left ? "balcony" : "balcony-right", x + (left ? 0 : 3), y);
    else stampCastle(map, "room-window", x, y);
    for (let col = 0; col < 3; col++) {
      map.layers.wall[(y + 4) * map.width + doorX + col] = 113 + col;
    }
    stampCastle(map, left ? "door-left" : "door-right", doorX, y + 1);
    addCastleSpawn(map, air ? "air" : "ground", {
      x: (doorX + 1.5) * 20, y: (y + 4) * 20, side: left ? 1 : -1,
    });
    return true;
  }
  const room = tool === "room" || tool.startsWith("room-") || tool.startsWith("stairs-");
  const roomStyle = { "room-window": 9, "room-shelf": 13, "room-armor": 9 };
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = (y + row) * map.width + x + col;
      if (tool.startsWith("roof-")) {
        const start = tool === "roof-peak" ? 393 : [201, 229, 113][row];
        map.layers.wall[index] = start + (tool === "roof-peak" ? 28 * row : 0) + col;
      } else if (room) {
        if (row === 4) map.layers.wall[index] = 113 + col % 8;
        else {
          map.layers.room[index] = 22 + 28 * row;
          map.layers.interior[index] = (roomStyle[tool] ?? 5) + 28 * row + col % 4;
          map.layers.furniture[index] = 258 + 28 * row + col % 4;
          map.layers.curtain[index] = 0;
          if (tool === "room-shelf" && col < 3) map.layers.curtain[index] = 191 + 28 * row + col;
          if (tool === "room-curtain" && col === 1 && row < 4) map.layers.curtain[index] = 264 + 28 * row;
          if (tool === "room-curtain-books" && col === 2 && row < 4) map.layers.curtain[index] = 267 + 28 * row;
          if (row === 3 && col === 2 && tool === "room-curtain") map.layers.curtain[index] = 256;
          if (row === 3 && col === 1 && tool === "room-curtain-books") map.layers.curtain[index] = 257;
          if (tool === "room-armor") {
            if (row >= 1 && (col === 1 || col === 2)) map.layers.curtain[index] = 222 + (row - 1) * 28 + col - 1;
            if (row === 3 && col === 2) map.layers.curtain[index] = 256;
          }
          if (tool.startsWith("stairs-")) {
            map.layers.stairs[index] = (tool === "stairs-right" ? 1 : 17) + 28 * row + col;
          }
        }
      } else if (tool === "balcony" || tool === "balcony-right") {
        const shift = tool === "balcony-right" ? 4 : 0;
        if (row >= 4) map.layers.wall[index] = 490 + (row - 4) * 28 + col + shift;
        else {
          map.layers.balcony[index] = 22 + 28 * row;
          if (row >= 2) map.layers.interior[index] = 434 + (row - 2) * 28 + col + shift;
        }
      } else if (tool.startsWith("door")) {
        map.layers.wall[index] = 0;
        map.layers.door[index] = (tool === "door-left" ? 213 : 216) + 28 * row + col;
      } else if (tool === "crystal") {
        map.layers.crystal[index] = 25 + 28 * row + col;
      }
    }
  }
  return true;
}

function connectWoodLadders(map, floors) {
  const crossings = [];
  for (const ladder of map.woodLadders ?? []) {
    const matches = (floor, y) => floor.y === y && ladder.x >= floor.left && ladder.x < floor.right;
    const top = floors.find((floor) => matches(floor, ladder.top));
    const bottom = floors.find((floor) => matches(floor, ladder.bottom));
    if (!top || !bottom) continue;
    const head = { x: ladder.x, y: top.y, floor: top };
    const foot = { x: ladder.x, y: bottom.y, floor: bottom };
    head.stair = foot;
    foot.stair = head;
    top.nodes.push(head);
    bottom.nodes.push(foot);
    crossings.push({ ...ladder, endX: ladder.x });
  }
  return crossings;
}

function rememberPlacedBlock(map, previous, box, template) {
  const cells = [];
  for (const [layer, values] of Object.entries(map.layers)) {
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) {
        const index = y * map.width + x;
        const before = previous.layers[layer][index];
        const after = values[index];
        const sample = (y - box.y) * box.w + x - box.x;
        if (before !== after || template?.layers[layer][sample]) cells.push({ layer, x, y, before, after });
      }
    }
  }
  const spawners = Object.keys(map.spawners).filter((id) => !Object.hasOwn(previous.spawners, id));
  if (cells.length || spawners.length) (map.placedBlocks ??= []).push({ ...box, cells, spawners });
}

function removePlacedBlock(map, target) {
  const blocks = map.placedBlocks;
  const index = blocks.indexOf(target);
  for (const cell of target.cells) {
    let next;
    for (let i = index + 1; i < blocks.length && !next; i++) {
      next = blocks[i].cells.find((other) => other.layer === cell.layer && other.x === cell.x && other.y === cell.y);
    }
    if (next) {
      if (next.before === cell.after) next.before = cell.before;
    } else {
      const values = map.layers[cell.layer];
      const at = cell.y * map.width + cell.x;
      if (values[at] === cell.after) values[at] = cell.before;
    }
  }
  for (const id of target.spawners) delete map.spawners[id];
  blocks.splice(index, 1);
}

function prepareCustomMap(map, { findFloors, findCrystals, connectStairs, connectIsolatedFloors }) {
  const floors = findFloors(map);
  const marker = map.draculaPosition;
  if (marker && !floors.some((floor) => floor.y === marker.y && floor.rooms.some((room) =>
    marker.x >= room.left && marker.x < room.right))) {
    throw new Error("Дракула остался без комнаты. Перенеси его или убери с карты.");
  }
  const crystals = findCrystals(map, floors, 150);
  if (!crystals.length || crystals.some((crystal) => !crystal.floor?.rooms.length)) {
    throw new Error("Поставь хотя бы один кристалл внутри комнаты. Нижний ряд кристалла должен совпасть с нижним рядом комнаты.");
  }
  const doors = floors.flatMap((floor) => floor.doors);
  const entries = Object.entries(map.spawners);
  if (!entries.length) throw new Error("Добавь хотя бы одну точку появления на двери.");
  connectStairs(map, floors);
  if (connectWoodLadders(map, floors).length !== (map.woodLadders?.length ?? 0)) {
    throw new Error("Деревянная лестница осталась без одного из этажей. Перенеси её или убери с карты.");
  }
  connectIsolatedFloors(floors, crystals);
  for (const [id, source] of entries) {
    const door = doors.find((candidate) => source.doorX === candidate.x && source.doorY === candidate.y);
    if (!door) throw new Error("Точка " + id + " осталась без двери. Удали её и поставь заново.");
    const visited = new Set([door.floor]);
    for (const floor of visited) {
      for (const node of floor.nodes) visited.add(node.stair.floor);
    }
    if (crystals.some((crystal) => !visited.has(crystal.floor))) {
      throw new Error("Из точки " + id + " нет прохода ко всем кристаллам. Соедини комнаты лестницами или общим этажом.");
    }
  }
  const { width, height, layers, spawners, minions, rooms, dracula,
    woodLadders, draculaPosition, placedBlocks, nextSpawnId } = map;
  return structuredClone({
    name: map.name.trim() || "Мой замок", width, height, layers, spawners, minions, rooms, dracula,
    woodLadders, draculaPosition, placedBlocks, nextSpawnId,
    waves: [{ delay: 10, events: [{ spawner: entries[0][0], hunters: ["knight", "knight", "knight"] }] }],
  });
}

function setupMapEditor(api) {
  const page = $("map-page");
  const board = $("map-canvas");
  const preview = $("map-preview");
  const scroll = $("map-scroll");
  const zoom = $("map-zoom");
  const palette = $("map-palette");
  const select = $("map-select");
  const toolSelect = $("map-tool");
  const layerSelect = $("map-layer");
  const name = $("map-name");
  const width = $("map-width");
  const height = $("map-height");
  const status = $("map-status");
  const tools = {
    brush: "Кисть", erase: "Ластик слоя", room: "Комната 8 × 4",
    "door-left": "Дверь · вход слева", "door-right": "Дверь · вход справа",
    crystal: "Кристалл", "stairs-right": "Лестница вверх вправо",
    "stairs-left": "Лестница вверх влево", balcony: "Балкон",
    ground: "Наземная точка", air: "Воздушная точка", "erase-object": "Убрать объект",
    "erase-block": "Удалить блок", "erase-rectangle": "Очистить прямоугольник",
    ...Object.fromEntries(Object.entries(castleBlocks).map(([key, [label]]) => [key, label])),
  };
  let map;
  let index;
  let selectedTile = 1;
  let stroke = null;
  let draggedBlock = null;
  let touchDrag = null;
  let touchBoard = null;
  let previewPointer = null;
  let eraseStart = null;
  let scrollFrame = 0;
  const blockTiles = new Map();
  const undo = [];

  function populate(control, values) {
    for (const [key, text] of Object.entries(values)) control.add(new Option(text, key));
  }

  function syncSelect() {
    select.replaceChildren(new Option("Новая карта из шаблона", "new"));
    api.maps.forEach((saved, i) => select.add(new Option(saved.name, String(i))));
    select.value = index === null ? "new" : String(index);
  }

  function remember() {
    undo.push(structuredClone(map));
    if (undo.length > 30) undo.shift();
  }

  function sync() {
    name.value = map.name;
    width.value = map.width;
    height.value = map.height;
    syncSelect();
    render();
  }

  function draft() {
    const saved = index === null ? api.originals[0] : api.maps[index];
    map = structuredClone(saved);
    if (index === null) {
      map.name = "Мой замок " + (api.maps.length + 1);
      const door = api.findFloors(map).flatMap((floor) => floor.doors)[0];
      map.spawners = {};
      if (door) addCastleSpawn(map, "ground", door);
    }
    undo.length = 0;
    status.textContent = "";
    sync();
  }

  function drawObject(paint, name, x, y, size) {
    const frame = api.unitFrames[name + ".png"];
    const scale = size / Math.max(frame.width, frame.height);
    const w = frame.width * scale;
    const h = frame.height * scale;
    paint.drawImage(api.units, frame.x, frame.y, frame.width, frame.height, x - w / 2, y - h, w, h);
  }

  function drawLadder(paint, { x, top, bottom }) {
    paint.fillStyle = "#3e281d";
    paint.fillRect(x - 7, top, 3, bottom - top);
    paint.fillRect(x + 4, top, 3, bottom - top);
    paint.fillStyle = "#a88051";
    for (let y = top + 5; y < bottom; y += 9) paint.fillRect(x - 6, y, 12, 2);
  }

  function render() {
    const scene = api.drawTiles(map);
    if (board.width !== scene.width || board.height !== scene.height) {
      board.width = scene.width;
      board.height = scene.height;
      preview.width = scene.width;
      preview.height = scene.height;
    }
    resizeBoard();
    const paint = board.getContext("2d");
    paint.clearRect(0, 0, board.width, board.height);
    paint.drawImage(scene, 0, 0);
    if (["crystal", "balcony"].includes(layerSelect.value)) {
      const layer = map.layers[layerSelect.value];
      paint.fillStyle = layerSelect.value === "crystal" ? "#ffc54555" : "#54dfcb40";
      layer.forEach((gid, i) => {
        if (gid) paint.fillRect(i % map.width * 20, Math.floor(i / map.width) * 20, 20, 20);
      });
    }
    paint.strokeStyle = "#e9d5fa26";
    paint.beginPath();
    for (let x = 0; x <= board.width; x += 20) {
      paint.moveTo(x + .5, 0);
      paint.lineTo(x + .5, board.height);
    }
    for (let y = 0; y <= board.height; y += 20) {
      paint.moveTo(0, y + .5);
      paint.lineTo(board.width, y + .5);
    }
    paint.stroke();
    for (const crystal of api.findCrystals(map, [], 150)) drawObject(paint, "crystalball1", crystal.x, crystal.y, 80);
    for (const ladder of map.woodLadders ?? []) drawLadder(paint, ladder);
    if (map.draculaPosition) {
      drawObject(paint, "dracula_idle1", map.draculaPosition.x, map.draculaPosition.y, 60);
    }
    const spawners = $("map-spawners");
    spawners.replaceChildren();
    for (const [id, source] of Object.entries(map.spawners)) {
      paint.fillStyle = source.type === "air" ? "#5acfff" : "#8dea78";
      paint.fillRect(source.doorX - 11, source.doorY - 25, 22, 20);
      paint.fillStyle = "#211825";
      paint.font = "bold 13px system-ui";
      paint.textAlign = "center";
      paint.fillText(id, source.doorX, source.doorY - 11);
      const row = document.createElement("div");
      const label = document.createElement("span");
      label.textContent = id + " · " + (source.type === "air" ? "Воздух" : "Земля");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Удалить";
      remove.addEventListener("click", () => {
        remember();
        delete map.spawners[id];
        render();
      });
      row.append(label, remove);
      spawners.append(row);
    }
    $("map-undo").disabled = undo.length === 0;
    if (previewPointer) showPreview(previewPointer);
  }

  function resizeBoard() {
    const scale = Number(zoom.value) || 1;
    for (const surface of [board, preview]) {
      surface.style.width = board.width * scale + "px";
      surface.style.height = board.height * scale + "px";
    }
  }

  function pointAt(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor((event.clientX - rect.left) * canvas.width / rect.width / 20),
      y: Math.floor((event.clientY - rect.top) * canvas.height / rect.height / 20),
    };
  }

  function putBlock(tool, x, y) {
    const floors = api.findFloors(map);
    const px = (x + .5) * 20;
    const py = (y + .5) * 20;
    const candidates = floors.filter((floor) => px >= floor.left && px < floor.right);
    const clickedFloor = candidates.find((floor) => floor.y > py && floor.y - py <= 80);
    if (tool === "erase-rectangle") {
      if (!eraseStart) {
        eraseStart = { x, y };
        status.textContent = "Теперь выбери противоположный угол.";
        return;
      }
      remember();
      const box = eraseBounds(x, y);
      for (const layer of Object.values(map.layers)) {
        for (let row = box.y; row < box.y + box.h; row++) {
          layer.fill(0, row * map.width + box.x, row * map.width + box.x + box.w);
        }
      }
      for (const [id, source] of Object.entries(map.spawners)) {
        if (contains(box, source.doorX / 20, source.doorY / 20 - 1)) delete map.spawners[id];
      }
      eraseStart = null;
      render();
      return;
    }
    remember();
    let placed = false;
    if (tool === "crystal") {
      if (clickedFloor?.rooms.length) {
        const row = clickedFloor.y / 20 - 4;
        const left = Math.max(0, Math.min(map.width - 4, x - 1));
        placed = !api.findCrystals(map, [], 150).some((crystal) =>
          crystal.y === clickedFloor.y && Math.abs(crystal.x - (left + 2) * 20) < 80) &&
          stampCastle(map, tool, left, row);
      }
      if (!placed) status.textContent = "Выбери свободное место внутри комнаты для кристалла.";
    } else if (tool === "dracula") {
      if (clickedFloor?.rooms.some((room) => px >= room.left && px < room.right)) {
        map.draculaPosition = { x: px, y: clickedFloor.y };
        placed = true;
      } else status.textContent = "Поставь Дракулу внутри комнаты.";
    } else if (tool === "wood-ladder") {
      const upper = candidates.filter((floor) => floor.y < clickedFloor?.y).at(-1);
      if (upper && clickedFloor) {
        map.woodLadders ??= [];
        if (!map.woodLadders.some((item) => item.x === px && item.top === upper.y && item.bottom === clickedFloor.y)) {
          map.woodLadders.push({ x: px, top: upper.y, bottom: clickedFloor.y });
          placed = true;
        }
      }
      if (!placed) status.textContent = "Выбери нижний этаж в колонке, где над ним есть ещё один этаж.";
    } else if (tool === "erase-block" || tool === "erase-object") {
      if (map.draculaPosition && Math.abs(px - map.draculaPosition.x) < 30 &&
          py < map.draculaPosition.y && py > map.draculaPosition.y - 70) {
        delete map.draculaPosition;
        placed = true;
      } else {
        const ladders = map.woodLadders ?? [];
        const at = ladders.findIndex((item) => Math.abs(item.x - px) < 14 && py >= item.top && py <= item.bottom);
        if (at >= 0) {
          ladders.splice(at, 1);
          placed = true;
        } else {
          const crystal = api.findCrystals(map, [], 150).find((item) =>
            Math.abs(item.x - px) < 40 && py < item.y && py > item.y - 80);
          if (crystal) {
            const left = crystal.x / 20 - 2;
            for (let row = crystal.y / 20 - 4; row < crystal.y / 20; row++) {
              map.layers.crystal.fill(0, row * map.width + left, row * map.width + left + 4);
            }
            placed = true;
          }
        }
      }
      if (!placed && tool === "erase-block") {
        const target = placedAt(x, y);
        if (target) {
          removePlacedBlock(map, target);
          placed = true;
        } else {
          status.textContent = "Здесь нет записанного блока. Для старой карты выбери «Очистить прямоугольник» в инструментах тайлов.";
        }
      }
    } else {
      const box = blockBounds(tool, x, y);
      placed = stampCastle(map, tool, box.x, box.y);
      if (placed) rememberPlacedBlock(map, undo.at(-1), box, blockTiles.get(tool));
      if (!placed) status.textContent = "Блок не помещается в границы карты.";
    }
    if (!placed) undo.pop();
    render();
  }

  function contains(box, x, y) {
    return x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
  }

  function placedAt(x, y) {
    return map.placedBlocks?.findLast((block) => contains(block, x, y));
  }

  function eraseBounds(x, y) {
    const start = eraseStart ?? { x, y };
    return { x: Math.min(x, start.x), y: Math.min(y, start.y),
      w: Math.abs(x - start.x) + 1, h: Math.abs(y - start.y) + 1 };
  }

  function blockBounds(tool, x, y) {
    const [, w, h] = castleBlocks[tool] ?? ["", tool.startsWith("door-") ? 3 : 8, tool.startsWith("door-") ? 3 : 5];
    if (!castleBlocks[tool]) return { x, y, w, h };
    if (tool.startsWith("balcony") || tool.startsWith("spawn-air-")) {
      const right = tool.endsWith("-right");
      const offset = tool.startsWith("spawn-air-") ? (right ? 3 : 4) : (right ? 0 : 4);
      const floors = api.findFloors(map).filter((floor) => floor.rooms.length &&
        Math.abs(floor.y / 20 - y) <= 1 &&
        x * 20 >= floor.left - 60 && x * 20 <= floor.right + 60);
      const floor = floors.reduce((best, item) =>
        !best || Math.abs(item.y / 20 - y) < Math.abs(best.y / 20 - y) ? item : best, null);
      const seam = floor ? floor.y / 20 : y;
      return { x: x - offset, y: seam - 4, w, h, seam, wallJoint: x };
    }
    const left = x - Math.floor(w / 2);
    const floors = ["crystal", "dracula", "wood-ladder"].includes(tool) ? api.findFloors(map)
      .filter((floor) => (x + .5) * 20 >= floor.left && (x + .5) * 20 < floor.right) : [];
    const floor = floors.find((item) => item.y > (y + .5) * 20 && item.y - (y + .5) * 20 <= 80);
    if (tool === "wood-ladder" && floor) {
      const upper = floors.filter((item) => item.y < floor.y).at(-1);
      if (upper) return { x, y: upper.y / 20, w: 1, h: (floor.y - upper.y) / 20 };
    }
    if (tool === "crystal" && floor) {
      return { x: Math.max(0, Math.min(map.width - 4, x - 1)), y: floor.y / 20 - 4, w, h };
    }
    if (tool === "dracula" && floor) return { x: left, y: floor.y / 20 - h, w, h };
    return { x: left, y: tool.startsWith("roof-") ? y - h : y, w, h,
      invalid: ["crystal", "dracula", "wood-ladder"].includes(tool) };
  }

  function clearPreview() {
    previewPointer = null;
    preview.getContext("2d").clearRect(0, 0, preview.width, preview.height);
  }

  function insideBoard(event) {
    const rect = board.getBoundingClientRect();
    const visible = scroll.getBoundingClientRect();
    return event.clientX >= Math.max(rect.left, visible.left) &&
      event.clientX < Math.min(rect.right, visible.right) &&
      event.clientY >= Math.max(rect.top, visible.top) &&
      event.clientY < Math.min(rect.bottom, visible.bottom);
  }

  function showPreview(event) {
    clearPreview();
    if (!insideBoard(event)) return;
    const tool = draggedBlock ?? toolSelect.value;
    if (!castleBlocks[tool] && !["erase-block", "erase-rectangle"].includes(tool)) return;
    previewPointer = event;
    const { x, y } = pointAt(event, board);
    const deleting = tool.startsWith("erase-");
    const box = tool === "erase-block" ? placedAt(x, y) ?? { x, y, w: 1, h: 1 }
      : tool === "erase-rectangle" ? eraseBounds(x, y) : blockBounds(tool, x, y);
    const paint = preview.getContext("2d");
    const fits = !box.invalid && box.x >= 0 && box.y >= 0 && box.x + box.w <= map.width &&
      box.y + box.h <= map.height;
    paint.fillStyle = fits && !deleting ? "#78e8b326" : "#ff545050";
    paint.fillRect(box.x * 20, box.y * 20, box.w * 20, box.h * 20);
    const block = blockTiles.get(tool);
    if (fits && block) {
      paint.fillStyle = "#ffc15480";
      const collision = new Set();
      for (const [layer, cells] of Object.entries(block.layers)) {
        cells.forEach((gid, i) => {
          if (!gid) return;
          const col = box.x + i % block.width;
          const row = box.y + Math.floor(i / block.width);
          const at = row * map.width + col;
          const structural = layer === "wall" || layer === "room" || layer === "balcony";
          if (map.layers[layer][at] || (structural && (map.layers.room[at] || map.layers.wall[at]))) collision.add(at);
        });
      }
      for (const at of collision) paint.fillRect(at % map.width * 20, Math.floor(at / map.width) * 20, 20, 20);
    }
    paint.strokeStyle = fits && !deleting ? "#87f1bb" : "#ff8079";
    paint.lineWidth = 2;
    paint.strokeRect(box.x * 20 + 1, box.y * 20 + 1, box.w * 20 - 2, box.h * 20 - 2);
    paint.fillStyle = "#fff3de";
    paint.font = "bold 13px system-ui";
    paint.textAlign = "left";
    paint.fillText(box.w + " × " + box.h, Math.max(3, box.x * 20 + 5), Math.max(15, box.y * 20 + 16));
    if (box.seam !== undefined && !deleting) {
      const seam = box.seam * 20;
      paint.strokeStyle = "#72dbff";
      paint.beginPath();
      paint.moveTo(box.x * 20 - 20, seam);
      paint.lineTo((box.x + box.w) * 20 + 20, seam);
      paint.stroke();
      paint.fillStyle = "#b8efff";
      paint.fillText("Пол этажа", Math.max(3, box.x * 20 + 5), seam - 5);
      const joint = box.wallJoint * 20;
      paint.strokeStyle = "#ffdd94";
      paint.beginPath();
      paint.moveTo(joint, box.y * 20 - 12);
      paint.lineTo(joint, (box.y + box.h) * 20 + 12);
      paint.stroke();
      paint.fillStyle = "#ffdd94";
      paint.fillText("Стык со стеной", Math.min(joint + 5, preview.width - 110),
        Math.max(15, box.y * 20 - 5));
    }
  }

  function paintTile(x, y) {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
    map.layers[layerSelect.value][y * map.width + x] = toolSelect.value === "erase" ? 0 : selectedTile;
  }

  function renderPalette() {
    const paint = palette.getContext("2d");
    paint.clearRect(0, 0, palette.width, palette.height);
    paint.drawImage(api.texture, 0, 0);
    paint.strokeStyle = "#ffd66b";
    paint.lineWidth = 2;
    const columns = palette.width / 20;
    paint.strokeRect((selectedTile - 1) % columns * 20 + 1,
      Math.floor((selectedTile - 1) / columns) * 20 + 1, 18, 18);
    $("map-tile").textContent = "Тайл №" + selectedTile;
  }

  function renderBlocks() {
    const list = $("map-blocks");
    for (const [id, [label, w, h]] of Object.entries(castleBlocks)) {
      const sample = blankCastleMap("", w, h);
      const thumb = document.createElement("canvas");
      thumb.width = w * 20;
      thumb.height = h * 20;
      thumb.setAttribute("aria-hidden", "true");
      const paint = thumb.getContext("2d");
      if (id === "dracula") drawObject(paint, "dracula_idle1", thumb.width / 2, thumb.height - 4, 54);
      else if (id === "crystal") drawObject(paint, "crystalball1", thumb.width / 2, thumb.height, 75);
      else if (id === "wood-ladder") drawLadder(paint, { x: 10, top: 4, bottom: thumb.height - 4 });
      else {
        stampCastle(sample, id, 0, 0);
        blockTiles.set(id, sample);
        paint.drawImage(api.drawTiles(sample), 0, 0);
      }
      const card = document.createElement("button");
      card.type = "button";
      card.draggable = true;
      card.className = "map-block";
      card.dataset.tool = id;
      const title = document.createElement("span");
      title.textContent = label;
      const labelBox = document.createElement("span");
      const size = document.createElement("small");
      size.textContent = w + " × " + h + " клеток";
      labelBox.append(title, size);
      const handle = document.createElement("span");
      handle.className = "map-block-handle";
      handle.textContent = "⠿";
      handle.setAttribute("aria-hidden", "true");
      card.append(thumb, labelBox, handle);
      card.addEventListener("click", () => selectTool(id));
      card.addEventListener("dragstart", (event) => {
        draggedBlock = id;
        selectTool(id);
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", id);
      });
      card.addEventListener("dragend", () => {
        finishDrag();
      });
      handle.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse") return;
        event.preventDefault();
        selectTool(id);
        draggedBlock = id;
        touchDrag = { id: event.pointerId, handle };
        handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener("pointermove", (event) => {
        if (touchDrag?.id === event.pointerId) trackDrag(event);
      });
      handle.addEventListener("pointerup", (event) => {
        if (touchDrag?.id !== event.pointerId) return;
        if (insideBoard(event)) {
          const { x, y } = pointAt(event, board);
          status.textContent = "";
          putBlock(id, x, y);
        }
        finishDrag();
      });
      handle.addEventListener("lostpointercapture", () => {
        if (touchDrag?.handle === handle) finishDrag();
      });
      list.append(card);
    }
  }

  function selectTool(tool) {
    eraseStart = null;
    toolSelect.value = tool;
    $("map-delete-block").setAttribute("aria-pressed", String(tool === "erase-block"));
    for (const card of $("map-blocks").children) {
      card.setAttribute("aria-pressed", String(card.dataset.tool === tool));
    }
    if (previewPointer) showPreview(previewPointer);
  }

  let dragPointer;
  function trackDrag(event) {
    dragPointer = event;
    showPreview(event);
    if (!scrollFrame) scrollFrame = requestAnimationFrame(scrollNearEdge);
  }

  function scrollNearEdge() {
    scrollFrame = 0;
    if (!draggedBlock || !dragPointer) return;
    const rect = scroll.getBoundingClientRect();
    const { clientX: x, clientY: y } = dragPointer;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
    const edge = (position, start, end) => position - start < 32 ? -10 : end - position < 32 ? 10 : 0;
    const dx = edge(x, rect.left, rect.right);
    const dy = edge(y, rect.top, rect.bottom);
    if (!dx && !dy) return;
    scroll.scrollLeft += dx;
    scroll.scrollTop += dy;
    showPreview(dragPointer);
    scrollFrame = requestAnimationFrame(scrollNearEdge);
  }

  function finishDrag() {
    draggedBlock = null;
    touchDrag = null;
    dragPointer = null;
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    clearPreview();
    board.classList.remove("map-drop-target");
  }

  function saveAndGo(destination) {
    try {
      const complete = prepareCustomMap(map, api);
      const slot = index ?? api.maps.length;
      const number = api.save(slot, complete);
      index = slot;
      map = structuredClone(complete);
      sync();
      status.textContent = "Карта сохранена.";
      if (destination !== null) {
        location.hash = destination;
        $("game-page").hidden = Boolean(destination);
        api.openLevel(number);
      }
    } catch (error) {
      status.textContent = error.name === "QuotaExceededError" || error.name === "SecurityError"
        ? "Браузер не смог сохранить карту в локальном хранилище. Черновик ещё открыт."
        : error.message;
    }
  }

  populate(layerSelect, mapLayerLabels);
  populate(toolSelect, tools);
  renderBlocks();
  selectTool("room-window");
  layerSelect.value = "interior";
  palette.width = api.texture.width;
  palette.height = api.texture.height;
  palette.addEventListener("pointerdown", (event) => {
    const { x, y } = pointAt(event, palette);
    if (x < 0 || y < 0 || x >= palette.width / 20 || y >= palette.height / 20) return;
    selectedTile = y * palette.width / 20 + x + 1;
    selectTool("brush");
    renderPalette();
  });
  board.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch" && !["brush", "erase"].includes(toolSelect.value)) {
      touchBoard = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false,
        left: scroll.scrollLeft, top: scroll.scrollTop };
      board.setPointerCapture(event.pointerId);
      return;
    }
    applyBoardTool(event);
  });

  function applyBoardTool(event) {
    const { x, y } = pointAt(event, board);
    const tool = toolSelect.value;
    status.textContent = "";
    if (tool === "ground" || tool === "air") {
      const doors = api.findFloors(map).flatMap((floor) => floor.doors);
      const door = doors.find((entry) => Math.abs(entry.x - (x + .5) * 20) <= 30 &&
        entry.y - (y + .5) * 20 > 0 && entry.y - (y + .5) * 20 <= 60);
      if (door) {
        remember();
        addCastleSpawn(map, tool, door);
      } else status.textContent = "Щёлкни внутри двери, чтобы привязать точку появления.";
    } else if (tool === "brush" || tool === "erase") {
      remember();
      stroke = { x, y, id: event.pointerId };
      board.setPointerCapture(event.pointerId);
      paintTile(x, y);
    } else {
      putBlock(tool, x, y);
      return;
    }
    render();
  }
  board.addEventListener("dragover", (event) => {
    if (!draggedBlock) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    board.classList.add("map-drop-target");
    trackDrag(event);
  });
  board.addEventListener("dragleave", () => {
    board.classList.remove("map-drop-target");
    dragPointer = null;
    clearPreview();
  });
  board.addEventListener("drop", (event) => {
    if (!draggedBlock) return;
    event.preventDefault();
    const { x, y } = pointAt(event, board);
    status.textContent = "";
    putBlock(draggedBlock, x, y);
    finishDrag();
  });
  board.addEventListener("pointermove", (event) => {
    if (touchBoard?.id === event.pointerId) {
      const dx = event.clientX - touchBoard.x;
      const dy = event.clientY - touchBoard.y;
      if (Math.hypot(dx, dy) >= 8) touchBoard.moved = true;
      if (touchBoard.moved) {
        scroll.scrollLeft = touchBoard.left - dx;
        scroll.scrollTop = touchBoard.top - dy;
      }
      return;
    }
    if (stroke?.id !== event.pointerId) {
      if (event.pointerType === "mouse") showPreview(event);
      return;
    }
    const { x, y } = pointAt(event, board);
    if (x === stroke.x && y === stroke.y) return;
    const dx = x - stroke.x;
    const dy = y - stroke.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 1; i <= steps; i++) {
      paintTile(Math.round(stroke.x + dx * i / steps), Math.round(stroke.y + dy * i / steps));
    }
    stroke = { x, y, id: event.pointerId };
    render();
  });
  board.addEventListener("pointerup", (event) => {
    if (touchBoard?.id === event.pointerId && !touchBoard.moved && insideBoard(event)) applyBoardTool(event);
    touchBoard = null;
  });
  board.addEventListener("pointerleave", clearPreview);
  board.addEventListener("contextmenu", (event) => {
    if (event.button !== 2 || event.pointerType === "touch") return;
    event.preventDefault();
    const { x, y } = pointAt(event, board);
    status.textContent = "";
    putBlock("erase-block", x, y);
  });
  board.addEventListener("lostpointercapture", () => { stroke = null; touchBoard = null; });
  scroll.addEventListener("scroll", () => { if (previewPointer) showPreview(previewPointer); });
  zoom.addEventListener("change", () => { resizeBoard(); clearPreview(); });
  select.addEventListener("change", () => { index = select.value === "new" ? null : Number(select.value); draft(); });
  name.addEventListener("input", () => { map.name = name.value; });
  layerSelect.addEventListener("change", render);
  toolSelect.addEventListener("change", () => selectTool(toolSelect.value));
  $("map-resize").addEventListener("click", () => {
    if (!width.reportValidity() || !height.reportValidity() || !width.value || !height.value) return;
    remember();
    map = resizeCastleMap(map, Number(width.value), Number(height.value));
    sync();
  });
  $("map-grow").addEventListener("click", () => {
    const rows = Math.min(10, 160 - map.height);
    if (rows < 1) {
      status.textContent = "Достигнута высота в 160 рядов.";
      return;
    }
    remember();
    map = growCastleMapUp(map, rows);
    clearPreview();
    sync();
    scroll.scrollTop = 0;
    status.textContent = "Добавлено рядов сверху: " + rows + ".";
  });
  $("map-blank").addEventListener("click", () => {
    remember();
    map = blankCastleMap(map.name, map.width, map.height);
    sync();
  });
  function undoEdit() {
    if (!undo.length) return;
    map = undo.pop();
    status.textContent = "";
    sync();
  }
  $("map-undo").addEventListener("click", undoEdit);
  window.addEventListener("keydown", (event) => {
    if (location.hash !== "#maps" || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey ||
        event.code !== "KeyZ" || event.target.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    if (!event.repeat) undoEdit();
  });
  $("map-delete-block").addEventListener("click", () => {
    selectTool(toolSelect.value === "erase-block" ? "room-window" : "erase-block");
  });
  $("map-save").addEventListener("click", () => saveAndGo(null));
  $("map-balance").addEventListener("click", () => {
    try {
      api.editBalance(index ?? api.maps.length, prepareCustomMap(map, api));
      location.hash = "#settings";
    } catch (error) {
      status.textContent = error.message;
    }
  });
  $("map-play").addEventListener("click", () => saveAndGo(""));
  function route() {
    const editing = location.hash === "#maps";
    page.hidden = !editing;
    if (!editing) return;
    $("game-page").hidden = true;
    if (!map) {
      index = null;
      draft();
      renderPalette();
    }
  }
  window.addEventListener("hashchange", route);
  route();
  return {
    markDeleted(slot) {
      if (index === slot) {
        index = null;
        draft();
      } else {
        if (index !== null && index > slot) index--;
        syncSelect();
      }
    },
    markSaved(slot, saved) {
      index = slot;
      map = structuredClone(saved);
      sync();
      status.textContent = "Карта сохранена.";
    },
  };
}
