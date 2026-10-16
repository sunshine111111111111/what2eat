/* what2eat 算法层离线单测：nutrition.js / recommender.js / foods.js（纯函数，不依赖 wx）
 * 运行：node tests/test-algo.js（仓库根目录执行，无任何依赖）
 */
const nut = require('../utils/nutrition.js');
const rec = require('../utils/recommender.js');
const FOODS = require('../data/foods.js');

let pass = 0, fail = 0;
function T(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + '  -> ' + (detail || '')); }
}

// ---------- 基础代谢 / TDEE ----------
const male = { gender: 'male', age: 24, height: 175, weight: 70, activity: 'light', goal: 'keep',
  cuisine: [], taste: [], avoid: [], price: 'p2', noPunish: false };
// 10*70 + 6.25*175 - 5*24 + 5 = 1678.75 -> 1679
T('BMR 男(24/175/70) = 1679', nut.calcBMR(male) === 1679, 'got ' + nut.calcBMR(male));
// 1679 * 1.375 = 2308.625 -> 2309
T('TDEE light = 2309', nut.calcTDEE(male) === 2309, 'got ' + nut.calcTDEE(male));

const female = { gender: 'female', age: 22, height: 162, weight: 52, activity: 'moderate', goal: 'cut',
  cuisine: [], taste: [], avoid: [], price: 'p2', noPunish: false };
// 10*52 + 6.25*162 - 5*22 - 161 = 1261.5 -> 1262
T('BMR 女(22/162/52) = 1262', nut.calcBMR(female) === 1262, 'got ' + nut.calcBMR(female));
// 1262*1.55 = 1956.1 -> 1956; 减脂 -400 -> 1556
T('女减脂日预算 = 1556', nut.dayBudget(female, 'normal') === 1556, 'got ' + nut.dayBudget(female, 'normal'));

// ---------- dayState ----------
const st = nut.dayState(male, {}, '2026-10-16');
T('空记录日预算 = TDEE', st.budget === 2309, 'got ' + st.budget);
T('空记录剩余 = 预算', st.remaining === 2309);
T('午餐配额 = 924', st.meals.lunch.quota === 924, 'got ' + st.meals.lunch.quota);
T('三餐配额合计≈预算', Math.abs(st.meals.breakfast.quota + st.meals.lunch.quota + st.meals.dinner.quota - st.budget) <= 2);

// ---------- 放纵模式 ----------
const stI = nut.dayState(male, { '2026-10-16': { mode: 'indulge', items: [] } }, '2026-10-16');
T('放纵日预算 ×1.3 = 3002', stI.budget === 3002, 'got ' + stI.budget);

// ---------- 超支分摊 ----------
// 昨天(10-15) 吃 2609，预算 2309，超 300 → 今天扣 100
const log2 = { '2026-10-15': { mode: 'normal', items: [{ kcal: 2609, p: 0, c: 0, f: 0 }] } };
const st2 = nut.dayState(male, log2, '2026-10-16');
T('昨日超300 → 今日扣100', st2.debt === 100 && st2.budget === 2209, 'debt=' + st2.debt + ' budget=' + st2.budget);

// 三天前各超 300 → 今天扣 300
const log3 = {};
['2026-10-13', '2026-10-14', '2026-10-15'].forEach(d => {
  log3[d] = { mode: 'normal', items: [{ kcal: 2609, p: 0, c: 0, f: 0 }] };
});
const st3 = nut.dayState(male, log3, '2026-10-16');
T('连续3天各超300 → 今日扣300', st3.debt === 300 && st3.budget === 2009, 'debt=' + st3.debt + ' budget=' + st3.budget);

// 只记账不惩罚
const maleNP = Object.assign({}, male, { noPunish: true });
const st3b = nut.dayState(maleNP, log3, '2026-10-16');
T('noPunish → 不扣', st3b.debt === 0 && st3b.budget === 2309);

// 预算下限保护
const tiny = { gender: 'female', age: 60, height: 150, weight: 40, activity: 'sedentary', goal: 'cut',
  cuisine: [], taste: [], avoid: [], noPunish: false };
