const waitOn = require("wait-on")
const nctx = require("nctx")
const Redis = require("ioredis")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports = async () => {
  const globalConfig = ctx.require("config")
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

  return redis
}

module.exports.dependencies = ["config"]

module.exports.ctx = ctx
