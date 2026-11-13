const qr = require("../../utils/qr");

// Entry configured in WeChat's ordinary-link QR rule. Rental behavior stays
// on the existing scan page; rebuild the URL from validated identity fields.
Page({
  data: { uuid: "", type: "", error: "" },
  onLoad(options) {
    this._device = null;
    this._redirecting = false;
    this.setData({ uuid: "", type: "", error: "" });
    try {
      this._device = qr.entry(options);
      this.setData({ uuid: this._device.uuid, type: this._device.type || "" });
      this.openDevice();
    } catch (error) {
      this.setData({ error: error.message || "设备二维码无效" });
    }
  },
  openDevice() {
    if (!this._device || this._redirecting) return;
    this._redirecting = true;
    this.setData({ error: "" });
    wx.redirectTo({
      url: qr.pageUrl(this._device),
      fail: () => {
        this._redirecting = false;
        this.setData({ error: "暂时无法打开设备页面，请重试" });
      },
    });
  },
});
