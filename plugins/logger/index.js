const pretty = require("pino-pretty")
const pino = require("pino")
const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports.create = () => {
  const config = ctx.require("config")

  const { isDev } = config

  const {
    level = isDev ? "debug" : "info",
    enableGlobal = true,
    pretty: enablePretty = isDev,
    timestamp = isDev,
    base = {},
    extraPinoConfig = {},
  } = config.logger || {}

  const stream = pretty({
    colorize: true,
    translateTime: "yyyy-mm-dd HH:MM:ss",
    ignore: "pid,hostname",
  })
  const logger = pino(
    {
      level,
      timestamp,
      base,
      ...extraPinoConfig,
      formatters: {
        level: (label) => {
          return { level: label.toUpperCase() }
        },
        ...(extraPinoConfig.formatters || {}),
      },
    },
    enablePretty ? stream : null
  )

  if (enableGlobal) {
    const log = (...args) => {
      if (args.length === 1) {
        ;[args] = args
      }
      logger.debug(args)
    }
    Object.assign(log, logger)
    Object.setPrototypeOf(log, Object.getPrototypeOf(logger))
    global.log = log
  }

  return logger
}

module.exports.dependencies = ["config"]

module.exports.ctx = ctx
