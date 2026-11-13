const session = require("../../utils/session");
const qr = require("../../utils/qr");
const format = require("../../utils/format");
const ui = require("../../utils/ui");
Page({
  data: {
    loading: false,
    scanning: false,
    error: "",
    identity: null,
    roleLabel: "",
    manager: false,
    root: false,
  },
  onLoad(options) {
    if (options && options.q) {
      try {
        wx.redirectTo({ url: qr.pageUrl(qr.entry(options)) });
      } catch (error) {
        this.setData({ error: ui.error(error) });
      }
    }
  },
  onShow() {
    this._active = true;
    this.load();
  },
  onHide() {
    this._active = false;
  },
  onUnload() {
    this._active = false;
  },
  async load() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      const identity = await session.login(true);
      if (this._active)
        this.setData({
          identity,
          roleLabel: format.role(identity.user.role),
          manager: session.isManager(identity),
          root: identity.user.role === "root",
        });
    } catch (error) {
      if (this._active)
        this.setData({
          error: ui.error(error),
          identity: null,
          manager: false,
          root: false,
        });
    } finally {
      if (this._active) this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },
  onPullDownRefresh() {
    this.load();
  },
  async scan() {
    if (this.data.scanning) return;
    this.setData({ scanning: true, error: "" });
    try {
      const value = await qr.scan();
      if (value && this._active) ui.go(qr.pageUrl(value));
    } catch (error) {
      if (this._active) this.setData({ error: ui.error(error) });
    } finally {
      if (this._active) this.setData({ scanning: false });
    }
  },
  orders() {
    wx.switchTab({ url: "/pages/orders/index" });
  },
  devices() {
    if (this.data.manager) ui.go("/pages/admin/devices");
  },
  users() {
    if (this.data.root) ui.go("/pages/admin/users");
  },
});
