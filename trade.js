// trade.js – торговля, легальные задания, находки товаров/минералов/артефактов

import { CONFIG, GOODS, MINERALS, ARTIFACTS } from './config.js';
import { player, addArtifact } from './player.js';
import { addLogToGame, randomRange, saveGame } from './utils.js';

// Глобальные переменные для легальных заданий
export let currentMission = null;
export let missionCompleted = false;
let lastMissionUpdate = Date.now();

// Находки
export function tryFindGoods(entity, isPlayer) {
    let chance = CONFIG.GOODS_FIND_CHANCE;
    if (isPlayer && player.luckBoostRemaining > 0) chance *= 1.5;
    if (!isPlayer && entity.luckBoostRemaining > 0) chance *= 1.5;
    if (Math.random() > chance) return false;
    const goodType = CONFIG.GOODS_FIND_TYPES[Math.floor(Math.random() * CONFIG.GOODS_FIND_TYPES.length)];
    const good = GOODS.find(g => g.id === goodType);
    if (!good) return false;
    let amount = randomRange(CONFIG.GOODS_FIND_AMOUNT[0], CONFIG.GOODS_FIND_AMOUNT[1]);
    if (isPlayer && player.luckBoostRemaining > 0) amount = Math.floor(amount * 2);
    if (!isPlayer && entity.luckBoostRemaining > 0) amount = Math.floor(amount * 2);
    const ship = getShip(entity.shipLevel);
    const currentCargo = Object.values(entity.cargo).reduce((a,b)=>a+b,0);
    const freeSpace = ship.cargo - currentCargo;
    if (freeSpace < amount * good.cargoSpace) return false;
    entity.cargo[good.id] = (entity.cargo[good.id] || 0) + amount;
    addLogToGame(`${isPlayer ? "Вы" : entity.name} нашли ${amount} ${good.name} в космосе!`, "goods", isPlayer);
    return true;
}

export function tryFindMineral(entity, isPlayer) {
    const p = entity.currentPlanet;
    const inZone = (p >= CONFIG.MINERAL_ZONE_START[0] && p <= CONFIG.MINERAL_ZONE_START[1]) ||
                   (p >= CONFIG.MINERAL_ZONE_END[0] && p <= CONFIG.MINERAL_ZONE_END[1]);
    if (!inZone) return false;
    let chance = CONFIG.MINERAL_FIND_CHANCE;
    if (isPlayer && player.luckBoostRemaining > 0) chance *= 1.5;
    if (!isPlayer && entity.luckBoostRemaining > 0) chance *= 1.5;
    if (Math.random() > chance) return false;
    const mineral = MINERALS[Math.floor(Math.random() * MINERALS.length)];
    let amount = 1;
    if (isPlayer && player.luckBoostRemaining > 0) amount = 2;
    if (!isPlayer && entity.luckBoostRemaining > 0) amount = 2;
    const ship = getShip(entity.shipLevel);
    const currentCargo = Object.values(entity.cargo).reduce((a,b)=>a+b,0);
    if (currentCargo + amount * mineral.cargoSpace > ship.cargo) return false;
    entity.cargo[mineral.id] = (entity.cargo[mineral.id] || 0) + amount;
    addLogToGame(`${isPlayer ? "Вы" : entity.name} нашли редкий минерал: ${mineral.name} x${amount}!`, "goods", isPlayer);
    return true;
}

export function tryFindArtifact(entity, isPlayer) {
    if (Math.random() > CONFIG.ARTIFACT_FIND_CHANCE) return false;
    const artList = Object.keys(ARTIFACTS).map(id => ({ id, uses: ARTIFACTS[id].uses }));
    const art = artList[Math.floor(Math.random() * artList.length)];
    if (isPlayer) {
        addArtifact(art.id, art.uses);
        addLogToGame(`✨ Найден артефакт: ${ARTIFACTS[art.id].name}! ${ARTIFACTS[art.id].desc} ✨`, "artifact", true);
        saveGame();
        return true;
    } else {
        addArtifact(entity.artifacts, art.id, art.uses);
        addLogToGame(`✨ ${entity.name} нашёл артефакт: ${ARTIFACTS[art.id].name}!`, "artifact", true);
        saveGame();
        return true;
    }
}

