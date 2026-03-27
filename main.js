// main.js – инициализация игры, таймеры, обработчики кнопок

import { CONFIG, GOODS, MINERALS, ARTIFACTS, SHIPS, MODULE_BLUEPRINTS, UPGRADE_RECIPES } from './config.js';
import { player, initPlayer, getShip, updatePlayerLevel, getTotalPower, getOptimizerCost, getDockCost, getTMHarvestBonus, getSSGeneratorBonus, addArtifact, useArtifact, hasArtifact } from './player.js';
import { addLogToGame, saveGame, loadGame, randomRange, gameLog } from './utils.js';
import { move, hyperJump } from './gameCore.js';
import { generateMission, updateMissionByTimer, currentMission, missionCompleted } from './trade.js';
import { generateContrabandOffers, activeContrabandOffers, takeContrabandOffer, takeContrabandCargo, deliverContraband } from './contraband.js';
import { bots, createBot, startBotAI, scheduleBotCreation, removeBot } from './bots.js';
import { planetOwners, planetPrevOwnersCount, planetIncome, planetTM, planetMinerIncome, planetModules, initPlanets, getPlanetMaxStorage, getPlanetStorageUpgradeCost, getPlanetIncomePercent, getPlanetPrice, canBuyPlanet, buyPlanet, installPlanetModule, upgradePlanetStorage, addIncomeToPlanet, collectAllPlanetResources, updatePlanetResources } from './planets.js';
import { moduleBlueprintsOwned, upgradeBlueprintsOwned, buyBlueprint, startCraft, processCrafting, installModule, uninstallModule } from './crafting.js';
import { artifactMarket, componentMarket, artifactPriceHistory, componentPriceHistory, getAverageComponentPrice, updateComponentPriceHistory, listComponentForSale, cancelComponentSale, buyComponent, updateArtifactPriceHistory, listArtifactForSale, cancelArtifactSale, buyArtifact, withdrawArtifactSales } from './market.js';
import { resolveCombat, fightWithBot, playerDefeated, encounterWithBots } from './combat.js';

// Глобальные переменные для состояния игры
export let gameActive = false;
let planetStocks = [];
let planetPrices = [];
let lastPriceUpdate = Date.now();
let lastMissionUpdate = Date.now();
let lastContrabandUpdate = Date.now();
let mineralPriceMultipliers = [];

// Инициализация планетных данных
function initPlanetData() {
    planetStocks = [];
    for (let i = 0; i < CONFIG.PLANET_COUNT; i++) {
        const stock = {};
        GOODS.forEach(g => stock[g.id] = 1000);
        planetStocks.push(stock);
    }
    planetPrices = [];
    for (let i = 0; i < CONFIG.PLANET_COUNT; i++) {
        planetPrices.push(generatePricesForPlanet(i+1, Date.now()));
    }
    mineralPriceMultipliers = MINERALS.map(() => 0.8 + Math.random() * 0.4);
}

function generatePricesForPlanet(planetIdx, timestamp) {
    const slot = Math.floor(timestamp / CONFIG.PRICE_REFRESH_INTERVAL);
    const seed = (planetIdx * 374761393) ^ (slot * 668265263);
    const rng = (seed % 10000) / 10000;
    const prices = {};
    GOODS.forEach(g => {
        let buy = g.baseBuy + Math.floor((rng * g.spread * 2) - g.spread);
        buy = Math.max(5, buy);
        let sell = Math.min(buy, Math.max(5, buy + Math.floor((Math.random() * g.spread) - g.spread / 2)));
        prices[g.id] = { buy, sell };
    });
    return prices;
}

function refreshPricesOnly() {
    const now = Date.now();
    const lastSlot = Math.floor(lastPriceUpdate / CONFIG.PRICE_REFRESH_INTERVAL);
    const currentSlot = Math.floor(now / CONFIG.PRICE_REFRESH_INTERVAL);
    if (currentSlot !== lastSlot) {
        for (let i = 0; i < CONFIG.PLANET_COUNT; i++) {
            planetPrices[i] = generatePricesForPlanet(i+1, now);
        }
        lastPriceUpdate = now;
        addLogToGame("🔄 Цены на планетах обновлены", "success", true);
        return true;
    }
    return false;
}

