// planets.js – покупка планет, модули планет, сбор дохода

import { CONFIG } from './config.js';
import { player } from './player.js';
import { addLogToGame, saveGame } from './utils.js';

export let planetOwners = new Array(CONFIG.PLANET_COUNT).fill(null);
export let planetPrevOwnersCount = new Array(CONFIG.PLANET_COUNT).fill(0);
export let planetIncome = new Array(CONFIG.PLANET_COUNT).fill(0);
export let planetTM = new Array(CONFIG.PLANET_COUNT).fill(0);
export let planetMinerIncome = new Array(CONFIG.PLANET_COUNT).fill(0);
export let planetModules = [];
for (let i = 0; i < CONFIG.PLANET_COUNT; i++) {
    planetModules[i] = { tmLaboratory: false, storageLevel: 0, planetMiner: false, teleport: false };
}

export function initPlanets() {
    for (let i = 0; i < CONFIG.PLANET_COUNT; i++) {
        planetOwners[i] = null;
        planetPrevOwnersCount[i] = 0;
        planetIncome[i] = 0;
        planetTM[i] = 0;
        planetMinerIncome[i] = 0;
        planetModules[i] = { tmLaboratory: false, storageLevel: 0, planetMiner: false, teleport: false };
    }
}

export function getPlanetMaxStorage(idx) {
    return CONFIG.MODULE_PLANET_STORAGE_CAPACITY[planetModules[idx].storageLevel] || 1000;
}

export function getPlanetStorageUpgradeCost(idx) {
    const lvl = planetModules[idx].storageLevel;
    if (lvl >= 5) return null;
    return CONFIG.MODULE_PLANET_STORAGE_LEVELS[lvl + 1];
}

export function getPlanetIncomePercent(idx) {
    return CONFIG.PLANET_INCOME_PERCENT + planetModules[idx].storageLevel * 0.05;
}

export function getPlanetPrice(idx) {
    return CONFIG.PLANET_PRICE_BASE + (planetPrevOwnersCount[idx] || 0) * 5000;
}

export function canBuyPlanet(idx, buyerLevel, isPlayer) {
    const owner = planetOwners[idx];
    if (owner === null) return true;
    const ownerLevel = (owner === "player") ? player.level : (window.bots?.find(b => b.id === owner)?.level);
    if (ownerLevel === undefined) return true;
    return buyerLevel >= ownerLevel;
}

export function buyPlanet(idx, buyer, isPlayer) {
    const price = getPlanetPrice(idx);
    if (buyer.credits < price || !canBuyPlanet(idx, buyer.level, isPlayer)) return false;
    buyer.credits -= price;
    planetOwners[idx] = isPlayer ? "player" : buyer.id;
    planetPrevOwnersCount[idx] = (planetPrevOwnersCount[idx] || 0) + 1;
    planetIncome[idx] = 0;
    planetTM[idx] = 0;
    planetMinerIncome[idx] = 0;
    planetModules[idx] = { tmLaboratory: false, storageLevel: 0, planetMiner: false, teleport: false };
    addLogToGame(`${isPlayer ? "Вы" : buyer.name} купил(и) планету #${idx + 1} за ${price}💰`, "success", isPlayer);
    saveGame();
    return true;
}

export function installPlanetModule(idx, type, isPlayer, entity) {
    if (planetOwners[idx] !== (isPlayer ? "player" : entity.id)) return false;
    let cost = 0;
    if (type === "tmLaboratory") cost = CONFIG.MODULE_PLANET_TM_LAB_COST;
    else if (type === "planetMiner") cost = CONFIG.MODULE_PLANET_MINER_COST;
    else if (type === "teleport") cost = CONFIG.MODULE_PLANET_TELEPORT_COST;
    if (entity.credits < cost) return false;
    entity.credits -= cost;
    if (type === "tmLaboratory") planetModules[idx].tmLaboratory = true;
    else if (type === "planetMiner") planetModules[idx].planetMiner = true;
    else if (type === "teleport") planetModules[idx].teleport = true;
    addLogToGame(`${isPlayer ? "Вы" : entity.name} установил(а) модуль ${type === "tmLaboratory" ? "лаборатория ТМ" : type === "planetMiner" ? "добытчик ресурсов" : "телепорт"} на планету #${idx + 1}`, "success", isPlayer);
    saveGame();
    return true;
}

export function upgradePlanetStorage(idx, isPlayer, entity) {
    if (planetOwners[idx] !== (isPlayer ? "player" : entity.id)) return false;
    const cost = getPlanetStorageUpgradeCost(idx);
    if (!cost || entity.credits < cost) return false;
    entity.credits -= cost;
    planetModules[idx].storageLevel++;
    addLogToGame(`${isPlayer ? "Вы" : entity.name} улучшили склад на планете #${idx + 1} до уровня ${planetModules[idx].storageLevel} (вместимость ${getPlanetMaxStorage(idx)})`, "success", isPlayer);
    saveGame();
    return true;
}

export function addIncomeToPlanet(idx, amount) {
    const owner = planetOwners[idx];
    if (owner !== null) {
        const percent = getPlanetIncomePercent(idx);
        const incomeAdd = Math.floor(amount * percent);
        if (incomeAdd > 0) planetIncome[idx] += incomeAdd;
    }
}

export function collectAllPlanetResources(isPlayer, entity) {
    let totalCredits = 0, totalTM = 0;
    for (let i = 0; i < CONFIG.PLANET_COUNT; i++) {
        if (planetOwners[i] === (isPlayer ? "player" : entity.id)) {
            totalCredits += planetIncome[i];
            planetIncome[i] = 0;
            if (planetModules[i].tmLaboratory) {
                totalTM += planetTM[i];
                planetTM[i] = 0;
            }
            if (planetModules[i].planetMiner) {
                totalCredits += planetMinerIncome[i];
                planetMinerIncome[i] = 0;
            }
        }
    }
    if (totalCredits > 0) entity.credits += totalCredits;
    if (totalTM > 0) entity.darkMatter += totalTM;
    if (totalCredits > 0 || totalTM > 0) addLogToGame(`${isPlayer ? "Вы" : entity.name} собрали ${totalCredits}💰 и ${totalTM}🌑 ТМ со всех планет.`, "success", isPlayer);
    saveGame();
    return { credits: totalCredits, tm: totalTM };
}

export function updatePlanetResources(deltaMinutes) {
    for (let i = 0; i < CONFIG.PLANET_COUNT; i++) {
        if (planetModules[i].tmLaboratory && planetOwners[i] !== null) {
            const generated = Math.floor(deltaMinutes * CONFIG.TM_GENERATOR_RATE);
            if (generated > 0) planetTM[i] += generated;
        }
        if (planetModules[i].planetMiner && planetOwners[i] !== null) {
            const steps = Math.floor(deltaMinutes / 10);
            for (let s = 0; s < steps; s++) {
                planetMinerIncome[i] += randomRange(5, 20);
            }
        }
    }
}
