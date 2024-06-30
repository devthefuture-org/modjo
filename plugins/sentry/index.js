const nctx = require("nctx")

const Sentry = require("@sentry/node")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports.create = () => {
  const config = ctx.require("config")
  const options = config.sentry || {}

  const {
    dsn = process.env.SENTRY_DSN,
    environment = process.env.SENTRY_ENVIRONMENT,
  } = options

  if (!dsn) {
    return
  }

  Sentry.init({
    dsn,
    environment,
    ...options,
  })

  return Sentry
}

module.exports.dependencies = ["config"]

module.exports.ctx = ctx
