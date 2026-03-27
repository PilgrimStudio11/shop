// combat.js – бои, расчёт силы, автоактивация артефактов

import { CONFIG } from './config.js';
import { player, getTotalPower, updatePlayerLevel } from './player.js';
import { addLogToGame, saveGame } from './utils.js';
import { bots, removeBot } from './bots.js';

// Автоактивация артефактов перед боем
export function autoActivateArtifacts(entity, isPlayer) {
    if (isPlayer) {
        if (Math.abs(player.level - (entity === player ? 0 : entity.level)) > 1 && hasArtifact(player.artifacts, "amuletSupremacy")) {
            if (useArtifact(player.artifacts, "amuletSupremacy")) {
                player.ignoreLevelOnce = true;
                addLogToGame(`✨ Амулет превосходства автоматически активирован! Следующий бой без ограничения уровней.`, "artifact", true);
                return true;
            }
        }
        if (hasArtifact(player.artifacts, "tempMask")) {
            const playerPower = getTotalPower(player);
            const botPower = getTotalPower(entity);
            if (botPower > playerPower * (1 + CONFIG.BOT_ATTACK_THRESHOLD) && entity.hull > 50) {
                if (useArtifact(player.artifacts, "tempMask")) {
                    player.stealthRemaining = 10;
                    addLogToGame(`✨ Временная маскировка автоматически активирована! Боты не атакуют 10 ходов.`, "artifact", true);
                    return true;
                }
            }
        }
    } else {
        // Для ботов аналогично (используем entity.artifacts)
        if (Math.abs(player.level - entity.level) > 1 && hasArtifact(entity.artifacts, "amuletSupremacy")) {
            if (useArtifact(entity.artifacts, "amuletSupremacy")) {
                entity.ignoreLevelOnce = true;
                addLogToGame(`✨ ${entity.name} активировал Амулет превосходства! Следующий бой без ограничения уровней.`, "artifact", false);
                return true;
            }
        }
        if (hasArtifact(entity.artifacts, "tempMask")) {
            const playerPower = getTotalPower(player);
            const botPower = getTotalPower(entity);
            if (botPower > playerPower * (1 + CONFIG.BOT_ATTACK_THRESHOLD) && entity.hull > 50) {
                if (useArtifact(entity.artifacts, "tempMask")) {
                    entity.stealthRemaining = 10;
                    addLogToGame(`✨ ${entity.name} активировал Временную маскировку! Игрок не будет атакован 10 ходов.`, "artifact", false);
                    return true;
                }
            }
        }
    }
    return false;
}

