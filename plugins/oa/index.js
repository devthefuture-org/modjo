const path = require("path")
const fs = require("fs-extra")

const httpError = require("http-errors")

const {
  compileDirList,
  buildDir,
  buildDirTree,
} = require("@modjo-plugins/core/libs/build")
const ctx = require("./ctx")

const createOapiStackVersions = require("./oapi-stack-versions")

module.exports = async () => {
  const config = ctx.require("config")
  const logger = ctx.require("logger")
  const httpServer = ctx.require("httpServer")

  const app = ctx.require("express")

  // oapiStack
  ctx.set("openApiValidatorOptions", {})
  const basePath = "/"
  const apiPath = "/api"
  const oasPath = "/oas"
  const { router: oapiStackVersionsRouter, versions } =
    await createOapiStackVersions({
      stackOptions: {
        basePath,
        apiPath,
        oasPath,
      },
    })
  const oapiUrl = path.join(basePath, apiPath)
  app.use(oapiUrl, oapiStackVersionsRouter)
  // logger.debug(`oapi-url: ${oapiUrl}`)

  // home
  const { version: projectVersion, name: projectName } =
    ctx.get("version") || {}
  app.get("/", (_, res) => {
    res.json({
      nodeEnv: config.nodeEnv,
      projectVersion,
      projectName,
    })
  })

  // request error handler
  function errorsHandler(err, _req, res, next) {
    const isHttp = httpError.isHttpError(err)
    if (!isHttp || err.statusCode >= 500) {
      logger.error(err.message)
      logger.debug(err.stack)
    }
    if (res.headersSent) {
      next(err)
    } else if (isHttp && err.expose) {
      res
        .status(err.statusCode)
        .send({ code: err.statusCode, message: err.message })
    } else {
      res.status(500).send({ code: 500, message: "Internal Server Error" })
    }
  }
  app.use(errorsHandler)

  httpServer.start()

  await httpServer.isReady

  return { versions }
}

module.exports.build = (options = {}) => {
  const { apiPath = "api", sharedApiPath = "api/shared" } = options || {}

  compileDirList(apiPath)

  buildDirTree([
    {
      dir: apiPath,
      pattern:
        /^\/v\d+\/(formats|operations|security|spec|validators|services)\/(.*)\.(js|yaml|yml)$/,
      dirName: "api",
    },
    {
      dir: sharedApiPath,
      pattern:
        /^\/(formats|operations|security|spec|validators|services)\/(.*)\.(js|yaml|yml)$/,
      dirName: "sharedApi",
    },
  ])

  fs.copySync(
    path.dirname(require.resolve("swagger-ui-dist")),
    path.join(buildDir, "swagger-ui-dist")
  )
}

module.exports.dependencies = ["config", "logger", "httpServer", "express"]

module.exports.ctx = ctx