T('极小身材预算有 800 下限', nut.baseDailyBudget(tiny) >= 800, 'got ' + nut.baseDailyBudget(tiny));

// ---------- 下一顿建议 ----------
const nk = nut.nextMeal(new Date(2026, 9, 16, 12, 0), st.meals);
T('12点未吃 → 下一顿午餐', nk === 'lunch', 'got ' + nk);
const allEaten = { breakfast: { eaten: 500 }, lunch: { eaten: 900 }, dinner: { eaten: 700 } };
T('三顿已吃 → 明天早餐', nut.nextMeal(new Date(2026, 9, 16, 21, 0), allEaten) === 'breakfast_tomorrow');
T('建议文案非空', typeof nut.nextMealAdvice(st, nk) === 'string' && nut.nextMealAdvice(st, nk).length > 5);

// ---------- 食物库完整性 ----------
T('食物库 ≥ 140 条', FOODS.length >= 140, 'got ' + FOODS.length);
const ids = FOODS.map(f => f.id);
T('食物 id 无重复', new Set(ids).size === ids.length);
const bad = FOODS.filter(f => !f.name || !f.cat || !f.cuisine || typeof f.kcal !== 'number' || typeof f.p !== 'number' || typeof f.c !== 'number' || typeof f.f !== 'number' || typeof f.price !== 'number');
T('字段完整', bad.length === 0, JSON.stringify(bad.slice(0, 3)));
const neg = FOODS.filter(f => f.kcal < 0 || f.p < 0 || f.c < 0 || f.f < 0);
T('无负数营养值', neg.length === 0);
T('主餐/饮品/零食/水果四类齐全',
  FOODS.some(f => f.cat === 'main') && FOODS.some(f => f.cat === 'drink') &&
  FOODS.some(f => f.cat === 'snack') && FOODS.some(f => f.cat === 'fruit'));

// ---------- 推荐引擎 ----------
let comboOk = 0, avoidOk = true, drinkZero = true, indulgePair = 0;
const pAvoid = Object.assign({}, male, { avoid: ['spicy', 'organ'] });
const pCut = female;
for (let i = 0; i < 60; i++) {
  const c1 = rec.pickCombo(FOODS, male, 'normal', 'lunch', 924, []);
  if (c1 && c1.main && c1.main.cat === 'main') comboOk++;
  // 忌口硬排除
  const c2 = rec.pickCombo(FOODS, pAvoid, 'normal', 'lunch', 924, []);
  if (c2 && (c2.main.tags || []).some(t => t === 'spicy' || t === 'organ')) avoidOk = false;
  if (c2 && c2.drink && (c2.drink.tags || []).some(t => t === 'spicy' || t === 'organ')) avoidOk = false;
  // 减脂：饮品只允许零卡
  const c3 = rec.pickCombo(FOODS, pCut, 'normal', 'lunch', 622, []);
  if (c3 && c3.drink && c3.drink.kcal > 20) drinkZero = false;
  // 放纵：饮品大概率必配
  const c4 = rec.pickCombo(FOODS, male, 'indulge', 'dinner', 1200, []);
  if (c4 && c4.drink) indulgePair++;
}
T('正餐组合结构 60/60 有效', comboOk === 60, 'got ' + comboOk + '/60');
T('忌口硬排除（60 次无违禁）', avoidOk);
T('减脂模式饮品仅零卡', drinkZero);
T('放纵模式 80% 以上配饮品', indulgePair >= 48, 'got ' + indulgePair + '/60');

// 换一个：排除上一个 id
const cA = rec.pickCombo(FOODS, male, 'normal', 'lunch', 924, []);
const cB = rec.pickCombo(FOODS, male, 'normal', 'lunch', 924, [cA.main.id]);
T('换一个不重复', cB.main.id !== cA.main.id);

// 加餐池
const cS = rec.pickCombo(FOODS, male, 'normal', 'snack', 150, []);
T('加餐从零食/水果池抽取', cS && (cS.main.cat === 'snack' || cS.main.cat === 'fruit'), cS && cS.main.cat);
T('加餐热量 ≤ 预算×1.1', cS && cS.main.kcal <= 165, cS && cS.main.kcal);

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail > 0 ? 1 : 0);
