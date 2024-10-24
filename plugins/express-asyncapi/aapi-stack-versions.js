const path = require("path")
const express = require("express")

const { reqCtx } = require("@modjo/express/ctx")
const createOptions = require("@modjo/core/utils/schema/options")
const createAapiStack = require("./aapi-stack")

const optionsSchema = createOptions({
  defaults: {
    stackOptions: {},
  },
})

module.exports = async function createAapiStackVersions(options = {}) {
  optionsSchema(options)

  const { stackOptions } = options

  const versions = require(`${process.cwd()}/build/api.dirs`)

  const router = express.Router({ strict: true, caseSensitive: true })
  reqCtx.setRouterContext(router)

  const result = await Promise.all(
    versions.map(async (version) => {
      const versionResult = await createAapiStack({
        ...stackOptions,
        version,
      })
      router.use(path.join("/", version), versionResult.router)
      return versionResult
    })
  )

  return { router, versions: result }
}
