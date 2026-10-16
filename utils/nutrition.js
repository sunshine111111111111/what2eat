/**
 * nutrition.js — 营养预算核心算法（纯函数模块，无副作用，可独立单测）
 *
 * 公式来源：
 *  - BMR: Mifflin-St Jeor (1990). Am J Clin Nutr, 51(2): 241-247.
 *    男: BMR = 10*W + 6.25*H - 5*A + 5
 *    女: BMR = 10*W + 6.25*H - 5*A - 161
 *  - 活动系数: FAO/WHO/UNU Human Energy Requirements (2004) 常用分段 1.2~1.9
 *
 * 口径声明：食物热量为品类级估算（±20%），本模块用于预算管理，不用于精确计量。
 */

const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: '久坐（几乎不运动）', factor: 1.2 },
  { key: 'light', label: '轻度（每周运动1-3次）', factor: 1.375 },
  { key: 'moderate', label: '中度（每周运动3-5次）', factor: 1.55 },
  { key: 'high', label: '高度（每周运动6-7次）', factor: 1.725 },
  { key: 'extreme', label: '极高（体力劳动+训练）', factor: 1.9 }
];

const GOALS = [
  { key: 'cut', label: '减脂（每天-400）', delta: -400 },
  { key: 'keep', label: '维持体重', delta: 0 },
  { key: 'bulk', label: '增肌（每天+250）', delta: 250 }
];

const PRICE_BANDS = [
  { key: 'p1', label: '15元以下', min: 0, max: 15 },
  { key: 'p2', label: '15~25元', min: 15, max: 25 },
  { key: 'p3', label: '25~40元', min: 25, max: 40 },
  { key: 'p4', label: '40元以上', min: 40, max: Infinity }
];

const MEAL_RATIO = { breakfast: 0.3, lunch: 0.4, dinner: 0.3 };
const MEAL_NAMES = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };

const INDULGE_FACTOR = 1.3; // 放纵日预算上浮
const SPREAD_DAYS = 3;      // 超支分摊天数
const MIN_BUDGET = 800;     // 单日预算下限（安全垫）
const STEPS_COEF = 0.00045; // 每步净消耗系数 kcal/步/kg（70kg·万步≈315，参照公开步耗估计区间300-400）

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function shiftDate(dateStr, offsetDays) {
  const p = dateStr.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  d.setDate(d.getDate() + offsetDays);
  return fmtDate(d);
}
function activityOf(key) { return ACTIVITY_LEVELS.find(a => a.key === key) || ACTIVITY_LEVELS[1]; }
function goalOf(key) { return GOALS.find(g => g.key === key) || GOALS[1]; }

function calcBMR(p) {
  const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  return Math.round(p.gender === 'female' ? base - 161 : base + 5);
}
function calcTDEE(p) { return Math.round(calcBMR(p) * activityOf(p.activity).factor); }
function baseDailyBudget(p) { return Math.max(MIN_BUDGET, calcTDEE(p) + goalOf(p.goal).delta); }
function dayBudget(p, mode) {
  return Math.round(baseDailyBudget(p) * (mode === 'indulge' ? INDULGE_FACTOR : 1));
}
function mealQuota(p, mode, mealKey) {
  return Math.round(dayBudget(p, mode) * (MEAL_RATIO[mealKey] || 0.15));
}

/** 步数 → 额外消耗 kcal（按体重加权，只加不减） */
function stepsBonus(steps, weight) {
  if (!steps || steps <= 0) return 0;
  return Math.round(steps * weight * STEPS_COEF);
}

function sumItems(items) {
  return (items || []).reduce((acc, it) => {
    acc.kcal += it.kcal || 0;
    acc.p += it.p || 0;
    acc.c += it.c || 0;
    acc.f += it.f || 0;
    return acc;
  }, { kcal: 0, p: 0, c: 0, f: 0 });
}

/**
 * 历史超支分摊：过去 SPREAD_DAYS 天里每天的净超支（相对当日预算，含当日放纵上浮），
 * 各取 1/3 记到今天头上。noPunish 模式直接返回 0（只记账不惩罚）。
 */
function carryDebt(log, p, dateStr) {
  if (p.noPunish) return 0;
  let debt = 0;
  for (let i = 1; i <= SPREAD_DAYS; i++) {
    const day = log[shiftDate(dateStr, -i)];
    if (!day || !day.items || !day.items.length) continue;
    const over = sumItems(day.items).kcal - dayBudget(p, day.mode || 'normal');
    if (over > 0) debt += over / SPREAD_DAYS;
  }
  return Math.round(debt);
}