function replenishStocks() {
    for (let i = 0; i < CONFIG.PLANET_COUNT; i++) {
        const maxStorage = getPlanetMaxStorage(i);
        for (let g of GOODS) {
            const add = randomRange(CONFIG.STOCK_REPLENISH_AMOUNT[0], CONFIG.STOCK_REPLENISH_AMOUNT[1]);
            planetStocks[i][g.id] = Math.min(maxStorage, planetStocks[i][g.id] + add);
        }
    }
    addLogToGame("📦 Запасы товаров на планетах пополнены", "success", true);
}

function simulateTimePassed(ms) {
    if (ms <= 0 || ms > 12 * 60 * 60 * 1000) return;
    const minutes = ms / 60000;
    updatePlanetResources(minutes);
    const priceSteps = Math.floor(ms / CONFIG.PRICE_REFRESH_INTERVAL);
    for (let i = 0; i < priceSteps; i++) refreshPricesOnly();
    const stockSteps = Math.floor(ms / CONFIG.STOCK_REPLENISH_INTERVAL);
    for (let i = 0; i < stockSteps; i++) replenishStocks();
    const missionSteps = Math.floor(ms / CONFIG.MISSION_REFRESH_INTERVAL);
    for (let i = 0; i < missionSteps; i++) updateMissionByTimer();
    const contrabandSteps = Math.floor(ms / CONFIG.CONTRABAND_MISSION_COOLDOWN);
    for (let i = 0; i < contrabandSteps; i++) {
        generateContrabandOffers();
        lastContrabandUpdate = Date.now();
    }
    // Симуляция движений ботов (упрощённо, чтобы не зависало)
    const avgMoveDelay = CONFIG.BOT_MOVE_DELAY;
    let moveCount = Math.floor(ms / avgMoveDelay);
    moveCount = Math.min(moveCount, 10000);
    for (let iter = 0; iter < moveCount; iter++) {
        for (let bot of bots) {
            if (bot.inDock) continue;
            const dir = getClosestEnemyPosition(bot);
            if (dir !== null) {
                let newPlanet = bot.currentPlanet + dir;
                if (newPlanet < 1) newPlanet = CONFIG.PLANET_COUNT;
                if (newPlanet > CONFIG.PLANET_COUNT) newPlanet = 1;
                bot.currentPlanet = newPlanet;
            } else {
                const r = Math.random() < 0.5 ? -1 : 1;
                let newPlanet = bot.currentPlanet + r;
                if (newPlanet < 1) newPlanet = CONFIG.PLANET_COUNT;
                if (newPlanet > CONFIG.PLANET_COUNT) newPlanet = 1;
                bot.currentPlanet = newPlanet;
            }
            if (bot.fuel > 0) bot.fuel--;
            if (bot.hasSSGenerator) bot.strangePower += 2;
            if (Math.random() < CONFIG.DARK_MATTER_CHANCE) bot.darkMatter += randomRange(CONFIG.DARK_MATTER_AMOUNT[0], CONFIG.DARK_MATTER_AMOUNT[1]);
            if (bot.hasTMHarvester) bot.darkMatter++;
            tryFindGoods(bot, false);
            tryFindMineral(bot, false);
            tryFindArtifact(bot, false);
            botTradeAndUpgrade(bot);
            botTryContraband(bot);
            const planetIdx = bot.currentPlanet - 1;
            if (planetOwners[planetIdx] !== bot.id && canBuyPlanet(planetIdx, bot.level, false) && bot.credits >= getPlanetPrice(planetIdx)) buyPlanet(planetIdx, bot, false);
            for (let i = 0; i < CONFIG.PLANET_COUNT; i++) if (planetOwners[i] === bot.id) {
                if (!planetModules[i].tmLaboratory && Math.random() < 0.1 && bot.credits >= CONFIG.MODULE_PLANET_TM_LAB_COST) installPlanetModule(i, "tmLaboratory", false, bot);
                if (!planetModules[i].planetMiner && Math.random() < 0.1 && bot.credits >= CONFIG.MODULE_PLANET_MINER_COST) installPlanetModule(i, "planetMiner", false, bot);
                if (!planetModules[i].teleport && Math.random() < 0.1 && bot.credits >= CONFIG.MODULE_PLANET_TELEPORT_COST) installPlanetModule(i, "teleport", false, bot);
                const upgradeCost = getPlanetStorageUpgradeCost(i);
                if (upgradeCost && planetModules[i].storageLevel < 5 && Math.random() < 0.05 && bot.credits >= upgradeCost) upgradePlanetStorage(i, false, bot);
            }
            if (Math.random() < 0.5) collectAllPlanetResources(false, bot);
            if (bot.stealthRemaining > 0) bot.stealthRemaining--;
            if (bot.luckBoostRemaining > 0) bot.luckBoostRemaining--;
            if (bot.battleBuffRemaining > 0) bot.battleBuffRemaining--;
            const newLevel = Math.floor(bot.wins / 7) + 1;
            if (newLevel > bot.level) bot.level = newLevel;
        }
        // Бои между ботами
        const planetsWithBots = new Map();
        for (let bot of bots) if (!bot.inDock) {
            if (!planetsWithBots.has(bot.currentPlanet)) planetsWithBots.set(bot.currentPlanet, []);
            planetsWithBots.get(bot.currentPlanet).push(bot);
        }
        for (let [planet, bList] of planetsWithBots) {
            if (bList.length < 2) continue;
            bList.sort((a,b) => getTotalPower(b) - getTotalPower(a));
            const attacker = bList[0];
            const defender = bList[1];
            if (getTotalPower(attacker) > getTotalPower(defender) * (1 + CONFIG.BOT_ATTACK_THRESHOLD)) {
                resolveCombat(attacker, defender, false);
            }
        }
    }
    const botCreateSteps = Math.floor(ms / CONFIG.BOT_CREATE_INTERVAL);
    for (let i = 0; i < botCreateSteps; i++) {
        const level1Count = bots.filter(b => b.level === 1).length;
        if (bots.length < CONFIG.MAX_BOTS && level1Count < CONFIG.MAX_LEVEL1_BOTS) createBot(1, 0);
    }
    saveGame();
    addLogToGame(`⏳ Симуляция пропущенного времени (${Math.floor(ms / 1000 / 60)} минут) завершена.`, "success", true);
}

