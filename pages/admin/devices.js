const api = require("../../utils/api");
const session = require("../../utils/session");
const format = require("../../utils/format");
const qr = require("../../utils/qr");
const ui = require("../../utils/ui");
const LABELS = {
  AVAILABLE: "可租赁",
  RESERVED: "支付占用",
  RENTED: "租赁中",
  SETTLING: "结算中",
  DISABLED: "已停租",
};
Page({
  data: {
    items: [],
    allowed: false,
    loading: false,
    scanning: false,
    search: "",
    appliedSearch: "",
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
  searchInput(event) {
    this.setData({ search: event.detail.value });
  },
  search() {
    this.load(true, this.data.search.trim());
  },
  async load(reset, search) {
    if (this.data.loading) {
      wx.stopPullDownRefresh();
      return;
    }
    this.setData({ loading: true, error: "" });
    const appliedSearch =
      search === undefined ? this.data.appliedSearch : search;
    try {
      const identity = await session.login(!!reset);
      if (!session.isManager(identity))
        throw new Error("当前账号没有设备管理权限");
      const result = await api.devices({
        search: appliedSearch,
        page: reset ? 1 : this.data.page + 1,
        "per-page": 20,
      });
      if (!this._active) return;
      if (!result || !Array.isArray(result.items))
        throw new Error("设备列表暂时不可用，请重试");
      const batch = result.items.map((item) =>
        Object.assign({}, item, {
          id: item.device.id,
          label: LABELS[item.state] || "处理中",
          useFeeText: format.money(item.pricing && item.pricing.useFeeCents),
          depositText: format.money(item.pricing && item.pricing.depositCents),
        })
      );
      const items = reset ? batch : this.data.items.concat(batch);
      this.setData({
        items,
        allowed: true,
        page: result.page,
        total: result.total,
        hasMore: items.length < result.total,
        appliedSearch,
      });
    } catch (error) {
      if (this._active)
        this.setData({ error: ui.error(error), allowed: false });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },
  async scan() {
    if (this.data.scanning || !this.data.allowed) return;
    this.setData({ scanning: true });
    try {
      const value = await qr.scan();
      if (value && this._active) ui.go(qr.pageUrl(value));
    } catch (error) {
      if (this._active) this.setData({ error: ui.error(error) });
    } finally {
      this.setData({ scanning: false });
    }
  },
  open(event) {
    const item = this.data.items[event.currentTarget.dataset.index];
    if (item && this.data.allowed)
      ui.go(qr.pageUrl({ uuid: item.device.uuid }));
  },
  retry() {
    this.load(true);
  },
});
