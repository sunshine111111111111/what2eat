const store = require('../../utils/store.js');
const nut = require('../../utils/nutrition.js');

Page({
  data: {
    ready: false,
    todayItems: [],
    todayText: '',
    today: { consumed: 0, budget: 0, remaining: 0 },
    days: []
  },

  onShow() { this.refresh(); },

  refresh() {
    const profile = store.getProfile();
    if (!profile) {
      this.setData({ ready: false });
      return;
    }
    const log = store.getLog();
    const now = new Date();
    const todayStr = nut.fmtDate(now);
    const state = nut.dayState(profile, log, todayStr);

    const todayItems = state.items.map((it, idx) => Object.assign({}, it, {
      idx,
      mealLabel: nut.MEAL_NAMES[it.meal] || '加餐'
    }));

    // 近 7 天账本（旧 → 新）
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const ds = nut.shiftDate(todayStr, -i);
      const day = log[ds] || {};
      const consumed = nut.sumItems(day.items).kcal;
      const budget = nut.dayBudget(profile, day.mode || 'normal');
      const over = consumed - budget;
      days.push({
        date: ds,
        isToday: ds === todayStr,
        consumed,
        budget,
        over,
        mode: day.mode || 'normal',
        steps: day.steps || 0,
        count: (day.items || []).length
      });
    }

    const todayText = (now.getMonth() + 1) + '月' + now.getDate() + '日';
    this.setData({
      ready: true,
      todayItems,
      todayText,
      today: {
        consumed: state.consumed.kcal,
        budget: state.budget,
        remaining: state.remaining
      },
      days
    });
  },

  removeItem(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const that = this;
    wx.showModal({
      title: '删掉这一条？',
      content: '删除后热量会从今天账上扣回来',
      confirmColor: '#ff7d00',
      success(res) {
        if (res.confirm) {
          store.removeMealItem(nut.fmtDate(new Date()), idx);
          that.refresh();
        }
      }
    });
  }
});
