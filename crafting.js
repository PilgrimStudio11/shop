// crafting.js – крафт, установка/снятие модулей, чертежи

import { CONFIG, MODULE_BLUEPRINTS, UPGRADE_RECIPES, COMPONENTS } from './config.js';
import { player } from './player.js';
import { addLogToGame, saveGame } from './utils.js';

// Глобальные наборы чертежей (должны быть доступны в main)
export let moduleBlueprintsOwned = [];
export let upgradeBlueprintsOwned = [];

export function buyBlueprint(entity, blueprintType, isUpgrade, isPlayer) {
    const blueprint = isUpgrade ? UPGRADE_RECIPES[blueprintType] : MODULE_BLUEPRINTS[blueprintType];
    if (!blueprint) return false;
    const costTM = isUpgrade ? blueprint.costSS : blueprint.costTM;
    if (isUpgrade) {
        if (entity.strangePower < costTM) return false;
        entity.strangePower -= costTM;
        upgradeBlueprintsOwned.push(blueprintType);
    } else {
        if (entity.darkMatter < costTM) return false;
        entity.darkMatter -= costTM;
        moduleBlueprintsOwned.push(blueprintType);
    }
    addLogToGame(`${isPlayer ? "Вы" : entity.name} купили чертёж ${blueprint.name}.`, "craft", isPlayer);
    saveGame();
    return true;
}

export function startCraft(entity, blueprintType, isUpgrade, isPlayer = false) {
    const blueprint = isUpgrade ? UPGRADE_RECIPES[blueprintType] : MODULE_BLUEPRINTS[blueprintType];
    if (!blueprint) return false;
    if (isUpgrade && !upgradeBlueprintsOwned.includes(blueprintType)) {
        if (isPlayer) addLogToGame("У вас нет чертежа этого улучшения.", "warning", true);
        return false;
    }
    if (!isUpgrade && !moduleBlueprintsOwned.includes(blueprintType)) {
        if (isPlayer) addLogToGame("У вас нет чертежа этого модуля.", "warning", true);
        return false;
    }
    const required = isUpgrade ? blueprint.components : { comp1:5, comp2:5, comp3:5, comp4:5, comp5:5 };
    for (let [compId, need] of Object.entries(required)) {
        if ((entity.components[compId] || 0) < need) {
            if (isPlayer) addLogToGame(`Не хватает ${COMPONENTS.find(c=>c.id===compId).name} (нужно ${need})`, "warning", true);
            return false;
        }
    }
    for (let [compId, need] of Object.entries(required)) {
        entity.components[compId] -= need;
    }
    entity.craftingQueue.push({
        type: blueprintType,
        isUpgrade,
        requiredComponents: required,
        timestamp: Date.now()
    });
    addLogToGame(`${isPlayer ? "Вы" : entity.name} начал(а) крафт ${isUpgrade ? "улучшения" : "модуля"} "${blueprint.name}". Завершится через 60 секунд.`, "craft", isPlayer);
    saveGame();
    return true;
}

export function processCrafting(entity, isPlayer = false) {
    const now = Date.now();
    for (let i = 0; i < entity.craftingQueue.length; i++) {
        const craft = entity.craftingQueue[i];
        if (now - craft.timestamp >= CONFIG.CRAFT_TIME_MS) {
            const blueprint = craft.isUpgrade ? UPGRADE_RECIPES[craft.type] : MODULE_BLUEPRINTS[craft.type];
            if (!blueprint) continue;
            if (craft.isUpgrade) {
                const success = Math.random() < CONFIG.UPGRADE_SUCCESS_CHANCE;
                if (success) {
                    addLogToGame(`${isPlayer ? "Вы" : entity.name} успешно создали улучшение для ${blueprint.name}.`, "success", isPlayer);
                    const existing = entity.ownedModules.find(m => m.type === craft.type && m.isUpgrade);
                    if (existing) existing.level++;
                    else entity.ownedModules.push({ type: craft.type, isUpgrade: true, level: 1 });
                } else {
                    addLogToGame(`${isPlayer ? "Вы" : entity.name} не удалось создать улучшение ${blueprint.name}, компоненты потеряны.`, "warning", isPlayer);
                }
            } else {
                addLogToGame(`${isPlayer ? "Вы" : entity.name} создали модуль ${blueprint.name}.`, "success", isPlayer);
                const existing = entity.ownedModules.find(m => m.type === craft.type && !m.isUpgrade);
                if (existing) existing.count = (existing.count || 1) + 1;
                else entity.ownedModules.push({ type: craft.type, isUpgrade: false, count: 1, level: 0 });
            }
            entity.craftingQueue.splice(i, 1);
            i--;
            saveGame();
        }
    }
}

