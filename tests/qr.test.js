const test = require("node:test");
const assert = require("node:assert/strict");
const qr = require("../utils/qr");
const format = require("../utils/format");
test("device identity survives WeChat q encoding and navigation without losing type", () => {
  for (const value of [
    { uuid: "550e8400-e29b-41d4-a716-446655440000", type: "rokid" },
    { uuid: "camera%2F+01", type: "AR glasses" },
    { uuid: "camera_01" },
  ]) {
    const built = qr.build(value);
    assert.deepEqual(qr.parse(built), value);
    assert.deepEqual(qr.entry({ q: encodeURIComponent(built) }), value);
    assert.equal(
      qr.pageUrl(value),
      "/pages/device/scan?q=" + encodeURIComponent(built)
    );
  }
});
test("the c.4mr.cn rule preserves special characters for raw and encoded WeChat entry URLs", () => {
  const url = "https://c.4mr.cn/d?uuid=camera%252F%2B01&type=AR%20glasses";
  const identity = { uuid: "camera%2F+01", type: "AR glasses" };
  assert.deepEqual(qr.parse(url), identity);
  assert.deepEqual(qr.entry({ q: encodeURIComponent(url) }), identity);
  assert.deepEqual(qr.entry({ q: url }), identity);
  assert.equal(qr.build(identity), url);
});
test("strict device URL host, path, query decoding and duplicate parameters", () => {
  const bad = [
    "",
    "R0123456789abcdef0123456789abcdef",
    "https://w.4mr.cn/d?uuid=x",
    "https://c.4mr.cn/t?k=x&v=1",
    "https://c.4mr.cn.evil.example/d?uuid=x",
    "https://c.4mr.cn@evil.example/d?uuid=x",
    "https://evil.example/?next=https://c.4mr.cn/d?uuid=x",
    "https://c.4mr.cn/d/extra?uuid=x",
    "ftp://c.4mr.cn/d?uuid=x",
    "https://c.4mr.cn/d?uuid=",
    "https://c.4mr.cn/d?uuid=x&uuid=x",
    "https://c.4mr.cn/d?uuid=x&%75uid=y",
    "https://c.4mr.cn/d?uuid=x&type=ios&type=rokid",
    "https://c.4mr.cn/d?uuid=x&type=",
    "https://c.4mr.cn/d?uuid=x&type=%20rokid",
    "https://c.4mr.cn/d?uuid=x%00",
    "https://c.4mr.cn/d?uuid=x&source=%",
    "https://c.4mr.cn/d?uuid=x\n",
  ];
  for (const value of bad)
    assert.throws(() => qr.parse(value), /二维码/, value);
  assert.throws(() => qr.entry({ q: "%" }), /二维码/);
  assert.deepEqual(
    qr.parse("http://c.4mr.cn/d?type=rokid&%75uid=camera#device"),
    { uuid: "camera", type: "rokid" }
  );
});
test("money uses exact integer cents and rejects invalid inputs", () => {
  assert.equal(format.cents("0.01"), 1);
  assert.equal(format.cents("20.3"), 2030);
  assert.equal(format.cents("200"), 20000);
  assert.equal(format.money(20001), "200.01");
  assert.equal(format.money(0), "0.00");
  for (const value of ["-1", "1e2", "NaN", "1.001", "", "Infinity"])
    assert.throws(() => format.cents(value));
});
test("display time is explicitly Beijing and ended duration stops changing", () => {
  assert.equal(format.time("2026-11-13T00:00:00Z"), "2026-11-13 08:00:00");
  assert.equal(
    format.duration("2026-11-13T00:00:00Z", "2026-11-13T01:01:02Z"),
    "1小时 1分 2秒"
  );
});
