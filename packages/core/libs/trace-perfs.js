const timeLogger = require("../utils/debug/time-logger")

const displayMemoryUsage = require("../utils/debug/memory-usage")

const elapsedTotal = timeLogger()

const ctx = require("../ctx")

module.exports = function tracePerformances() {
  const logger = ctx.get("logger") || console
  const logLevel = "debug"
  elapsedTotal.end({
    label: "modjo total bootstrap",
    logger,
    logLevel,
  })
  logger[logLevel](displayMemoryUsage())
}
