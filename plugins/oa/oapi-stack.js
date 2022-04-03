const path = require("path")
const express = require("express")
const { reqCtx } = require("@modjo-plugins/express/ctx")

const createOptions = require("@modjo-plugins/core/utils/schema/options")
const ctx = require("./ctx")
const createOpenApi = require("./openapi")
const createSwaggerServer = require("./swagger")

const optionsSchema = createOptions(
  {
    defaults: {
      docsPath: "/spec",
      oasPath: "/oas",
    },
    required: ["version"],
  },
  "createOapiStack"
)

module.exports = async function createOapiStack(options = {}) {
  optionsSchema(options)

  const { version, basePath, apiPath, oasPath, docsPath } = options

  const router = express.Router({ strict: true, caseSensitive: true })
  reqCtx.setRouterContext(router)

  // openapi
  const { router: openapiRouter, apiSpec } = await createOpenApi({
    basePath,
    apiPath,
    oasPath,
    version,
  })
  router.use(oasPath, openapiRouter)
  router.get(docsPath, (_, res) => {
    return res.json(apiSpec)
  })

  // swagger-ui
  const swaggerServer = createSwaggerServer({
    swaggerOptions: {
      url: path.join(basePath, apiPath, version, docsPath),
    },
  })
  const swaggerUiDistPath = `${process.cwd()}/build/swagger-ui-dist`
  router.use(
    "/swagger",
    express.static(swaggerUiDistPath, {
      index: false,
    }),
    ...swaggerServer
  )

  return {
    router,
    basePath,
    apiPath,
    version,
    apiSpec,
  }
}
