const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage } = require("./helpers");
const qr = require("../utils/qr");

test("the configured ordinary-link entry preserves encoded UUID and type into the rental page", () => {
  const redirects = [];
  const { page } = loadPage("pages/device/index.js", {}, {
    redirectTo(options) { redirects.push(options); },
  });
  const source = "https://c.4mr.cn/d?uuid=device%252F%2B01&type=AR%20glasses";
  page.onLoad({ q: encodeURIComponent(source) });
  assert.equal(page.data.uuid, "device%2F+01");
  assert.equal(page.data.type, "AR glasses");
  assert.equal(redirects.length, 1);
  const [path, query] = redirects[0].url.split("?");
  assert.equal(path, "/pages/device/scan");
  const q = new URLSearchParams(query).get("q");
  assert.deepEqual(qr.parse(q), { uuid: "device%2F+01", type: "AR glasses" });
});

test("invalid ordinary-link entry never redirects", () => {
  const redirects = [];
  const { page } = loadPage("pages/device/index.js", {}, {
    redirectTo(options) { redirects.push(options); },
  });
  page.onLoad({ q: encodeURIComponent("https://c.4mr.cn.evil.example/d?uuid=x") });
  assert.equal(redirects.length, 0);
  assert.equal(page.data.uuid, "");
  assert.match(page.data.error, /二维码/);
});

test("a failed redirect keeps the device UUID and supports retrying the same device", () => {
  const redirects = [];
  const { page } = loadPage("pages/device/index.js", {}, {
    redirectTo(options) { redirects.push(options); },
  });
  page.onLoad({ q: encodeURIComponent("https://c.4mr.cn/d?uuid=test-device") });
  redirects[0].fail();
  assert.equal(page.data.uuid, "test-device");
  assert.match(page.data.error, /重试/);
  page.openDevice();
  assert.equal(redirects.length, 2);
  assert.equal(redirects[1].url, redirects[0].url);
});
