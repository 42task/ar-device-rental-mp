const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage, deferred } = require("./helpers");
const qr = require("../utils/qr");
const UUID = "550e8400-e29b-41d4-a716-446655440000";
const clean = (value) => JSON.parse(JSON.stringify(value));
const pendingRental = {
  id: "rental-7",
  deviceId: 7,
  uuid: UUID,
  deviceName: "AR 眼镜 07",
  status: "PENDING_PAYMENT",
  mine: true,
  useFeeCents: 2000,
  depositCents: 20000,
  totalCents: 22000,
  createdAt: "2026-11-13T00:00:00Z",
};
function fixture(role) {
  const calls = [],
    modals = [],
    navigation = [];
  let context = {
    device: { id: 7, uuid: UUID, name: "AR 眼镜 07", type: "rokid" },
    state: "AVAILABLE",
    relation: "none",
    pricing: {
      enabled: true,
      useFeeCents: 2000,
      depositCents: 20000,
      totalCents: 22000,
      version: 3,
    },
    rental: null,
    actions: {
      canRent: true,
      canContinuePayment: false,
      canCancelPayment: false,
      canEndRental: false,
      canConfigure: role !== "user",
      canCreate: false,
    },
    serverTime: "2026-11-13T01:00:00Z",
    paymentReady: true,
  };
  const api = {
    context: async (uuid) => {
      calls.push(["context", uuid]);
      return structuredClone(context);
    },
    createRental: async (data) => {
      calls.push(["createRental", clean(data)]);
      context = Object.assign({}, context, {
        state: "RESERVED",
        relation: "mine",
        rental: pendingRental,
        actions: Object.assign({}, context.actions, {
          canRent: false,
          canContinuePayment: true,
          canCancelPayment: true,
        }),
      });
      return { rental: pendingRental };
    },
    cancel: async (id) => {
      calls.push(["cancel", id]);
      return {
        rental: Object.assign({}, pendingRental, { status: "CANCELLED" }),
      };
    },
    syncPayment: async (id) => {
      calls.push(["syncPayment", id]);
      return { rental: pendingRental };
    },
    end: async (id, body) => {
      calls.push(["end", id, clean(body)]);
      context = Object.assign({}, context, {
        state: "SETTLING",
        rental: Object.assign({}, context.rental, {
          status: "ENDED",
          endedAt: "2026-11-13T01:00:00Z",
          refundStatus: "PROCESSING",
        }),
        actions: Object.assign({}, context.actions, { canEndRental: false }),
      });
      return { rental: context.rental };
    },
    syncRefund: async (id) => {
      calls.push(["syncRefund", id]);
      return { rental: context.rental };
    },
    retryRefund: async (id) => {
      calls.push(["retryRefund", id]);
      return { rental: context.rental };
    },
    createDevice: async (body) => {
      calls.push(["createDevice", clean(body)]);
      context = Object.assign({}, context, {
        state: "DISABLED",
        device: { id: 7, uuid: UUID, name: UUID, type: body.type },
        actions: Object.assign({}, context.actions, {
          canCreate: false,
          canConfigure: true,
          canRent: false,
        }),
      });
      return context.device;
    },
    configure: async (id, body) => {
      calls.push(["configure", id, clean(body)]);
      return {};
    },
  };
  const identity = { user: { id: 3, role: role || "user" } };
  const session = {
    login: async (force) => {
      calls.push(["login", force]);
      return identity;
    },
    isManager: (value) => ["manager", "root"].includes(value.user.role),
  };
  const payment = {
    pay: async (id, isActive) => {
      calls.push(["pay", id]);
      assert.equal(isActive(), true);
      return { rental: pendingRental };
    },
  };
  const ui = {
    confirm: async (options) => {
      modals.push(clean(options));
      return false;
    },
    toast: (message) => calls.push(["toast", message]),
    error: (error) => error.message || "failed",
    go: (url) => navigation.push(url),
  };
  const wx = {
    stopPullDownRefresh() {},
    reLaunch: (options) => navigation.push(options.url),
    showToast: (options) => calls.push(["toast", options.title]),
  };
  const { page, timers } = loadPage(
    "pages/device/scan.js",
    {
      "../../utils/api": api,
      "../../utils/session": session,
      "../../utils/payment": payment,
      "../../utils/ui": ui,
    },
    wx
  );
  page.onLoad({
    q: encodeURIComponent(qr.build({ uuid: UUID, type: "rokid" })),
  });
  page._active = true;
  return {
    page,
    timers,
    api,
    session,
    payment,
    ui,
    calls,
    modals,
    navigation,
    context: () => context,
    setContext: (value) => {
      context = value;
    },
  };
}
test("ordinary users stay on the device page and receive the same rental pricing", async () => {
  const f = fixture("user");
  await f.page.load(true);
  assert.equal(f.page.data.context.state, "AVAILABLE");
  assert.equal(f.page.data.totalText, "220.00");
  assert.equal(f.page.data.manager, false);
  assert.equal(f.page.data.paymentBlocked, false);
  assert.deepEqual(f.navigation, []);
});
test("rental creation submits device and price revision but no client amount or payer", async () => {
  const f = fixture("user");
  await f.page.load(true);
  await f.page.rent();
  const created = f.calls.find((call) => call[0] === "createRental")[1];
  assert.equal(created.deviceId, 7);
  assert.equal(created.priceVersion, 3);
  assert.match(created.idempotencyKey, /^rent_/);
  assert.deepEqual(Object.keys(created).sort(), [
    "deviceId",
    "idempotencyKey",
    "priceVersion",
  ]);
  assert.equal(f.calls.filter((call) => call[0] === "pay").length, 1);
  assert.equal(f.page.data.context.state, "RESERVED");
  assert.equal(f.page.data.busy, false);
});
test("occupied equipment cannot be rented by another ordinary user or manager", async () => {
  for (const role of ["user", "manager"]) {
    const f = fixture(role);
    f.setContext(
      Object.assign({}, f.context(), {
        state: "RENTED",
        relation: "other",
        rental:
          role === "user"
            ? null
            : Object.assign({}, pendingRental, {
                status: "ACTIVE",
                mine: false,
              }),
        actions: Object.assign({}, f.context().actions, {
          canRent: false,
          canEndRental: role === "manager",
        }),
      })
    );
    await f.page.load(true);
    await f.page.rent();
    assert.equal(
      f.calls.some((call) => call[0] === "createRental"),
      false
    );
    assert.equal(f.page.data.context.actions.canEndRental, role === "manager");
  }
});
test("cancelled missing-device confirmation performs no creation", async () => {
  const f = fixture("manager");
  f.setContext(
    Object.assign({}, f.context(), {
      state: "UNREGISTERED",
      device: null,
      pricing: null,
      actions: { canCreate: true },
    })
  );
  await f.page.load(true);
  assert.equal(f.modals.length, 1);
  assert.equal(
    f.calls.some((call) => call[0] === "createDevice"),
    false
  );
  assert.equal(f.page.data.context.state, "UNREGISTERED");
  assert.deepEqual(f.navigation, []);
});
test("confirmed missing-device registration preserves the QR type and leaves rental disabled", async () => {
  const f = fixture("root");
  f.ui.confirm = async (options) => {
    f.modals.push(options);
    return true;
  };
  f.setContext(
    Object.assign({}, f.context(), {
      state: "UNREGISTERED",
      device: null,
      pricing: null,
      actions: { canCreate: true },
    })
  );
  await f.page.load(true);
  assert.deepEqual(f.calls.find((call) => call[0] === "createDevice")[1], {
    uuid: UUID,
    type: "rokid",
  });
  assert.equal(f.page.data.context.state, "DISABLED");
  assert.equal(f.page.data.context.actions.canRent, false);
});
test("lookup failure never triggers creation and remains visible", async () => {
  const f = fixture("manager");
  f.api.context = async () => {
    throw new Error("无权限访问");
  };
  await f.page.load(true);
  assert.equal(f.page.data.error, "无权限访问");
  assert.equal(f.modals.length, 0);
  assert.equal(
    f.calls.some((call) => call[0] === "createDevice"),
    false
  );
});
test("device UUID and QR type remain available when backend login is not configured", async () => {
  const f = fixture("user");
  f.page.onLoad({ q: encodeURIComponent("https://c.4mr.cn/d?uuid=" + UUID + "&type=rokid") });
  f.page._active = true;
  f.session.login = async () => { throw new Error("租赁小程序尚未配置"); };
  await f.page.load(true);
  assert.equal(f.page.data.uuid, UUID);
  assert.equal(f.page.data.qrType, "rokid");
  assert.equal(f.page.data.context, null);
  assert.equal(f.page.data.loading, false);
  assert.equal(f.page.data.error, "租赁小程序尚未配置");
  assert.equal(f.calls.some((call) => call[0] === "context" || call[0] === "createDevice"), false);
});
test("admin ending requires explicit return confirmation and a reason, and locks the selected refund mode", async () => {
  const f = fixture("manager");
  f.setContext(
    Object.assign({}, f.context(), {
      state: "RENTED",
      relation: "other",
      rental: Object.assign({}, pendingRental, {
        status: "ACTIVE",
        mine: false,
        startedAt: "2026-11-13T00:00:00Z",
      }),
      actions: Object.assign({}, f.context().actions, {
        canRent: false,
        canEndRental: true,
      }),
    })
  );
  await f.page.load(true);
  f.page.openEnd();
  f.page.selectRefund({ currentTarget: { dataset: { mode: "full" } } });
  await f.page.confirmEnd();
  assert.equal(
    f.calls.some((call) => call[0] === "end"),
    false
  );
  f.page.reasonInput({ detail: { value: "设备已归还，取消使用" } });
  f.page.returnChanged({ detail: { value: ["returned"] } });
  await f.page.confirmEnd();
  const ended = f.calls.find((call) => call[0] === "end");
  assert.equal(ended[1], "rental-7");
  assert.equal(ended[2].refundMode, "full");
  assert.equal(ended[2].reason, "设备已归还，取消使用");
  assert.equal(
    Object.prototype.hasOwnProperty.call(ended[2], "refundAmountCents"),
    false
  );
  assert.equal(f.page.data.context.state, "SETTLING");
  assert.equal(f.page.data.showEnd, false);
});
test("closing the return sheet makes no refund request", async () => {
  const f = fixture("root");
  f.setContext(
    Object.assign({}, f.context(), {
      state: "RENTED",
      relation: "mine",
      rental: Object.assign({}, pendingRental, { status: "ACTIVE" }),
      actions: { canEndRental: true },
    })
  );
  await f.page.load(true);
  f.page.openEnd();
  f.page.closeEnd();
  assert.equal(f.page.data.showEnd, false);
  assert.equal(
    f.calls.some((call) => call[0] === "end"),
    false
  );
});
test("abnormal or closed refunds query the original refund after merchant handling without retrying", async () => {
  for (const refundStatus of ["ABNORMAL", "CLOSED"]) {
    const f = fixture("manager");
    f.setContext(
      Object.assign({}, f.context(), {
        state: "SETTLING",
        relation: "other",
        rental: Object.assign({}, pendingRental, {
          status: "ENDED",
          mine: false,
          refundStatus,
        }),
        actions: Object.assign({}, f.context().actions, {
          canRent: false,
          canEndRental: false,
        }),
      })
    );
    f.ui.confirm = async (options) => {
      f.modals.push(clean(options));
      return true;
    };
    await f.page.load(true);
    await f.page.queryAfterMerchantHandling();
    assert.equal(f.modals.length, 1);
    assert.match(f.modals[0].content, /先在微信支付商户平台处理/);
    assert.deepEqual(
      f.calls.filter((call) => call[0] === "syncRefund"),
      [["syncRefund", "rental-7"]]
    );
    assert.equal(
      f.calls.some((call) => call[0] === "retryRefund" || call[0] === "end"),
      false
    );
  }
});
test("a failed operation stays visible even after context is refreshed", async () => {
  const f = fixture("user");
  await f.page.load(true);
  f.api.createRental = async () => {
    throw new Error("设备已被其他用户租赁");
  };
  await f.page.rent();
  assert.equal(f.page.data.error, "设备已被其他用户租赁");
  assert.equal(f.page.data.busy, false);
});
test("leaving during context lookup prevents a creation prompt or later page mutation", async () => {
  const f = fixture("root"),
    pending = deferred();
  f.api.context = () => pending.promise;
  const loading = f.page.load(true);
  await Promise.resolve();
  f.page.onUnload();
  const state = clean(f.page.data);
  pending.resolve({
    state: "UNREGISTERED",
    device: null,
    actions: { canCreate: true },
  });
  await loading;
  assert.equal(f.modals.length, 0);
  assert.deepEqual(clean(f.page.data), state);
  assert.equal(f.timers.size, 0);
});
test("returning from native payment clears busy state and refreshes, without creating again", async () => {
  const f = fixture("user"),
    native = deferred();
  await f.page.load(true);
  f.payment.pay = () => native.promise;
  const paying = f.page.rent();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.page.data.busy, true);
  f.page.onHide();
  f.page.onShow();
  native.resolve({
    rental: Object.assign({}, pendingRental, { status: "ACTIVE" }),
  });
  await paying;
  assert.equal(f.page.data.busy, false);
  assert.equal(f.calls.filter((call) => call[0] === "createRental").length, 1);
});
test("fee configuration sends exact cents and original revision", async () => {
  const f = fixture("manager");
  await f.page.load(true);
  f.page.openConfig();
  f.page.feeInput({ detail: { value: "20.05" } });
  f.page.depositInput({ detail: { value: "200" } });
  await f.page.saveConfig();
  assert.deepEqual(f.calls.find((call) => call[0] === "configure").slice(1), [
    7,
    { enabled: true, useFeeCents: 2005, depositCents: 20000, version: 3 },
  ]);
});
test("a disabled payment environment cannot invoke rental payment", async () => {
  const f = fixture("user");
  f.setContext(Object.assign({}, f.context(), { paymentReady: false }));
  await f.page.load(true);
  await f.page.rent();
  assert.equal(
    f.calls.some((call) => call[0] === "createRental"),
    false
  );
});
test("invalid or unrelated QR is rejected before authentication or device APIs", async () => {
  const f = fixture("manager");
  f.page.onLoad({ q: encodeURIComponent("https://evil.example/d?uuid=other") });
  f.page.onShow();
  await Promise.resolve();
  assert.equal(f.calls.length, 0);
  assert.match(f.page.data.error, /二维码/);
});
