// utils.js – утилиты: логи, сохранение/загрузка, случайности

import { CONFIG } from './config.js';

export let gameLog = []; // для отображения в логе

export function addLogToGame(msg, type = "normal", global = true) {
    if (!global) return;
    const entry = { msg, type, timestamp: Date.now() };
    gameLog.unshift(entry);
    if (gameLog.length > 50) gameLog.pop();
    // обновляем UI, если он уже создан
    const logBox = document.getElementById("logBox");
    if (logBox) {
        const entryDiv = document.createElement("div");
        entryDiv.className = `log-entry ${type}`;
        entryDiv.innerText = msg;
        logBox.appendChild(entryDiv);
        logBox.scrollTop = logBox.scrollHeight;
        while (logBox.children.length > 50) logBox.removeChild(logBox.firstChild);
    }
}

export function saveGame(player, planets, bots, etc) {
    const data = {
        player,
        planets: planets.data,
        bots,
        gameState: {
            currentMission: window.currentMission,
            missionCompleted: window.missionCompleted,
            lastPriceUpdate: window.lastPriceUpdate,
            lastMissionUpdate: window.lastMissionUpdate,
            lastContrabandUpdate: window.lastContrabandUpdate,
            planetStocks: window.planetStocks,
            planetPrices: window.planetPrices,
            mineralPriceMultipliers: window.mineralPriceMultipliers,
            artifactMarket: window.artifactMarket,
            componentMarket: window.componentMarket,
            componentPriceHistory: window.componentPriceHistory,
            artifactPriceHistory: window.artifactPriceHistory,
            activeContrabandOffers: window.activeContrabandOffers,
            moduleBlueprintsOwned: window.moduleBlueprintsOwned,
            upgradeBlueprintsOwned: window.upgradeBlueprintsOwned,
            nextBotId: window.nextBotId
        }
    };
    localStorage.setItem("starNomadFull", JSON.stringify(data));
    localStorage.setItem("starNomadFullLastTime", Date.now().toString());
}

export function loadGame() {
    const raw = localStorage.getItem("starNomadFull");
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch(e) { return null; }
}

export function randomRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

export function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function formatNumber(n) {
    return Math.floor(n).toLocaleString();
}
