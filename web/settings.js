"use strict";

function loadBalance(defaults, saved) {
  try {
    const value = JSON.parse(saved);
    if (Array.isArray(value?.levels) && value.rules && value.defenders && value.hunters) {
      if (!value.version && value.levels[15]?.startingMana === 220) {
        value.levels[15].startingMana = defaults.levels[15].startingMana;
      }
      value.levels = defaults.levels.map((level, index) => value.levels[index] ?? structuredClone(level));
      value.version = defaults.version;
      return value;
    }
  } catch {
    // A new session can always start from the bundled balance.
  }
  return structuredClone(defaults);
}

function setupBalanceEditor({ defaults, maps, portraitImage, portraitFrames, read, currentLevel, pending, cancelPending, deleteMap, apply }) {
  const form = $("balance-form");
  const levelSelect = $("balance-level");
  const names = {
    Skeleton: "Скелет", Spirit: "Дух", Bat: "Летучая мышь",
    Bull: "Минотавр", FrostDragon: "Ледяной дракон", Cyclops: "Циклоп",
    SkeletonBoss: "Король скелетов", knight: "Синий рыцарь",
    speedknight: "Быстрый рыцарь", redknight: "Красный рыцарь",
    whiteknight: "Белый рыцарь", archer: "Лучник",
  };
  const portraits = {
    Skeleton: "skeleton_idle", Spirit: "spiritdark1", Bat: "bat1", Bull: "bull",
    FrostDragon: "frost_dragon1", Cyclops: "cyclops_walk1", SkeletonBoss: "skeletonBoss_idle1",
    knight: "knight_idle", speedknight: "speedknight_idle", redknight: "redknight_idle",
    whiteknight: "whiteknight_idle", archer: "archer_idle",
  };
  const rules = {
    baseManaPerSecond: ["Мана в секунду", 0],
    maxMana: ["Лимит маны", 1],
    crystalMaxHealth: ["Здоровье кристалла", 1],
    spiritLifetime: ["Время жизни, с", .01],
    spiritGlowTime: ["Время горения, с", 0],
    spiritManaInterval: ["Интервал начисления маны, с", .01],
    spiritManaAmount: ["Мана за начисление", 0],
    draculaDamage: ["Урон", 0],
    draculaRange: ["Дальность", 0],
    draculaInterval: ["Интервал атаки, с", .01],
    iceFlightTime: ["Полёт ледяного снаряда, с", .01],
    iceSlowDuration: ["Длительность замедления, с", 0],
    iceSpeedMultiplier: ["Скорость замедленной цели, ×", 0],
    batRedMultiplier: ["Урон мыши по красному рыцарю, ×", 0],
    bullConfuseSeconds: ["Замешательство от Минотавра, с", 0],
    bullRollDistance: ["Расстояние за оборот Минотавра", 1],
    enemyAttackInterval: ["Интервал атаки врагов, с", .01],
    crystalAttackInterval: ["Интервал атаки по кристаллу, с", .01],
    minionAttackInterval: ["Интервал атаки миньонов, с", .01],
    batAttackInterval: ["Интервал сброса бомб, с", .01],
  };
  const stats = {
    hp: ["Здоровье", 1], speed: ["Скорость", 0], damage: ["Урон", 0], range: ["Дальность", 0],
  };
  const explanations = {
    baseManaPerSecond: "Сколько маны автоматически прибавляется за секунду игрового времени. Например, 3 дают 30 маны за 10 секунд. При 0 остаются только стартовый запас и мана от духов.",
    maxMana: "Максимальный запас маны. Новая мана сверх лимита не накапливается. Если стартовый запас выше лимита, игра начнёт с лимита.",
    crystalMaxHealth: "Начальное здоровье каждого кристалла. Урон снимается с того кристалла, который атакуют рыцари. При 0 здоровья этот кристалл разрушается.",
    spiritLifetime: "Сколько секунд дух живёт после призыва, если его раньше не убили и он не взорвался рядом с врагом.",
    spiritGlowTime: "Сколько секунд после призыва дух горит и даёт ману. При 16 секундах горения и 19 секундах жизни последние 3 секунды дух проводит в угасании.",
    spiritManaInterval: "Пауза между начислениями от одного яркого духа. При 2 первое начисление произойдёт через 2 секунды, следующее через 4 и так далее, пока дух не погаснет.",
    spiritManaAmount: "Сколько маны даёт один дух за начисление. При 5 маны и интервале 2 секунды он выдаёт по 5 каждые 2 секунды, пока запас не заполнится.",
    draculaDamage: "Сколько здоровья снимает один удар Дракулы. Он бьёт по одной цели. При 24 урона обычному рыцарю с 42 здоровья нужны два попадания.",
    draculaRange: "Максимальное расстояние по горизонтали от Дракулы до рыцаря на том же этаже, в игровых пикселях.",
    draculaInterval: "Минимальное время между началами атак Дракулы. При 3,2 секунды группа рыцарей может успеть пройти мимо, пока он готовит следующий удар.",
    iceFlightTime: "Время от выстрела дракона до попадания. Урон и замедление применяются по завершении полёта.",
    iceSlowDuration: "Сколько секунд действует изменение скорости после попадания ледяного снаряда. Новый ледяной выстрел обновляет длительность.",
    iceSpeedMultiplier: "Множитель обычной скорости цели под действием ледяного выстрела. 1 — обычная скорость, 2 — вдвое быстрее, 0,5 — вдвое медленнее, 0 — цель останавливается на время эффекта.",
    batRedMultiplier: "Дополнительный множитель урона бомбы только по красному рыцарю. Оригинальная карточка мыши говорит, что она особенно сильна против красных. Значение 1 убирает бонус, а 1,35 даёт примерно на 35% больше урона.",
    bullConfuseSeconds: "На сколько секунд задетый Минотавром рыцарь останавливается и перестаёт атаковать. 0 отключает эту паузу, сам урон сохраняется.",
    bullRollDistance: "Сколько игровых пикселей пути соответствует одному обороту спрайта Минотавра. Меньшее число ускоряет вращение, скорость перемещения задаётся отдельно.",
    enemyAttackInterval: "Общая пауза между ударами рыцарей по миньонам. Чем меньше число, тем чаще атаки. У отдельного типа врага может быть своё значение.",
    crystalAttackInterval: "Общая пауза между ударами рыцарей по кристаллу. У отдельного типа врага может быть своё значение.",
    minionAttackInterval: "Общая пауза между атаками миньонов с перезарядкой. Мышь, дух и Минотавр используют отдельные правила.",
    batAttackInterval: "Общая пауза между сбросами бомб мышью. При 1,4 мышь может сбрасывать бомбу раз в 1,4 секунды, если на этаже ниже есть цель.",
    hp: "Сколько у персонажа здоровья при появлении. Каждый удар вычитает свой урон. Когда здоровье падает до нуля, персонаж погибает.",
    speed: "Обычная скорость перемещения в игровых пикселях за секунду. 0 оставляет персонажа на месте. 60 означает вдвое более быстрое движение, чем 30.",
    damage: "Базовое количество здоровья, которое снимает попадание или контакт. Некоторые атаки применяют дополнительные множители, например бомба мыши против красного рыцаря.",
    range: "Дальность атаки в игровых пикселях по горизонтали. У персонажей с особыми атаками действуют дополнительные условия, например мышь атакует с этажа выше.",
    cost: "Сколько маны списывается при призыве. 0 делает призыв бесплатным. Этот параметр не влияет на миньонов, уже расставленных на старте.",
    hover: "На сколько игровых пикселей спрайт парит над полом. Миньон по-прежнему относится к тому этажу, на котором призван.",
    attackInterval: "Своя пауза между атаками этого типа. Например, 0,5 позволяет атаковать примерно два раза в секунду при наличии цели.",
    startingMana: "Сколько маны доступно сразу после запуска выбранного уровня. 300 позволяет сразу потратить до 300 маны, если лимит это разрешает.",
    manaRate: "Фоновый прирост маны в секунду на выбранном уровне. Например, 8 дадут 80 маны за 10 секунд, пока не достигнут лимит.",
    manaLimit: "Максимальный запас только на выбранном уровне. Например, лимит 200 не даст накопить больше 200.",
    crystalHealth: "Начальное здоровье каждого кристалла только на выбранном уровне. Например, 200 добавят 50 здоровья на кристалл относительно общего значения 150.",
    bullDamageMultiplier: "Доля входящего урона, которую получают Минотавры на выбранном уровне. 1 — полный урон, 0,5 — примерно половина, 2 — двойной, 0 — атаки не наносят урон. Результат округляется вверх.",
    dracula: "Номер комнаты с Дракулой в веб-версии. Нумерация начинается с 0. Значение −1 убирает Дракулу с уровня.",
    delay: "Через сколько секунд начинается волна. Для первой отсчёт идёт от начала уровня, для остальных — от начала предыдущей волны. Волны могут пересекаться.",
    count: "Сколько врагов указанного типа выйдет в этой группе. Общее число врагов в волне складывается из всех её групп.",
    offset: "Сколько секунд выждать после начала выхода этой волны, прежде чем появится первый враг группы. 0 запускает группу сразу, 5 — через 5 секунд.",
    spacing: "Пауза между соседними врагами одной группы. При 0 вся группа выходит одновременно. При 0,6 враги выходят по одному каждые 0,6 секунды.",
  };
  const ruleSections = [
    ["Мана и кристаллы", ["baseManaPerSecond", "maxMana", "crystalMaxHealth"]],
    ["Дух", ["spiritLifetime", "spiritGlowTime", "spiritManaInterval", "spiritManaAmount"]],
    ["Дракула", ["draculaDamage", "draculaRange", "draculaInterval"]],
    ["Атаки и эффекты", [
      "enemyAttackInterval", "crystalAttackInterval", "minionAttackInterval", "batAttackInterval",
      "iceFlightTime", "iceSlowDuration", "iceSpeedMultiplier", "batRedMultiplier",
      "bullConfuseSeconds", "bullRollDistance",
    ]],
  ];
  let draft;
  let index = 0;
  let selectedUnit = "Skeleton";
  let editingMaps;
  let editingDefaults;
  let fieldId = 0;
  let activeHelp;
  let pinnedHelp;

  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  }

  const tooltip = node("div", "", "balance-help-tooltip");
  tooltip.id = "balance-help-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  $("settings-page").append(tooltip);

  function closeHelp() {
    activeHelp?.removeAttribute("aria-describedby");
    activeHelp?.setAttribute("aria-expanded", "false");
    activeHelp = pinnedHelp = null;
    tooltip.hidden = true;
  }

  function showHelp(button, explanation) {
    if (activeHelp && activeHelp !== button) closeHelp();
    activeHelp = button;
    tooltip.textContent = explanation;
    tooltip.hidden = false;
    button.setAttribute("aria-describedby", tooltip.id);
    button.setAttribute("aria-expanded", "true");
    const anchor = button.getBoundingClientRect();
    const size = tooltip.getBoundingClientRect();
    const left = Math.min(Math.max(8, anchor.left), Math.max(8, window.innerWidth - size.width - 8));
    const below = anchor.bottom + 7;
    const top = below + size.height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - size.height - 7);
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  function helpButton(label, explanation) {
    const button = node("button", "?", "balance-help");
    button.type = "button";
    button.setAttribute("aria-label", "Пояснение: " + label);
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch" && (!pinnedHelp || pinnedHelp === button)) showHelp(button, explanation);
    });
    button.addEventListener("pointerleave", () => {
      if (activeHelp === button && !pinnedHelp && !button.matches(":focus-visible")) closeHelp();
    });
    button.addEventListener("focus", () => {
      if (button.matches(":focus-visible")) showHelp(button, explanation);
    });
    button.addEventListener("blur", () => {
      if (activeHelp === button && !pinnedHelp) closeHelp();
    });
    button.addEventListener("click", () => {
      if (pinnedHelp === button) closeHelp();
      else {
        showHelp(button, explanation);
        pinnedHelp = button;
      }
    });
    return button;
  }

  function appendField(parent, control, text, explanation) {
    const wrapper = node("div", "", "balance-field");
    const header = node("div", "", "balance-field-heading");
    const label = node("label", text, "balance-field-label");
    control.id = "balance-field-" + ++fieldId;
    label.htmlFor = control.id;
    header.append(label, helpButton(text, explanation));
    wrapper.append(header, control);
    parent.append(wrapper);
  }

  function numberField(parent, object, key, text, min, options = {}) {
    const { optional = false, integer = false, max, help = explanations[key],
      inherited = "общее значение" } = options;
    const input = node("input");
    input.type = "number";
    input.min = min;
    input.step = integer ? "1" : "any";
    if (max !== undefined) input.max = max;
    input.required = !optional;
    input.value = object[key] ?? "";
    if (optional) input.placeholder = "По умолчанию";
    input.addEventListener("input", () => {
      if (optional && !input.value && !input.validity.badInput) object[key] = null;
      else if (input.validity.valid && Number.isFinite(input.valueAsNumber)) object[key] = input.valueAsNumber;
    });
    appendField(parent, input, text, help + (optional ? " Пустое поле использует " + inherited + "." : ""));
    return input;
  }

  function selectField(parent, text, values, current, change, help) {
    const select = node("select");
    for (const [id, caption] of values) select.add(new Option(caption, id));
    select.value = current;
    select.addEventListener("change", () => change(select.value));
    appendField(parent, select, text, help);
  }

  function action(text, callback) {
    const button = node("button", text);
    button.type = "button";
    button.addEventListener("click", callback);
    return button;
  }

  function renderGlobal() {
    closeHelp();
    const rulesPanel = $("balance-rules");
    const unitPanel = $("balance-units");
    rulesPanel.replaceChildren();
    unitPanel.replaceChildren();
    for (const [title, keys] of ruleSections) {
      const section = node("section", "", "balance-rule-section");
      const fields = node("div", "", "balance-fields");
      for (const key of keys) {
        const [label, min] = rules[key];
        numberField(fields, draft.rules, key, label, min);
      }
      section.append(node("h3", title), fields);
      rulesPanel.append(section);
    }
    const editor = node("section", "", "balance-unit-editor");
    const heading = node("h3");
    const fields = node("div", "", "balance-fields");
    editor.append(heading, fields);
    const cards = new Map();

    function showUnit(type) {
      closeHelp();
      selectedUnit = type;
      for (const [name, card] of cards) card.setAttribute("aria-pressed", String(name === type));
      const enemy = Object.hasOwn(draft.hunters, type);
      const unit = enemy ? draft.hunters[type] : draft.defenders[type];
      heading.textContent = names[type];
      fields.replaceChildren();
      for (const [key, [label, min]] of Object.entries(stats)) {
        numberField(fields, unit, key, label, min);
      }
      if (!enemy) numberField(fields, unit, "cost", "Цена призыва", 0, { integer: true });
      if ("hover" in unit) numberField(fields, unit, "hover", "Высота полёта", 0);
      if (!["Bull", "Spirit"].includes(type)) {
        const rule = enemy ? "enemyAttackInterval" : type === "Bat" ? "batAttackInterval" : "minionAttackInterval";
        numberField(fields, unit, "attackInterval", "Интервал атаки, с", .01, { optional: true })
          .placeholder = String(draft.rules[rule]);
      }
      if (enemy) {
        numberField(fields, unit, "crystalAttackInterval", "Атака по кристаллу, с", .01, { optional: true })
          .placeholder = String(draft.rules.crystalAttackInterval);
      }
    }

    for (const [label, group] of [["Миньоны", draft.defenders], ["Враги", draft.hunters]]) {
      const row = node("div", "", "balance-unit-cards");
      for (const type of Object.keys(group)) {
        const card = action("", () => {
          if ([...fields.querySelectorAll("input")].every((input) => input.reportValidity())) showUnit(type);
        });
        card.className = "balance-unit-card";
        const sprite = node("canvas");
        sprite.width = 88;
        sprite.height = 60;
        sprite.setAttribute("aria-hidden", "true");
        const frame = portraitFrames[portraits[type] + ".png"];
        if (frame) {
          const scale = Math.min(76 / frame.width, 54 / frame.height);
          const width = frame.width * scale;
          const height = frame.height * scale;
          sprite.getContext("2d").drawImage(portraitImage, frame.x, frame.y, frame.width, frame.height,
            (sprite.width - width) / 2, sprite.height - height - 3, width, height);
        }
        card.append(sprite, node("span", names[type]));
        cards.set(type, card);
        row.append(card);
      }
      unitPanel.append(node("h3", label), row);
    }
    unitPanel.append(editor);
    showUnit(selectedUnit);
  }

  function renderLevel() {
    closeHelp();
    levelSelect.value = String(index + 1);
    $("balance-delete-level").hidden = !canDeleteLevel();
    const level = draft.levels[index];
    const fields = $("balance-level-fields");
    fields.replaceChildren();
    numberField(fields, level, "startingMana", "Стартовая мана", 0);
    numberField(fields, level, "manaRate", "Мана в секунду", 0, { optional: true })
      .placeholder = String(draft.rules.baseManaPerSecond);
    numberField(fields, level, "manaLimit", "Лимит маны", 1, { optional: true })
      .placeholder = String(draft.rules.maxMana);
    numberField(fields, level, "crystalHealth", "Здоровье кристалла", 1, { optional: true })
      .placeholder = String(draft.rules.crystalMaxHealth);
    numberField(fields, level, "bullDamageMultiplier", "Урон по Минотавру, ×", 0);
    numberField(fields, level, "dracula", "Комната Дракулы", -1, { integer: true });

    const minions = $("balance-minions");
    minions.replaceChildren();
    for (const type of Object.keys(draft.defenders)) {
      const row = node("div", "", "balance-group");
      const input = node("input");
      input.type = "checkbox";
      input.checked = level.minions.includes(type);
      input.addEventListener("change", () => {
        level.minions = input.checked ? [...level.minions, type] : level.minions.filter((other) => other !== type);
      });
      appendField(row, input, names[type],
        "Если включено, этого миньона можно призывать на выбранном уровне при достаточном запасе маны. Если выключено, его слот показывает замок.");
      numberField(row, level.startingMinions, type, "На старте у кристаллов", 0,
        { optional: true, integer: true, max: 1000, inherited: "0", help:
          "Сколько дополнительных миньонов этого типа автоматически появится у кристаллов в начале уровня. За них мана не списывается. Поле не открывает их для покупки." }).placeholder = "0";
      minions.append(row);
    }
    renderWaves();
  }

  function canDeleteLevel() {
    return !pending() && Boolean(maps[index]?.name);
  }

  function renderWaves(openIndex = -1) {
    closeHelp();
    const root = $("balance-waves");
    const spawners = Object.entries(editingMaps[index].spawners).map(([id, source]) =>
      [id, id + " · " + (source.type === "air" ? "Воздух" : "Земля") + " (" + source.x + ", " + source.y + ")"]);
    const enemyTypes = Object.keys(draft.hunters).map((type) => [type, names[type]]);
    const list = draft.levels[index].waves;
    root.replaceChildren();
    list.forEach((wave, waveIndex) => {
      const details = node("details");
      const summary = node("summary");
      const updateSummary = () => {
        const count = wave.groups.reduce((sum, group) => sum + group.count, 0);
        summary.textContent = "Волна " + (waveIndex + 1) + " · " + count + " врагов · " + wave.delay + " с";
      };
      updateSummary();
      details.open = waveIndex === openIndex;
      details.append(summary);
      const fields = node("div", "", "balance-fields");
      numberField(fields, wave, "delay", "Задержка волны, с", 0).addEventListener("input", updateSummary);
      details.append(fields);
      wave.groups.forEach((group, groupIndex) => {
        const panel = node("div", "", "balance-group");
        const groupFields = node("div", "", "balance-fields");
        selectField(groupFields, "Враг", enemyTypes, group.type, (type) => { group.type = type; },
          "Какой тип врага входит в эту группу. Чтобы смешать несколько типов в одной волне, добавьте отдельную группу для каждого.");
        selectField(groupFields, "Точка появления", spawners, group.spawner, (id) => { group.spawner = id; },
          "Откуда появляются враги группы. Земля ведёт к нижнему входу, воздух — к подлёту и приземлению. Номер и координаты взяты из карты уровня.");
        numberField(groupFields, group, "count", "Количество", 1, { integer: true, max: 10000 })
          .addEventListener("input", updateSummary);
        numberField(groupFields, group, "offset", "Старт группы после начала волны, с", 0);
        numberField(groupFields, group, "spacing", "Интервал между врагами, с", 0);
        group.stats ??= {};
        for (const [key, [label, min]] of Object.entries(stats)) {
          const field = numberField(groupFields, group.stats, key, label + " группы", min,
            { optional: true, inherited: "характеристику выбранного типа врага" });
          field.addEventListener("input", () => {
            if (group.stats[key] === null) delete group.stats[key];
          });
        }
        panel.append(groupFields, action("Удалить группу", () => {
          wave.groups.splice(groupIndex, 1);
          renderWaves(waveIndex);
        }));
        details.append(panel);
      });
      const controls = node("div", "", "balance-actions");
      controls.append(action("Добавить группу", () => {
        wave.groups.push({ type: "knight", spawner: spawners[0][0], count: 1, offset: 0, spacing: .6 });
        renderWaves(waveIndex);
      }), action("Удалить волну", () => {
        list.splice(waveIndex, 1);
        renderWaves(Math.min(waveIndex, list.length - 1));
      }));
      details.append(controls);
      root.append(details);
    });
  }

  function route() {
    closeHelp();
    const editing = location.hash === "#settings";
    $("game-page").hidden = editing || location.hash === "#maps";
    $("settings-page").hidden = !editing;
    if (editing) {
      draft = structuredClone(read());
      editingMaps = maps.slice();
      editingDefaults = structuredClone(defaults);
      const custom = pending();
      index = custom?.index ?? currentLevel() - 1;
      if (custom) {
        editingMaps[index] = custom.map;
        draft.levels[index] = structuredClone(custom.options);
        editingDefaults.levels[index] = structuredClone(custom.defaults);
      }
      $("balance-back").href = custom ? "#maps" : "#";
      $("balance-back").textContent = custom ? "Назад к карте" : "Назад в игру";
      $("balance-status").textContent = "";
      fillLevelSelect(levelSelect, editingMaps);
      renderGlobal();
      renderLevel();
      $("settings-page").scrollTop = 0;
    } else {
      cancelPending();
      window.dispatchEvent(new Event("resize"));
    }
  }

  levelSelect.parentElement.after(helpButton("Уровень",
    "Выбирает карту, чьи волны, ману и доступных миньонов вы редактируете. Общие характеристики персонажей действуют на всех уровнях."));
  form.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".balance-help")) closeHelp();
  });
  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeHelp) closeHelp();
  });
  $("settings-page").addEventListener("scroll", closeHelp);
  window.addEventListener("resize", closeHelp);
  levelSelect.addEventListener("change", () => {
    if (!form.reportValidity()) {
      levelSelect.value = String(index + 1);
      return;
    }
    index = Number(levelSelect.value) - 1;
    renderLevel();
  });
  $("balance-add-wave").addEventListener("click", () => {
    const waves = draft.levels[index].waves;
    waves.push({ delay: 10, groups: [{
      type: "knight", spawner: Object.keys(editingMaps[index].spawners)[0], count: 1, offset: 0, spacing: .6,
    }] });
    renderWaves(waves.length - 1);
  });
  $("balance-example").addEventListener("click", () => {
    const level = draft.levels[index];
    const spawner = Object.keys(editingMaps[index].spawners)[0];
    level.waves = Array.from({ length: 5 }, (_, i) => ({ delay: i === 0 ? 10 : 12, groups: [{
      type: "redknight", spawner, count: 3 + i, offset: 0, spacing: .8,
      stats: { speed: draft.hunters.redknight.speed * 1.5, damage: draft.hunters.redknight.damage * 1.5 },
    }] }));
    renderWaves(0);
  });
  $("balance-reset-level").addEventListener("click", () => {
    draft.levels[index] = structuredClone(editingDefaults.levels[index]);
    renderLevel();
  });
  $("balance-delete-level").addEventListener("click", () => {
    if (!canDeleteLevel() || !window.confirm("Удалить карту «" + maps[index].name +
      "» вместе с её волнами и настройками?")) return;
    try {
      deleteMap(index);
      draft.levels.splice(index, 1);
      editingDefaults.levels.splice(index, 1);
      editingMaps = maps.slice();
      index = Math.min(index, editingMaps.length - 1);
      fillLevelSelect(levelSelect, editingMaps);
      renderLevel();
      $("balance-status").textContent = "Карта удалена.";
    } catch (error) {
      $("balance-status").textContent = "Не удалось удалить карту: " + error.message;
    }
  });
  $("balance-reset-all").addEventListener("click", () => {
    draft = structuredClone(editingDefaults);
    renderGlobal();
    renderLevel();
  });
  form.addEventListener("invalid", (event) => {
    for (let parent = event.target.closest("details"); parent; parent = parent.parentElement.closest("details")) {
      parent.open = true;
    }
  }, true);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      apply(draft, index + 1);
      location.hash = "";
      $("settings-page").hidden = true;
      $("game-page").hidden = false;
      window.dispatchEvent(new Event("resize"));
    } catch (error) {
      $("balance-status").textContent = "Не удалось сохранить настройки: " + error.message;
    }
  });
  window.addEventListener("hashchange", route);
  route();
}