// Легальные задания
export function generateMission() {
    if (missionCompleted) return;
    if (currentMission && !currentMission.completed) return;
    const good = GOODS[Math.floor(Math.random() * GOODS.length)];
    const qty = randomRange(10, 50);
    let fromPlanet, toPlanet;
    do {
        fromPlanet = randomRange(1, CONFIG.PLANET_COUNT);
        toPlanet = randomRange(1, CONFIG.PLANET_COUNT);
    } while (fromPlanet === toPlanet);
    const rewardType = Math.random() < 0.5 ? "credits" : "tm";
    const rewardAmount = rewardType === "credits" ? randomRange(1000, 5000) : randomRange(50, 100);
    currentMission = {
        good: good.id, goodName: good.name, qty,
        fromPlanet, toPlanet,
        rewardType, rewardAmount,
        completed: false, bought: 0, sold: 0
    };
    missionCompleted = false;
    addLogToGame(`📡 НОВОЕ ЗАДАНИЕ: купить ${qty} ${good.name} на планете #${fromPlanet}, затем продать на планете #${toPlanet}. Награда: ${rewardAmount} ${rewardType === "credits" ? "💰" : "🌑 ТМ"}!`, "mission", true);
    saveGame();
}

export function onBuyGood(goodId, qty, planetNumber, isPlayer) {
    if (!isPlayer) return false;
    if (!currentMission || currentMission.completed) return false;
    if (goodId !== currentMission.good) return false;
    if (planetNumber !== currentMission.fromPlanet) return false;
    currentMission.bought = (currentMission.bought || 0) + qty;
    if (currentMission.bought > currentMission.qty) currentMission.bought = currentMission.qty;
    addLogToGame(`📦 Задание: куплено ${currentMission.bought}/${currentMission.qty} ${currentMission.goodName} на #${currentMission.fromPlanet}`, "mission", true);
    saveGame();
    return true;
}

export function onSellGood(goodId, qty, planetNumber, isPlayer) {
    if (!isPlayer) return false;
    if (!currentMission || currentMission.completed) return false;
    if (goodId !== currentMission.good) return false;
    if (planetNumber !== currentMission.toPlanet) return false;
    if (currentMission.bought < currentMission.qty) {
        addLogToGame(`⚠️ Сначала нужно купить ${currentMission.qty} ${currentMission.goodName} на планете #${currentMission.fromPlanet}!`, "warning", true);
        return false;
    }
    currentMission.sold = (currentMission.sold || 0) + qty;
    if (currentMission.sold > currentMission.qty) currentMission.sold = currentMission.qty;
    if (currentMission.sold >= currentMission.qty) {
        currentMission.completed = true;
        missionCompleted = true;
        if (currentMission.rewardType === "credits") {
            player.credits += currentMission.rewardAmount;
            addLogToGame(`🎉 Задание выполнено! +${currentMission.rewardAmount}💰!`, "success", true);
        } else {
            player.darkMatter += currentMission.rewardAmount;
            addLogToGame(`🎉 Задание выполнено! +${currentMission.rewardAmount}🌑 ТМ!`, "success", true);
        }
        player.missionsCompleted++;
        const newBonus10 = Math.floor(player.missionsCompleted / 10);
        const newBonus100 = Math.floor(player.missionsCompleted / 100);
        if (newBonus10 > player.lastMissionBonus10) {
            const bonus = (newBonus10 - player.lastMissionBonus10) * 10000;
            player.credits += bonus;
            addLogToGame(`🏆 Бонус за выполнение ${newBonus10*10} заданий! Получено ${bonus}💰.`, "success", true);
            player.lastMissionBonus10 = newBonus10;
        }
        if (newBonus100 > player.lastMissionBonus100) {
            const bonus = (newBonus100 - player.lastMissionBonus100) * 1000;
            player.darkMatter += bonus;
            addLogToGame(`🏆 Бонус за выполнение ${newBonus100*100} заданий! Получено ${bonus}🌑 ТМ.`, "success", true);
            player.lastMissionBonus100 = newBonus100;
        }
        saveGame();
        return true;
    } else {
        addLogToGame(`📊 Прогресс задания: продано ${currentMission.sold}/${currentMission.qty} ${currentMission.goodName}`, "mission", true);
        saveGame();
        return false;
    }
}

export function updateMissionByTimer() {
    const now = Date.now();
    const lastSlot = Math.floor(lastMissionUpdate / CONFIG.MISSION_REFRESH_INTERVAL);
    const currentSlot = Math.floor(now / CONFIG.MISSION_REFRESH_INTERVAL);
    if (currentSlot !== lastSlot) {
        lastMissionUpdate = now;
        if (currentMission && !currentMission.completed) addLogToGame("⏰ Время выполнения задания истекло. Новое задание.", "warning", true);
        currentMission = null;
        missionCompleted = false;
        generateMission();
        return true;
    }
    return false;
}
