// market.js – чёрный рынок компонентов и рынок артефактов

import { CONFIG, COMPONENTS, ARTIFACTS } from './config.js';
import { addArtifact, useArtifact, hasArtifact } from './player.js';
import { addLogToGame, saveGame } from './utils.js';

export let artifactMarket = [];
export let componentMarket = [];
export let artifactPriceHistory = {};
export let componentPriceHistory = {};

// Компоненты
export function getAverageComponentPrice(compId) {
    const hist = componentPriceHistory[compId];
    if (!hist || hist.count === 0) return COMPONENTS.find(c => c.id === compId).basePrice;
    return Math.floor(hist.totalSum / hist.count);
}

export function updateComponentPriceHistory(compId, price) {
    if (!componentPriceHistory[compId]) componentPriceHistory[compId] = { totalSum: 0, count: 0 };
    const hist = componentPriceHistory[compId];
    hist.totalSum += price;
    hist.count++;
    saveGame();
}

export function listComponentForSale(compId, price, sellerId, sellerIsPlayer) {
    componentMarket.push({ componentId: compId, price, sellerId, sellerIsPlayer, timestamp: Date.now() });
    addLogToGame(`${sellerIsPlayer ? "Вы" : "Бот"} выставил ${COMPONENTS.find(c=>c.id===compId).name} на продажу за ${price}💰.`, "success", sellerIsPlayer);
    saveGame();
}

export function cancelComponentSale(index, isPlayerCancelling) {
    const offer = componentMarket[index];
    if (!offer) return false;
    if (!isPlayerCancelling && offer.sellerIsPlayer) return false;
    if (isPlayerCancelling && !offer.sellerIsPlayer) return false;
    componentMarket.splice(index, 1);
    addLogToGame(`${isPlayerCancelling ? "Вы" : "Бот"} снял компонент с продажи.`, "success", isPlayerCancelling);
    saveGame();
    return true;
}

export function buyComponent(index, buyer, isPlayer, buyerName) {
    const offer = componentMarket[index];
    if (!offer) return false;
    const price = offer.price;
    const commission = Math.floor(price * CONFIG.MARKET_COMMISSION);
    const sellerGets = price - commission;
    if (buyer.credits < price) return false;
    buyer.credits -= price;
    buyer.components[offer.componentId] = (buyer.components[offer.componentId] || 0) + 1;
    updateComponentPriceHistory(offer.componentId, price);
    if (offer.sellerIsPlayer) {
        window.player.artifactSalesBalance += sellerGets;
        addLogToGame(`${buyerName} купил ${COMPONENTS.find(c=>c.id===offer.componentId).name} у вас за ${price}💰 (комиссия ${commission}💰). Средства на счёте продаж: ${window.player.artifactSalesBalance}💰.`, "success", true);
    } else {
        const sellerBot = window.bots?.find(b => b.id === offer.sellerId);
        if (sellerBot) sellerBot.artifactSalesBalance += sellerGets;
        addLogToGame(`${buyerName} купил ${COMPONENTS.find(c=>c.id===offer.componentId).name} у ${sellerBot?.name || "бота"} за ${price}💰.`, "success", isPlayer);
    }
    componentMarket.splice(index, 1);
    saveGame();
    return true;
}

// Артефакты
export function updateArtifactPriceHistory(artifactId, price) {
    if (!artifactPriceHistory[artifactId]) artifactPriceHistory[artifactId] = { totalSum: 0, count: 0 };
    const hist = artifactPriceHistory[artifactId];
    hist.totalSum += price;
    hist.count++;
    saveGame();
}

export function listArtifactForSale(artifactId, usesLeft, price, sellerId, sellerIsPlayer) {
    artifactMarket.push({ artifactId, usesLeft, price, sellerId, sellerIsPlayer, timestamp: Date.now() });
    addLogToGame(`${sellerIsPlayer ? "Вы" : "Бот"} выставил ${ARTIFACTS[artifactId].name} на продажу за ${price}💰.`, "success", sellerIsPlayer);
    saveGame();
}

export function cancelArtifactSale(index, isPlayerCancelling) {
    const offer = artifactMarket[index];
    if (!offer) return false;
    if (!isPlayerCancelling && offer.sellerIsPlayer) return false;
    if (isPlayerCancelling && !offer.sellerIsPlayer) return false;
    artifactMarket.splice(index, 1);
    addLogToGame(`${isPlayerCancelling ? "Вы" : "Бот"} снял артефакт с продажи.`, "success", isPlayerCancelling);
    saveGame();
    return true;
}

export function buyArtifact(index, buyer, isPlayer, buyerName) {
    const offer = artifactMarket[index];
    if (!offer) return false;
    const price = offer.price;
    const commission = Math.floor(price * CONFIG.MARKET_COMMISSION);
    const sellerGets = price - commission;
    if (buyer.credits < price) return false;
    buyer.credits -= price;
    addArtifact(buyer, offer.artifactId, offer.usesLeft);
    updateArtifactPriceHistory(offer.artifactId, price);
    if (offer.sellerIsPlayer) {
        window.player.artifactSalesBalance += sellerGets;
        addLogToGame(`${buyerName} купил ${ARTIFACTS[offer.artifactId].name} у вас за ${price}💰 (комиссия ${commission}💰). Средства на счёте продаж: ${window.player.artifactSalesBalance}💰.`, "success", true);
    } else {
        const sellerBot = window.bots?.find(b => b.id === offer.sellerId);
        if (sellerBot) sellerBot.artifactSalesBalance += sellerGets;
        addLogToGame(`${buyerName} купил ${ARTIFACTS[offer.artifactId].name} у ${sellerBot?.name || "бота"} за ${price}💰.`, "success", isPlayer);
    }
    artifactMarket.splice(index, 1);
    saveGame();
    return true;
}

export function withdrawArtifactSales(entity, isPlayer) {
    const balance = entity.artifactSalesBalance || 0;
    if (balance <= 0) return false;
    entity.credits += balance;
    entity.artifactSalesBalance = 0;
    addLogToGame(`${isPlayer ? "Вы" : entity.name} забрали ${balance}💰 со счёта продаж.`, "success", isPlayer);
    saveGame();
    return true;
}
