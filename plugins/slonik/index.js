const { createPool } = require("slonik")
const defaultsDeep = require("lodash.defaultsdeep")
const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

const defaultOptions = {
  pgURL: "postgres://",
  clientConfiguration: {
    // https://github.com/gajus/slonik#api
    maximumPoolSize: 10,
  },
}

module.exports.create = () => {
  const config = ctx.require("config")
  const options = {
    pgURL: config.pgURL,
    clientConfiguration: {
      maximumPoolSize: config.pgMaximumPoolSize,
    },
  }
  defaultsDeep(options, defaultOptions)
  const { pgURL, clientConfiguration } = options
  const pgPool = createPool(pgURL, clientConfiguration)

  const shutdownHandlers = ctx.require("shutdownHandlers")
  shutdownHandlers.push(async () => {
    await pgPool.end()
  })
  return pgPool
}

module.exports.dependencies = ["config", "shutdownHandlers"]

module.exports.ctx = ctx
