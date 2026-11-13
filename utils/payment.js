const api = require("./api");
const session = require("./session");
function nativePayment(params) {
  if (
    !params ||
    !params.package ||
    !params.paySign ||
    !params.timeStamp ||
    !params.nonceStr ||
    params.signType !== "RSA"
  )
    return Promise.reject(new Error("支付参数无效，请重新查询订单"));
  const appId = session.runtimeAppId();
  if (appId && params.appId !== appId)
    return Promise.reject(new Error("支付应用不匹配，请联系管理员"));
  return new Promise((resolve) =>
    wx.requestPayment({
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType,
      paySign: params.paySign,
      success: () => resolve("submitted"),
      fail: (error) =>
        resolve(
          error.errMsg && error.errMsg.indexOf("cancel") !== -1
            ? "cancelled"
            : "unknown"
        ),
    })
  );
}
async function pay(id, isActive) {
  const result = await api.payment(id);
  if (!result || !result.rental) throw new Error("支付订单无效，请重新查询");
  if (result.rental.status !== "PENDING_PAYMENT")
    return { rental: result.rental, nativeResult: "not-needed" };
  if (isActive && !isActive())
    throw new Error("页面已离开，请返回订单继续支付");
  const nativeResult = await nativePayment(result.payParams);
  // Success, cancellation and unknown native results all require server confirmation.
  const confirmed = await api.syncPayment(id);
  if (!confirmed || !confirmed.rental)
    throw new Error("支付结果确认中，请重新查询订单");
  return { rental: confirmed.rental, nativeResult };
}
module.exports = { nativePayment, pay };
