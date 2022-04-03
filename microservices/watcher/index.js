const nctx = require("nctx")
const { buildDirTree } = require("@modjo-plugins/core/libs/build")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports = async () => {
  const watcherFactory = require(`${process.cwd()}/build/watchers`)

  // prepare watchers, preflight
  const watchHandlers = await Promise.all(
    Object.values(watcherFactory).map((factory) => factory())
  )
  // run watchers
  watchHandlers.map((handler) => handler())

  const watcherKeys = Object.keys(watcherFactory)
  ctx.set("watcherKeys", watcherKeys)
}

module.exports.dependencies = ["logger", "amqp", "apolloClient"]

module.exports.ready = () => {
  const logger = ctx.require("logger")
  const watcherKeys = ctx.require("watcherKeys")
  logger.info(`🚀 Overwatch follow up: ${watcherKeys.join(",")}`)
}

module.exports.build = () => {
  buildDirTree([
    {
      dir: "watchers",
      pattern: /^(.*)\.(js|yaml|yml)$/,
    },
  ])
}

module.exports.ctx = ctx
