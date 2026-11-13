const request = require("./request");
module.exports = {
  context: (uuid) => request.get("/rental/devices/context", { uuid }),
  orders: (params) => request.get("/rentals", params),
  detail: (id) => request.get("/rentals/" + encodeURIComponent(id)),
  createRental: (data) => request.post("/rentals", data),
  payment: (id) =>
    request.post("/rentals/" + encodeURIComponent(id) + "/payment"),
  syncPayment: (id) =>
    request.post("/rentals/" + encodeURIComponent(id) + "/sync-payment"),
  cancel: (id) =>
    request.post("/rentals/" + encodeURIComponent(id) + "/cancel"),
  end: (id, data) =>
    request.post("/rentals/" + encodeURIComponent(id) + "/end", data),
  syncRefund: (id) =>
    request.post("/rentals/" + encodeURIComponent(id) + "/sync-refund"),
  retryRefund: (id) =>
    request.post("/rentals/" + encodeURIComponent(id) + "/retry-refund"),
  createDevice: (data) => request.post("/rental/devices", data),
  devices: (params) => request.get("/rental/admin/devices", params),
  configure: (id, data) =>
    request.patch(
      "/rental/devices/" + encodeURIComponent(id) + "/config",
      data
    ),
  users: (params) => request.get("/rental/admin/users", params),
  userRole: (id, role) =>
    request.request("/rental/admin/users/" + encodeURIComponent(id) + "/role", {
      method: "PUT",
      data: { role },
    }),
};
