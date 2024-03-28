const { ctx, taskCtx } = require("../ctx")
const timeLogger = require("./time-logger")

const createTaskRunner = require("./task-runner")

module.exports = async function createQueueWorker(q) {
  const logger = ctx.require("logger")
  const conn = ctx.require("amqp")
  const { microserviceWorker: config = {} } = ctx.require("config")

  const taskRunner = await createTaskRunner(q)

  const ch = await conn.createChannel()

  const { prefetchSize = 100 } = config
  ch.prefetch(prefetchSize, true)

  await ch.assertQueue(q, {
    durable: true,
  })

  ch.consume(q, async function runTask(msg) {
    if (msg === null) {
      return
    }

    await taskCtx.provide(async () => {
      const json = msg.content.toString()
      const taskDefinition = JSON.parse(json)

      const taskLogger = logger.child({ queueName: q, taskDefinition })
      taskCtx.set("logger", taskLogger)

      const elapsedTaskRunner = timeLogger({ logger: taskLogger })

      const res = await taskRunner(taskDefinition)

      if (res !== false) {
        elapsedTaskRunner.end()
        taskLogger.trace("acknowledge task")
        ch.ack(msg)
      } else {
        ch.nack(msg)
      }
    })
  })

  ch.on("error", (err) => {
    logger.info("channel error:", err.message)
    createQueueWorker() // Attempt to restart the consumer on channel error
  })

  ch.on("close", () => {
    logger.info("channel closed, attempting to restart...")
    createQueueWorker() // Attempt to restart the consumer on channel close
  })
}
