const nctx = require("nctx")

const ctx = nctx.create(Symbol("another"))

module.exports.create = () => ({ kind: "another-instance" })
module.exports.dependencies = ["dummy"]
module.exports.ctx = ctx