export function resolveCombat(attacker, defender, isPlayerAttacker, eventFight = false) {
    let powerA = getTotalPower(attacker);
    let powerD = getTotalPower(defender);
    if (powerA < powerD) {
        addLogToGame(`Ошибка: атакующий (${attacker.name}) слабее защитника (${defender.name})!`, "warning", isPlayerAttacker);
        return false;
    }

    let needed = powerD;
    let remaining = needed;
    let usedRockets = 0, usedTM = 0, hullDamage = 0;

    // Расход ракет
    if (attacker.cargo.rockets && attacker.cargo.rockets > 0 && remaining > 0) {
        let maxRocketPower = attacker.cargo.rockets * CONFIG.ROCKET_POWER;
        if (maxRocketPower >= remaining) {
            usedRockets = Math.ceil(remaining / CONFIG.ROCKET_POWER);
            attacker.cargo.rockets -= usedRockets;
            remaining = 0;
        } else {
            usedRockets = attacker.cargo.rockets;
            remaining -= attacker.cargo.rockets * CONFIG.ROCKET_POWER;
            attacker.cargo.rockets = 0;
        }
    }
    // Расход ТМ
    if (remaining > 0 && attacker.darkMatter > 0) {
        let maxTMPower = attacker.darkMatter * CONFIG.TM_POWER;
        if (maxTMPower >= remaining) {
            usedTM = Math.ceil(remaining / CONFIG.TM_POWER);
            attacker.darkMatter -= usedTM;
            remaining = 0;
        } else {
            usedTM = attacker.darkMatter;
            remaining -= attacker.darkMatter * CONFIG.TM_POWER;
            attacker.darkMatter = 0;
        }
    }
    // Урон прочности
    if (remaining > 0) {
        let basePower = getShip(attacker.shipLevel).power;
        hullDamage = (remaining / basePower) * 100;
        attacker.hull -= hullDamage;
        if (attacker.hull < 0) attacker.hull = 0;
    }

    // Если атакующий уничтожен
    if (attacker.hull <= 0) {
        [attacker, defender] = [defender, attacker];
        // Передача средств со счёта продаж
        if (defender.artifactSalesBalance > 0) {
            attacker.credits += defender.artifactSalesBalance;
            addLogToGame(`${attacker.name} получил ${defender.artifactSalesBalance}💰 со счёта продаж побеждённого ${defender.name}.`, "success", isPlayerAttacker);
            defender.artifactSalesBalance = 0;
        }
        attacker.wins = (attacker.wins || 0) + 1;
        attacker.level = Math.floor(attacker.wins / 7) + 1;
        if (attacker === player) {
            addLogToGame(`Ваш корабль разрушен! Победил ${defender.name}. Все ресурсы потеряны.`, "combat", true);
            playerDefeated();
        } else {
            addLogToGame(`${attacker.name} погиб в бою с ${defender.name}.`, "combat", true);
            removeBot(attacker.id);
        }
        return true;
    }

    // Победа атакующего
    let stolenCredits = Math.floor(defender.credits);
    attacker.credits += stolenCredits;
    defender.credits = 0;

    let stolenGoods = [];
    for (let g of GOODS) {
        let qty = defender.cargo[g.id] || 0;
        if (qty > 0) {
            let stolen = Math.floor(qty * (0.1 + Math.random() * 0.2));
            if (stolen > 0) {
                let ship = getShip(attacker.shipLevel);
                let currentCargo = Object.values(attacker.cargo).reduce((a,b)=>a+b,0);
                let free = ship.cargo - currentCargo;
                let actual = Math.min(stolen, Math.floor(free / g.cargoSpace));
                if (actual > 0) {
                    attacker.cargo[g.id] = (attacker.cargo[g.id] || 0) + actual;
                    stolenGoods.push(`${g.name}: ${actual}`);
                }
                defender.cargo[g.id] -= stolen;
            }
        }
    }

    if (defender === player && attacker !== player && player.artifactSalesBalance > 0) {
        attacker.credits += player.artifactSalesBalance;
        addLogToGame(`${attacker.name} получил ${player.artifactSalesBalance}💰 со счёта продаж побеждённого игрока.`, "success", false);
        player.artifactSalesBalance = 0;
    }

    attacker.wins = (attacker.wins || 0) + 1;
    attacker.level = Math.floor(attacker.wins / 7) + 1;
    if (attacker === player) {
        updatePlayerLevel();
        addLogToGame(`Победа над ${defender.name}! Захвачено ${stolenCredits}💰 и ${stolenGoods.join(', ')}. Расход: ракеты ${usedRockets}, ТМ ${usedTM}, прочность -${Math.floor(hullDamage)}%`, "combat", true);
        if (eventFight && defender.name === "Пират-изгой") {
            let extra = randomRange(200, 300);
            player.credits += extra;
            addLogToGame(`Вы ограбили пиратов и нашли дополнительные ${extra}💰!`, "success", true);
        }
    } else {
        addLogToGame(`${attacker.name} (ур.${attacker.level}) уничтожил ${defender.name} на планете #${defender.currentPlanet}.`, "combat", true);
    }

    if (defender !== player) removeBot(defender.id);
    return true;
}

export function fightWithBot(bot, eventFight = false) {
    if (player.isDead) return;
    autoActivateArtifacts(bot, false);
    let canAttack = (Math.abs(player.level - bot.level) <= 1) || player.ignoreLevelOnce || bot.ignoreLevelOnce;
    if (!canAttack) {
        addLogToGame(`Вы не можете атаковать ${bot.name} (разница уровней больше 1) и нет активного артефакта`, "warning", true);
        return;
    }
    if (player.ignoreLevelOnce) player.ignoreLevelOnce = false;
    if (bot.ignoreLevelOnce) bot.ignoreLevelOnce = false;
    resolveCombat(player, bot, true, eventFight);
    if (player.battleBuffRemaining > 0) {
        player.battleBuffRemaining--;
        if (player.battleBuffRemaining === 0) addLogToGame(`Энергетический резонатор израсходован.`, "artifact", true);
    }
    if (bot.battleBuffRemaining > 0) {
        bot.battleBuffRemaining--;
        if (bot.battleBuffRemaining === 0) addLogToGame(`Энергетический резонатор ${bot.name} израсходован.`, "artifact", false);
    }
    if (player.hull <= 0) playerDefeated();
    saveGame();
    if (window.updateUIFunc) window.updateUIFunc();
}

