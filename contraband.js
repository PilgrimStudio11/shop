// contraband.js – контрабандные задания, встреча с патрулём

import { CONFIG } from './config.js';
import { player } from './player.js';
import { addLogToGame, randomRange, saveGame } from './utils.js';

export let activeContrabandOffers = [];
let lastContrabandUpdate = Date.now();

export function generateContrabandOffers() {
    const offers = [];
    for (let level = 1; level <= 3; level++) {
        const rewardType = Math.random() < 0.5 ? "credits" : "tm";
        let rewardBase;
        if (rewardType === "credits") {
            if (level === 1) rewardBase = randomRange(5000, 8000);
            else if (level === 2) rewardBase = randomRange(8000, 12000);
            else rewardBase = randomRange(12000, 18000);
        } else {
            if (level === 1) rewardBase = randomRange(100, 200);
            else if (level === 2) rewardBase = randomRange(200, 350);
            else rewardBase = randomRange(350, 500);
        }
        let fromPlanet, toPlanet;
        do {
            fromPlanet = randomRange(1, CONFIG.PLANET_COUNT);
            toPlanet = randomRange(1, CONFIG.PLANET_COUNT);
        } while (fromPlanet === toPlanet);
        offers.push({ level, fromPlanet, toPlanet, rewardType, rewardBase, completed: false });
    }
    activeContrabandOffers = offers;
    saveGame();
}

export function takeContrabandOffer(offerIndex) {
    const offer = activeContrabandOffers[offerIndex];
    if (!offer || offer.completed) return false;
    if (player.contrabandMission) {
        addLogToGame("У вас уже есть активное контрабандное задание.", "warning", true);
        return false;
    }
    player.contrabandMission = {
        fromPlanet: offer.fromPlanet,
        toPlanet: offer.toPlanet,
        rewardBase: offer.rewardBase,
        rewardType: offer.rewardType,
        level: offer.level,
        cargoTaken: false
    };
    addLogToGame(`Вы взяли контрабандное задание (уровень ${offer.level}). Нужно забрать груз на планете #${offer.fromPlanet} и доставить на #${offer.toPlanet}.`, "contraband", true);
    offer.completed = true;
    saveGame();
    return true;
}

export function takeContrabandCargo() {
    if (!player.contrabandMission) return false;
    if (player.contrabandMission.cargoTaken) {
        addLogToGame("Вы уже взяли груз.", "warning", true);
        return false;
    }
    if (player.currentPlanet !== player.contrabandMission.fromPlanet) {
        addLogToGame("Вы должны быть на планете отправления, чтобы забрать груз.", "warning", true);
        return false;
    }
    const ship = getShip(player.shipLevel);
    const currentCargo = Object.values(player.cargo).reduce((a,b)=>a+b,0);
    if (currentCargo + 1 > ship.cargo) {
        addLogToGame("Недостаточно места в трюме.", "warning", true);
        return false;
    }
    player.cargo["contraband"] = (player.cargo["contraband"] || 0) + 1;
    player.contrabandMission.cargoTaken = true;
    addLogToGame(`Вы взяли контрабанду на планете #${player.currentPlanet}. Доставьте на #${player.contrabandMission.toPlanet}.`, "contraband", true);
    saveGame();
    return true;
}

export function deliverContraband() {
    if (!player.contrabandMission) return false;
    if (!player.contrabandMission.cargoTaken) {
        addLogToGame("Вы ещё не забрали груз на планете отправления.", "warning", true);
        return false;
    }
    if (player.currentPlanet !== player.contrabandMission.toPlanet) return false;
    const contrabandQty = player.cargo["contraband"] || 0;
    if (contrabandQty === 0) {
        addLogToGame("У вас нет контрабанды!", "warning", true);
        return false;
    }
    player.cargo["contraband"]--;
    if (player.cargo["contraband"] === 0) delete player.cargo["contraband"];

    const success = Math.random() < (1 - CONFIG.CONTRABAND_ENCOUNTER_CHANCE);
    let ratingChange = 0;
    let reward = 0;
    if (success) {
        ratingChange = player.contrabandMission.level;
        reward = player.contrabandMission.rewardBase * (1 + (player.contrabandRating - 50) / 100);
        if (player.contrabandMission.rewardType === "credits") player.credits += Math.floor(reward);
        else player.darkMatter += Math.floor(reward);
        player.contrabandRating = Math.min(100, player.contrabandRating + ratingChange);
        addLogToGame(`🎉 Контрабанда доставлена! Получено ${Math.floor(reward)}${player.contrabandMission.rewardType === "credits" ? "💰" : "🌑 ТМ"}. Рейтинг +${ratingChange} (текущий ${player.contrabandRating}).`, "contraband", true);
    } else {
        ratingChange = -player.contrabandMission.level;
        player.credits = Math.max(0, player.credits - 1000);
        player.contrabandRating = Math.max(0, player.contrabandRating + ratingChange);
        addLogToGame(`❌ Контрабанда провалена! Потеряно 1000💰. Рейтинг ${ratingChange} (текущий ${player.contrabandRating}).`, "contraband", true);
    }
    player.contrabandMission = null;
    generateContrabandOffers();
    saveGame();
    return true;
}

