const store = require('../../utils/store.js');
const rec = require('../../utils/recommender.js');
const FOODS_BASE = require('../../data/foods.js');

const CATS = [
  { key: 'main', label: '主餐' },
  { key: 'snack', label: '零食/加餐' },
  { key: 'fruit', label: '水果' },
  { key: 'drink', label: '饮品' }
];

Page({
  data: {
    catLabels: CATS.map(c => c.label),
    catIndex: 0,
    cuisineLabels: ['（主餐需要选）'].concat(rec.CUISINE_OPTIONS.map(c => c.label)),
    cuisineIndex: 0,
    form: { name: '', kcal: '', p: '', c: '', f: '', portion: '', price: '' },
    list: [],
    baseCount: FOODS_BASE.length
  },

  onShow() { this.refresh(); },

  refresh() {
    const list = store.getCustomFoods().map(f => Object.assign({}, f, {
      catLabel: (CATS.find(c => c.key === f.cat) || {}).label || f.cat
    }));
    this.setData({ list });
  },

  onNameInput(e) { this.setData({ 'form.name': e.detail.value }); },
  onKcalInput(e) { this.setData({ 'form.kcal': e.detail.value }); },
  onPInput(e) { this.setData({ 'form.p': e.detail.value }); },
  onCInput(e) { this.setData({ 'form.c': e.detail.value }); },
  onFInput(e) { this.setData({ 'form.f': e.detail.value }); },
  onPortionInput(e) { this.setData({ 'form.portion': e.detail.value }); },
  onPriceInput(e) { this.setData({ 'form.price': e.detail.value }); },
  onCatChange(e) { this.setData({ catIndex: Number(e.detail.value) }); },
  onCuisineChange(e) { this.setData({ cuisineIndex: Number(e.detail.value) }); },

  addFood() {
    const d = this.data;
    const name = (d.form.name || '').trim();
    const kcal = Number(d.form.kcal);
    if (!name) return this.toast('名字先填上');
    if (!kcal || kcal < 1 || kcal > 5000) return this.toast('热量填一下（1-5000 kcal）');

    const cat = CATS[d.catIndex].key;
    let cuisine;
    if (cat === 'main') {
      if (d.cuisineIndex < 1) return this.toast('主餐要选一个类型（米饭/面/…）');
      cuisine = rec.CUISINE_OPTIONS[d.cuisineIndex - 1].key;
    } else {
      cuisine = cat; // 与内置库对齐：零食/水果/饮品的 cuisine 即自身
    }
    store.addCustomFood({
      id: 'c' + Date.now(),
      name: name,
      cat: cat,
      cuisine: cuisine,
      kcal: Math.round(kcal),
      p: Number(d.form.p) || 0,
      c: Number(d.form.c) || 0,
      f: Number(d.form.f) || 0,
      portion: (d.form.portion || '').trim() || '1份',
      price: Number(d.form.price) || 0,
      tags: []
    });
    this.setData({
      form: { name: '', kcal: '', p: '', c: '', f: '', portion: '', price: '' },
      cuisineIndex: 0
    });
    this.refresh();
    wx.showToast({ title: '加进池子了', icon: 'success' });
  },

  removeFood(e) {
    const id = e.currentTarget.dataset.id;
    const that = this;
    wx.showModal({
      title: '删掉这个自定义食物？',
      content: '已经记过的历史不受影响',
      confirmColor: '#ff7d00',
      success(res) {
        if (res.confirm) { store.removeCustomFood(id); that.refresh(); }
      }
    });
  },

  toast(t) { wx.showToast({ title: t, icon: 'none' }); }
});
