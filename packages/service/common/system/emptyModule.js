const emptyModule = new Proxy(function emptyModule() {}, {
  get() {
    return emptyModule;
  },
  apply() {
    return undefined;
  },
  construct() {
    return {};
  }
});

module.exports = emptyModule;
module.exports.default = emptyModule;
