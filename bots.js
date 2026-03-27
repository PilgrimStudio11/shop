// bots.js – управление ботами: создание, движение, торговля, крафт, рынки

import { CONFIG, GOODS, MINERALS, COMPONENTS, SHIPS, MODULE_BLUEPRINTS, UPGRADE_RECIPES } from './config.js';
import { addLogToGame, randomRange, saveGame } from './utils.js';
import { getTotalPower as getPlayerTotalPower } from './player.js';
import { resolveCombat } from './combat.js';
import { tryFindGoods, tryFindMineral, tryFindArtifact } from './trade.js';
import { buyPlanet, upgradePlanetStorage, installPlanetModule, collectAllPlanetResources, getPlanetPrice, canBuyPlanet, getPlanetStorageUpgradeCost, planetOwners, planetModules, planetIncome, planetTM, planetMinerIncome } from './planets.js';
import { listComponentForSale, buyComponent, cancelComponentSale, updateComponentPriceHistory, getAverageComponentPrice, listArtifactForSale, buyArtifact, cancelArtifactSale, updateArtifactPriceHistory, withdrawArtifactSales } from './market.js';
import { startCraft, installModule, uninstallModule, processCrafting } from './crafting.js';

export let bots = [];
export let nextBotId = 100;

export function createBot(level, wins) {
    const shipLevel = Math.min(level, 21);
    const bot = {
        id: nextBotId++,
        name: `Bot-${nextBotId - 1}`,
        credits: 5000,
        cargo: {},
        components: { comp1:0, comp2:0, comp3:0, comp4:0, comp5:0 },
        wins: wins,
        level: level,
        shipLevel: shipLevel,
        currentPlanet: randomRange(1, CONFIG.PLANET_COUNT),
        hull: 100,
        darkMatter: 0,
        strangePower: CONFIG.START_STRANGE_POWER,
        fuel: SHIPS[shipLevel-1].fuelCap,
        nextMoveTime: Date.now() + Math.random() * CONFIG.BOT_MOVE_DELAY,
        hasTMHarvester: false,
        hasSSGenerator: false,
        hasOptimizer: false,
        tmHarvesterLevel: 0,
        ssGeneratorLevel: 0,
        optimizerLevel: 0,
        contrabandRating: 50,
        contrabandMission: null,
        inDock: false,
        dockEnterTime: 0,
        artifacts: [],
        ignoreLevelOnce: false,
        stealthRemaining: 0,
        luckBoostRemaining: 0,
        battleBuffRemaining: 0,
        goal: "explore",
        targetPlanet: null,
        targetBot: null,
        missionBought: 0,
        lastDecisionTime: Date.now(),
        artifactSalesBalance: 0,
        ownedModules: [],
        craftingQueue: []
    };
    // Начальный груз
    for (let g of GOODS) if (Math.random() < 0.3) bot.cargo[g.id] = randomRange(1, 10);
    for (let comp of COMPONENTS) if (Math.random() < 0.2) bot.components[comp.id] = randomRange(1, 3);
    bots.push(bot);
    addLogToGame(`✨ Новый бот появился: ${bot.name}`, "normal", true);
    return bot;
}

export function removeBot(botId) {
    const idx = bots.findIndex(b => b.id === botId);
    if (idx === -1) return;
    const bot = bots[idx];
    // Освобождаем планеты
    for (let i = 0; i < CONFIG.PLANET_COUNT; i++) {
        if (planetOwners[i] === botId) {
            planetOwners[i] = null;
            planetModules[i] = { tmLaboratory: false, storageLevel: 0, planetMiner: false, teleport: false };
            planetIncome[i] = 0;
            planetTM[i] = 0;
            planetMinerIncome[i] = 0;
        }
    }
    // Удаляем предложения на рынках
    const market = window.componentMarket || [];
    for (let i = market.length-1; i>=0; i--) {
        if (market[i].sellerId === botId) market.splice(i,1);
    }
    const artMarket = window.artifactMarket || [];
    for (let i = artMarket.length-1; i>=0; i--) {
        if (artMarket[i].sellerId === botId) artMarket.splice(i,1);
    }
    bots.splice(idx, 1);
}

function getShip(bot) {
    return SHIPS[bot.shipLevel - 1];
}

function getTotalPower(bot) {
    const ship = getShip(bot);
    const rocketBonus = (bot.cargo.rockets || 0) * CONFIG.ROCKET_POWER;
    const tmBonus = (bot.darkMatter || 0) * CONFIG.TM_POWER;
    let effective = ship.power + rocketBonus + tmBonus;
    const hullPercent = Math.max(0, bot.hull) / 100;
    let power = effective * hullPercent;
    if (bot.battleBuffRemaining > 0) power *= 2;
    return power;
}

