const waitOn = require("wait-on")
const nctx = require("nctx")
const Redis = require("ioredis")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports = async () => {
  const globalConfig = ctx.require("config")
  const logger = ctx.require("logger")
  const config = globalConfig.ioredis || globalConfig.redis

  const { username, password, db = 0 } = config
  // console.log("config", config)

  // Wait for Redis or sentinel to be available
  if (config.sentinel) {
    const { sentinels } = config.sentinel
    if (sentinels && sentinels.length > 0) {
      const sentinel = sentinels[0]
      await waitOn({
        resources: [`tcp:${sentinel.host}:${sentinel.port}`],
        timeout: 2 * 60 * 1000,
      })
    }
  } else {
    const { host, port } = config
    await waitOn({
      resources: [`tcp:${host}:${port}`],
      timeout: 2 * 60 * 1000,
    })
  }

  // Prepare Redis options based on configuration
  const redisOptions = config.sentinel
    ? (() => {
        // Extract sentinel configuration
        const {
          sentinels,
          name = "mymaster",
          sentinelPassword,
        } = config.sentinel

        // Configure Redis with sentinel options
        const options = {
          sentinels,
          name,
          password,
          db,
          sentinelPassword: sentinelPassword || password,
        }

        if (username) {
          options.username = username
        }

        return options
      })()
    : {
        host: config.host,
        port: config.port,
        username,
        password,
        db,
      }

  // Create Redis client with the appropriate options
  const redis = new Redis(redisOptions)

  await new Promise((resolve, reject) => {
    redis.on("connect", () => {
      const connectionInfo = config.sentinel
        ? { sentinel: true, name: config.sentinel.name, db }
        : { host: config.host, port: config.port, db }
      logger.debug(connectionInfo, "connected to redis successfully")
    })
    redis.on("error", (err) => {
      const connectionInfo = config.sentinel
        ? { sentinel: true, name: config.sentinel.name, db, error: err.message }
        : { host: config.host, port: config.port, db, error: err.message }
      logger.error(connectionInfo, "failed to connect to redis")
      reject(err)
    })
    redis.on("ready", () => {
      const connectionInfo = config.sentinel
        ? { sentinel: true, name: config.sentinel.name, db }
        : { host: config.host, port: config.port, db }
      logger.debug(connectionInfo, "redis client is ready")
      resolve(true)
    })
  })

  return redis
}

module.exports.dependencies = ["config", "logger"]

module.exports.ctx = ctx
