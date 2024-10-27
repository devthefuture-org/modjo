const nctx = require("nctx")

const pluginSymbol = Symbol(__dirname.split("/").pop())
const ctx = nctx.create(pluginSymbol)

module.exports = ctx
module.exports.pluginSymbol = pluginSymbol