// Функции для UI (в полной версии будут реализованы)
function updateUI() {
    // Обновление всех панелей
}

function openPlanetMenu(planetNumber) {
    // Модальное окно планеты
}

function openDock(restore = false) {
    // Док
}

function openShipShopModal() {
    // Магазин
}

function updateRankingModal() {
    // Рейтинг
}

function showInfoModal() {
    // Справка
}

function startGame() {
    if (player.isDead) return;
    gameActive = true;
    document.getElementById("menuScreen").style.display = "none";
    document.getElementById("gameScreen").classList.remove("hidden");
    updateUI();
    startBotAI();
    scheduleBotCreation();
    setInterval(() => { if (gameActive) refreshPricesOnly(); }, 60000);
    setInterval(() => { if (gameActive) replenishStocks(); }, CONFIG.STOCK_REPLENISH_INTERVAL);
    setInterval(() => { if (gameActive) updateMissionByTimer(); }, 60000);
    setInterval(() => { if (gameActive) { generateContrabandOffers(); lastContrabandUpdate = Date.now(); } }, CONFIG.CONTRABAND_MISSION_COOLDOWN);
    setInterval(() => { if (gameActive && player.immunityUntil && Date.now() > player.immunityUntil && player.immunityUntil !== 0) { addLogToGame("🛡️ Иммунитет закончился! Боты могут атаковать.", "warning", true); player.immunityUntil = 0; saveGame(); } }, 60000);
    setInterval(() => processCrafting(player, true), 1000);
    if (player.inDock) openDock(true);
}

function resetWorld() {
    if (confirm("Сброс мира удалит всех ботов, очистит все планеты, обнулит экономику и сбросит вашего персонажа. Продолжить?")) {
        resetWorldAndNewPlayer();
        document.getElementById("continueBtn").disabled = false;
        document.getElementById("newGameBtn").disabled = true;
        if (gameActive) {
            gameActive = false;
            if (window.botInterval) clearInterval(window.botInterval);
            if (window.botCreationTimeout) clearTimeout(window.botCreationTimeout);
            document.getElementById("menuScreen").style.display = "block";
            document.getElementById("gameScreen").classList.add("hidden");
        }
        updateRankingModal();
        alert("Мир был сброшен. Начните новую игру через кнопку ПРОДОЛЖИТЬ.");
    }
}

