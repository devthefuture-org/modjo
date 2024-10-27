const path = require("path")

const postwrapExpress = require("@modjo/express/postwrap")

const { compileDirList, buildDirTree } = require("@modjo/core/libs/build")

const ctx = require("./ctx")

const createAapiStackVersions = require("./aapi-stack-versions")

module.exports.create = async () => {
  // const config = ctx.require("config")
  // const logger = ctx.require("logger")
  // const sentry = ctx.get("sentry")
  const httpServer = ctx.require("httpServer")
  const app = ctx.require("express")

  // oapiStack
  ctx.set("asyncApiValidatorOptions", {})
  const basePath = "/"
  const apiPath = "/ws"
  const aasPath = "/aas"
  const { router: aapiStackVersionsRouter, versions } =
    await createAapiStackVersions({
      stackOptions: {
        basePath,
        apiPath,
        aasPath,
      },
    })
  const aapiUrl = path.join(basePath, apiPath)

  app.use(aapiUrl, aapiStackVersionsRouter)

  await postwrapExpress(app, "@modjo/express-asyncapi")

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
          /^\/v\d+\/(formats|operations|security|spec-asyncapi|validators|services)\/(.*)(?<=operations\/.*)(\.sub|\.pub|\.chan)|(?<!operations\/.*)\.(js|yaml|yml)$/,
        dirName: "asyncapi",
      },
      {
        dir: sharedApiPath,
        pattern:
          /^\/(formats|operations|security|spec-asyncapi|validators|services)\/(.*)(?<=operations\/.*)(\.sub|\.pub|\.chan)|(?<!operations\/.*)\.(js|yaml|yml)$/,
        dirName: "sharedAsyncapi",
      },
    ],
    {
      filter: (p) => !/(^|\/)\.[^/]+/.test(p),
    }
  )
}

module.exports.dependencies = [
  "config",
  "express",
  "logger",
  "shutdownHandlers",
  "httpServer",
  "sentry",
]

module.exports.ctx = ctx
