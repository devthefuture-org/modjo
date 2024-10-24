const path = require("path")
const fs = require("fs-extra")

const {
  compileDirList,
  buildDir,
  buildDirTree,
} = require("@modjo/core/libs/build")

const postwrapExpress = require("@modjo/express/postwrap")

const ctx = require("./ctx")

const createOapiStackVersions = require("./oapi-stack-versions")

module.exports = async () => {
  const config = ctx.require("config")
  const logger = ctx.require("logger")
  const httpServer = ctx.require("httpServer")
  const sentry = ctx.get("sentry")

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
  // console.log("openapi registered")
  // logger.debug(`oapi-url: ${oapiUrl}`)

  await postwrapExpress(app, "@modjo/oa")

  await httpServer.isReady

  return { versions }
}

module.exports.build = (options = {}) => {
  const { apiPath = "api", sharedApiPath = "api/shared" } = options || {}

  compileDirList(apiPath)

  buildDirTree(
    [
      {
        dir: apiPath,
        pattern:
          /^\/v\d+\/(formats|operations|security|spec-openapi|validators|services)\/(.*?)(?!\.sub)\.(js|yaml|yml)$/,
        dirName: "api",
      },
      {
        dir: sharedApiPath,
        pattern:
          /^\/(formats|operations|security|spec-openapi|validators|services)\/(.*?)(?!\.sub)\.(js|yaml|yml)$/,
        dirName: "sharedApi",
      },
    ],

    {
      filter: (p) => !/(^|\/)\.[^/]+/.test(p),
    }
  )

  fs.copySync(
    path.dirname(require.resolve("swagger-ui-dist")),
    path.join(buildDir, "swagger-ui-dist")
  )
}

module.exports.dependencies = ["config", "logger", "httpServer", "express"]

module.exports.ctx = ctx
