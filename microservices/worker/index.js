const camelCase = require("lodash.camelcase")
const { buildDirTree } = require("@modjo-plugins/core/libs/build")
const createQueueWorker = require("./libs/queue-worker")

const ctx = require("./ctx")

module.exports = async () => {
  // const config = ctx.require("config")

  const queueHandlerFactories = require(`${process.cwd()}/build/queues`)
  const queues = Object.keys(queueHandlerFactories).map(camelCase)
  ctx.set("queues", queues)

  // testing dev
  // queues.map(async function (q) {
  // const conn = ctx.require("amqp")
  //   const ch = await conn.createChannel()
  //   await ch.assertQueue(q)
  //   await ch.sendToQueue(
  // q,
  //     Buffer.from(JSON.stringify({ foo: "bar", rand: Math.random() }))
  //   )
  // })

  // await Promise.all(queues.map(createQueueWorker))
  queues.map(createQueueWorker)
}

module.exports.dependencies = [
  "config",
  "logger",
  "pgPool",
  "shutdownHandlers",
  "lightship",
  "amqp",
]

module.exports.build = () => {
  buildDirTree([
    {
      dir: "queues",
      pattern: /^(.*)\.(js|yaml|yml)$/,
    },
  ])
}

module.exports.ready = () => {
  const logger = ctx.require("logger")
  const queues = ctx.get("queues")
  logger.info(`🚀 Worker ready for queues ${queues.join(",")}`)
}

module.exports.ctx = ctx
