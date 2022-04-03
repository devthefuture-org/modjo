const amqplib = require("amqplib")
const waitOn = require("wait-on")
const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports = async () => {
  const config = ctx.require("config")
  const logger = ctx.require("logger")

  const { url: amqpURL } = config.amqp

  const url = new URL(`${amqpURL}`)
  await waitOn({
    resources: [`tcp:${url.hostname}:${url.port || "5672"}`],
    timeout: 2 * 60 * 1000,
  })

  try {
    const conn = await amqplib.connect(amqpURL)
    conn.addTask = async function addTask(q, data) {
      // const logger = ctx.require("logger")
      const ch = await conn.createChannel()
      await ch.assertQueue(q)
      await ch.sendToQueue(q, Buffer.from(JSON.stringify(data)))
    }
    return conn
  } catch (e) {
    logger.error("Unable to connect to amqp server")
    throw e
  }
}

module.exports.dependencies = ["config", "logger"]

module.exports.ctx = ctx
