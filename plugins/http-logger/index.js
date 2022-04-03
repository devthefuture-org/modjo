const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports.create = () => {
  const logger = ctx.require("logger")
  return (req, res, next) => {
    const originalSend = res.send
    res.send = function (...args) {
      originalSend.apply(res, args)
      logger.info(`${req.method} ${req.url} ${res.statusCode}`)
    }
    next()
  }
}
module.exports.dependencies = ["logger"]

module.exports.ctx = ctx
