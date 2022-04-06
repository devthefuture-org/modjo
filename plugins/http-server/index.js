const http = require("http")
const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports = async () => {
  const config = ctx.require("config")

  const {
    host = "0.0.0.0",
    port = 3000,
    ...httpServerOptions
  } = config.httpServer || {}

  const httpServer = http.createServer(httpServerOptions)

  const logger = ctx.require("logger")
  const lightship = ctx.require("lightship")

  httpServer
    .on("listening", function () {
      logger.trace(`server listening on ${host}:${port}`)
    })
    .on("error", () => {
      lightship.shutdown()
    })

  const shutdownHandlers = ctx.require("shutdownHandlers")
  shutdownHandlers.push(() => {
    httpServer.close()
  })

  const isReady = new Promise((res) => {
    httpServer.on("listening", () => {
      res()
    })
  })

  const start = () => {
    httpServer.listen(port, host)
  }

  httpServer.isReady = isReady
  httpServer.start = start

  return httpServer
}

module.exports.dependencies = [
  "config",
  "logger",
  "lightship",
  "shutdownHandlers",
]

module.exports.ctx = ctx
