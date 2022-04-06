const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports.dependencies = [
  "express",
  "oa",
  "expressMonitor",
  "logger",
  "config",
  "httpServer",
]

module.exports.ready = () => {
  const logger = ctx.require("logger")
  const config = ctx.require("config")

  const { serviceName = "server" } = config.microserviceOapi || {}

  const { host = "0.0.0.0", port = 3000 } = config.httpServer || {}

  logger.info(`🚀 ${serviceName} ready at http://${host}:${port}`)
}

module.exports.ctx = ctx
