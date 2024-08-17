const kebabCase = require("lodash.kebabcase")
const deepmerge = require("@modjo/core/utils/object/deepmerge")
const { ctx } = require("../ctx")

const errorWrapperFactory = require("./factory-plugins/error-wrapper")

module.exports = async function createTaskRunner(q) {
  const queueHandlerFactories = require(`${process.cwd()}/build/queues`)
  const { microserviceWorker: config = {} } = ctx.require("config")
  const logger = ctx.require("logger")

  const defaultFactoryPlugins = {
    errorWrapper: {
      enabled: true,
      factory: errorWrapperFactory,
      options: {},
    },
  }

  const factoryPlugins = deepmerge(
    config.factoryPlugins || {},
    defaultFactoryPlugins
  )

  let { factories = [] } = config
  factories = [...factories].reverse()

  for (const factoryPlugin of Object.values(factoryPlugins)) {
    if (factoryPlugin.enabled) {
      factories.push([factoryPlugin.factory, factoryPlugin.options])
    }
  }

  const queueFilename = kebabCase(q)
  const userFactory = queueHandlerFactories[queueFilename]
  if (!userFactory) {
    const errorMsg = `queue function not found in files auto factory: ${queueFilename}`
    logger.error({ queueFilename, q }, errorMsg)
    throw new Error(errorMsg)
  }
  let handler = await userFactory()

  for (let factory of factories) {
    if (!Array.isArray(factory)) {
      factory = [factory, {}]
    }
    const [factoryFn, factoryOptions] = factory
    handler = await factoryFn(handler, q, factoryOptions)
  }

  return async function taskRunner(taskDefinition) {
    const res = await handler(taskDefinition)
    return res
  }
}
