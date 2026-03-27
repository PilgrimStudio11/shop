// events.js – случайные события при перелёте

import { CONFIG, GOODS } from './config.js';
import { player } from './player.js';
import { addLogToGame, randomRange, saveGame } from './utils.js';
import { fightWithBot } from './combat.js';
import { createBot } from './bots.js'; // будет определён позже

export function triggerRandomEvent() {
    if (Math.random() > CONFIG.EVENT_CHANCE) return;
    const r = Math.random();
    // Событие: дрейфующий корабль
    if (r < 0.15 && Math.random() < CONFIG.EVENT_HELP_SHIP_CHANCE / 0.03) {
        const choice = confirm("Обнаружен дрейфующий корабль. Помочь (получить ресурсы) или ограбить (бой)?\nНажмите ОК — помочь, Отмена — ограбить.");
        if (choice) {
            if (Math.random() < 0.5) {
                const amount = randomRange(200, 500);
                player.credits += amount;
                addLogToGame(`🤝 Вы помогли экипажу и получили ${amount}💰 в благодарность.`, "event", true);
            } else {
                const amount = randomRange(5, 20);
                player.darkMatter += amount;
                addLogToGame(`🤝 Вы помогли экипажу и получили ${amount}🌑 ТМ.`, "event", true);
            }
        } else {
            addLogToGame(`⚔️ Вы решили ограбить дрейфующий корабль, но экипаж оказал сопротивление!`, "event", true);
            const tempBot = createBot(1, 0);
            tempBot.name = "Пират-изгой";
            tempBot.credits = randomRange(500, 1000);
            tempBot.hull = 80;
            tempBot.cargo = {};
            for (let g of GOODS) tempBot.cargo[g.id] = randomRange(0, 5);
            fightWithBot(tempBot);
        }
    }
    // Остальные события...
    else if (r < 0.35) {
        const dmg = randomRange(5, 10);
        player.hull = Math.max(1, player.hull - dmg);
        addLogToGame(`💥 Повреждение обшивки! Прочность снижена на ${dmg}%.`, "event", true);
    }
    else if (r < 0.55) {
        const newPlanet = randomRange(1, CONFIG.PLANET_COUNT);
        player.currentPlanet = newPlanet;
        addLogToGame(`🌀 Аномалия пространства! Вы неконтролируемо переместились на планету #${newPlanet}.`, "event", true);
    }
    else if (r < 0.7) {
        const goodsList = GOODS.filter(g => player.cargo[g.id] > 0);
        if (goodsList.length > 0) {
            const g = goodsList[Math.floor(Math.random() * goodsList.length)];
            const lost = Math.min(player.cargo[g.id], randomRange(1, 3));
            player.cargo[g.id] -= lost;
            addLogToGame(`💨 Космический мусор! Потеряно ${lost} ${g.name}.`, "event", true);
        } else {
            const lostCredits = randomRange(10, 100);
            player.credits = Math.max(0, player.credits - lostCredits);
            addLogToGame(`💨 Космический мусор! Потеряно ${lostCredits}💰.`, "event", true);
        }
    }
    else if (r < 0.85) {
        const dmg = randomRange(5, 10);
        player.hull = Math.max(1, player.hull - dmg);
        const find = randomRange(1, 3);
        const good = GOODS.find(g => g.id === "rockets") || GOODS[0];
        player.cargo[good.id] = (player.cargo[good.id] || 0) + find;
        addLogToGame(`🌑 Поле астероидов! Прочность -${dmg}%, найдено ${find} ${good.name}.`, "event", true);
    }
    else {
        const dmg = randomRange(1, 3);
        player.hull = Math.max(1, player.hull - dmg);
        const goodsList = GOODS.filter(g => player.cargo[g.id] > 0);
        if (goodsList.length > 0) {
            const g = goodsList[Math.floor(Math.random() * goodsList.length)];
            const lost = Math.min(player.cargo[g.id], randomRange(1, 2));
            player.cargo[g.id] -= lost;
            addLogToGame(`☄️ Метеоритный дождь! Прочность -${dmg}%, потеряно ${lost} ${g.name}.`, "event", true);
        } else {
            addLogToGame(`☄️ Метеоритный дождь! Прочность -${dmg}%.`, "event", true);
        }
    }
    saveGame();
}