export async function patrolEncounter(isPlayer) {
    if (!isPlayer) return false;
    if (!player.contrabandMission || !player.contrabandMission.cargoTaken) return false;
    if (Math.random() > CONFIG.CONTRABAND_ENCOUNTER_CHANCE) return false;
    const success = await patrolEncounterWithChoice();
    if (success) return false;
    player.cargo["contraband"] = (player.cargo["contraband"] || 0) - 1;
    if (player.cargo["contraband"] <= 0) delete player.cargo["contraband"];
    player.credits = Math.max(0, player.credits - 1000);
    player.contrabandRating = Math.max(0, player.contrabandRating - 1);
    player.contrabandMission = null;
    saveGame();
    return true;
}

function patrolEncounterWithChoice() {
    return new Promise((resolve) => {
        const modal = document.createElement("div"); modal.className = "modal";
        modal.innerHTML = `<div class="modal-content"><h3>🚨 ПАТРУЛЬ ОСТАНОВИЛ ВАС!</h3><p>Ваш корабль с контрабандой остановлен. Что будете делать?</p><div class="modal-buttons"><button id="bribeBtn">💵 Дать взятку (500💰, 50% успеха)</button><button id="docsBtn">📄 Показать поддельные документы (250💰, 80% успеха)</button><button id="runBtn">🏃‍♂️ Убежать (кинуть кубик)</button></div></div>`;
        document.body.appendChild(modal);
        modal.querySelector("#bribeBtn").onclick = () => {
            modal.remove();
            if (player.credits < 500) { addLogToGame("Не хватает кредитов для взятки!", "warning", true); resolve(false); return; }
            player.credits -= 500;
            if (Math.random() < 0.5) { addLogToGame("Патруль взял взятку и отпустил вас. Контрабанда сохранена.", "success", true); resolve(true); }
            else { addLogToGame("Патруль взял взятку, но всё равно конфисковал груз! Задание провалено.", "combat", true); resolve(false); }
        };
        modal.querySelector("#docsBtn").onclick = () => {
            modal.remove();
            if (player.credits < 250) { addLogToGame("Не хватает кредитов для покупки фальшивых документов!", "warning", true); resolve(false); return; }
            player.credits -= 250;
            if (Math.random() < 0.8) { addLogToGame("Поддельные документы сработали! Патруль пропустил вас.", "success", true); resolve(true); }
            else { addLogToGame("Поддельные документы не помогли. Груз конфискован!", "combat", true); resolve(false); }
        };
        modal.querySelector("#runBtn").onclick = () => {
            modal.remove();
            const diceModal = document.createElement("div"); diceModal.className = "modal";
            diceModal.innerHTML = `<div class="modal-content dice-modal"><h3>🏃‍♂️ ПОПЫТКА УБЕЖАТЬ</h3><p>Нажмите кнопку, чтобы бросить кубик:</p><button id="rollDiceBtn">🎲 БРОСИТЬ КУБИК</button><div id="diceResult" class="dice-result"></div><div id="diceMessage"></div></div>`;
            document.body.appendChild(diceModal);
            const rollBtn = diceModal.querySelector("#rollDiceBtn");
            const resultDiv = diceModal.querySelector("#diceResult");
            const msgDiv = diceModal.querySelector("#diceMessage");
            rollBtn.onclick = () => {
                const patrolRoll = Math.floor(Math.random() * 6) + 1;
                const playerRoll = Math.floor(Math.random() * 6) + 1;
                resultDiv.innerHTML = `Патруль выбросил: ${patrolRoll}<br>Вы выбросили: ${playerRoll}`;
                if (playerRoll >= patrolRoll) {
                    msgDiv.innerHTML = "✅ Вы ушли от погони! Контрабанда сохранена.";
                    const closeBtn = document.createElement("button"); closeBtn.innerText = "Продолжить";
                    closeBtn.onclick = () => { diceModal.remove(); resolve(true); };
                    diceModal.querySelector(".modal-content").appendChild(closeBtn);
                } else {
                    msgDiv.innerHTML = "❌ Патруль догнал вас! Груз конфискован.";
                    const closeBtn = document.createElement("button"); closeBtn.innerText = "Продолжить";
                    closeBtn.onclick = () => { diceModal.remove(); resolve(false); };
                    diceModal.querySelector(".modal-content").appendChild(closeBtn);
                }
                rollBtn.disabled = true;
            };
        };
    });
}
