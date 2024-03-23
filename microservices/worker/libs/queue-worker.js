const { ctx, taskCtx } = require("../ctx")
const timeLogger = require("./time-logger")

const createTaskRunner = require("./task-runner")

module.exports = async function createQueueWorker(q) {
  const logger = ctx.require("logger")

  const conn = ctx.require("amqp")

  const ch = await conn.createChannel()

  await ch.assertQueue(q)

  const taskRunner = await createTaskRunner(q)

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
      }
    })
  })
}
