// trade.js – торговля, легальные задания, находки товаров/минералов/компонентов

import { CONFIG, GOODS, MINERALS, COMPONENTS } from './config.js';
import { player, addArtifact } from './player.js';
import { addLogToGame, randomRange, saveGame } from './utils.js';
import { addIncomeToPlanet } from './planets.js';

export let currentMission = null;
export let missionCompleted = false;

export function generateMission() {
    if (missionCompleted) return;
    if (currentMission && !currentMission.completed) return;
    const good = GOODS[Math.floor(Math.random() * GOODS.length)];
    const qty = randomRange(10, 50);
    let fromPlanet, toPlanet;
    do { fromPlanet = randomRange(1, CONFIG.PLANET_COUNT); toPlanet = randomRange(1, CONFIG.PLANET_COUNT); } while (fromPlanet === toPlanet);
    const rewardType = Math.random() < 0.5 ? "credits" : "tm";
    const rewardAmount = rewardType === "credits" ? randomRange(1000, 5000) : randomRange(50, 100);
    currentMission = {
        good: good.id,
        goodName: good.name,
        qty,
        fromPlanet,
        toPlanet,
        rewardType,
        rewardAmount,
        completed: false,
        bought: 0,
        sold: 0
    };
    missionCompleted = false;
    addLogToGame(`📡 НОВОЕ ЗАДАНИЕ: купить ${qty} ${good.name} на планете #${fromPlanet}, затем продать их на планете #${toPlanet}. Награда: ${rewardAmount} ${rewardType === "credits" ? "💰" : "🌑 ТМ"}!`, "mission", true);
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
            addLogToGame(`🏆 Бонус за выполнение ${newBonus10 * 10} заданий! Получено ${bonus}💰.`, "success", true);
            player.lastMissionBonus10 = newBonus10;
        }
        if (newBonus100 > player.lastMissionBonus100) {
            const bonus = (newBonus100 - player.lastMissionBonus100) * 1000;
            player.darkMatter += bonus;
            addLogToGame(`🏆 Бонус за выполнение ${newBonus100 * 100} заданий! Получено ${bonus}🌑 ТМ.`, "success", true);
            player.lastMissionBonus100 = newBonus100;
        }
        saveGame();
        return true;
    } else {
        addLogToGame(`📊 Прогресс задания: продано ${currentMission.sold}/${currentMission.qty} ${currentMission.goodName}`, "mission", true);
        saveGame();
    }
    return false;
}

export function updateMissionByTimer() {
    const now = Date.now();
    const lastSlot = Math.floor(window.lastMissionUpdate / CONFIG.MISSION_REFRESH_INTERVAL);
    const currentSlot = Math.floor(now / CONFIG.MISSION_REFRESH_INTERVAL);
    if (currentSlot !== lastSlot) {
        window.lastMissionUpdate = now;
        if (currentMission && !currentMission.completed) addLogToGame("⏰ Время выполнения задания истекло. Новое задание.", "warning", true);
        currentMission = null;
        missionCompleted = false;
        generateMission();
        return true;
    }
    return false;
}

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
    const ship = window.getShip?.(entity) || entity.ship;
    const currentCargo = Object.values(entity.cargo).reduce((a,b)=>a+b,0);
    const freeSpace = ship.cargo - currentCargo;
    if (freeSpace < amount * good.cargoSpace) return false;
    entity.cargo[good.id] = (entity.cargo[good.id] || 0) + amount;
    addLogToGame(`${isPlayer ? "Вы" : entity.name} нашли ${amount} ${good.name} в космосе!`, "goods", isPlayer);
    return true;
}

