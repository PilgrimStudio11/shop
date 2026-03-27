// player.js – управление состоянием игрока

import { CONFIG, SHIPS, COMPONENTS, MODULE_BLUEPRINTS, UPGRADE_RECIPES, ARTIFACTS } from './config.js';
import { addLogToGame, saveGame } from './utils.js';

export let player = {
    credits: CONFIG.START_CREDITS,
    cargo: {},
    components: { comp1:0, comp2:0, comp3:0, comp4:0, comp5:0 },
    wins: 0,
    level: 1,
    shipLevel: 1,
    currentPlanet: 1,
    fuel: 100,
    strangePower: CONFIG.START_STRANGE_POWER,
    darkMatter: 0,
    hull: 100,
    isDead: false,
    immunityUntil: 0,
    hasTMHarvester: false,
    hasSSGenerator: false,
    hasOptimizer: false,
    tmHarvesterLevel: 0,
    ssGeneratorLevel: 0,
    optimizerLevel: 0,
    inDock: false,
    dockEnterTime: 0,
    missionsCompleted: 0,
    stealthRemaining: 0,
    luckBoostRemaining: 0,
    battleBuffRemaining: 0,
    ignoreLevelOnce: false,
    lastMissionBonus10: 0,
    lastMissionBonus100: 0,
    contrabandRating: 50,
    contrabandMission: null,
    artifactSalesBalance: 0,
    ownedModules: [], // { type, isUpgrade, level/count }
    craftingQueue: []   // { type, isUpgrade, requiredComponents, currentComponents, progress, timestamp }
};

export function initPlayer() {
    player.credits = CONFIG.START_CREDITS;
    player.cargo = {};
    player.components = { comp1:0, comp2:0, comp3:0, comp4:0, comp5:0 };
    player.wins = 0;
    player.level = 1;
    player.shipLevel = 1;
    player.currentPlanet = 1;
    player.fuel = SHIPS[0].fuelCap;
    player.strangePower = CONFIG.START_STRANGE_POWER;
    player.darkMatter = 0;
    player.hull = 100;
    player.isDead = false;
    player.immunityUntil = 0;
    player.hasTMHarvester = false;
    player.hasSSGenerator = false;
    player.hasOptimizer = false;
    player.tmHarvesterLevel = 0;
    player.ssGeneratorLevel = 0;
    player.optimizerLevel = 0;
    player.inDock = false;
    player.dockEnterTime = 0;
    player.missionsCompleted = 0;
    player.stealthRemaining = 0;
    player.luckBoostRemaining = 0;
    player.battleBuffRemaining = 0;
    player.ignoreLevelOnce = false;
    player.lastMissionBonus10 = 0;
    player.lastMissionBonus100 = 0;
    player.contrabandRating = 50;
    player.contrabandMission = null;
    player.artifactSalesBalance = 0;
    player.ownedModules = [];
    player.craftingQueue = [];
}

export function getShip() {
    return SHIPS[player.shipLevel - 1];
}

export function getTotalPower() {
    const ship = getShip();
    const rocketBonus = (player.cargo.rockets || 0) * CONFIG.ROCKET_POWER;
    const tmBonus = (player.darkMatter || 0) * CONFIG.TM_POWER;
    let effective = ship.power + rocketBonus + tmBonus;
    const hullPercent = Math.max(0, player.hull) / 100;
    let power = effective * hullPercent;
    if (player.battleBuffRemaining > 0) power *= 2;
    return power;
}

export function getOptimizerCost() {
    let base = CONFIG.HYPER_COST;
    if (player.hasOptimizer) {
        base -= player.optimizerLevel * 5;
        if (base < 5) base = 5;
    }
    return base;
}

export function getDockCost() {
    let base = CONFIG.DOCK_COST;
    if (player.hasOptimizer) {
        base -= player.optimizerLevel * 5;
        if (base < 20) base = 20;
    }
    return base;
}

export function getTMHarvestBonus() {
    return player.hasTMHarvester ? (1 + player.tmHarvesterLevel) : 0;
}

export function getSSGeneratorBonus() {
    return player.hasSSGenerator ? (2 + player.ssGeneratorLevel * 2) : 0;
}

export function addArtifact(id, usesLeft) {
    const existing = player.artifacts.find(a => a.id === id && a.usesLeft === usesLeft);
    if (existing) existing.count++;
    else player.artifacts.push({ id, usesLeft, count: 1 });
}

export function useArtifact(id) {
    const idx = player.artifacts.findIndex(a => a.id === id);
    if (idx === -1) return false;
    const art = player.artifacts[idx];
    if (art.count > 1) art.count--;
    else player.artifacts.splice(idx, 1);
    return true;
}

export function hasArtifact(id) {
    return player.artifacts.some(a => a.id === id);
}

// Экспортируем для доступа из других модулей
export function updatePlayerLevel() {
    player.level = Math.floor(player.wins / 7) + 1;
}
