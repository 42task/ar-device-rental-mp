const session = require("./utils/session");
App({
  onLaunch() {
    session.load();
  },
  globalData: { name: "AR设备租赁" },
});
