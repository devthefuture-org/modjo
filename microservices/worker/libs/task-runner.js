const kebabCase = require("lodash.kebabcase")
const deepmerge = require("@modjo/core/utils/object/deepmerge")
const { ctx } = require("../ctx")

const errorWrapperFactory = require("./factory-plugins/error-wrapper")
const redisQueueDedupFactory = require("./factory-plugins/redis-queue-dedup")

module.exports = async function createTaskRunner(q) {
  const queueHandlerFactories = require(`${process.cwd()}/build/queues`)
  const { microserviceWorker: config = {} } = ctx.require("config")

  const defaultFactoryPlugins = {
    errorWrapper: {
      enabled: true,
      factory: errorWrapperFactory,
      options: {},
    },
    redisQueueDedup: {
      enabled: !!ctx.get("redisQueueDedup"),
      factory: redisQueueDedupFactory,
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
  let handler = await userFactory()

  for (let factory of factories) {
    if (!Array.isArray(factory)) {
      factory = [factory, {}]
    }
    const [factoryFn, factoryOptions] = factory
    handler = await factoryFn(handler, q, factoryOptions);
  }

  return async function taskRunner(taskDefinition) {
    await handler(taskDefinition)
  }
}
