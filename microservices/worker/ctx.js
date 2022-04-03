const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

const taskCtx = nctx.create(Symbol("worker.task"))

module.exports = { ctx, taskCtx }
