const config = require("./config");
class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "ApiError";
    this.status = status || 0;
    this.code = code || "";
  }
}
function message(body, status) {
  if (body && typeof body.message === "string" && body.message.length < 300)
    return body.message;
  if (status === 401) return "登录已过期，请重新登录";
  if (status === 403) return "当前账号没有此操作权限";
  if (status === 404) return "租赁服务接口尚未部署或地址不正确";
  if (status === 409) return "设备状态已变化，请刷新后重试";
  if (status >= 500) return "服务暂时不可用，请稍后重试";
  return "请求未完成，请重试";
}
function networkError(error) {
  // Classify native diagnostics without retaining URLs or credentials.
  const detail =
    error && typeof error.errMsg === "string"
      ? error.errMsg.replace(/https?:\/\/\S+/gi, "")
      : "";
  if (/domain\s*(?:list|whitelist)|合法域名|域名.*白名单/i.test(detail))
    return new ApiError(
      "请求域名校验失败，请管理员检查服务器域名配置",
      0,
      "NETWORK_DOMAIN"
    );
  if (
    /ssl|tls|certificate|err_cert_|\bcert[_\s-]|证书|handshake|hand\s+shake|握手失败/i.test(
      detail
    )
  )
    return new ApiError(
      "安全连接失败，请管理员检查服务器证书",
      0,
      "NETWORK_TLS"
    );
  if (/timeout|timed[\s_]+out|超时/i.test(detail))
    return new ApiError("请求超时，请稍后重试", 0, "NETWORK_TIMEOUT");
  if (
    /dns|name_not_resolved|enotfound|eai_again|getaddrinfo|unknownhost|域名解析/i.test(
      detail
    )
  )
    return new ApiError(
      "域名解析失败，请切换网络后重试",
      0,
      "NETWORK_DNS"
    );
  return new ApiError(
    "网络连接失败，请检查网络后重新查询",
    0,
    "NETWORK_ERROR"
  );
}
function send(path, options) {
  const opts = options || {};
  if (typeof path !== "string" || path.charAt(0) !== "/" || /^\/\//.test(path))
    return Promise.reject(new ApiError("接口地址无效"));
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.API_BASE + path,
      method: opts.method || "GET",
      data: opts.data,
      timeout: config.REQUEST_TIMEOUT,
      header: Object.assign(
        { "Content-Type": "application/json" },
        opts.token ? { Authorization: "Bearer " + opts.token } : {}
      ),
      success(response) {
        const status = response.statusCode;
        if (status >= 200 && status < 300) resolve(response.data);
        else
          reject(
            new ApiError(
              message(response.data, status),
              status,
              response.data && response.data.code
            )
          );
      },
      fail(error) {
        reject(networkError(error));
      },
    });
  });
}
module.exports = { send, ApiError };
