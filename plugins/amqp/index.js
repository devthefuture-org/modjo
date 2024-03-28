const yaRetry = require("ya-retry")
const amqplib = require("amqplib")
const waitOn = require("wait-on")
const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))
const ReconnectableProxy = require("./reconnectable-proxy")

module.exports = async () => {
  const config = ctx.require("config")
  const logger = ctx.require("logger")

  const { url: amqpURL, autoReconnect = {} } = config.amqp

  const url = new URL(`${amqpURL}`)
  await waitOn({
    resources: [`tcp:${url.hostname}:${url.port || "5672"}`],
    timeout: 2 * 60 * 1000,
  })

  try {
    // autoReconnect, see https://github.com/amqp-node/amqplib/issues/25
    const proxyManager = new ReconnectableProxy()
    let reconnecting = false
    const createConnection = async () => {
      const conn = await amqplib.connect(amqpURL)
      conn.on("close", async (err) => {
        logger.debug("onConnectionClose")
        logger.debug(err)
        if (reconnecting) {
          return
        }
        reconnecting = true
        await yaRetry(
          async (_bail) => {
            logger.debug("rabbitmq disconnected, trying to reconnect")
            const newConn = await createConnection()
            await proxyManager.reconnect(newConn)
            logger.debug("rabbitmq reconnected")
          },
          {
            retries: 10,
            minTimeout: 1000,
            maxTimeout: 30000,
            ...(autoReconnect.retryOptions || {}),
          }
        )
        reconnecting = false
      })
      conn.addTask = async function addTask(q, data) {
        // const logger = ctx.require("logger")
        const ch = await conn.createChannel()
        await ch.assertQueue(q)
        await ch.sendToQueue(q, Buffer.from(JSON.stringify(data)), {
          persistent: true,
        })
      }
      return conn
    }

    const conn = await createConnection()
    proxyManager.setTarget(conn)
    const proxy = proxyManager.getProxy()

    return proxy
  } catch (e) {
    logger.error("Unable to connect to amqp server")
    throw e
  }
}

module.exports.dependencies = ["config", "logger"]

module.exports.ctx = ctx
