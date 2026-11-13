const config = require("./config");
const transport = require("./transport");
let cached = null;
let pending = null;
function valid(value) {
  return !!(
    value &&
    value.token &&
    typeof value.token.accessToken === "string" &&
    value.token.accessToken &&
    value.user &&
    Number.isSafeInteger(value.user.id) &&
    value.user.id > 0 &&
    ["user", "manager", "root"].indexOf(value.user.role) !== -1 &&
    typeof value.appId === "string"
  );
}
function runtimeAppId() {
  try {
    return wx.getAccountInfoSync().miniProgram.appId || config.APP_ID;
  } catch (_) {
    return config.APP_ID;
  }
}
function load() {
  if (cached) return cached;
  try {
    const stored = wx.getStorageSync(config.SESSION_KEY);
    if (
      valid(stored) &&
      runtimeAppId() === config.APP_ID &&
      stored.appId === config.APP_ID
    )
      cached = stored;
  } catch (_) {
    cached = null;
  }
  return cached;
}
function save(value) {
  if (!valid(value)) throw new Error("登录响应无效，请重试");
  const appId = runtimeAppId();
  if (appId !== config.APP_ID || value.appId !== config.APP_ID)
    throw new Error("登录应用不匹配，请联系管理员");
  cached = value;
  wx.setStorageSync(config.SESSION_KEY, value);
  return value;
}
function clear() {
  cached = null;
  try {
    wx.removeStorageSync(config.SESSION_KEY);
  } catch (_) {}
}
function performLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        result.code
          ? resolve(result.code)
          : reject(new Error("微信登录失败，请重试"));
      },
      fail() {
        reject(new Error("微信登录失败，请重试"));
      },
    });
  })
    .then((code) =>
      transport.send("/rental/auth/login", { method: "POST", data: { code } })
    )
    .then((result) => {
      if (!result || result.success !== true)
        throw new Error("登录失败，请重试");
      return save(result.data);
    });
}
function login(force) {
  if (pending) return pending;
  const existing = load();
  if (!force && existing) return Promise.resolve(existing);
  pending = performLogin()
    .catch((error) => {
      clear();
      throw error;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
function refresh() {
  if (pending) return pending;
  const current = load();
  if (!current || !current.token.refreshToken) return login(true);
  pending = transport
    .send("/rental/auth/refresh", {
      method: "POST",
      data: { refreshToken: current.token.refreshToken },
    })
    .then((result) => {
      if (!result || result.success !== true) throw new Error("登录已过期");
      return save(result.data);
    })
    .catch(() => {
      clear();
      return performLogin();
    })
    .catch((error) => {
      clear();
      throw error;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
function isManager(identity) {
  return !!(
    identity &&
    identity.user &&
    ["manager", "root"].indexOf(identity.user.role) !== -1
  );
}
module.exports = { load, login, refresh, clear, isManager, runtimeAppId };
