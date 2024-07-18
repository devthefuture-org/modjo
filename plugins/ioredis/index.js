const waitOn = require("wait-on")
const nctx = require("nctx")
const Redis = require("ioredis")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports = async () => {
  const globalConfig = ctx.require("config")
  const logger = ctx.require("logger")
  const config = globalConfig.ioredis || globalConfig.redis

  const { host, port, username, password, db = 0 } = config

  // console.log("config", config)

  await waitOn({
    resources: [`tcp:${host}:${port}`],
    timeout: 2 * 60 * 1000,
  })

  const redis = new Redis({
    host,
    port,
    username,
    password,
    db,
  })

  redis.on("connect", () => {
    logger.debug({ host, port, db }, "connected to redis successfully")
  })
  redis.on("error", (err) => {
    logger.error(
      {
        error: err.message,
        host,
        port,
        db,
      },
      "failed to connect to redis"
    )
  })
  redis.on("ready", () => {
    logger.debug({ host, port, db }, "redis client is ready")
  })

  return redis
}

module.exports.dependencies = ["config", "logger"]

module.exports.ctx = ctx
