const test = require("node:test");
const assert = require("node:assert/strict");
const { clearModules } = require("./helpers");
const config = require("../utils/config");
const APPID = config.APP_ID;
const identity = (token) => ({
  appId: APPID,
  user: { id: 7, role: "user" },
  openid: "new-app-openid",
  token: {
    accessToken: token,
    refreshToken: "refresh-token",
    expires: "2099-01-01T00:00:00Z",
  },
});
function setup(transport, saved) {
  clearModules();
  const storage = new Map(
      saved ? [[config.SESSION_KEY, saved]] : []
    ),
    calls = [];
  let logins = 0;
  global.wx = {
    getAccountInfoSync: () => ({ miniProgram: { appId: APPID } }),
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    login(options) {
      logins++;
      queueMicrotask(() => options.success({ code: "new-code" }));
    },
    request(options) {
      calls.push(options);
      queueMicrotask(() => {
        const result = transport(options);
        result.fail
          ? options.fail({ errMsg: "network failure" })
          : options.success({
              statusCode: result.status || 200,
              data: result.data,
            });
      });
    },
  };
  return {
    request: require("../utils/request"),
    session: require("../utils/session"),
    calls,
    logins: () => logins,
    storage,
  };
}
test("new application login and concurrent requests share one login and scoped bearer", async () => {
  const f = setup((options) =>
    options.url.endsWith("/auth/login")
      ? { data: { success: true, data: identity("new-token") } }
      : { data: { ok: true } }
  );
  await Promise.all([
    f.request.get("/rentals"),
    f.request.get("/rental/devices/context", { uuid: "camera+1" }),
  ]);
  assert.ok(
    f.calls.every((call) => call.url.startsWith("https://d.4mr.cn/api/v2/"))
  );
  assert.equal(f.logins(), 1);
  assert.equal(
    f.calls.filter((call) => call.url.endsWith("/auth/login")).length,
    1
  );
  const business = f.calls.filter((call) => !call.url.endsWith("/auth/login"));
  assert.ok(
    business.every((call) => call.header.Authorization === "Bearer new-token")
  );
  assert.ok(business.some((call) => call.url.endsWith("?uuid=camera%2B1")));
});
test("legacy backend cache requires a fresh WeChat login and cannot carry its role or token", async () => {
  const f = setup((options) =>
    options.url.endsWith("/auth/login")
      ? { data: { success: true, data: identity("fresh-d-backend-token") } }
      : { data: { ok: true } }
  );
  const legacy = Object.assign(identity("legacy-backend-token"), {
    user: { id: 99, role: "root" },
    openid: "legacy-backend-openid",
  });
  f.storage.set("AR_DEVICE_RENTAL_SESSION_V1", legacy);
  assert.equal(f.session.load(), null);

  await f.request.get("/rentals");

  assert.equal(f.logins(), 1);
  assert.equal(f.calls.length, 2);
  assert.equal(
    f.calls[0].url,
    "https://d.4mr.cn/api/v2/rental/auth/login"
  );
  assert.equal(f.calls[0].method, "POST");
  assert.deepEqual(f.calls[0].data, { code: "new-code" });
  assert.equal(f.calls[0].header.Authorization, undefined);
  assert.equal(f.calls[1].url, "https://d.4mr.cn/api/v2/rentals");
  assert.equal(
    f.calls[1].header.Authorization,
    "Bearer fresh-d-backend-token"
  );
  assert.deepEqual(f.session.load(), identity("fresh-d-backend-token"));
  assert.deepEqual(
    f.storage.get(config.SESSION_KEY),
    identity("fresh-d-backend-token")
  );
  assert.equal(f.session.isManager(f.session.load()), false);
});
test("concurrent expired requests share refresh and preserve write idempotency payload", async () => {
  const f = setup((options) => {
    if (options.url.endsWith("/auth/refresh"))
      return { data: { success: true, data: identity("new-token") } };
    return options.header.Authorization === "Bearer old-token"
      ? { status: 401, data: {} }
      : { data: { ok: true } };
  }, identity("old-token"));
  const body = { deviceId: 7, priceVersion: 1, idempotencyKey: "same-key" };
  await Promise.all([
    f.request.post("/rentals", body),
    f.request.get("/rentals"),
  ]);
  assert.equal(
    f.calls.filter((call) => call.url.endsWith("/auth/refresh")).length,
    1
  );
  assert.equal(f.logins(), 0);
  const writes = f.calls.filter(
    (call) => call.method === "POST" && call.url.endsWith("/rentals")
  );
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].data, body);
  assert.deepEqual(writes[1].data, body);
});
test("all concurrent refresh callers share fallback wx login after refresh fails", async () => {
  const f = setup((options) => {
    if (options.url.endsWith("/auth/refresh")) return { status: 401, data: {} };
    if (options.url.endsWith("/auth/login"))
      return { data: { success: true, data: identity("recovered-token") } };
    return options.header.Authorization === "Bearer old-token"
      ? { status: 401, data: {} }
      : { data: { ok: true } };
  }, identity("old-token"));
  await Promise.all([
    f.request.get("/rentals"),
    f.request.get("/rental/devices/context"),
    f.request.post("/rentals", { idempotencyKey: "retry-once" }),
  ]);
  assert.equal(
    f.calls.filter((call) => call.url.endsWith("/auth/refresh")).length,
    1
  );
  assert.equal(f.logins(), 1);
  assert.equal(
    f.calls.filter((call) => call.url.endsWith("/auth/login")).length,
    1
  );
});
test("network failure and forbidden requests never automatically replay writes", async () => {
  for (const result of [
    { fail: true },
    { status: 403, data: { message: "权限已撤销" } },
  ]) {
    const f = setup(() => result, identity("valid-token"));
    await assert.rejects(
      f.request.post("/rentals/7/end", {
        refundMode: "full",
        idempotencyKey: "settle-key",
      })
    );
    assert.equal(f.calls.length, 1);
    assert.equal(f.logins(), 0);
  }
});
test("wrong application identity is rejected rather than cached", async () => {
  const f = setup(() => ({
    data: {
      success: true,
      data: Object.assign(identity("wrong-token"), {
        appId: "wxffffffffffffffff",
      }),
    },
  }));
  await assert.rejects(f.session.login(true), /登录应用不匹配/);
  assert.equal(f.storage.has(config.SESSION_KEY), false);
});
