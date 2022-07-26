const defaultsDeep = require("lodash.defaultsdeep")
const nctx = require("nctx")
const postgres = require("postgres")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

const defaultOptions = {
  max: 10,
  shutdownTimeout: 5,
}

module.exports.create = () => {
  const options = ctx.require("config.postgres")
  defaultsDeep(options, defaultOptions)

  const { dsn, shutdownTimeout, ...postgresOptions } = options

  let sql
  if (dsn) {
    sql = postgres(dsn, postgresOptions)
  } else {
    sql = postgres(postgresOptions)
  }

  const shutdownHandlers = ctx.require("shutdownHandlers")
  shutdownHandlers.push(async () => {
    await sql.end({ timeout: shutdownTimeout })
  })

  return sql
}

module.exports.dependencies = ["config", "shutdownHandlers"]

module.exports.ctx = ctx
