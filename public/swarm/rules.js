// Extracted from "히드라땅따먹기한글판3.0.scm" (SHA256 AF1C1FF1…52E8420).
// Provenance, trigger indices and web-engine differences: research/original-rules.md.
export const RULES=Object.freeze({
 edition:'한글판 3.0',startMinerals:1000,claimCost:250,upgradeCost:50,upgradeMax:255,
 upgradeSeconds:.042,freeResearchSeconds:15*.042,rescueMinerals:250,rescueSeconds:4,
 hydraHp:40,hydraDamage:5,hydraDamageBonus:1,baseHp:9999,baseArmor:50,baseDamage:200,
 dispenserHp:9999,dispenserArmor:250,baseReward:150,
 triggerSeconds:31*.042,sectorUnitLimit:80,sharedUnitLimit:1700,
 hydraCooldown:15*.042,baseCooldown:32*.042,
 // Original 384-pixel sector becomes 200 world units. Research uses original frame times.
 hydraBaseRange:128*200/384,hydraBaseSpeed:3.66/.042*200/384,
 dispenserBaseSpeed:(213/256)/.042*200/384,
 hydraRange:160*200/384,baseRange:224*200/384,
 hydraSpeed:3.66*1.5/.042*200/384,dispenserSpeed:(853/256)/.042*200/384,
 regenPerSecond:4/256/.042,
});
// Mobile 1v1 tuning. Keep the original profile above independently verifiable.
// Benchmarked without a time-limit victory; see research/five-minute-balance.md.
export const MOBILE_RULES=Object.freeze({...RULES,
 edition:'5×5 성큰 전투',playerUnitLimit:200,baseHp:8000,baseArmor:16,baseDamage:200,killReward:3,
});
// TRIG 37–47: score conversion is deliberately NOT a flat +5 per kill.
// Large batches are paid +10 for each highest power-of-two chunk, leaving the remainder.
export function convertKillScore(score){
 if(score===100)return {score:0,minerals:5};
 for(let chunk=200;chunk<=102400;chunk*=2){if(score>=chunk&&(chunk===102400||score<chunk*2))return {score:score-chunk,minerals:10};}
 return {score,minerals:0};
}

