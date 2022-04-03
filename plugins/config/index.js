const defaultsDeep = require("lodash.defaultsdeep")
const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

const ENV_DEV = "development"
const ENV_PROD = "production"

const createDefaultConfig = () => {
  const { env } = process

  const nodeEnv = env.NODE_ENV || ENV_DEV

  const isProd = nodeEnv === ENV_PROD
  const isDev = !isProd

  const defaultConfig = {
    nodeEnv,
    isDev,
    isProd,
    logger: {
      level: isDev ? "debug" : "info",
    },
  }

  return defaultConfig
}

module.exports.create = () => {
  const createConfig = ctx.get("customConfig") || (() => ({}))
  const config = createConfig()

  const defaultConfig = createDefaultConfig(config)

  return defaultsDeep(config, defaultConfig)
}

module.exports.ctx = ctx
