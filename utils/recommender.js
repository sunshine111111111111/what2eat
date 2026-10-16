/**
 * recommender.js — 搭配推荐引擎（纯函数模块）
 *
 * 职责：从食物库中按 偏好画像 + 模式（标准/放纵）+ 本餐预算 抽取一个组合：
 *   正餐 = 主餐 + 可选饮品；加餐 = 零食/水果 + 可选零卡饮品。
 * 打分是加权随机（带随机扰动），保证"常推爱吃的"但不总推同一个。
 */
const nutrition = require('./nutrition.js');

const CUISINE_OPTIONS = [
  { key: 'rice', label: '米饭套餐' },
  { key: 'noodle', label: '面/粉' },
  { key: 'dumpling', label: '饺子馄饨包子' },
  { key: 'west', label: '西式快餐' },
  { key: 'light', label: '轻食沙拉' },
  { key: 'porridge', label: '粥/汤/肠粉' },
  { key: 'hotpot', label: '麻辣烫/冒菜' }
];
const TASTE_OPTIONS = [
  { key: 'spicy', label: '麻辣' },
  { key: 'salty', label: '咸香' },
  { key: 'light', label: '清淡' },
  { key: 'sweet', label: '甜口' }
];
const AVOID_OPTIONS = [
  { key: 'spicy', label: '不吃辣' },
  { key: 'fried', label: '不吃油炸' },
  { key: 'organ', label: '不吃内脏' },
  { key: 'cilantro', label: '不吃香菜' }
];

function hasTag(food, t) { return (food.tags || []).indexOf(t) > -1; }
function passAvoid(food, avoid) {
  return !(food.tags || []).some(t => (avoid || []).indexOf(t) > -1);
}
function priceBandKey(price) {
  const b = nutrition.PRICE_BANDS.find(b => price >= b.min && price < b.max);
  return b ? b.key : 'p2';
}

/** 单项打分（不含随机扰动部分见内部） */
function scoreItem(food, profile, mode) {
  let s = 1;
  if (profile.cuisine && profile.cuisine.length && profile.cuisine.indexOf(food.cuisine) > -1) s *= 1.6;
  const tasteHit = (food.tags || []).filter(t => (profile.taste || []).indexOf(t) > -1).length;
  s *= Math.pow(1.25, tasteHit);
  if (profile.price && priceBandKey(food.price) === profile.price) s *= 1.25;

  const indulgent = hasTag(food, 'heavy') || hasTag(food, 'fried') || hasTag(food, 'sugar');
  if (mode === 'indulge') {
    if (indulgent) s *= 1.5;
  } else {
    if (hasTag(food, 'heavy')) s *= 0.85;
    if (hasTag(food, 'sugar')) s *= 0.9;
    if (profile.goal === 'cut') {
      if (hasTag(food, 'heavy')) s *= 0.75;
      if (hasTag(food, 'fried')) s *= 0.7;
    }
  }
  s *= 0.7 + Math.random() * 0.6; // 扰动，避免天天同一个答案
  return s;
}

