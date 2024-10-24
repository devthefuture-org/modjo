const { ctx } = require("./ctx")

const errorHandlerFactory = require("./middlewares/error-handler")

const { isRouteRegistered } = require("./utils")

const readyDependencies = []

module.exports = async (app, dependencyName) => {
  const dependencies = app.get("@modjo/express/postwrap.dependencies")
  if (dependencies) {
    readyDependencies.push(dependencyName)
    if (!dependencies.every((dep) => readyDependencies.includes(dep))) {
      return
    }
  }

  if (app.get("@modjo/express/postwrapped")) {
    return
  }
  app.set("@modjo/express/postwrapped", true)

  // const logger = ctx.require("logger")
  const config = ctx.require("config")
  const httpServer = ctx.require("httpServer")
  const sentry = ctx.get("sentry")

  if (!isRouteRegistered(app, "/", "get")) {
    const { version: projectVersion, name: projectName } =
      ctx.get("version") || {}
    app.get("/", (_, res) => {
      res.json({
        nodeEnv: config.nodeEnv,
        projectVersion,
        projectName,
      })
    })
  }

  // request error handler
  if (sentry && config.express.sentryEnabled !== false) {
    // sentry.setupExpressErrorHandler(app)
    app.use(sentry.expressErrorHandler())
  }

  app.use(errorHandlerFactory())

  if (httpServer.address() === null) {
    httpServer.start()
  }
}