export function installModule(entity, moduleType, isUpgrade, isPlayer = false) {
    const blueprint = MODULE_BLUEPRINTS[moduleType];
    if (!blueprint) return false;
    const owned = entity.ownedModules.find(m => m.type === moduleType && m.isUpgrade === isUpgrade);
    if (!owned || (isUpgrade && owned.level === 0) || (!isUpgrade && (!owned.count || owned.count < 1))) {
        if (isPlayer) addLogToGame(`У вас нет такого модуля/улучшения.`, "warning", true);
        return false;
    }
    if (entity.credits < blueprint.installCost) {
        if (isPlayer) addLogToGame(`Не хватает ${blueprint.installCost}💰 на установку.`, "warning", true);
        return false;
    }
    entity.credits -= blueprint.installCost;
    if (isUpgrade) {
        if (moduleType === "harvester") entity.tmHarvesterLevel = owned.level;
        else if (moduleType === "generator") entity.ssGeneratorLevel = owned.level;
        else if (moduleType === "optimizer") entity.optimizerLevel = owned.level;
        addLogToGame(`${isPlayer ? "Вы" : entity.name} установил(а) улучшение ${blueprint.name} уровня ${owned.level}.`, "success", isPlayer);
    } else {
        if (moduleType === "harvester") entity.hasTMHarvester = true;
        else if (moduleType === "generator") entity.hasSSGenerator = true;
        else if (moduleType === "optimizer") entity.hasOptimizer = true;
        addLogToGame(`${isPlayer ? "Вы" : entity.name} установил(а) модуль ${blueprint.name}.`, "success", isPlayer);
        owned.count--;
        if (owned.count === 0) entity.ownedModules = entity.ownedModules.filter(m => !(m.type === moduleType && !m.isUpgrade));
    }
    saveGame();
    return true;
}

export function uninstallModule(entity, moduleType, isPlayer = false) {
    const blueprint = MODULE_BLUEPRINTS[moduleType];
    if (!blueprint) return false;
    if (entity.credits < blueprint.installCost) {
        if (isPlayer) addLogToGame(`Не хватает ${blueprint.installCost}💰 на снятие.`, "warning", true);
        return false;
    }
    entity.credits -= blueprint.installCost;
    if (moduleType === "harvester") {
        if (!entity.hasTMHarvester) return false;
        entity.hasTMHarvester = false;
        const level = entity.tmHarvesterLevel;
        entity.tmHarvesterLevel = 0;
        if (level > 0) {
            const existing = entity.ownedModules.find(m => m.type === "harvester" && m.isUpgrade);
            if (existing) existing.level = level;
            else entity.ownedModules.push({ type: "harvester", isUpgrade: true, level });
        }
        const baseMod = entity.ownedModules.find(m => m.type === "harvester" && !m.isUpgrade);
        if (baseMod) baseMod.count++;
        else entity.ownedModules.push({ type: "harvester", isUpgrade: false, count: 1, level: 0 });
    } else if (moduleType === "generator") {
        if (!entity.hasSSGenerator) return false;
        entity.hasSSGenerator = false;
        const level = entity.ssGeneratorLevel;
        entity.ssGeneratorLevel = 0;
        if (level > 0) {
            const existing = entity.ownedModules.find(m => m.type === "generator" && m.isUpgrade);
            if (existing) existing.level = level;
            else entity.ownedModules.push({ type: "generator", isUpgrade: true, level });
        }
        const baseMod = entity.ownedModules.find(m => m.type === "generator" && !m.isUpgrade);
        if (baseMod) baseMod.count++;
        else entity.ownedModules.push({ type: "generator", isUpgrade: false, count: 1, level: 0 });
    } else if (moduleType === "optimizer") {
        if (!entity.hasOptimizer) return false;
        entity.hasOptimizer = false;
        const level = entity.optimizerLevel;
        entity.optimizerLevel = 0;
        if (level > 0) {
            const existing = entity.ownedModules.find(m => m.type === "optimizer" && m.isUpgrade);
            if (existing) existing.level = level;
            else entity.ownedModules.push({ type: "optimizer", isUpgrade: true, level });
        }
        const baseMod = entity.ownedModules.find(m => m.type === "optimizer" && !m.isUpgrade);
        if (baseMod) baseMod.count++;
        else entity.ownedModules.push({ type: "optimizer", isUpgrade: false, count: 1, level: 0 });
    }
    addLogToGame(`${isPlayer ? "Вы" : entity.name} снял(а) модуль ${blueprint.name}.`, "success", isPlayer);
    saveGame();
    return true;
}
