function confirm(options) {
  return new Promise((resolve, reject) =>
    wx.showModal(
      Object.assign({}, options, {
        success: (result) => resolve(!!result.confirm),
        fail: () => reject(new Error("确认窗口未能打开，请重试")),
      })
    )
  );
}
function toast(title) {
  wx.showToast({ title, icon: "none", duration: 2200 });
}
function error(value) {
  return value && typeof value.message === "string"
    ? value.message
    : "操作未完成，请重试";
}
function go(url) {
  wx.navigateTo({ url, fail: () => toast("页面打开失败，请重试") });
}
module.exports = { confirm, toast, error, go };
