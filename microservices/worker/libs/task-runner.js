const kebabCase = require("lodash.kebabcase")

module.exports = async function createTaskRunner(q) {
  const queueHandlerFactories = require(`${process.cwd()}/build/queues`)

  const queueFilename = kebabCase(q)
  const factory = queueHandlerFactories[queueFilename]
  const handler = await factory()

  return async function taskRunner(taskDefinition) {
    await handler(taskDefinition)
  }
}
