const api = require("../../utils/api");
const payment = require("../../utils/payment");
const format = require("../../utils/format");
const qr = require("../../utils/qr");
const ui = require("../../utils/ui");
Page({
  data: { rental: null, loading: false, busy: false, error: "", elapsed: "—" },
  onLoad(options) {
    this._id = options && options.id;
    this._revision = 0;
    this._operation = 0;
    this._destroyed = false;
    if (!this._id) this.setData({ error: "未提供租赁订单" });
  },
  onShow() {
    this._active = true;
    if (this._id) this.load();
  },
  onHide() {
    this.stop();
  },
  onUnload() {
    this._destroyed = true;
    this.stop();
  },
  stop() {
    this._active = false;
    this._revision++;
    this._loading = false;
    clearTimeout(this._poll);
    clearInterval(this._tick);
  },
  onPullDownRefresh() {
    this.load();
  },
  tick() {
    const value = this.data.rental;
    if (value && value.startedAt)
      this.setData({
        elapsed: format.duration(value.startedAt, value.endedAt),
      });
  },
  schedule() {
    clearTimeout(this._poll);
    clearInterval(this._tick);
    if (!this._active || !this.data.rental) return;
    if (this.data.rental.status === "ACTIVE")
      this._tick = setInterval(() => this.tick(), 1000);
    if (
      this.data.rental.status === "PENDING_PAYMENT" ||
      (this.data.rental.refundStatus &&
        this.data.rental.refundStatus !== "SUCCESS")
    )
      this._poll = setTimeout(() => this.load(), 8000);
  },
  async load() {
    if (!this._id || !this._active || this._loading || this.data.busy) {
      wx.stopPullDownRefresh();
      return;
    }
    const revision = ++this._revision;
    this._loading = true;
    this.setData({ loading: !this.data.rental, error: "" });
    try {
      const result = await api.detail(this._id);
      if (!this._active || revision !== this._revision) return;
      if (!result || !result.rental)
        throw new Error("租赁记录暂时不可用，请重试");
      this.setData({ rental: format.rental(result.rental) });
      this.tick();
    } catch (error) {
      if (this._active && revision === this._revision)
        this.setData({ error: ui.error(error) });
    } finally {
      if (revision === this._revision) {
        this._loading = false;
        if (this._active) {
          this.setData({ loading: false });
          this.schedule();
        }
      }
      wx.stopPullDownRefresh();
    }
  },
  async operation(action) {
    if (this.data.busy || this._loading || !this._active) return;
    const token = ++this._operation;
    let failure = "";
    clearTimeout(this._poll);
    this.setData({ busy: true, error: "" });
    try {
      await action();
    } catch (error) {
      failure = ui.error(error);
    } finally {
      if (!this._destroyed && token === this._operation) {
        this.setData({ busy: false });
        if (this._active) {
          await this.load();
          if (failure) this.setData({ error: failure });
        }
      }
    }
  },
  pay() {
    if (
      this.data.rental &&
      this.data.rental.mine &&
      this.data.rental.status === "PENDING_PAYMENT"
    )
      return this.operation(() => payment.pay(this._id, () => this._active));
  },
  cancel() {
    if (
      this.data.rental &&
      this.data.rental.mine &&
      this.data.rental.status === "PENDING_PAYMENT"
    )
      return this.operation(async () => {
        const confirmed = await ui.confirm({
          title: "取消待支付订单",
          content: "系统确认未付款并关闭订单后，设备将恢复可租。",
          confirmText: "取消订单",
        });
        if (confirmed && this._active) await api.cancel(this._id);
      });
  },
  syncPayment() {
    return this.operation(() => api.syncPayment(this._id));
  },
  syncRefund() {
    return this.operation(() => api.syncRefund(this._id));
  },
  device() {
    if (this.data.rental) ui.go(qr.pageUrl({ uuid: this.data.rental.uuid }));
  },
});
