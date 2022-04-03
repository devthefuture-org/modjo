const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports.create = () => {
  const lightship = ctx.require("lightship")

  const shutdownHandlers = []
  lightship.registerShutdownHandler(async () => {
    await Promise.all(shutdownHandlers.map((callback) => callback()))
  })

  return shutdownHandlers
}

module.exports.dependencies = ["lightship"]

module.exports.ctx = ctx
