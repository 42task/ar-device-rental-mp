function money(value) {
  if (!Number.isSafeInteger(value) || value < 0) return "—";
  return (
    String(Math.floor(value / 100)) + "." + String(value % 100).padStart(2, "0")
  );
}
function cents(value) {
  if (
    typeof value !== "string" ||
    !/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim())
  )
    throw new Error("金额须为最多两位小数的非负数");
  const parts = value.trim().split(".");
  const amount =
    Number(parts[0]) * 100 + Number((parts[1] || "").padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 2147483647)
    throw new Error("金额超出允许范围");
  return amount;
}
function time(value) {
  if (!value) return "—";
  const stamp = new Date(value).getTime();
  if (!Number.isFinite(stamp)) return String(value);
  const date = new Date(stamp + 8 * 3600000),
    pad = (n) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear() +
    "-" +
    pad(date.getUTCMonth() + 1) +
    "-" +
    pad(date.getUTCDate()) +
    " " +
    pad(date.getUTCHours()) +
    ":" +
    pad(date.getUTCMinutes()) +
    ":" +
    pad(date.getUTCSeconds())
  );
}
function duration(start, end) {
  const seconds = Math.max(
    0,
    Math.floor(
      (new Date(end || Date.now()).getTime() - new Date(start).getTime()) / 1000
    )
  );
  if (!Number.isFinite(seconds)) return "—";
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  return (
    (hours ? hours + "小时 " : "") + minutes + "分 " + (seconds % 60) + "秒"
  );
}
function rentalLabel(value) {
  const status = value && value.status;
  if (
    value &&
    value.refundStatus &&
    value.refundStatus !== "SUCCESS" &&
    status !== "ACTIVE"
  )
    return ["ABNORMAL", "CLOSED"].indexOf(value.refundStatus) >= 0
      ? "退款待处理"
      : "退款处理中";
  return (
    {
      PENDING_PAYMENT: "待支付",
      ACTIVE: "租赁中",
      ENDED: "已结束",
      CANCELLED: "已取消",
      COMPENSATING: "退款处理中",
    }[status] || "处理中"
  );
}
function rental(value) {
  if (!value) return null;
  return Object.assign({}, value, {
    label: rentalLabel(value),
    useFeeText: money(value.useFeeCents),
    depositText: money(value.depositCents),
    totalText: money(value.totalCents),
    refundText: money(value.refundAmountCents || 0),
    startedText: time(value.startedAt),
    endedText: time(value.endedAt),
    createdText: time(value.createdAt),
    elapsed: value.startedAt ? duration(value.startedAt, value.endedAt) : "—",
  });
}
function key(prefix) {
  return (
    (prefix || "op") +
    "_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 14)
  );
}
function role(value) {
  return (
    { root: "平台管理员", manager: "设备管理员", user: "租赁用户" }[value] ||
    "租赁用户"
  );
}
module.exports = {
  money,
  cents,
  time,
  duration,
  rental,
  rentalLabel,
  key,
  role,
};
