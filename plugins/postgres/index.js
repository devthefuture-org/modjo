const defaultsDeep = require("lodash.defaultsdeep")
const nctx = require("nctx")
const postgres = require("postgres")

const { trace } = require("@opentelemetry/api")

const tracingQueryHandler = require("./tracing")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

const defaultOptions = {
  max: 10,
  shutdownTimeout: 5,
  transform: { column: { to: postgres.fromCamel, from: postgres.toCamel } },
  tracing: {
    enabled: true,
    name: "postgres",
    serverName: "pg",
  },
}

module.exports.create = () => {
  const options = ctx.require("config.postgres")
  defaultsDeep(options, defaultOptions)

  const { dsn, shutdownTimeout, tracing, ...postgresOptions } = options

  if (tracing.enabled) {
    const tracer = trace.getTracer(tracing.name)
    postgresOptions.onquery = tracingQueryHandler(tracer, tracing.serverName)
  }

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
