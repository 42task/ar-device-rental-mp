const session = require("./session");
const transport = require("./transport");
async function request(path, options) {
  const opts = options || {};
  const identity = await session.login(false);
  try {
    return await transport.send(
      path,
      Object.assign({}, opts, { token: identity.token.accessToken })
    );
  } catch (error) {
    if (error.status !== 401) throw error;
    const current = session.load();
    const refreshed =
      current && current.token.accessToken !== identity.token.accessToken
        ? current
        : await session.refresh();
    return transport.send(
      path,
      Object.assign({}, opts, { token: refreshed.token.accessToken })
    );
  }
}
function query(values) {
  return Object.keys(values || {})
    .filter(
      (key) =>
        values[key] !== undefined && values[key] !== null && values[key] !== ""
    )
    .map(
      (key) =>
        encodeURIComponent(key) + "=" + encodeURIComponent(String(values[key]))
    )
    .join("&");
}
function get(path, values) {
  const params = query(values);
  return request(path + (params ? "?" + params : ""));
}
function post(path, data) {
  return request(path, { method: "POST", data: data || {} });
}
function patch(path, data) {
  return request(path, { method: "PATCH", data });
}
module.exports = { request, get, post, patch, query };
