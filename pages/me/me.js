const store = require('../../utils/store.js');
const nut = require('../../utils/nutrition.js');
const rec = require('../../utils/recommender.js');

Page({
  data: {
    ready: false,
    form: { gender: 'male', age: '', height: '', weight: '' },
    activityIndex: 1,
    goalIndex: 1,
    priceIndex: 1,
    cuisineOpts: [],
    tasteOpts: [],
    avoidOpts: [],
    noPunish: false,
    summary: '',
    amapKey: '',
    activityLabels: nut.ACTIVITY_LEVELS.map(a => a.label),
    goalLabels: nut.GOALS.map(g => g.label),
    priceLabels: nut.PRICE_BANDS.map(b => b.label)
  },

  onShow() { this.loadProfile(); },

  loadProfile() {
    const p = store.getProfile();
    if (!p) {
      this.setData({ ready: false });
      return;
    }
    const tdee = nut.calcTDEE(p);
    this.setData({
      ready: true,
      form: { gender: p.gender, age: String(p.age), height: String(p.height), weight: String(p.weight) },
      activityIndex: Math.max(0, nut.ACTIVITY_LEVELS.findIndex(a => a.key === p.activity)),
      goalIndex: Math.max(0, nut.GOALS.findIndex(g => g.key === p.goal)),
      priceIndex: Math.max(0, nut.PRICE_BANDS.findIndex(b => b.key === p.price)),
      cuisineOpts: this.markOpts(rec.CUISINE_OPTIONS, p.cuisine),
      tasteOpts: this.markOpts(rec.TASTE_OPTIONS, p.taste),
      avoidOpts: this.markOpts(rec.AVOID_OPTIONS, p.avoid),
      noPunish: !!p.noPunish,
      amapKey: store.getAmapKey(),
      summary: '每日消耗约 ' + tdee + ' kcal，基础代谢 ' + nut.calcBMR(p) + ' kcal'
    });
  },

  markOpts(options, selArr) {
    return options.map(o => Object.assign({}, o, { on: (selArr || []).indexOf(o.key) > -1 }));
  },

  // ---- 编辑事件 ----
  setGender(e) { this.setData({ 'form.gender': e.currentTarget.dataset.v }); this.save(); },
  onAgeInput(e) { this.setData({ 'form.age': e.detail.value }); },
  onHeightInput(e) { this.setData({ 'form.height': e.detail.value }); },
  onWeightInput(e) { this.setData({ 'form.weight': e.detail.value }); },
  onActivityChange(e) { this.setData({ activityIndex: Number(e.detail.value) }); this.save(); },
  onGoalChange(e) { this.setData({ goalIndex: Number(e.detail.value) }); this.save(); },
  onPriceChange(e) { this.setData({ priceIndex: Number(e.detail.value) }); this.save(); },
  onCuisineChange(e) {
    this.setData({ cuisineOpts: this.markOpts(rec.CUISINE_OPTIONS, e.detail.value) });
    this.save();
  },
  onTasteChange(e) {
    this.setData({ tasteOpts: this.markOpts(rec.TASTE_OPTIONS, e.detail.value) });
    this.save();
  },
  onAvoidChange(e) {
    this.setData({ avoidOpts: this.markOpts(rec.AVOID_OPTIONS, e.detail.value) });
    this.save();
  },
  onNoPunishChange(e) { this.setData({ noPunish: e.detail.value }); this.save(); },

  selOf(opts) { return opts.filter(o => o.on).map(o => o.key); },

  save() {
    const d = this.data;
    const age = Number(d.form.age), height = Number(d.form.height), weight = Number(d.form.weight);
    if (!age || !height || !weight) return; // 输入中间态不落库
    const p = store.getProfile();
    if (!p) return;
    const profile = Object.assign({}, p, {
      gender: d.form.gender, age, height, weight,
      activity: nut.ACTIVITY_LEVELS[d.activityIndex].key,
      goal: nut.GOALS[d.goalIndex].key,
      price: nut.PRICE_BANDS[d.priceIndex].key,
      cuisine: this.selOf(d.cuisineOpts),
      taste: this.selOf(d.tasteOpts),
      avoid: this.selOf(d.avoidOpts),
      noPunish: d.noPunish
    });
    store.saveProfile(profile);
    this.setData({ summary: '每日消耗约 ' + nut.calcTDEE(profile) + ' kcal，基础代谢 ' + nut.calcBMR(profile) + ' kcal' });
  },

  saveBody() { this.save(); this.toast('已保存'); },
  toast(t) { wx.showToast({ title: t, icon: 'none' }); },

  goFood() {
    wx.navigateTo({ url: '/pages/food/food' });
  },
  onAmapBlur(e) {
    store.setAmapKey((e.detail.value || '').trim());
    this.toast('Key已保存');
  },

  clearAll() {
    const that = this;
    wx.showModal({
      title: '清空全部数据？',
      content: '身体数据、偏好和所有吃饭记录都会删掉，不可恢复',
      confirmColor: '#e53935',
      success(res) {
        if (res.confirm) {
          store.clearAll();
          that.setData({ ready: false });
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  }
});
