const kebabCase = require("lodash.kebabcase")

const { ctx } = require("../ctx")

const defaultFactory = async function catchErrorFactory(handler) {
  const logger = ctx.require("logger")
  return async (...args) => {
    try {
      await handler(...args)
    } catch (err) {
      logger.error(err)
    }
  }
}

module.exports = async function createTaskRunner(q) {
  const queueHandlerFactories = require(`${process.cwd()}/build/queues`)
  const { microserviceWorker: config = {} } = ctx.require("config")

  const queueFilename = kebabCase(q)
  const userFactory = queueHandlerFactories[queueFilename]
  let handler = await userFactory()

  const factory = config.factory || defaultFactory
  if (factory) {
    handler = await factory(handler)
  }

  return async function taskRunner(taskDefinition) {
    await handler(taskDefinition)
  }
}
