const camelCase = require("lodash.camelcase")
const { buildDirTree } = require("@modjo/core/libs/build")
const createQueueWorker = require("./libs/queue-worker")

const { ctx } = require("./ctx")

module.exports.create = async () => {
  // const config = ctx.require("config")

  const queueHandlerFactories = require(`${process.cwd()}/build/queues`)
  const queues = Object.keys(queueHandlerFactories).map(camelCase)

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

  queues.map(createQueueWorker)

  return queues
}

module.exports.dependencies = [
  "config",
  "logger",
  "postgres",
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

module.exports.ready = (queues) => {
  const logger = ctx.require("logger")
  logger.info(`🚀 Worker ready for queues ${queues.join(",")}`)
}

module.exports.ctx = ctx
