const ERROR = "请扫描有效的 AR 设备二维码";
function decode(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch (_) {
    throw new Error(ERROR);
  }
}
function identifier(value, max) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Array.from(value).length <= max &&
    !/\s/.test(value) &&
    Array.from(value).every(
      (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127
    )
  );
}
function deviceType(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    Array.from(value).length <= 32 &&
    Array.from(value).every(
      (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127
    )
  );
}
function parse(value) {
  if (typeof value !== "string") throw new Error(ERROR);
  const match = /^https?:\/\/c\.4mr\.cn\/d\?([^\s#]*)(?:#[^\s]*)?$/i.exec(
    value
  );
  if (!match || match[0] !== value) throw new Error(ERROR);
  let uuid, type;
  match[1].split("&").forEach((field) => {
    const index = field.indexOf("=");
    const key = decode(index < 0 ? field : field.slice(0, index));
    const val = decode(index < 0 ? "" : field.slice(index + 1));
    if (key === "uuid") {
      if (uuid !== undefined) throw new Error(ERROR);
      uuid = val;
    }
    if (key === "type") {
      if (type !== undefined) throw new Error(ERROR);
      type = val;
    }
  });
  if (!identifier(uuid, 255) || (type !== undefined && !deviceType(type)))
    throw new Error(ERROR);
  return type === undefined ? { uuid } : { uuid, type };
}
function build(value) {
  if (
    !value ||
    !identifier(value.uuid, 255) ||
    (value.type !== undefined && !deviceType(value.type))
  )
    throw new Error(ERROR);
  return (
    "https://c.4mr.cn/d?uuid=" +
    encodeURIComponent(value.uuid) +
    (value.type === undefined ? "" : "&type=" + encodeURIComponent(value.type))
  );
}
function entry(options) {
  if (!options || typeof options.q !== "string" || !options.q)
    throw new Error(ERROR);
  let value;
  try {
    value = /^https?:\/\//i.test(options.q) ? options.q : decodeURIComponent(options.q);
  } catch (_) {
    throw new Error(ERROR);
  }
  return parse(value);
}
function pageUrl(value) {
  return "/pages/device/scan?q=" + encodeURIComponent(build(value));
}
function scan() {
  return new Promise((resolve, reject) =>
    wx.scanCode({
      scanType: ["qrCode"],
      success(result) {
        try {
          resolve(parse(result.result));
        } catch (error) {
          reject(error);
        }
      },
      fail(error) {
        if (error.errMsg && error.errMsg.indexOf("cancel") !== -1)
          resolve(null);
        else reject(new Error("扫码失败，请重试"));
      },
    })
  );
}
module.exports = { parse, build, entry, pageUrl, scan };
