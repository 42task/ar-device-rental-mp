const api = require("../../utils/api");
const qr = require("../../utils/qr");
const session = require("../../utils/session");
const payment = require("../../utils/payment");
const format = require("../../utils/format");
const ui = require("../../utils/ui");
const LABELS = {
  AVAILABLE: "可租赁",
  RESERVED: "支付占用中",
  RENTED: "租赁中",
  SETTLING: "归还结算中",
  DISABLED: "暂不可租",
  UNREGISTERED: "设备未登记",
};
Page({
  data: {
    uuid: "",
    qrType: "",
    context: null,
    rental: null,
    identity: null,
    manager: false,
    loading: false,
    busy: false,
    error: "",
    message: "",
    stateLabel: "",
    useFeeText: "—",
    depositText: "—",
    totalText: "—",
    elapsed: "—",
    showEnd: false,
    refundMode: "deposit",
    reason: "",
    returned: false,
    refundText: "—",
    showConfig: false,
    feeInput: "",
    depositInput: "",
    enabledInput: false,
    paymentBlocked: false,
  },
  onLoad(options) {
    this._revision = 0;
    this._active = false;
    this._offeredCreate = false;
    this._loading = false;
    this._operationToken = 0;
    this._destroyed = false;
    this._qr = null;
    this.setData({
      uuid: "",
      qrType: "",
      context: null,
      rental: null,
      loading: false,
      busy: false,
      error: "",
      message: "",
    });
    try {
      this._qr = qr.entry(options);
      this.setData({ uuid: this._qr.uuid, qrType: this._qr.type || "" });
    } catch (error) {
      this.setData({ error: ui.error(error) });
    }
  },
  onShow() {
    this._active = true;
    if (this._qr) this.load(true);
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
    this._poll = this._tick = null;
  },
  onPullDownRefresh() {
    this.load(true);
  },
  apply(context) {
    if (!context || !context.actions || !LABELS[context.state])
      throw new Error("设备响应无效，请重新查询");
    this._clockOffset = context.serverTime
      ? new Date(context.serverTime).getTime() - Date.now()
      : 0;
    const pricing = context.pricing || {};
    this.setData({
      context,
      rental: format.rental(context.rental),
      stateLabel: LABELS[context.state],
      useFeeText: format.money(pricing.useFeeCents),
      depositText: format.money(pricing.depositCents),
      totalText: format.money(pricing.totalCents),
      paymentBlocked: context.paymentReady === false,
    });
    this.tick();
  },
  tick() {
    const rental = this.data.rental;
    if (rental && rental.startedAt)
      this.setData({
        elapsed: format.duration(
          rental.startedAt,
          rental.endedAt || Date.now() + (this._clockOffset || 0)
        ),
      });
  },
  schedule() {
    clearTimeout(this._poll);
    clearInterval(this._tick);
    if (!this._active) return;
    if (this.data.rental && this.data.rental.status === "ACTIVE")
      this._tick = setInterval(() => this.tick(), 1000);
    if (
      this.data.context &&
      ["RESERVED", "RENTED", "SETTLING"].indexOf(this.data.context.state) !== -1
    )
      this._poll = setTimeout(() => this.load(false), 8000);
  },
  async load(refreshIdentity) {
    if (!this._qr || this._loading || this.data.busy || !this._active) {
      wx.stopPullDownRefresh();
      return;
    }
    const revision = ++this._revision;
    this._loading = true;
    this.setData({ loading: !this.data.context, error: "" });
    try {
      const identity = await session.login(!!refreshIdentity);
      if (!this._active || revision !== this._revision) return;
      const context = await api.context(this._qr.uuid);
      if (!this._active || revision !== this._revision) return;
      this.setData({ identity, manager: session.isManager(identity) });
      this.apply(context);
      if (
        context.state === "UNREGISTERED" &&
        context.actions.canCreate &&
        !this._offeredCreate
      ) {
        this._offeredCreate = true;
        await this.createDevice();
      }
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
    this.setData({ busy: true, error: "", message: "" });
    const token = ++this._operationToken;
    let failure = "";
    clearTimeout(this._poll);
    try {
      await action();
    } catch (error) {
      failure = ui.error(error);
    } finally {
      if (!this._destroyed && token === this._operationToken) {
        this.setData({ busy: false });
        if (this._active) {
          await this.load(false);
          if (failure) this.setData({ error: failure });
        }
      }
    }
  },
  rent() {
    if (
      !this.data.context ||
      !this.data.context.actions.canRent ||
      this.data.paymentBlocked
    )
      return;
    return this.operation(async () => {
      const context = this.data.context;
      const result = await api.createRental({
        deviceId: context.device.id,
        priceVersion: context.pricing.version,
        idempotencyKey: format.key("rent"),
      });
      if (!this._active || !result || !result.rental) return;
      const confirmed = await payment.pay(result.rental.id, () => this._active);
      if (this._active)
        this.setData({
          message:
            confirmed.rental.status === "ACTIVE"
              ? "租赁已生效"
              : "支付结果已查询，请以当前订单状态为准",
        });
    });
  },
  continuePayment() {
    if (
      !this.data.context ||
      !this.data.context.actions.canContinuePayment ||
      !this.data.rental
    )
      return;
    return this.operation(async () => {
      const result = await payment.pay(this.data.rental.id, () => this._active);
      if (this._active)
        this.setData({
          message:
            result.rental.status === "ACTIVE"
              ? "租赁已生效"
              : "支付结果已查询，请以当前订单状态为准",
        });
    });
  },
  cancelPayment() {
    if (
      !this.data.context ||
      !this.data.context.actions.canCancelPayment ||
      !this.data.rental
    )
      return;
    return this.operation(async () => {
      const confirmed = await ui.confirm({
        title: "取消待支付订单",
        content: "系统将确认支付状态并关闭未支付订单，再释放设备。",
        confirmText: "取消订单",
        cancelText: "继续保留",
      });
      if (confirmed && this._active) await api.cancel(this.data.rental.id);
    });
  },
  checkPayment() {
    if (this.data.rental)
      return this.operation(() => api.syncPayment(this.data.rental.id));
  },
  checkRefund() {
    if (this.data.rental)
      return this.operation(() => api.syncRefund(this.data.rental.id));
  },
  queryAfterMerchantHandling() {
    if (
      !this.data.manager ||
      !this.data.rental ||
      ["ABNORMAL", "CLOSED"].indexOf(this.data.rental.refundStatus) === -1
    )
      return;
    return this.operation(async () => {
      const confirmed = await ui.confirm({
        title: "查询异常退款",
        content:
          "请先在微信支付商户平台处理异常退款，完成后再查询。此处仅同步原退款单状态，不会创建新的退款。",
        confirmText: "查询状态",
      });
      if (confirmed && this._active) await api.syncRefund(this.data.rental.id);
    });
  },
  openEnd() {
    if (
      this.data.context &&
      this.data.context.actions.canEndRental &&
      this.data.rental
    )
      this.setData({
        showEnd: true,
        refundMode: "deposit",
        refundText: format.money(this.data.rental.depositCents),
        returned: false,
        reason: "",
      });
  },
  closeEnd() {
    if (!this.data.busy) this.setData({ showEnd: false });
  },
  selectRefund(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === "deposit" || mode === "full")
      this.setData({
        refundMode: mode,
        refundText: format.money(
          mode === "full"
            ? this.data.rental.totalCents
            : this.data.rental.depositCents
        ),
      });
  },
  reasonInput(event) {
    this.setData({ reason: event.detail.value });
  },
  returnChanged(event) {
    this.setData({ returned: event.detail.value.indexOf("returned") !== -1 });
  },
  confirmEnd() {
    if (
      !this.data.returned ||
      !this.data.reason.trim() ||
      !this.data.context.actions.canEndRental
    )
      return;
    const rentalId = this.data.rental.id,
      mode = this.data.refundMode,
      reason = this.data.reason.trim();
    return this.operation(async () => {
      await api.end(rentalId, {
        refundMode: mode,
        reason,
        idempotencyKey: format.key("end"),
      });
      if (this._active)
        this.setData({
          showEnd: false,
          message: "已提交结束租赁，请查看退款处理状态",
        });
    });
  },
  async createDevice() {
    if (
      !this.data.context ||
      !this.data.context.actions.canCreate ||
      this.data.busy
    )
      return;
    const confirmed = await ui.confirm({
      title: "登记设备",
      content:
        "未找到该设备，是否登记？\nUUID：" +
        this._qr.uuid +
        "\n类型：" +
        (this._qr.type || "ios"),
      confirmText: "登记",
      cancelText: "取消",
    });
    if (!confirmed || !this._active) return;
    // Called during initial context load as well as from an explicit button.
    this.setData({ busy: true, error: "" });
    try {
      await api.createDevice(this._qr);
      if (this._active) {
        this.apply(await api.context(this._qr.uuid));
        this.setData({ message: "设备已登记，配置租赁费用后可启用" });
      }
    } catch (error) {
      if (this._active) this.setData({ error: ui.error(error) });
    } finally {
      if (this._active) this.setData({ busy: false });
    }
  },
  openConfig() {
    const context = this.data.context;
    if (!context || !context.actions.canConfigure) return;
    const pricing = context.pricing || {};
    this.setData({
      showConfig: true,
      feeInput: format.money(pricing.useFeeCents || 0),
      depositInput: format.money(pricing.depositCents || 0),
      enabledInput: !!pricing.enabled,
    });
  },
  closeConfig() {
    if (!this.data.busy) this.setData({ showConfig: false });
  },
  feeInput(event) {
    this.setData({ feeInput: event.detail.value });
  },
  depositInput(event) {
    this.setData({ depositInput: event.detail.value });
  },
  enabledChanged(event) {
    this.setData({ enabledInput: event.detail.value });
  },
  saveConfig() {
    if (!this.data.context || !this.data.context.actions.canConfigure) return;
    let data;
    try {
      data = {
        enabled: this.data.enabledInput,
        useFeeCents: format.cents(this.data.feeInput),
        depositCents: format.cents(this.data.depositInput),
        version: this.data.context.pricing
          ? this.data.context.pricing.version
          : 0,
      };
      if (data.enabled && data.useFeeCents + data.depositCents <= 0)
        throw new Error("启用租赁前请设置有效的使用费或押金");
    } catch (error) {
      ui.toast(ui.error(error));
      return;
    }
    return this.operation(async () => {
      await api.configure(this.data.context.device.id, data);
      if (this._active)
        this.setData({ showConfig: false, message: "租赁配置已保存" });
    });
  },
  detail() {
    if (this.data.rental)
      ui.go(
        "/pages/rental/detail?id=" + encodeURIComponent(this.data.rental.id)
      );
  },
  stopTap() {},
});
