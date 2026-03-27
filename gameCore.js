// gameCore.js – основные действия: движение, гиперпрыжок, случайные события

import { CONFIG, GOODS, MINERALS, ARTIFACTS } from './config.js';
import { player, getShip, getOptimizerCost, getTMHarvestBonus, getSSGeneratorBonus, addArtifact, updatePlayerLevel } from './player.js';
import { addLogToGame, randomRange, saveGame } from './utils.js';
import { tryFindGoods, tryFindMineral, tryFindArtifact } from './trade.js'; // эти функции мы определим позже
import { triggerRandomEvent } from './events.js'; // тоже позже
import { encounterWithBots } from './combat.js';
import { patrolEncounter } from './contraband.js';

export async function move(delta) {
    if (player.isDead) { addLogToGame("Ваш корабль уничтожен. Начните новую игру.", "warning", true); return; }
    if (player.fuel <= 0) { addLogToGame("Нет топлива! Заправьтесь.", "warning", true); return; }

    let newPlanet = player.currentPlanet + delta;
    if (newPlanet < 1) newPlanet = 1;
    if (newPlanet > CONFIG.PLANET_COUNT) newPlanet = CONFIG.PLANET_COUNT;
    player.currentPlanet = newPlanet;

    player.fuel--;
    player.strangePower++;

    const ssBonus = getSSGeneratorBonus();
    if (ssBonus > 0) {
        player.strangePower += ssBonus;
        addLogToGame(`Генератор СС: +${ssBonus} СС`, "success", true);
    }
    const tmBonus = getTMHarvestBonus();
    if (tmBonus > 0) {
        player.darkMatter += tmBonus;
        addLogToGame(`Модуль добычи: +${tmBonus} ТМ`, "success", true);
    }

    // Находки
    let darkChance = CONFIG.DARK_MATTER_CHANCE;
    if (player.luckBoostRemaining > 0) darkChance *= 1.5;
    if (Math.random() < darkChance) {
        let tm = randomRange(CONFIG.DARK_MATTER_AMOUNT[0], CONFIG.DARK_MATTER_AMOUNT[1]);
        if (player.luckBoostRemaining > 0) tm = Math.floor(tm * 2);
        player.darkMatter += tm;
        addLogToGame(`Найдена тёмная материя! +${tm} ТМ`, "success", true);
    }

    tryFindGoods(player, true);
    tryFindArtifact(player, true);
    tryFindMineral(player, true);

    triggerRandomEvent();

    if (player.luckBoostRemaining > 0) player.luckBoostRemaining--;
    if (player.stealthRemaining > 0) player.stealthRemaining--;

    if (player.contrabandMission && player.contrabandMission.cargoTaken) await patrolEncounter(true);

    updatePlayerLevel();
    saveGame();
    // Обновим UI через внешнюю функцию (будет в main)
    if (window.updateUIFunc) window.updateUIFunc();
    encounterWithBots();
}

export function hyperJump(direction) {
    if (player.isDead) { addLogToGame("Ваш корабль уничтожен.", "warning", true); return; }
    const cost = getOptimizerCost();
    if (player.strangePower < cost) {
        addLogToGame(`Недостаточно Силы Странника (нужно ${cost})`, "warning", true);
        return;
    }
    const current = player.currentPlanet;
    const available = [];
    if (direction === -1) {
        for (let i = 1; i < current; i++) available.push(i);
    } else {
        for (let i = current + 1; i <= CONFIG.PLANET_COUNT; i++) available.push(i);
    }
    if (available.length === 0) {
        addLogToGame("В этом направлении нет планет для гиперпрыжка!", "warning", true);
        return;
    }
    const randomIndex = Math.floor(Math.random() * available.length);
    player.currentPlanet = available[randomIndex];
    player.strangePower -= cost;
    addLogToGame(`Гиперпрыжок ${direction === -1 ? "налево" : "направо"}! Вы на планете #${player.currentPlanet}`, "success", true);
    saveGame();
    if (window.updateUIFunc) window.updateUIFunc();
    encounterWithBots();
}
