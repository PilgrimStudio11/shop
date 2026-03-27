// config.js – глобальные настройки, данные кораблей, артефактов, рецепты

export const CONFIG = {
    PLANET_COUNT: 1000,
    FUEL_PRICE: 2,
    START_CREDITS: 5000,
    START_STRANGE_POWER: 100,
    HYPER_COST: 50,
    DOCK_COST: 100,
    DARK_MATTER_CHANCE: 0.1,
    DARK_MATTER_AMOUNT: [2,5],
    GOODS_FIND_CHANCE: 0.1,
    GOODS_FIND_AMOUNT: [1,3],
    GOODS_FIND_TYPES: ["gold","food"],
    ARTIFACT_FIND_CHANCE: 0.005,
    EVENT_CHANCE: 0.03,
    EVENT_HELP_SHIP_CHANCE: 0.01,
    MINERAL_FIND_CHANCE: 0.05,
    MINERAL_ZONE_START: [1,100],
    MINERAL_ZONE_END: [901,1000],
    CONTRABAND_ENCOUNTER_CHANCE: 0.05,
    CONTRABAND_MISSION_COOLDOWN: 15*60*1000,
    CONTRABAND_BASE_REWARD: [5000,8000],
    BOT_MOVE_DELAY: 1000,
    BOT_CREATE_INTERVAL: 5*60*1000,
    MAX_BOTS: 200,
    MAX_LEVEL1_BOTS: 50,
    MAX_DOCK_BOTS: 3,
    DOCK_STAY_MS: 5*60*1000,
    PRICE_REFRESH_INTERVAL: 30*60*1000,
    STOCK_REPLENISH_INTERVAL: 30*60*1000,
    STOCK_REPLENISH_AMOUNT: [50,150],
    MISSION_REFRESH_INTERVAL: 30*60*1000,
    IMMUNITY_DURATION: 30*60*1000,
    MODULE_HARVESTER_COST: 50000,
    MODULE_SS_GENERATOR_COST: 50000,
    MODULE_OPTIMIZER_COST: 50000,
    PLANET_PRICE_BASE: 10000,
    MODULE_PLANET_TM_LAB_COST: 10000,
    MODULE_PLANET_STORAGE_LEVELS: [0,5000,10000,15000,20000,25000],
    MODULE_PLANET_STORAGE_CAPACITY: [1000,2000,3000,4000,5000,6000],
    MODULE_PLANET_MINER_COST: 10000,
    MODULE_PLANET_TELEPORT_COST: 10000,
    PLANET_INCOME_PERCENT: 0.1,
    TM_GENERATOR_RATE: 10,
    BOT_ATTACK_THRESHOLD: 0.05,
    RETREAT_COST: 1000,
    ROCKET_POWER: 2,
    TM_POWER: 0.01,
    MARKET_COMMISSION: 0.05,
    CRAFT_TIME_MS: 60000,
    UPGRADE_SUCCESS_CHANCE: 0.7,
};

export const GOODS = [
    { id: "gold", name: "Золото", baseBuy:100, baseSell:100, spread:30, cargoSpace:1 },
    { id: "slaves", name: "Рабы", baseBuy:80, baseSell:80, spread:25, cargoSpace:1 },
    { id: "food", name: "Продукты", baseBuy:40, baseSell:40, spread:15, cargoSpace:1 },
    { id: "rockets", name: "Ракеты", baseBuy:200, baseSell:200, spread:50, cargoSpace:5 },
    { id: "oil", name: "Нефть", baseBuy:60, baseSell:60, spread:20, cargoSpace:1 }
];

export const MINERALS = [
    { id: "mineral1", name: "Кристаллы Арида", basePrice: 500, cargoSpace:1 },
    { id: "mineral2", name: "Звёздная пыль", basePrice: 800, cargoSpace:1 },
    { id: "mineral3", name: "Космический янтарь", basePrice: 1200, cargoSpace:1 },
    { id: "mineral4", name: "Нексус-руда", basePrice: 2000, cargoSpace:1 },
    { id: "mineral5", name: "Ксенолит", basePrice: 3500, cargoSpace:1 },
    { id: "mineral6", name: "Гравитонные камни", basePrice: 5000, cargoSpace:1 },
    { id: "mineral7", name: "Эфирные кристаллы", basePrice: 7500, cargoSpace:1 },
    { id: "mineral8", name: "Тёмный опал", basePrice: 10000, cargoSpace:1 },
    { id: "mineral9", name: "Сердце звезды", basePrice: 15000, cargoSpace:1 },
    { id: "mineral10", name: "Артефакт Древних", basePrice: 25000, cargoSpace:1 }
];

