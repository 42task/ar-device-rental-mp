const api = require("../../utils/api");
const session = require("../../utils/session");
const format = require("../../utils/format");
const ui = require("../../utils/ui");
Page({
  data: {
    items: [],
    loading: false,
    error: "",
    page: 0,
    total: 0,
    hasMore: false,
  },
  onShow() {
    this._active = true;
    this.load(true);
  },
  onHide() {
    this._active = false;
  },
  onUnload() {
    this._active = false;
  },
  onPullDownRefresh() {
    this.load(true);
  },
  onReachBottom() {
    if (this.data.hasMore) this.load(false);
  },
  async load(reset) {
    if (this.data.loading) {
      wx.stopPullDownRefresh();
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      await session.login(!!reset);
      const result = await api.orders({
        page: reset ? 1 : this.data.page + 1,
        "per-page": 20,
      });
      if (!this._active) return;
      if (!result || !Array.isArray(result.items))
        throw new Error("租赁列表暂时不可用，请重试");
      const items = reset
        ? result.items.map(format.rental)
        : this.data.items.concat(result.items.map(format.rental));
      this.setData({
        items,
        page: result.page,
        total: result.total,
        hasMore: items.length < result.total,
      });
    } catch (error) {
      if (this._active) this.setData({ error: ui.error(error) });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },
  retry() {
    this.load(true);
  },
  detail(event) {
    ui.go(
      "/pages/rental/detail?id=" +
        encodeURIComponent(event.currentTarget.dataset.id)
    );
  },
  scan() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
