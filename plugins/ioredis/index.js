const waitOn = require("wait-on")
const nctx = require("nctx")
const Redis = require("ioredis")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports = async () => {
  const config = ctx.require("config")

  const {
    host,
    port,
    username,
    password,
    db = 0,
  } = config.ioredis || config.redis

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
