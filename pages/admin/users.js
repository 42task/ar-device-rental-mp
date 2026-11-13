const api = require("../../utils/api");
const session = require("../../utils/session");
const format = require("../../utils/format");
const ui = require("../../utils/ui");
Page({
  data: {
    items: [],
    allowed: false,
    loading: false,
    busyId: null,
    error: "",
    search: "",
    appliedSearch: "",
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
  },
  onShow() {
    this._active = true;
    this.load(1);
  },
  onHide() {
    this._active = false;
  },
  onUnload() {
    this._active = false;
  },
  onPullDownRefresh() {
    this.load(1);
  },
  searchInput(event) {
    this.setData({ search: event.detail.value });
  },
  search() {
    this.load(1, this.data.search.trim());
  },
  async load(page, search) {
    if (this.data.loading || this.data.busyId !== null) {
      wx.stopPullDownRefresh();
      return;
    }
    this.setData({ loading: true, error: "" });
    const appliedSearch =
      search === undefined ? this.data.appliedSearch : search;
    try {
      const identity = await session.login(true);
      if (identity.user.role !== "root")
        throw new Error("仅平台管理员可以管理用户身份");
      const result = await api.users({
        search: appliedSearch,
        page: page || 1,
        "per-page": 20,
      });
      if (!this._active) return;
      if (!result || !Array.isArray(result.items))
        throw new Error("用户列表暂时不可用，请重试");
      this.setData({
        allowed: true,
        items: result.items.map((item) =>
          Object.assign({}, item, { roleLabel: format.role(item.role) })
        ),
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        hasMore: result.page * result.pageSize < result.total,
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
  async change(event) {
    if (!this.data.allowed || this.data.busyId !== null || this.data.loading)
      return;
    const target = this.data.items[event.currentTarget.dataset.index];
    if (!target || target.role === "root") return;
    const role = target.role === "manager" ? "user" : "manager";
    this.setData({ busyId: target.id, error: "" });
    try {
      const confirmed = await ui.confirm({
        title: role === "manager" ? "授予设备管理员身份" : "撤销设备管理员身份",
        content:
          (target.nickname || "用户 #" + target.id) +
          (role === "manager"
            ? "将可以配置设备、结束租赁并办理退款。"
            : "将保留普通租赁权限，不能继续管理设备或退款。"),
        confirmText: role === "manager" ? "确认授予" : "确认撤销",
      });
      if (!confirmed || !this._active) return;
      const updated = await api.userRole(target.id, role);
      if (this._active)
        this.setData({
          items: this.data.items.map((item) =>
            item.id === target.id
              ? Object.assign({}, updated, {
                  roleLabel: format.role(updated.role),
                })
              : item
          ),
        });
    } catch (error) {
      if (this._active) this.setData({ error: ui.error(error) });
    } finally {
      this.setData({ busyId: null });
    }
  },
  previous() {
    if (this.data.page > 1) this.load(this.data.page - 1);
  },
  next() {
    if (this.data.hasMore) this.load(this.data.page + 1);
  },
  retry() {
    this.load(this.data.page);
  },
});
