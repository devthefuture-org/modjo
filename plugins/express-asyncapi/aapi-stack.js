const express = require("express")
const { reqCtx } = require("@modjo/express/ctx")

const createOptions = require("@modjo/core/utils/schema/options")
const createAsyncapi = require("./asyncapi")

const optionsSchema = createOptions(
  {
    defaults: {
      docsPath: "/spec",
      aasPath: "/aas",
    },
    required: ["version"],
  },
  "createOapiStack"
)

module.exports = async function createAapiStack(options = {}) {
  optionsSchema(options)

  const { version, basePath, apiPath, aasPath, docsPath } = options

  const router = express.Router({ strict: true, caseSensitive: true })
  reqCtx.setRouterContext(router)

  const { router: asyncapiRouter, apiSpec } = await createAsyncapi({
    basePath,
    apiPath,
    aasPath,
    version,
  })
  router.use(aasPath, asyncapiRouter)
  router.get(docsPath, (_, res) => {
    return res.json(apiSpec)
  })

  return {
    router,
    basePath,
    apiPath,
    version,
    apiSpec,
  }
}
