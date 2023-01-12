const nctx = require("nctx")

const Sentry = require("@sentry/node")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports.create = () => {
  const config = ctx.require("config")
  const options = config.sentry || {}

  const { dsn = process.env.SENTRY_DSN } = options

  if (!dsn) {
    return
  }

  Sentry.init({
    dsn,
    ...options,
  })

  return Sentry
}

module.exports.dependencies = ["config"]

module.exports.ctx = ctx