export function playerDefeated() {
    addLogToGame(`💀 Ваш корабль разрушен! Все планеты потеряны.`, "combat", true);
    // Освобождение планет
    for (let i = 0; i < CONFIG.PLANET_COUNT; i++) {
        if (planetOwners[i] === "player") {
            planetOwners[i] = null;
            planetModules[i] = { tmLaboratory: false, storageLevel: 0, planetMiner: false, teleport: false };
            planetIncome[i] = 0; planetTM[i] = 0; planetMinerIncome[i] = 0;
            planetPrevOwnersCount[i] = 0;
        }
    }
    player.isDead = true;
    player.inDock = false;
    player.dockEnterTime = 0;
    player.artifacts = [];
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
    player.contrabandMission = null;
    saveGame();
    // Возврат в главное меню
    if (window.gameActive) {
        window.gameActive = false;
        if (window.botInterval) clearInterval(window.botInterval);
        if (window.botCreationTimeout) clearTimeout(window.botCreationTimeout);
        document.getElementById("menuScreen").style.display = "block";
        document.getElementById("gameScreen").classList.add("hidden");
        document.getElementById("continueBtn").disabled = true;
        document.getElementById("newGameBtn").disabled = false;
    }
}

export function encounterWithBots() {
    if (player.stealthRemaining > 0) return;
    const botsHere = bots.filter(b => b.currentPlanet === player.currentPlanet);
    if (botsHere.length === 0) return;
    const bot = botsHere[0];
    if (Date.now() < player.immunityUntil) {
        addLogToGame(`🛡️ Иммунитет активен, бот ${bot.name} не атакует.`, "warning", true);
        return;
    }
    autoActivateArtifacts(bot, true);
    let canFight = (Math.abs(player.level - bot.level) <= 1) || player.ignoreLevelOnce || bot.ignoreLevelOnce;
    if (!canFight) {
        addLogToGame(`Вы встретили ${bot.name} (ур.${bot.level}), но разница уровней слишком велика для боя и нет активного артефакта.`, "warning", true);
        return;
    }
    const modal = document.createElement("div"); modal.className = "modal";
    modal.innerHTML = `<div class="modal-content"><h3>Встреча с ${bot.name}</h3><p>Уровень ${bot.level}, сила ${getTotalPower(bot).toFixed(2)}</p><p>💰 Кредиты бота: ${Math.floor(bot.credits)}</p><p>Ваша сила: ${getTotalPower(player).toFixed(2)}</p>${player.ignoreLevelOnce ? '<p>✨ Амулет превосходства активен! Вы можете атаковать любого противника.</p>' : ''}${bot.ignoreLevelOnce ? '<p>✨ У бота активен Амулет превосходства!</p>' : ''}<div class="modal-buttons"><button id="attackBtn">⚔️ АТАКОВАТЬ</button><button id="retreatBtn">🏃 ОТСТУПИТЬ (${CONFIG.RETREAT_COST}💰)</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector("#attackBtn").onclick = () => { modal.remove(); fightWithBot(bot); };
    modal.querySelector("#retreatBtn").onclick = () => {
        modal.remove();
        if (player.credits >= CONFIG.RETREAT_COST) {
            player.credits -= CONFIG.RETREAT_COST;
            bot.credits += CONFIG.RETREAT_COST;
            addLogToGame(`Вы заплатили ${CONFIG.RETREAT_COST}💰 и мирно разошлись.`, "success", true);
        } else {
            addLogToGame(`Не хватает кредитов для откупа! Приходится сражаться.`, "warning", true);
            fightWithBot(bot);
        }
    };
}