function resetWorldAndNewPlayer() {
    initPlanetData();
    lastPriceUpdate = Date.now();
    lastMissionUpdate = Date.now();
    lastContrabandUpdate = Date.now();
    bots.length = 0;
    nextBotId = 100;
    initPlanets();
    for (let i = 0; i < CONFIG.MAX_LEVEL1_BOTS; i++) createBot(1, 0);
    initPlayer();
    player.currentPlanet = randomRange(1, CONFIG.PLANET_COUNT);
    player.fuel = getShip().fuelCap;
    player.immunityUntil = Date.now() + CONFIG.IMMUNITY_DURATION;
    ALL_GOODS.forEach(g => player.cargo[g.id] = 0);
    COMPONENTS.forEach(c => player.components[c.id] = 0);
    player.artifacts = [];
    currentMission = null;
    missionCompleted = false;
    generateContrabandOffers();
    moduleBlueprintsOwned = [];
    upgradeBlueprintsOwned = [];
    artifactMarket = [];
    componentMarket = [];
    componentPriceHistory = {};
    artifactPriceHistory = {};
    saveGame();
}

window.onload = () => {
    const saved = loadGame();
    if (saved) {
        // Восстановление состояния из сохранения (пропущено для краткости)
    } else {
        resetWorldAndNewPlayer();
    }
    const lastSaveTime = localStorage.getItem("starNomadFullLastTime");
    if (lastSaveTime) {
        const timePassed = Date.now() - parseInt(lastSaveTime);
        if (timePassed > 0 && timePassed < 12 * 60 * 60 * 1000) simulateTimePassed(timePassed);
    }
    localStorage.setItem("starNomadFullLastTime", Date.now().toString());

    document.getElementById("continueBtn").disabled = player.isDead;
    document.getElementById("newGameBtn").disabled = !player.isDead;
    document.getElementById("continueBtn").onclick = () => startGame();
    document.getElementById("newGameBtn").onclick = () => {
        if (!player.isDead) { alert("Новая игра только после гибели."); return; }
        createNewPlayerInCurrentWorld();
        player.isDead = false;
        document.getElementById("continueBtn").disabled = false;
        document.getElementById("newGameBtn").disabled = true;
        if (gameActive) {
            gameActive = false;
            if (window.botInterval) clearInterval(window.botInterval);
            if (window.botCreationTimeout) clearTimeout(window.botCreationTimeout);
            document.getElementById("menuScreen").style.display = "block";
            document.getElementById("gameScreen").classList.add("hidden");
        }
    };
    document.getElementById("resetWorldBtn").onclick = () => resetWorld();
    document.getElementById("shopBtn").onclick = () => openShipShopModal();
    document.getElementById("rankingBtn").onclick = () => updateRankingModal();
    document.getElementById("infoBtn").onclick = () => showInfoModal();
    document.getElementById("exportBtn").onclick = () => exportSave();
    document.getElementById("importBtn").onclick = () => importSave();
    document.getElementById("exitBtn").onclick = () => { saveGame(); alert("Игра сохранена."); };
    document.getElementById("leftBtn").onclick = () => move(-1);
    document.getElementById("rightBtn").onclick = () => move(1);
    document.getElementById("hyperLeftBtn").onclick = () => hyperJump(-1);
    document.getElementById("hyperRightBtn").onclick = () => hyperJump(1);
    document.getElementById("menuBtn").onclick = () => { gameActive = false; if (window.botInterval) clearInterval(window.botInterval); if (window.botCreationTimeout) clearTimeout(window.botCreationTimeout); document.getElementById("menuScreen").style.display = "block"; document.getElementById("gameScreen").classList.add("hidden"); document.getElementById("continueBtn").disabled = player.isDead; document.getElementById("newGameBtn").disabled = !player.isDead; saveGame(); };
    document.getElementById("dockBtn").onclick = () => openDock(false);
    document.getElementById("currentPlanetCard").onclick = () => { if (!player.isDead) openPlanetMenu(player.currentPlanet); };
    document.getElementById("menuScreen").style.display = "block";
    if (!currentMission && !missionCompleted) generateMission();
    generateContrabandOffers();
    registerPWA();
};