export function tryFindArtifact(entity, isPlayer) {
    if (!isPlayer && !window.gameActive) return false;
    if (Math.random() > CONFIG.ARTIFACT_FIND_CHANCE) return false;
    const artList = ["energyResonator", "amuletSupremacy", "tempMask", "rareCrystal", "luckMatrix", "navigationCrystal", "contrabandNetwork", "scanner", "emergencyAccelerator"];
    const artId = artList[Math.floor(Math.random() * artList.length)];
    const artDef = window.ARTIFACTS[artId];
    if (isPlayer) {
        addArtifact(player, artId, artDef.uses);
        addLogToGame(`✨ Найден артефакт: ${artDef.name}! ${artDef.desc} ✨`, "artifact", true);
        saveGame();
    } else {
        addArtifact(entity, artId, artDef.uses);
        addLogToGame(`✨ ${entity.name} нашёл артефакт: ${artDef.name}!`, "artifact", true);
        saveGame();
    }
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
    const ship = window.getShip?.(entity) || entity.ship;
    const currentCargo = Object.values(entity.cargo).reduce((a,b)=>a+b,0);
    if (currentCargo + amount * mineral.cargoSpace > ship.cargo) return false;
    entity.cargo[mineral.id] = (entity.cargo[mineral.id] || 0) + amount;
    addLogToGame(`${isPlayer ? "Вы" : entity.name} нашли редкий минерал: ${mineral.name} x${amount}!`, "goods", isPlayer);
    return true;
}

export function tryFindComponent(entity, isPlayer) {
    if (Math.random() > 0.02) return false; // 2% шанс
    const comp = COMPONENTS[Math.floor(Math.random() * COMPONENTS.length)];
    entity.components[comp.id] = (entity.components[comp.id] || 0) + 1;
    addLogToGame(`${isPlayer ? "Вы" : entity.name} нашли компонент: ${comp.name}!`, "goods", isPlayer);
    return true;
}

// Продажа минералов (вызывается из контрабандиста)
export function sellMinerals() {
    const mineralsInCargo = MINERALS.filter(m => player.cargo[m.id] && player.cargo[m.id] > 0);
    if (mineralsInCargo.length === 0) {
        addLogToGame("У вас нет редких минералов для продажи.", "warning", true);
        return;
    }
    const modal = document.createElement("div");
    modal.className = "modal";
    let html = `<div class="modal-content"><h3>Продажа редких минералов</h3><div class="trade-row">`;
    for (let m of mineralsInCargo) {
        const idx = MINERALS.findIndex(m2 => m2.id === m.id);
        const multiplier = window.mineralPriceMultipliers[idx];
        const ratingFactor = 1 + (player.contrabandRating - 50) / 100;
        const price = Math.floor(m.basePrice * multiplier * ratingFactor);
        html += `<div class="trade-item"><b>${m.name}</b> (${player.cargo[m.id]} шт.)<br>Цена: ${price}💰<br><button class="sellMineral" data-id="${m.id}" data-price="${price}">Продать 1</button><button class="sellAllMineral" data-id="${m.id}" data-price="${price}">Продать всё</button></div>`;
    }
    html += `</div><div class="modal-buttons"><button id="closeSellMenu">Закрыть</button></div></div>`;
    modal.innerHTML = html;
    document.body.appendChild(modal);
    modal.querySelectorAll(".sellMineral").forEach(btn => {
        btn.onclick = () => {
            const id = btn.dataset.id;
            const price = parseInt(btn.dataset.price);
            if (player.cargo[id] > 0) {
                player.cargo[id]--;
                if (player.cargo[id] === 0) delete player.cargo[id];
                player.credits += price;
                addLogToGame(`Продано 1 ${MINERALS.find(m => m.id === id).name} за ${price}💰.`, "success", true);
                saveGame();
                modal.remove();
                sellMinerals();
            }
        };
    });
    modal.querySelectorAll(".sellAllMineral").forEach(btn => {
        btn.onclick = () => {
            const id = btn.dataset.id;
            const price = parseInt(btn.dataset.price);
            const qty = player.cargo[id];
            if (qty > 0) {
                player.credits += qty * price;
                delete player.cargo[id];
                addLogToGame(`Продано ${qty} ${MINERALS.find(m => m.id === id).name} за ${qty * price}💰.`, "success", true);
                saveGame();
                modal.remove();
                sellMinerals();
            }
        };
    });
    modal.querySelector("#closeSellMenu").onclick = () => modal.remove();
}
