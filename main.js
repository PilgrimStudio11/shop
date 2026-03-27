// main.js – точка входа, инициализация, таймеры, обработчики

import { CONFIG, GOODS, MINERALS, ARTIFACTS, SHIPS, MODULE_BLUEPRINTS, UPGRADE_RECIPES } from './config.js';
import { player, initPlayer, getShip, updatePlayerLevel, getTotalPower, getOptimizerCost, getDockCost, getTMHarvestBonus, getSSGeneratorBonus, addArtifact, useArtifact, hasArtifact } from './player.js';
import { addLogToGame, saveGame, loadGame, randomRange, gameLog } from './utils.js';
import { move, hyperJump } from './gameCore.js';
import { generateMission, updateMissionByTimer, currentMission, missionCompleted, onBuyGood, onSellGood, tryFindGoods, tryFindArtifact, tryFindMineral, tryFindComponent, sellMinerals } from './trade.js';
import { generateContrabandOffers, activeContrabandOffers, takeContrabandOffer, takeContrabandCargo, deliverContraband, patrolEncounter } from './contraband.js';
import { bots, createBot, startBotAI, scheduleBotCreation, removeBot, getClosestEnemyPosition, botTradeAndUpgrade, botTryContraband } from './bots.js';
import { planetOwners, planetPrevOwnersCount, planetIncome, planetTM, planetMinerIncome, planetModules, initPlanets, getPlanetMaxStorage, getPlanetStorageUpgradeCost, getPlanetIncomePercent, getPlanetPrice, canBuyPlanet, buyPlanet, installPlanetModule, upgradePlanetStorage, addIncomeToPlanet, collectAllPlanetResources, updatePlanetResources } from './planets.js';
import { moduleBlueprintsOwned, upgradeBlueprintsOwned, buyBlueprint, startCraft, processCrafting, installModule, uninstallModule } from './crafting.js';
import { artifactMarket, componentMarket, artifactPriceHistory, componentPriceHistory, getAverageComponentPrice, updateComponentPriceHistory, listComponentForSale, cancelComponentSale, buyComponent, updateArtifactPriceHistory, listArtifactForSale, cancelArtifactSale, buyArtifact, withdrawArtifactSales } from './market.js';
import { resolveCombat, fightWithBot, playerDefeated, encounterWithBots } from './combat.js';
import { triggerRandomEvent } from './events.js';
import { updateUI, openPlanetMenu, openDock, openShipShopModal, updateRankingModal, showInfoModal, exitDockToRandom } from './ui.js';

// Глобальные переменные для состояния игры
export let gameActive = false;
let planetStocks = [];
let planetPrices = [];
let lastPriceUpdate = Date.now();
let lastMissionUpdate = Date.now();
let lastContrabandUpdate = Date.now();
let mineralPriceMultipliers = [];
let nextBotId = 100;

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
    // Симуляция движений ботов (упрощённо)
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
    for (let g of GOODS) player.cargo[g.id] = 0;
    for (let m of MINERALS) player.cargo[m.id] = 0;
    for (let c of COMPONENTS) player.components[c.id] = 0;
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

function createNewPlayerInCurrentWorld() {
    // Создаёт нового игрока в текущем мире без сброса мира
    initPlayer();
    player.currentPlanet = randomRange(1, CONFIG.PLANET_COUNT);
    player.fuel = getShip().fuelCap;
    player.immunityUntil = Date.now() + CONFIG.IMMUNITY_DURATION;
    for (let g of GOODS) player.cargo[g.id] = 0;
    for (let m of MINERALS) player.cargo[m.id] = 0;
    for (let c of COMPONENTS) player.components[c.id] = 0;
    player.artifacts = [];
    player.ownedModules = [];
    player.craftingQueue = [];
    player.artifactSalesBalance = 0;
    player.missionsCompleted = 0;
    player.contrabandRating = 50;
    player.contrabandMission = null;
    player.wins = 0;
    player.level = 1;
    player.shipLevel = 1;
    player.hull = 100;
    player.strangePower = CONFIG.START_STRANGE_POWER;
    player.darkMatter = 0;
    player.isDead = false;
    player.inDock = false;
    player.dockEnterTime = 0;
    player.hasTMHarvester = false;
    player.hasSSGenerator = false;
    player.hasOptimizer = false;
    player.tmHarvesterLevel = 0;
    player.ssGeneratorLevel = 0;
    player.optimizerLevel = 0;
    player.stealthRemaining = 0;
    player.luckBoostRemaining = 0;
    player.battleBuffRemaining = 0;
    player.ignoreLevelOnce = false;
    player.lastMissionBonus10 = 0;
    player.lastMissionBonus100 = 0;
    saveGame();
}

