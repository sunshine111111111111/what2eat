/* what2eat 第二批功能离线单测：步数换算 / 自定义食物 / 高德Key / 复合预算
 * 运行：node tests/test-batch2.js（仓库根目录执行，无任何依赖）
 */
global.wx = {
  __s: {},
  getStorageSync(k) { return this.__s[k] === undefined ? '' : this.__s[k]; },
  setStorageSync(k, v) { this.__s[k] = v; },
  removeStorageSync(k) { delete this.__s[k]; }
};
const store = require('../utils/store.js');
const nut = require('../utils/nutrition.js');
const rec = require('../utils/recommender.js');
const FOODS = require('../data/foods.js');

let pass = 0, fail = 0;
function T(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + '  -> ' + (detail || '')); }
}

const male = { gender: 'male', age: 24, height: 175, weight: 70, activity: 'light', goal: 'keep',
  cuisine: [], taste: [], avoid: [], price: 'p2', noPunish: false };

// ---------- 步数换算 ----------
T('stepsBonus(10000, 70) = 315', nut.stepsBonus(10000, 70) === 315, 'got ' + nut.stepsBonus(10000, 70));
T('stepsBonus(8000, 70) = 252', nut.stepsBonus(8000, 70) === 252, 'got ' + nut.stepsBonus(8000, 70));
T('stepsBonus(0, 70) = 0', nut.stepsBonus(0, 70) === 0);
T('stepsBonus(负数, 70) = 0', nut.stepsBonus(-5, 70) === 0);

const log1 = { '2026-10-16': { mode: 'normal', items: [], steps: 8000 } };
const st1 = nut.dayState(male, log1, '2026-10-16');
T('8000步日预算 2309+252=2561', st1.budget === 2561 && st1.bonus === 252, 'budget=' + st1.budget + ' bonus=' + st1.bonus);
T('旧log无steps字段兼容', nut.dayState(male, {}, '2026-10-16').bonus === 0);

// 步数持久化
store.setDaySteps('2026-10-16', 8000);
T('setDaySteps 持久化', ((store.getLog()['2026-10-16']) || {}).steps === 8000);
T('setDaySteps 补空日结构', ((store.getLog()['2026-10-16']) || {}).items !== undefined);

// ---------- 复合：放纵超支 + 步数加成 ----------
// 昨天 10-15 放纵日预算 3002，吃 3302（超 300）→ 今天扣 100；今天步数 10000 → +315
const logC = {
  '2026-10-15': { mode: 'indulge', items: [{ kcal: 3302, p: 0, c: 0, f: 0 }] },
  '2026-10-16': { mode: 'normal', items: [], steps: 10000 }
};
const stC = nut.dayState(male, logC, '2026-10-16');
T('复合 2309-100+315=2524', stC.budget === 2524, 'got ' + stC.budget);
T('noPunish 只免债不免步数加成', nut.dayState(Object.assign({}, male, { noPunish: true }), logC, '2026-10-16').budget === 2624);

// ---------- 自定义食物 ----------
const custMain = { id: 'c1', name: '食堂鸡腿套餐', cat: 'main', cuisine: 'rice', kcal: 620, p: 32, c: 68, f: 18, price: 14, portion: '1份', tags: [] };
const custDrink = { id: 'c2', name: '自制柠檬水', cat: 'drink', cuisine: 'drink', kcal: 30, p: 0, c: 6, f: 0, price: 0, portion: '1杯', tags: ['zero'] };

store.addCustomFood(custMain);
T('自定义主餐入库', store.getCustomFoods().length === 1 && store.getCustomFoods()[0].id === 'c1');
store.addCustomFood(custDrink);
T('自定义饮品入库', store.getCustomFoods().length === 2);

const pool = FOODS.concat(store.getCustomFoods());
T('合并池含自定义条目', pool.some(f => f.id === 'c1') && pool.some(f => f.id === 'c2'));

// 引擎兼容：仅自定义食物构成的池
const c1 = rec.pickCombo([custMain, custDrink], male, 'normal', 'lunch', 924, []);
T('引擎可抽自定义主餐', c1 && c1.main.id === 'c1', c1 && c1.main.id);
T('引擎可配自定义饮品', c1 && c1.drink && c1.drink.id === 'c2', c1 && (c1.drink || {}).id);
T('组合汇总正确', c1 && c1.total.kcal === 650, c1 && c1.total.kcal);

// 自定义零卡饮品符合减脂约束
const female = { gender: 'female', age: 22, height: 162, weight: 52, activity: 'moderate', goal: 'cut',
  cuisine: [], taste: [], avoid: [], price: 'p2', noPunish: false };
const c2 = rec.pickCombo([custMain, custDrink], female, 'normal', 'lunch', 622, []);
T('减脂+自定义零卡饮品合规', !c2.drink || c2.drink.kcal <= 20);

// 忌口过滤不影响无标签自定义食物
const c3 = rec.pickCombo([custMain, custDrink], Object.assign({}, male, { avoid: ['spicy', 'fried'] }), 'normal', 'lunch', 924, []);
T('无标签自定义不受忌口误伤', c3 && c3.main.id === 'c1');

store.removeCustomFood('c1');
T('删除自定义食物', store.getCustomFoods().length === 1 && !store.getCustomFoods().some(f => f.id === 'c1'));
store.removeCustomFood('c2');
T('清空自定义食物', store.getCustomFoods().length === 0);

// ---------- 高德 Key ----------
store.setAmapKey('abc123');
T('高德Key存取', store.getAmapKey() === 'abc123');
store.setAmapKey('');
T('高德Key可清空', store.getAmapKey() === '');

// ---------- 数据隔离（自定义食物不污染既有 log/profile 断言） ----------
T('log 中 steps 记录仍在', ((store.getLog()['2026-10-16']) || {}).steps === 8000);

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail > 0 ? 1 : 0);
