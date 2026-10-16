/**
 * store.js — 本地数据层（全部存微信 storage，不上传任何服务器）
 *
 * profile: 用户画像与身体数据
 * log:     { 'YYYY-MM-DD': { mode:'normal|indulge', items:[{id,name,portion,kcal,p,c,f,meal,ts}] } }
 */

const PROFILE_KEY = 'w2e_profile_v1';
const LOG_KEY = 'w2e_log_v1';
const CUSTOM_KEY = 'w2e_custom_foods_v1';
const AMAP_KEY = 'w2e_amap_key_v1';

const DEFAULT_PROFILE = {
  gender: 'male',        // male | female
  age: 24,
  height: 175,           // cm
  weight: 70,            // kg
  activity: 'light',     // sedentary|light|moderate|high|extreme
  goal: 'keep',          // cut|keep|bulk
  cuisine: [],           // 偏好品类 key 列表，空=都行
  taste: [],             // 偏好口味 spicy|salty|light|sweet
  price: 'p2',           // 常用价格带
  avoid: [],             // 忌口标签（硬排除）
  noPunish: false,       // 超支只记账不从后扣
  createdAt: 0
};

function getProfile() {
  try {
    const p = wx.getStorageSync(PROFILE_KEY);
    if (!p) return null;
    return Object.assign({}, DEFAULT_PROFILE, p);
  } catch (e) { return null; }
}
function saveProfile(p) { wx.setStorageSync(PROFILE_KEY, p); }

function getLog() {
  try { return wx.getStorageSync(LOG_KEY) || {}; } catch (e) { return {}; }
}
function saveLog(log) { wx.setStorageSync(LOG_KEY, log); }

function addMealItem(dateStr, item) {
  const log = getLog();
  if (!log[dateStr]) log[dateStr] = { mode: 'normal', items: [] };
  log[dateStr].items.push(item);
  saveLog(log);
}
function removeMealItem(dateStr, idx) {
  const log = getLog();
  const day = log[dateStr];
  if (!day || !day.items || idx < 0 || idx >= day.items.length) return;
  day.items.splice(idx, 1);
  if (!day.items.length && day.mode === 'normal') delete log[dateStr];
  saveLog(log);
}
function setDayMode(dateStr, mode) {
  const log = getLog();
  if (!log[dateStr]) log[dateStr] = { mode: 'normal', items: [] };
  log[dateStr].mode = mode;
  saveLog(log);
}

function setDaySteps(dateStr, steps) {
  const log = getLog();
  if (!log[dateStr]) log[dateStr] = { mode: 'normal', items: [] };
  log[dateStr].steps = steps;
  saveLog(log);
}

function getCustomFoods() {
  try { return wx.getStorageSync(CUSTOM_KEY) || []; } catch (e) { return []; }
}
function addCustomFood(food) {
  const arr = getCustomFoods();
  arr.push(food);
  wx.setStorageSync(CUSTOM_KEY, arr);
}
function removeCustomFood(id) {
  wx.setStorageSync(CUSTOM_KEY, getCustomFoods().filter(f => f.id !== id));
}

function getAmapKey() {
  try { return wx.getStorageSync(AMAP_KEY) || ''; } catch (e) { return ''; }
}
function setAmapKey(k) { wx.setStorageSync(AMAP_KEY, k || ''); }

function clearAll() {
  try {
    wx.removeStorageSync(PROFILE_KEY);
    wx.removeStorageSync(LOG_KEY);
    wx.removeStorageSync(CUSTOM_KEY);
    wx.removeStorageSync(AMAP_KEY);
  } catch (e) { /* ignore */ }
}

module.exports = {
  DEFAULT_PROFILE,
  getProfile, saveProfile,
  getLog, saveLog,
  addMealItem, removeMealItem, setDayMode, setDaySteps,
  getCustomFoods, addCustomFood, removeCustomFood,
  getAmapKey, setAmapKey,
  clearAll
};
