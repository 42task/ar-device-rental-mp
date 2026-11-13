const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const project = JSON.parse(
  fs.readFileSync(path.join(root, "project.config.json"), "utf8")
);
const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
const config = require("../utils/config");
if (project.appid !== "wx03dbf50c15cac06f" || config.APP_ID !== project.appid)
  throw new Error(
    "上传目标必须是“AR设备租赁” wx03dbf50c15cac06f，禁止使用其他 AppID。"
  );
if (
  project.projectname !== "AR设备租赁" ||
  project.compileType !== "miniprogram" ||
  project.setting.urlCheck !== true
)
  throw new Error("上传目标或安全配置不正确。");
if (!app.pages.includes("pages/device/scan") || !app.pages.includes("pages/device/index"))
  throw new Error("设备扫码入口未注册。");
for (const page of app.pages)
  for (const extension of ["js", "json", "wxml", "wxss"]) {
    if (!fs.existsSync(path.join(root, page + "." + extension)))
      throw new Error("缺少页面文件：" + page + "." + extension);
  }
if (
  !fs
    .readFileSync(path.join(root, "utils/config.js"), "utf8")
    .includes("https://c.4mr.cn/api/v2")
)
  throw new Error("后端入口配置不正确。");
console.log(
  "已验证 AR设备租赁：" +
    project.appid +
    "，" +
    app.pages.length +
    " 个原生微信小程序页面，可交由开发者工具上传。"
);
