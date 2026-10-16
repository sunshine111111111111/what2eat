const store = require('../../utils/store.js');
const nut = require('../../utils/nutrition.js');
const rec = require('../../utils/recommender.js');
const FOODS_BASE = require('../../data/foods.js');

// 品类 → 高德周边搜索关键词（多词用 | 分隔）
const CUISINE_KW = {
  rice: '饭店|快餐|米饭',
  noodle: '面馆|米粉|米线',
  dumpling: '饺子|馄饨|包子',
  west: '汉堡|披萨|西餐',
  light: '轻食|沙拉',
  porridge: '粥|肠粉|汤',
  hotpot: '麻辣烫|冒菜|串串'
};

function allFoods() { return FOODS_BASE.concat(store.getCustomFoods()); }

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

Page({
  data: {
    profile: null,
    // ---- onboarding 表单 ----
    form: { gender: 'male', age: '', height: '', weight: '' },
    activityIndex: 1,
    goalIndex: 1,
    priceIndex: 1,
    cuisineSel: [],
    tasteSel: [],
    avoidSel: [],
    noPunish: false,
    cuisineOptions: rec.CUISINE_OPTIONS,
    tasteOptions: rec.TASTE_OPTIONS,
    avoidOptions: rec.AVOID_OPTIONS,
    activityLabels: nut.ACTIVITY_LEVELS.map(a => a.label),
    goalLabels: nut.GOALS.map(g => g.label),
    priceLabels: nut.PRICE_BANDS.map(b => b.label),
    // ---- 主界面 ----
    state: null,
    dateText: '',
    advice: '',
    todayItems: [],
    combo: null,
    comboHead: '',
    nextBtnLabel: '',
    // ---- 附近搜店 ----
    nearby: { show: false, loading: false, list: [], error: '', cuisine: '' },
    cuisineChips: [{ key: '', label: '全部' }].concat(rec.CUISINE_OPTIONS)
  },

  onLoad() { this.refresh(); },
  onShow() { this.refresh(); },

  refresh() {
    const profile = store.getProfile();
    if (!profile) {
      this.setData({ profile: null, state: null, combo: null, todayItems: [] });
      return;
    }
    const now = new Date();
    const dateStr = nut.fmtDate(now);
    const log = store.getLog();
    const state = nut.dayState(profile, log, dateStr);
    const nk = nut.nextMeal(now, state.meals);
    const advice = nut.nextMealAdvice(state, nk);
    const dateText = (now.getMonth() + 1) + '月' + now.getDate() + '日 周' + WEEK[now.getDay()];
    const todayItems = state.items.map(it => Object.assign({}, it, {
      mealLabel: nut.MEAL_NAMES[it.meal] || '加餐'
    }));
    this.setData({
      profile, state, advice, dateText, todayItems,
      nextBtnLabel: nk === 'breakfast_tomorrow' ? '明天早餐' : '这顿' + nut.MEAL_NAMES[nk]
    });
  },

  // ========== onboarding ==========
  setGender(e) { this.setData({ 'form.gender': e.currentTarget.dataset.v }); },
  onAgeInput(e) { this.setData({ 'form.age': e.detail.value }); },
  onHeightInput(e) { this.setData({ 'form.height': e.detail.value }); },
  onWeightInput(e) { this.setData({ 'form.weight': e.detail.value }); },
  onActivityChange(e) { this.setData({ activityIndex: Number(e.detail.value) }); },
  onGoalChange(e) { this.setData({ goalIndex: Number(e.detail.value) }); },
  onPriceChange(e) { this.setData({ priceIndex: Number(e.detail.value) }); },
  onCuisineChange(e) { this.setData({ cuisineSel: e.detail.value }); },
  onTasteChange(e) { this.setData({ tasteSel: e.detail.value }); },
  onAvoidChange(e) { this.setData({ avoidSel: e.detail.value }); },
  onNoPunishChange(e) { this.setData({ noPunish: e.detail.value }); },

  saveProfile() {
    const f = this.data.form;
    const age = Number(f.age), height = Number(f.height), weight = Number(f.weight);
    if (!age || age < 10 || age > 90) return this.toast('先把年龄填上（10-90）');
    if (!height || height < 120 || height > 230) return this.toast('身高填一下（120-230 cm）');
    if (!weight || weight < 25 || weight > 200) return this.toast('体重填一下（25-200 kg）');
    const profile = Object.assign({}, store.DEFAULT_PROFILE, {
      gender: f.gender, age, height, weight,
      activity: nut.ACTIVITY_LEVELS[this.data.activityIndex].key,
      goal: nut.GOALS[this.data.goalIndex].key,
      price: nut.PRICE_BANDS[this.data.priceIndex].key,
      cuisine: this.data.cuisineSel,
      taste: this.data.tasteSel,
      avoid: this.data.avoidSel,
      noPunish: this.data.noPunish,
      createdAt: Date.now()
    });
    store.saveProfile(profile);
    this.refresh();
  },
  toast(t) { wx.showToast({ title: t, icon: 'none' }); },

  // ========== 主界面 ==========
  toggleIndulge(e) {
    const mode = e.detail.value ? 'indulge' : 'normal';
    store.setDayMode(nut.fmtDate(new Date()), mode);
    this.refresh();
  },

  recommend(excludeIds) {
    const p = this.data.profile;
    const state = this.data.state;
    if (!p || !state) return;

    let mealKey = nut.currentMealKey(new Date());
    // 当前餐次已吃过 → 转为加餐推荐
    if (mealKey !== 'snack' && state.meals[mealKey] && state.meals[mealKey].eaten > 0) {
      mealKey = 'snack';
    }
    let mealBudget;
    if (mealKey === 'snack') {
      mealBudget = state.remaining > 0 ? Math.max(120, Math.round(state.remaining * 0.5)) : 150;
    } else {
      const m = state.meals[mealKey];
      mealBudget = Math.max(250, m.quota - m.eaten);
    }
    const combo = rec.pickCombo(allFoods(), p, state.mode, mealKey, mealBudget, excludeIds || []);
    if (!combo || !combo.main) {
      this.toast('筛得太严没得选了，去「我的」放宽点忌口试试');
      return;
    }
    const label = mealKey === 'snack' ? '加餐建议' : nut.MEAL_NAMES[mealKey] + '建议';
    this.setData({
      combo,
      comboHead: label + ' · 本餐预算 ' + mealBudget + ' kcal',
      lastExclude: [combo.main.id]
    });
  },

  reroll() {
    const prev = this.data.combo && this.data.combo.main ? [this.data.combo.main.id] : [];
    const ex = (this.data.lastExclude || []).concat(prev);
    this.recommend(ex.slice(-6));
  },

  acceptCombo() {
    const combo = this.data.combo;
    if (!combo) return;
    const dateStr = nut.fmtDate(new Date());
    const ts = Date.now();
    const mk = combo.mealKey;
    store.addMealItem(dateStr, {
      id: combo.main.id, name: combo.main.name, portion: combo.main.portion,
      kcal: combo.main.kcal, p: combo.main.p, c: combo.main.c, f: combo.main.f,
      meal: mk, ts
    });
    if (combo.drink) {
      store.addMealItem(dateStr, {
        id: combo.drink.id, name: combo.drink.name, portion: combo.drink.portion || '1杯',
        kcal: combo.drink.kcal, p: combo.drink.p || 0, c: combo.drink.c || 0, f: combo.drink.f || 0,
        meal: mk, ts: ts + 1
      });
    }
    this.setData({ combo: null });
    this.refresh();
    wx.showToast({ title: '记上了，吃好喝好', icon: 'success' });
  },

  // ========== 步数 ==========
  onStepsBlur(e) {
    const v = Number(e.detail.value) || 0;
    store.setDaySteps(nut.fmtDate(new Date()), Math.max(0, Math.min(60000, v)));
    this.refresh();
  },

  // ========== 附近搜店 ==========
  onNearbyTap(e) { this.nearbySearch(e.currentTarget.dataset.cuisine || ''); },
  setNearbyCuisine(e) { this.nearbySearch(e.currentTarget.dataset.key || ''); },
  closeNearby() { this.setData({ 'nearby.show': false }); },

  nearbySearch(cuisineKey) {
    const key = store.getAmapKey();
    if (!key) {
      wx.showModal({
        title: '需要高德Key',
        content: '去「我的」页填入高德开放平台的「Web服务」类型Key（免费申请），就能搜附近1.5公里的店了',
        showCancel: false,
        confirmColor: '#ff7d00'
      });
      return;
    }
    this.setData({ 'nearby.show': true, 'nearby.loading': true, 'nearby.cuisine': cuisineKey, 'nearby.list': [], 'nearby.error': '' });
    const that = this;
    wx.getLocation({
      type: 'gcj02',
      success(res) { that.amapAround(key, res.latitude, res.longitude, cuisineKey); },
      fail() {
        that.setData({ 'nearby.loading': false, 'nearby.error': '定位失败：检查定位授权；开发工具里可先模拟一个位置' });
      }
    });
  },

  amapAround(key, lat, lng, cuisineKey) {
    const that = this;
    wx.request({
      url: 'https://restapi.amap.com/v3/place/around',
      data: {
        key: key,
        location: lng + ',' + lat,
        keywords: CUISINE_KW[cuisineKey] || '',
        types: '050000',
        radius: 1500,
        offset: 20,
        page: 1,
        sortrule: 'distance'
      },
      success(res) {
        const d = res.data;
        if (d && d.status === '1' && d.pois) {
          const raw = (d.pois || []).filter(p => p.name);
          const list = raw.map((p, i) => {
            const dist = p.distance ? Number(p.distance) : null;
            return {
              idx: i,
              name: p.name,
              address: p.address || '—',
              location: p.location || '',
              distanceText: dist === null ? '' : (dist >= 1000 ? (dist / 1000).toFixed(1) + 'km' : Math.round(dist) + 'm')
            };
          });
          that.setData({
            'nearby.loading': false,
            'nearby.list': list,
            'nearby.error': list.length ? '' : '1.5公里内没搜到，换个品类或选「全部」试试'
          });
        } else {
          that.setData({ 'nearby.loading': false, 'nearby.error': '高德返回异常：确认Key是「Web服务」类型、未超免费额度' });
        }
      },
      fail() {
        that.setData({ 'nearby.loading': false, 'nearby.error': '请求失败：检查网络；开发版已关闭域名校验' });
      }
    });
  },

  openShop(e) {
    const i = Number(e.currentTarget.dataset.i);
    const p = this.data.nearby.list[i];
    if (!p || !p.location) { this.toast('这家店没有坐标信息'); return; }
    const parts = p.location.split(',');
    wx.openLocation({
      latitude: Number(parts[1]),
      longitude: Number(parts[0]),
      name: p.name,
      address: p.address,
      scale: 16
    });
  }
});