function weightedPick(pool, scoreFn) {
  if (!pool || !pool.length) return null;
  const scores = pool.map(f => Math.max(0.01, scoreFn(f)));
  const total = scores.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= scores[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** 饮品搭配决策：放纵必配且含糖优先；减脂只从零卡池；其余按概率/口味 */
function pickDrink(foods, profile, mode, remainBudget) {
  let pool = foods.filter(f => f.cat === 'drink' && passAvoid(f, profile.avoid));
  if (!pool.length) return null;

  const mustPair = mode === 'indulge';
  const wantSweet = (profile.taste || []).indexOf('sweet') > -1;

  if (profile.goal === 'cut' && !mustPair) {
    pool = pool.filter(f => hasTag(f, 'zero'));
    if (!pool.length || Math.random() > 0.3) return null;
  } else if (!mustPair && !wantSweet && Math.random() > 0.4) {
    return null;
  }
  if (mustPair) {
    const sugared = pool.filter(f => hasTag(f, 'sugar') && f.kcal <= Math.max(remainBudget, 80));
    if (sugared.length) pool = sugared;
  }
  const inBudget = pool.filter(f => f.kcal <= remainBudget);
  const usePool = inBudget.length ? inBudget : pool.filter(f => f.kcal <= Math.max(60, remainBudget));
  if (!usePool.length) return null;
  return weightedPick(usePool, f => scoreItem(f, profile, mode));
}

function assemble(main, drink, mealBudget, mealKey, mode) {
  const total = {
    kcal: (main ? main.kcal : 0) + (drink ? drink.kcal : 0),
    p: (main ? main.p : 0) + (drink ? (drink.p || 0) : 0),
    c: (main ? main.c : 0) + (drink ? (drink.c || 0) : 0),
    f: (main ? main.f : 0) + (drink ? (drink.f || 0) : 0)
  };
  const ratio = mealBudget > 0 ? Math.round(total.kcal / mealBudget * 100) : 100;
  let note;
  if (ratio > 110) note = '占本餐预算 ' + ratio + '%，略超一点，剩余额度下一顿会自动收紧。';
  else if (ratio < 70) note = '占本餐预算 ' + ratio + '%，吃得克制，富余可以留给加餐（一个苹果≈90 kcal）。';
  else note = '占本餐预算 ' + ratio + '%，刚刚好。';
  if (mode === 'indulge') note = '放纵模式，这顿吃得尽兴——账上会记着，明天见。' + note;
  return { main, drink, total, ratio, budget: mealBudget, note, mealKey };
}

/**
 * 主入口：抽一个组合
 * @param foods        食物库数组
 * @param profile      用户画像
 * @param mode         'normal' | 'indulge'
 * @param mealKey      breakfast/lunch/dinner/snack
 * @param mealBudget   本餐预算 kcal
 * @param excludeIds   本次要排除的主餐 id（换一个时避免重复）
 */
function pickCombo(foods, profile, mode, mealKey, mealBudget, excludeIds) {
  excludeIds = excludeIds || [];
  const avoid = profile.avoid || [];

  if (mealKey === 'snack') {
    let pool = foods.filter(f => (f.cat === 'snack' || f.cat === 'fruit') && passAvoid(f, avoid));
    if (!pool.length) return null;
    const inBudget = pool.filter(f => f.kcal <= mealBudget * 1.1 && excludeIds.indexOf(f.id) < 0);
    const usePool = inBudget.length ? inBudget : pool.filter(f => excludeIds.indexOf(f.id) < 0);
    const pick1 = weightedPick(usePool, f => scoreItem(f, profile, mode));
    if (!pick1) return null;
    const drink = pickDrink(foods, profile, mode, mealBudget - pick1.kcal);
    return assemble(pick1, drink, mealBudget, mealKey, mode);
  }

  const cap = mealBudget * (mode === 'indulge' ? 1.35 : 1.15);
  let mainPool = foods.filter(f =>
    f.cat === 'main' && passAvoid(f, avoid) && f.kcal <= cap && excludeIds.indexOf(f.id) < 0);
  // 偏好品类池够大才收窄，避免小池天天重复
  if ((profile.cuisine || []).length) {
    const preferred = mainPool.filter(f => profile.cuisine.indexOf(f.cuisine) > -1);
    if (preferred.length >= 3) mainPool = preferred;
  }
  if (!mainPool.length) {
    mainPool = foods.filter(f => f.cat === 'main' && passAvoid(f, avoid) && excludeIds.indexOf(f.id) < 0);
  }
  if (!mainPool.length) return null;

  const main = weightedPick(mainPool, f => scoreItem(f, profile, mode));
  const remain = mealBudget - main.kcal;
  const drink = remain > 40 ? pickDrink(foods, profile, mode, remain) : null;
  return assemble(main, drink, mealBudget, mealKey, mode);
}

module.exports = {
  CUISINE_OPTIONS, TASTE_OPTIONS, AVOID_OPTIONS,
  pickCombo, scoreItem, passAvoid, priceBandKey
};
