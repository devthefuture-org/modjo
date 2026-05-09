// minimal local plugin used to exercise the NCC-bundled plugin resolution
const nctx = require("nctx")

const ctx = nctx.create(Symbol("dummy"))

module.exports.create = () => ({ kind: "dummy-instance" })
module.exports.dependencies = []
module.exports.ctx = ctx
