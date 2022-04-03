const expressMonitor = require("express-status-monitor")
const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports.create = () => {
  return expressMonitor({ path: "/" })
}

module.exports.ctx = ctx
