const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "..");
function clearModules() {
  Object.keys(require.cache)
    .filter(
      (filename) =>
        filename.startsWith(root + path.sep) &&
        filename.indexOf(path.sep + "tests" + path.sep) === -1
    )
    .forEach((filename) => {
      delete require.cache[filename];
    });
}
function loadPage(relative, modules, wx) {
  const filename = path.join(root, relative);
  const nativeRequire = createRequire(filename);
  let definition;
  const timers = new Map();
  let nextTimer = 0;
  const context = {
    Page(value) {
      definition = value;
    },
    wx: wx || {},
    require(name) {
      if (modules && Object.prototype.hasOwnProperty.call(modules, name))
        return modules[name];
      return nativeRequire(name);
    },
    setTimeout(fn) {
      const id = ++nextTimer;
      timers.set(id, fn);
      return id;
    },
    setInterval(fn) {
      const id = ++nextTimer;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    clearInterval(id) {
      timers.delete(id);
    },
    Date,
    Promise,
    Number,
    Array,
    Object,
    String,
    Math,
    Error,
    encodeURIComponent,
    decodeURIComponent,
  };
  new vm.Script(fs.readFileSync(filename, "utf8"), {
    filename,
  }).runInNewContext(context);
  const page = Object.assign({}, definition, {
    data: structuredClone(definition.data),
    setData(values) {
      this.data = Object.assign({}, this.data, values);
    },
  });
  return { page, timers };
}
function loadModule(relative, modules, wx) {
  const filename = path.join(root, relative),
    nativeRequire = createRequire(filename),
    module = { exports: {} };
  new vm.Script(
    "(function(require,module,exports,wx){" +
      fs.readFileSync(filename, "utf8") +
      "\n})",
    { filename }
  ).runInThisContext()(
    (name) =>
      modules && Object.prototype.hasOwnProperty.call(modules, name)
        ? modules[name]
        : nativeRequire(name),
    module,
    module.exports,
    wx || global.wx
  );
  return module.exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
module.exports = { root, clearModules, loadPage, loadModule, deferred };
