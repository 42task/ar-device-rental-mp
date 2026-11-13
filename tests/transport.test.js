const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers");

function setup(result) {
  return loadModule("utils/transport.js", null, {
    request(options) {
      if (Object.prototype.hasOwnProperty.call(result, "failure"))
        options.fail(result.failure);
      else options.success({ statusCode: result.status, data: result.data });
    },
  });
}

const failures = [
  {
    code: "NETWORK_DOMAIN",
    message: "请求域名校验失败，请管理员检查服务器域名配置",
    diagnostics: [
      "request:fail url not in domain list",
      "request:fail 不在 request 合法域名列表中",
      "request:fail DOMAIN WHITELIST check failed",
    ],
  },
  {
    code: "NETWORK_TLS",
    message: "安全连接失败，请管理员检查服务器证书",
    diagnostics: [
      "request:fail ssl hand shake error",
      "request:fail SSLHandshakeException: handshake timed out",
      "request:fail TLS connection error",
      "request:fail net::ERR_CERT_DATE_INVALID",
      "request:fail certificate hostname mismatch",
      "request:fail 服务器证书错误",
    ],
  },
  {
    code: "NETWORK_TIMEOUT",
    message: "请求超时，请稍后重试",
    diagnostics: [
      "request:fail timeout",
      "request:fail connection timed out",
      "request:fail net::ERR_CONNECTION_TIMED_OUT",
      "request:fail 请求超时",
    ],
  },
  {
    code: "NETWORK_DNS",
    message: "域名解析失败，请切换网络后重试",
    diagnostics: [
      "request:fail DNS lookup failed",
      "request:fail net::ERR_NAME_NOT_RESOLVED",
      "request:fail getaddrinfo ENOTFOUND",
      "request:fail EAI_AGAIN",
      "request:fail UnknownHostException",
      "request:fail 域名解析失败",
    ],
  },
  {
    code: "NETWORK_ERROR",
    message: "网络连接失败，请检查网络后重新查询",
    diagnostics: [
      "request:fail net::ERR_CONNECTION_RESET",
      "request:fail network disconnected",
    ],
  },
];

for (const category of failures) {
  test("native request failures classify as " + category.code, async () => {
    for (const diagnostic of category.diagnostics) {
      const transport = setup({ failure: { errMsg: diagnostic } });
      await assert.rejects(transport.send("/rental/auth/login"), (error) => {
        assert.ok(error instanceof transport.ApiError);
        assert.equal(error.status, 0);
        assert.equal(error.code, category.code, diagnostic);
        assert.equal(error.message, category.message);
        return true;
      });
    }
  });
}

test("native errors never expose sensitive diagnostics, request headers, or data", async () => {
  for (const category of failures) {
    const transport = setup({
      failure: {
        errMsg:
          category.diagnostics[0] +
          " https://d.4mr.cn/api/v2/rental/auth/login?code=secret-login-code&token=secret-query-token Authorization: Bearer secret-native-token",
        token: "secret-native-field",
      },
    });
    await assert.rejects(
      transport.send("/rental/auth/login?code=secret-url-code", {
        method: "POST",
        token: "secret-header-token",
        data: { code: "secret-body-code" },
      }),
      (error) => {
        assert.equal(error.code, category.code);
        assert.equal(error.message, category.message);
        const exposed = String(error) + JSON.stringify(error);
        assert.doesNotMatch(exposed, /secret|https?:|Authorization|Bearer|errMsg/);
        assert.deepEqual(Object.keys(error).sort(), ["code", "name", "status"]);
        return true;
      }
    );
  }
});

test("missing diagnostics and keywords only inside URLs remain generic failures", async () => {
  for (const failure of [
    undefined,
    null,
    {},
    { errMsg: 123 },
    { errMsg: "request:fail https://c.4mr.cn/d?token=ssl&code=timeout" },
  ]) {
    const transport = setup({ failure });
    await assert.rejects(transport.send("/rentals"), {
      status: 0,
      code: "NETWORK_ERROR",
      message: "网络连接失败，请检查网络后重新查询",
    });
  }
});

test("HTTP 404 and 503 retain HTTP status and server messages", async () => {
  for (const response of [
    {
      status: 404,
      data: "Not Found",
      expected: "租赁服务接口尚未部署或地址不正确",
      code: "",
    },
    {
      status: 503,
      data: {},
      expected: "服务暂时不可用，请稍后重试",
      code: "",
    },
    {
      status: 404,
      data: { message: "租赁接口暂未启用", code: "ROUTE_DISABLED" },
      expected: "租赁接口暂未启用",
      code: "ROUTE_DISABLED",
    },
    {
      status: 503,
      data: { message: "小程序登录尚未配置", code: "AUTH_NOT_CONFIGURED" },
      expected: "小程序登录尚未配置",
      code: "AUTH_NOT_CONFIGURED",
    },
  ]) {
    const transport = setup(response);
    await assert.rejects(transport.send("/rental/auth/login"), {
      status: response.status,
      code: response.code,
      message: response.expected,
    });
  }
});
