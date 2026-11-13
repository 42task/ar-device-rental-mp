const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers");
const params = {
  appId: "wx1234567890abcdef",
  timeStamp: "1",
  nonceStr: "nonce",
  package: "prepay_id=test",
  signType: "RSA",
  paySign: "provider-signature",
};
function setup(result, confirmed) {
  const calls = [];
  const wx = {
    requestPayment(options) {
      calls.push("native");
      result === "success"
        ? options.success({})
        : options.fail({ errMsg: result });
    },
  };
  const api = {
    payment: async (id) => {
      calls.push(["payment", id]);
      return { rental: { id, status: "PENDING_PAYMENT" }, payParams: params };
    },
    syncPayment: async (id) => {
      calls.push(["sync", id]);
      return { rental: { id, status: confirmed } };
    },
  };
  return {
    calls,
    api,
    payment: loadModule(
      "utils/payment.js",
      { "./api": api, "./session": { runtimeAppId: () => params.appId } },
      wx
    ),
  };
}
test("native success uses server result and never marks pending as paid locally", async () => {
  const f = setup("success", "PENDING_PAYMENT");
  const result = await f.payment.pay("rental-7");
  assert.equal(result.rental.status, "PENDING_PAYMENT");
  assert.equal(result.nativeResult, "submitted");
  assert.deepEqual(f.calls, [
    ["payment", "rental-7"],
    "native",
    ["sync", "rental-7"],
  ]);
});
test("cancellation and unknown native failures both query server payment status", async () => {
  for (const reason of [
    "requestPayment:fail cancel",
    "requestPayment:fail unknown",
  ]) {
    const f = setup(reason, "ACTIVE");
    const result = await f.payment.pay(7);
    assert.equal(result.rental.status, "ACTIVE");
    assert.ok(
      f.calls.some((call) => Array.isArray(call) && call[0] === "sync")
    );
  }
});
test("a returned prepay response cannot open the cashier after leaving the page", async () => {
  const f = setup("success", "ACTIVE");
  await assert.rejects(
    f.payment.pay(7, () => false),
    /页面已离开/
  );
  assert.equal(f.calls.includes("native"), false);
});
test("payment parameters for a different AppID are rejected before native payment", async () => {
  const f = setup("success", "ACTIVE");
  f.api.payment = async () => ({
    rental: { id: 7, status: "PENDING_PAYMENT" },
    payParams: Object.assign({}, params, { appId: "wxffffffffffffffff" }),
  });
  await assert.rejects(f.payment.pay(7), /支付应用不匹配/);
  assert.equal(f.calls.includes("native"), false);
});