function getClosestEnemyPosition(bot) {
    const playerPos = window.player?.currentPlanet;
    if (playerPos) {
        const diff = playerPos - bot.currentPlanet;
        if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    const otherBots = bots.filter(b => b.id !== bot.id && Math.abs(b.level - bot.level) <= 1);
    if (otherBots.length === 0) return null;
    let closest = null;
    let minDist = Infinity;
    for (let b of otherBots) {
        const dist = Math.abs(b.currentPlanet - bot.currentPlanet);
        if (dist < minDist) {
            minDist = dist;
            closest = b;
        }
    }
    if (closest) {
        const diff = closest.currentPlanet - bot.currentPlanet;
        return diff > 0 ? 1 : -1;
    }
    return null;
}

function botTradeAndUpgrade(bot) {
    const planetIdx = bot.currentPlanet - 1;
    const prices = window.planetPrices?.[planetIdx];
    if (!prices) return;
    const ship = getShip(bot);
    const currentCargo = Object.values(bot.cargo).reduce((a,b)=>a+b,0);
    const free = ship.cargo - currentCargo;
    // Продажа товаров, если цена высокая
    for (let g of GOODS) {
        const qty = bot.cargo[g.id] || 0;
        if (qty > 0 && prices[g.id].sell > g.baseSell * 1.2) {
            const toSell = Math.min(qty, Math.floor(free / g.cargoSpace) + qty);
            if (toSell > 0) {
                const revenue = toSell * prices[g.id].sell;
                bot.credits += revenue;
                bot.cargo[g.id] -= toSell;
                if (bot.cargo[g.id] === 0) delete bot.cargo[g.id];
                addLogToGame(`${bot.name} продал ${toSell} ${g.name} на планете #${bot.currentPlanet} за ${revenue}💰`, "success", false);
            }
        }
    }
    // Покупка товаров, если цена низкая и есть место
    for (let g of GOODS) {
        if (free >= g.cargoSpace && prices[g.id].buy < g.baseBuy * 0.8 && bot.credits >= prices[g.id].buy) {
            const maxBuy = Math.min(Math.floor(free / g.cargoSpace), Math.floor(bot.credits / prices[g.id].buy));
            if (maxBuy > 0) {
                const cost = maxBuy * prices[g.id].buy;
                bot.credits -= cost;
                bot.cargo[g.id] = (bot.cargo[g.id] || 0) + maxBuy;
                addLogToGame(`${bot.name} купил ${maxBuy} ${g.name} на планете #${bot.currentPlanet} за ${cost}💰`, "success", false);
            }
        }
    }
}

function botTryContraband(bot) {
    // Бот может взять контрабандное задание, если нет активного
    if (!bot.contrabandMission && window.activeContrabandOffers) {
        const available = window.activeContrabandOffers.filter(o => !o.completed);
        if (available.length > 0 && Math.random() < 0.3) {
            const offer = available[0];
            bot.contrabandMission = {
                fromPlanet: offer.fromPlanet,
                toPlanet: offer.toPlanet,
                rewardBase: offer.rewardBase,
                rewardType: offer.rewardType,
                level: offer.level,
                cargoTaken: false
            };
            offer.completed = true;
            addLogToGame(`${bot.name} взял контрабандное задание уровня ${offer.level}.`, "contraband", false);
        }
    }
    if (bot.contrabandMission && !bot.contrabandMission.cargoTaken && bot.currentPlanet === bot.contrabandMission.fromPlanet) {
        // Забрать груз
        const ship = getShip(bot);
        const currentCargo = Object.values(bot.cargo).reduce((a,b)=>a+b,0);
        if (currentCargo + 1 <= ship.cargo) {
            bot.cargo["contraband"] = (bot.cargo["contraband"] || 0) + 1;
            bot.contrabandMission.cargoTaken = true;
            addLogToGame(`${bot.name} забрал контрабанду на планете #${bot.currentPlanet}.`, "contraband", false);
        }
    }
    if (bot.contrabandMission && bot.contrabandMission.cargoTaken && bot.currentPlanet === bot.contrabandMission.toPlanet) {
        const success = Math.random() < (1 - CONFIG.CONTRABAND_ENCOUNTER_CHANCE);
        if (success) {
            const reward = bot.contrabandMission.rewardBase * (1 + (bot.contrabandRating - 50) / 100);
            if (bot.contrabandMission.rewardType === "credits") bot.credits += Math.floor(reward);
            else bot.darkMatter += Math.floor(reward);
            bot.contrabandRating = Math.min(100, bot.contrabandRating + bot.contrabandMission.level);
            addLogToGame(`${bot.name} успешно доставил контрабанду и получил ${Math.floor(reward)}${bot.contrabandMission.rewardType === "credits" ? "💰" : "🌑 ТМ"}.`, "success", false);
        } else {
            bot.credits = Math.max(0, bot.credits - 1000);
            bot.contrabandRating = Math.max(0, bot.contrabandRating - bot.contrabandMission.level);
            addLogToGame(`${bot.name} провалил контрабанду и потерял 1000💰.`, "warning", false);
        }
        if (bot.cargo["contraband"]) {
            bot.cargo["contraband"]--;
            if (bot.cargo["contraband"] === 0) delete bot.cargo["contraband"];
        }
        bot.contrabandMission = null;
    }
}

function botAI() {
    if (!window.gameActive) return;
    const now = Date.now();
    for (let bot of bots) {
        if (bot.inDock) {
            // Проверка выхода из дока
            if (now - bot.dockEnterTime >= CONFIG.DOCK_STAY_MS) {
                bot.inDock = false;
                bot.currentPlanet = randomRange(1, CONFIG.PLANET_COUNT);
                addLogToGame(`${bot.name} покинул док.`, "normal", false);
            } else {
                // В доке бот может собрать доход, продать минералы, заняться рынком
                collectAllPlanetResources(false, bot);
                // Продажа минералов
                for (let m of MINERALS) {
                    const qty = bot.cargo[m.id] || 0;
                    if (qty > 0) {
                        const price = Math.floor(m.basePrice * (window.mineralPriceMultipliers?.[MINERALS.indexOf(m)] || 1) * (1 + (bot.contrabandRating-50)/100));
                        const total = qty * price;
                        bot.credits += total;
                        delete bot.cargo[m.id];
                        addLogToGame(`${bot.name} продал ${qty} ${m.name} за ${total}💰 в доке.`, "success", false);
                    }
                }
                // Артефакты и компоненты: продажа дубликатов
                for (let art of bot.artifacts) {
                    if (art.count > 1 && Math.random() < 0.2) {
                        const artDef = window.ARTIFACTS[art.id];
                        const avgPrice = window.artifactPriceHistory?.[art.id]?.average || artDef.basePrice;
                        const price = Math.floor(avgPrice * (0.8 + Math.random() * 0.4));
                        listArtifactForSale(art.id, art.usesLeft, price, bot.id, false);
                        if (art.count > 1) art.count--;
                        else bot.artifacts = bot.artifacts.filter(a => a !== art);
                    }
                }
                for (let compId in bot.components) {
                    const qty = bot.components[compId];
                    if (qty > 1 && Math.random() < 0.2) {
                        const avgPrice = getAverageComponentPrice(compId);
                        const price = Math.floor(avgPrice * (0.8 + Math.random() * 0.4));
                        listComponentForSale(compId, price, bot.id, false);
                        bot.components[compId]--;
                    }
                }
                // Крафт
                processCrafting(bot);
                if (bot.craftingQueue.length === 0 && Math.random() < 0.05) {
                    // Попытка скрафтить модуль или улучшение
                    const possible = [];
                    for (let [type, bp] of Object.entries(MODULE_BLUEPRINTS)) {
                        if (window.moduleBlueprintsOwned?.includes(type) && bot.components.comp1 >= 5 && bot.components.comp2 >= 5 && bot.components.comp3 >= 5 && bot.components.comp4 >= 5 && bot.components.comp5 >= 5) {
                            possible.push({ type, isUpgrade: false });
                        }
                    }
                    for (let [type, up] of Object.entries(UPGRADE_RECIPES)) {
                        if (window.upgradeBlueprintsOwned?.includes(type)) {
                            let has = true;
                            for (let [compId, need] of Object.entries(up.components)) {
                                if ((bot.components[compId] || 0) < need) { has = false; break; }
                            }
                            if (has) possible.push({ type, isUpgrade: true });
                        }
                    }
                    if (possible.length > 0) {
                        const craft = possible[Math.floor(Math.random() * possible.length)];
                        startCraft(bot, craft.type, craft.isUpgrade);
                    }
                }
                // Покупка чертежей
                if (Math.random() < 0.05 && bot.darkMatter >= 500 && !window.moduleBlueprintsOwned?.includes("harvester")) {
                    bot.darkMatter -= 500;
                    window.moduleBlueprintsOwned.push("harvester");
                    addLogToGame(`${bot.name} купил чертёж Добытчика ТМ.`, "craft", false);
                }
                if (Math.random() < 0.05 && bot.strangePower >= 100 && !window.upgradeBlueprintsOwned?.includes("harvester")) {
                    bot.strangePower -= 100;
                    window.upgradeBlueprintsOwned.push("harvester");
                    addLogToGame(`${bot.name} купил чертёж улучшения Добытчика ТМ.`, "craft", false);
                }
                continue;
            }
        }

        if (now < bot.nextMoveTime) continue;
        bot.nextMoveTime = now + CONFIG.BOT_MOVE_DELAY;

        // Движение
        const dir = getClosestEnemyPosition(bot);
        if (dir !== null) {
            let newPlanet = bot.currentPlanet + dir;
            if (newPlanet < 1) newPlanet = CONFIG.PLANET_COUNT;
            if (newPlanet > CONFIG.PLANET_COUNT) newPlanet = 1;
            bot.currentPlanet = newPlanet;
        } else {
            // Случайное блуждание
            const r = Math.random() < 0.5 ? -1 : 1;
            let newPlanet = bot.currentPlanet + r;
            if (newPlanet < 1) newPlanet = CONFIG.PLANET_COUNT;
            if (newPlanet > CONFIG.PLANET_COUNT) newPlanet = 1;
            bot.currentPlanet = newPlanet;
        }

        // Расход топлива
        if (bot.fuel > 0) bot.fuel--;
        // Генерация СС и ТМ
        if (bot.hasSSGenerator) bot.strangePower += 2;
        if (Math.random() < CONFIG.DARK_MATTER_CHANCE) bot.darkMatter += randomRange(CONFIG.DARK_MATTER_AMOUNT[0], CONFIG.DARK_MATTER_AMOUNT[1]);
        if (bot.hasTMHarvester) bot.darkMatter++;

        // Находки
        tryFindGoods(bot, false);
        tryFindMineral(bot, false);
        tryFindArtifact(bot, false);

        // Торговля на планете
        botTradeAndUpgrade(bot);
        botTryContraband(bot);

        // Покупка планеты
        const planetIdx = bot.currentPlanet - 1;
        if (planetOwners[planetIdx] !== bot.id && canBuyPlanet(planetIdx, bot.level, false) && bot.credits >= getPlanetPrice(planetIdx)) {
            buyPlanet(planetIdx, bot, false);
        }
        // Установка модулей на планеты
        for (let i = 0; i < CONFIG.PLANET_COUNT; i++) {
            if (planetOwners[i] === bot.id) {
                if (!planetModules[i].tmLaboratory && Math.random() < 0.1 && bot.credits >= CONFIG.MODULE_PLANET_TM_LAB_COST) {
                    installPlanetModule(i, "tmLaboratory", false, bot);
                }
                if (!planetModules[i].planetMiner && Math.random() < 0.1 && bot.credits >= CONFIG.MODULE_PLANET_MINER_COST) {
                    installPlanetModule(i, "planetMiner", false, bot);
                }
                if (!planetModules[i].teleport && Math.random() < 0.1 && bot.credits >= CONFIG.MODULE_PLANET_TELEPORT_COST) {
                    installPlanetModule(i, "teleport", false, bot);
                }
                const upgradeCost = getPlanetStorageUpgradeCost(i);
                if (upgradeCost && planetModules[i].storageLevel < 5 && Math.random() < 0.05 && bot.credits >= upgradeCost) {
                    upgradePlanetStorage(i, false, bot);
                }
            }
        }
        // Сбор доходов с планет
        if (Math.random() < 0.5) collectAllPlanetResources(false, bot);

        // Уменьшение эффектов
        if (bot.stealthRemaining > 0) bot.stealthRemaining--;
        if (bot.luckBoostRemaining > 0) bot.luckBoostRemaining--;
        if (bot.battleBuffRemaining > 0) bot.battleBuffRemaining--;

        // Повышение уровня
        const newLevel = Math.floor(bot.wins / 7) + 1;
        if (newLevel > bot.level) bot.level = newLevel;

        // Проверка на вход в док
        const ship = getShip(bot);
        if (!bot.inDock && (bot.hull < 30 || bot.fuel < ship.fuelCap * 0.2 || Object.values(bot.cargo).some(v=>v>0 && MINERALS.some(m=>m.id===v)) || bot.artifactSalesBalance > 0)) {
            const botsInDock = bots.filter(b => b.inDock).length;
            if (botsInDock < CONFIG.MAX_DOCK_BOTS) {
                bot.inDock = true;
                bot.dockEnterTime = Date.now();
                addLogToGame(`${bot.name} зашёл в док.`, "normal", false);
            }
        }
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

export function startBotAI() {
    if (window.botInterval) clearInterval(window.botInterval);
    window.botInterval = setInterval(botAI, 500);
}

export function scheduleBotCreation() {
    if (window.botCreationTimeout) clearTimeout(window.botCreationTimeout);
    window.botCreationTimeout = setTimeout(() => {
        const level1Count = bots.filter(b => b.level === 1).length;
        if (bots.length < CONFIG.MAX_BOTS && level1Count < CONFIG.MAX_LEVEL1_BOTS) {
            createBot(1, 0);
        }
        scheduleBotCreation();
    }, CONFIG.BOT_CREATE_INTERVAL);
}