export const COMPONENTS = [
    { id: "comp1", name: "Наночип", basePrice: 2000 },
    { id: "comp2", name: "Энергоячейка", basePrice: 1500 },
    { id: "comp3", name: "Кварцевый резонатор", basePrice: 3000 },
    { id: "comp4", name: "Тёмный кристалл", basePrice: 5000 },
    { id: "comp5", name: "Плазменный инжектор", basePrice: 4000 }
];

export const MODULE_BLUEPRINTS = {
    harvester: { name: "Чертёж: Добытчик ТМ", moduleType: "hasTMHarvester", baseEffect: 1, upgradeEffect: 1, costTM: 500, installCost: 5000, upgradeCostSS: 100 },
    generator: { name: "Чертёж: Генератор СС", moduleType: "hasSSGenerator", baseEffect: 2, upgradeEffect: 2, costTM: 500, installCost: 5000, upgradeCostSS: 100 },
    optimizer: { name: "Чертёж: Оптимизатор полёта", moduleType: "hasOptimizer", baseEffect: 25, upgradeEffect: 5, costTM: 500, installCost: 5000, upgradeCostSS: 100 }
};

export const UPGRADE_RECIPES = {
    harvester: { name: "Улучшение: Добытчик ТМ", components: { comp1:2, comp2:1, comp3:1 }, costSS: 100 },
    generator: { name: "Улучшение: Генератор СС", components: { comp2:2, comp4:1, comp5:1 }, costSS: 100 },
    optimizer: { name: "Улучшение: Оптимизатор полёта", components: { comp3:2, comp1:1, comp5:1 }, costSS: 100 }
};

export const ARTIFACTS = {
    energyResonator: { name: "Энергетический резонатор", desc: "Удваивает силу на 3 боя", uses: 3, type: "battleBuff", powerMultiplier: 2, basePrice: 50000 },
    amuletSupremacy: { name: "Амулет превосходства", desc: "Один бой без ограничения уровней", uses: 1, type: "ignoreLevel", basePrice: 30000 },
    tempMask: { name: "Временная маскировка", desc: "10 ходов боты не атакуют", uses: 10, type: "stealth", basePrice: 20000 },
    rareCrystal: { name: "Редкий кристалл", desc: "Даёт 10000 кредитов", uses: 1, type: "cash", value: 10000, basePrice: 8000 },
    luckMatrix: { name: "Матрица удачи", desc: "Удваивает находки на 10 ходов", uses: 10, type: "luckBoost", basePrice: 40000 },
    navigationCrystal: { name: "Навигационный Кристалл", desc: "Телепорт на любую выбранную планету", uses: 3, type: "teleport", basePrice: 30000 },
    contrabandNetwork: { name: "Контрабандная сеть", desc: "Мгновенно избегает патруля (1 использование)", uses: 1, type: "escapePatrol", basePrice: 15000 },
    scanner: { name: "Сканер", desc: "Показывает координаты всех кораблей с их уровнем (1 использование)", uses: 1, type: "scanner", basePrice: 8000 },
    emergencyAccelerator: { name: "Модуль экстренного ускорения", desc: "Восстанавливает топливо и даёт +20 СС (3 использования)", uses: 3, type: "fuelBoost", basePrice: 20000 }
};

// Корабли 1-21 уровня
export const SHIPS = [];
for (let i = 1; i <= 4; i++) {
    let power = 20 * Math.pow(2, i-1);
    let cargo = 100 * Math.pow(2, i-1);
    let fuel = 100 * Math.pow(2, i-1);
    SHIPS.push({ level: i, name: getShipName(i), power, cargo: Math.floor(cargo), fuelCap: Math.floor(fuel), cost: i===1 ? 0 : 50000 * Math.pow(2, i-2), tmCost: 0 });
}
for (let i = 5; i <= 21; i++) {
    let prev = SHIPS[i-2];
    let power = prev.power + 1000;
    let cargo = prev.cargo + 1000;
    let fuel = prev.fuelCap + 1000;
    let cost = Math.floor(prev.cost * 1.5);
    let tmCost = 1000 * (i-4);
    SHIPS.push({ level: i, name: getShipName(i), power, cargo, fuelCap: fuel, cost, tmCost });
}
function getShipName(level) {
    const names = ["Странник","Искатель","Пилигрим","Компас","Орион","Вега","Сириус","Альтаир","Поллукс","Регул","Денеб","Антарес","Бетельгейзе","Ригель","Канопус","Ахернар","Альдебаран","Поларис","Вега-2","Солнцестояние","Галактика"];
    return names[level-1];
}
