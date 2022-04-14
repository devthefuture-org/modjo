const nctx = require("nctx")
const { createLightship } = require("lightship")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports.create = async () => {
  const lightship = await createLightship()

  const logger = ctx.require("logger")

  process.on("unhandledRejection", (reason, promise) => {
    logger.error({
      message: "Unhandled Rejection",
      promise,
      reason,
    })
    if (reason) {
      console.trace(reason)
    }
  })

  process.on("uncaughtException", async (err, origin) => {
    const msg = `Caught exception: ${err}\nException origin: ${origin}`
    logger.error(msg)
    const captureException = ctx.get("captureException")
    if (captureException) {
      captureException(msg)
    }
    lightship.shutdown()
    // eslint-disable-next-line no-process-exit
    process.exit(1)
  })

  return lightship
}

module.exports.dependencies = ["logger"]

module.exports.ready = (lightship) => {
  lightship.signalReady()
}

module.exports.ctx = ctx