/** 汇总某日完整状态：预算、已吃、剩余、三餐配额、BMR/TDEE、进度百分比 */
function dayState(p, log, dateStr) {
  const mode = (log[dateStr] && log[dateStr].mode) || 'normal';
  const gross = dayBudget(p, mode);
  const debt = carryDebt(log, p, dateStr);
  const steps = (log[dateStr] && log[dateStr].steps) || 0;
  const bonus = stepsBonus(steps, p.weight);
  const budget = Math.max(MIN_BUDGET, gross - debt + bonus);
  const items = (log[dateStr] && log[dateStr].items) || [];
  const consumed = sumItems(items);
  const meals = {};
  Object.keys(MEAL_RATIO).forEach(k => {
    meals[k] = {
      quota: mealQuota(p, mode, k),
      eaten: sumItems(items.filter(it => it.meal === k)).kcal
    };
  });
  const pct = budget > 0 ? Math.min(100, Math.round(consumed.kcal / budget * 100)) : 100;
  return {
    mode, gross, debt, steps, bonus, budget,
    consumed, remaining: budget - consumed.kcal,
    meals, items, pct,
    bmr: calcBMR(p), tdee: calcTDEE(p),
    noPunish: !!p.noPunish
  };
}

/** 当前应吃的餐次（按本地时间） */
function currentMealKey(now) {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < 10.5) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21.5) return 'dinner';
  return 'snack';
}

/** 下一顿：第一个还没吃的正餐；都吃过则明天早餐 */
function nextMeal(now, meals) {
  const h = now.getHours() + now.getMinutes() / 60;
  if (meals.breakfast.eaten === 0 && h < 10.5) return 'breakfast';
  if (meals.lunch.eaten === 0 && h < 15) return 'lunch';
  if (meals.dinner.eaten === 0) return 'dinner';
  return 'breakfast_tomorrow';
}

/** 下一顿建议文案 */
function nextMealAdvice(state, nextKey) {
  if (nextKey === 'breakfast_tomorrow') {
    if (state.remaining < 0) {
      return '今天已超支 ' + (-state.remaining) + ' kcal。' +
        (state.noPunish ? '按你的设置只记账、不惩罚。' : '接下来 ' + SPREAD_DAYS + ' 天每天会自动少一点额度，匀回来。') +
        '明天早餐配额约 ' + state.meals.breakfast.quota + ' kcal，正常吃即可。';
    }
    return '今天三顿都安排完了，还剩 ' + state.remaining + ' kcal 余量。明天早餐配额约 ' + state.meals.breakfast.quota + ' kcal。';
  }
  const q = state.meals[nextKey] ? state.meals[nextKey].quota : Math.max(150, state.remaining);
  const name = MEAL_NAMES[nextKey];
  if (state.remaining >= q * 1.15) return name + '可以正常吃（配额约 ' + q + ' kcal），还有富余，饭后可以加个水果或饮品。';
  if (state.remaining >= q * 0.85) return name + '按正常量吃就行（配额约 ' + q + ' kcal）。';
  if (state.remaining >= q * 0.3) return '今天额度用掉不少了，' + name + '建议控制在 ' + Math.max(120, state.remaining) + ' kcal 左右，优先高蛋白、少油炸。';
  if (state.remaining > 0) return '今天额度基本用完（剩 ' + state.remaining + ' kcal）。' + name + '如果一定要吃，选水果、无糖茶、茶叶蛋这类轻的。';
  return '今天已超支 ' + (-state.remaining) + ' kcal。' +
    (state.noPunish ? '按你的设置只记账、不惩罚。' : '超的部分未来 ' + SPREAD_DAYS + ' 天会自动扣回一点。') +
    '下一顿尽量轻。';
}

module.exports = {
  ACTIVITY_LEVELS, GOALS, PRICE_BANDS, MEAL_NAMES, MEAL_RATIO,
  INDULGE_FACTOR, SPREAD_DAYS,
  calcBMR, calcTDEE, baseDailyBudget, dayBudget, mealQuota, stepsBonus,
  sumItems, carryDebt, dayState,
  currentMealKey, nextMeal, nextMealAdvice,
  fmtDate, shiftDate
};