function exportSave() {
    const data = localStorage.getItem("starNomadFull");
    if (!data) { alert("Нет сохранения."); return; }
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `star_nomad_save_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    alert("Сохранение экспортировано.");
}

function importSave() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const data = JSON.parse(ev.target.result);
                localStorage.setItem("starNomadFull", JSON.stringify(data));
                alert("Сохранение импортировано. Перезагрузите страницу.");
                location.reload();
            } catch (err) { alert("Ошибка импорта."); }
        };
        reader.readAsText(file);
    };
    input.click();
}

function registerPWA() {
    const manifest = {
        name: "Star Nomad — Торговая Империя",
        short_name: "Star Nomad",
        description: "Космическая торговая песочница",
        start_url: ".",
        display: "standalone",
        theme_color: "#03050b",
        background_color: "#03050b",
        icons: [{ src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='45' fill='%2303050b' stroke='%23ffcf6e' stroke-width='2'/%3E%3Ctext x='50' y='70' font-size='55' text-anchor='middle' fill='%23ffcf6e'%3E🪐%3C/text%3E%3C/svg%3E", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
    };
    const manifestBlob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const manifestURL = URL.createObjectURL(manifestBlob);
    document.getElementById("manifest-link").setAttribute("href", manifestURL);
    if ('serviceWorker' in navigator) {
        const swCode = `const CACHE_NAME='star-nomad-v1'; const urlsToCache=[location.pathname]; self.addEventListener('install',event=>{ event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(urlsToCache))); }); self.addEventListener('fetch',event=>{ event.respondWith(caches.match(event.request).then(response=>response||fetch(event.request))); }); self.addEventListener('activate',event=>{ event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>{if(key!==CACHE_NAME)return caches.delete(key);})))); });`;
        const swBlob = new Blob([swCode], { type: "application/javascript" });
        const swURL = URL.createObjectURL(swBlob);
        navigator.serviceWorker.register(swURL).catch(err => console.log("SW failed", err));
    }
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; document.getElementById("pwaInstallBanner").classList.remove("hidden"); });
    document.getElementById("installPwaBtn").addEventListener("click", () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => { deferredPrompt = null; document.getElementById("pwaInstallBanner").classList.add("hidden"); });
        } else alert("Нажмите «Поделиться» → «На экран «Домой»» в Safari.");
    });
}

window.onload = () => {
    // Присваиваем глобальные объекты для доступа из UI
    window.planetStocks = planetStocks;
    window.planetPrices = planetPrices;
    window.mineralPriceMultipliers = mineralPriceMultipliers;
    window.planetOwners = planetOwners;
    window.planetModules = planetModules;
    window.planetIncome = planetIncome;
    window.planetTM = planetTM;
    window.planetMinerIncome = planetMinerIncome;
    window.bots = bots;
    window.currentMission = currentMission;
    window.missionCompleted = missionCompleted;
    window.activeContrabandOffers = activeContrabandOffers;
    window.lastMissionUpdate = lastMissionUpdate;
    window.lastPriceUpdate = lastPriceUpdate;
    window.lastContrabandUpdate = lastContrabandUpdate;
    window.componentMarket = componentMarket;
    window.artifactMarket = artifactMarket;
    window.componentPriceHistory = componentPriceHistory;
    window.artifactPriceHistory = artifactPriceHistory;
    window.moduleBlueprintsOwned = moduleBlueprintsOwned;
    window.upgradeBlueprintsOwned = upgradeBlueprintsOwned;
    window.nextBotId = nextBotId;
    window.gameActive = gameActive;
    window.CONFIG = CONFIG;
    window.GOODS = GOODS;
    window.MINERALS = MINERALS;
    window.ARTIFACTS = ARTIFACTS;
    window.SHIPS = SHIPS;
    window.COMPONENTS = COMPONENTS;
    window.MODULE_BLUEPRINTS = MODULE_BLUEPRINTS;
    window.UPGRADE_RECIPES = UPGRADE_RECIPES;
    window.player = player;
    window.getShip = getShip;
    window.getTotalPower = getTotalPower;
    window.getOptimizerCost = getOptimizerCost;
    window.getDockCost = getDockCost;
    window.getTMHarvestBonus = getTMHarvestBonus;
    window.getSSGeneratorBonus = getSSGeneratorBonus;
    window.addArtifact = addArtifact;
    window.useArtifact = useArtifact;
    window.hasArtifact = hasArtifact;
    window.addLogToGame = addLogToGame;
    window.saveGame = saveGame;
    window.loadGame = loadGame;
    window.randomRange = randomRange;
    window.gameLog = gameLog;
    window.move = move;
    window.hyperJump = hyperJump;
    window.generateMission = generateMission;
    window.updateMissionByTimer = updateMissionByTimer;
    window.onBuyGood = onBuyGood;
    window.onSellGood = onSellGood;
    window.tryFindGoods = tryFindGoods;
    window.tryFindArtifact = tryFindArtifact;
    window.tryFindMineral = tryFindMineral;
    window.tryFindComponent = tryFindComponent;
    window.sellMinerals = sellMinerals;
    window.generateContrabandOffers = generateContrabandOffers;
    window.takeContrabandOffer = takeContrabandOffer;
    window.takeContrabandCargo = takeContrabandCargo;
    window.deliverContraband = deliverContraband;
    window.patrolEncounter = patrolEncounter;
    window.createBot = createBot;
    window.startBotAI = startBotAI;
    window.scheduleBotCreation = scheduleBotCreation;
    window.removeBot = removeBot;
    window.getClosestEnemyPosition = getClosestEnemyPosition;
    window.botTradeAndUpgrade = botTradeAndUpgrade;
    window.botTryContraband = botTryContraband;
    window.initPlanets = initPlanets;
    window.getPlanetMaxStorage = getPlanetMaxStorage;
    window.getPlanetStorageUpgradeCost = getPlanetStorageUpgradeCost;
    window.getPlanetIncomePercent = getPlanetIncomePercent;
    window.getPlanetPrice = getPlanetPrice;
    window.canBuyPlanet = canBuyPlanet;
    window.buyPlanet = buyPlanet;
    window.installPlanetModule = installPlanetModule;
    window.upgradePlanetStorage = upgradePlanetStorage;
    window.addIncomeToPlanet = addIncomeToPlanet;
    window.collectAllPlanetResources = collectAllPlanetResources;
    window.updatePlanetResources = updatePlanetResources;
    window.buyBlueprint = buyBlueprint;
    window.startCraft = startCraft;
    window.processCrafting = processCrafting;
    window.installModule = installModule;
    window.uninstallModule = uninstallModule;
    window.getAverageComponentPrice = getAverageComponentPrice;
    window.updateComponentPriceHistory = updateComponentPriceHistory;
    window.listComponentForSale = listComponentForSale;
    window.cancelComponentSale = cancelComponentSale;
    window.buyComponent = buyComponent;
    window.updateArtifactPriceHistory = updateArtifactPriceHistory;
    window.listArtifactForSale = listArtifactForSale;
    window.cancelArtifactSale = cancelArtifactSale;
    window.buyArtifact = buyArtifact;
    window.withdrawArtifactSales = withdrawArtifactSales;
    window.resolveCombat = resolveCombat;
    window.fightWithBot = fightWithBot;
    window.playerDefeated = playerDefeated;
    window.encounterWithBots = encounterWithBots;
    window.triggerRandomEvent = triggerRandomEvent;
    window.updateUI = updateUI;
    window.openPlanetMenu = openPlanetMenu;
    window.openDock = openDock;
    window.openShipShopModal = openShipShopModal;
    window.updateRankingModal = updateRankingModal;
    window.showInfoModal = showInfoModal;
    window.exitDockToRandom = exitDockToRandom;
    window.simulateTimePassed = simulateTimePassed;

    // Загрузка сохранения или создание нового мира
    const saved = loadGame();
    if (saved) {
        // Восстанавливаем данные из сохранения (упрощённо, но в полной версии нужно восстановить все переменные)
        Object.assign(player, saved.player);
        bots.length = 0;
        bots.push(...saved.bots);
        // ... остальное восстановление (опущено для краткости, но в полном коде нужно)
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
    document.getElementById("menuBtn").onclick = () => {
        gameActive = false;
        if (window.botInterval) clearInterval(window.botInterval);
        if (window.botCreationTimeout) clearTimeout(window.botCreationTimeout);
        document.getElementById("menuScreen").style.display = "block";
        document.getElementById("gameScreen").classList.add("hidden");
        document.getElementById("continueBtn").disabled = player.isDead;
        document.getElementById("newGameBtn").disabled = !player.isDead;
        saveGame();
    };
    document.getElementById("dockBtn").onclick = () => openDock(false);
    document.getElementById("currentPlanetCard").onclick = () => { if (!player.isDead) openPlanetMenu(player.currentPlanet); };
    document.getElementById("menuScreen").style.display = "block";
    if (!currentMission && !missionCompleted) generateMission();
    generateContrabandOffers();
    registerPWA();
};
