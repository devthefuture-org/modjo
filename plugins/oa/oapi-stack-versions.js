const path = require("path")
const express = require("express")

const { reqCtx } = require("@modjo/express/ctx")
const createOptions = require("@modjo/core/utils/schema/options")
const createOapiStack = require("./oapi-stack")

const optionsSchema = createOptions({
  defaults: {
    stackOptions: {},
  },
})

module.exports = async function createOapiStackVersions(options = {}) {
  optionsSchema(options)

  const { stackOptions } = options

  const versions = require(`${process.cwd()}/build/api.dirs`)

  const router = express.Router({ strict: true, caseSensitive: true })
  reqCtx.setRouterContext(router)

  const result = await Promise.all(
    versions.map(async (version) => {
      const versionResult = await createOapiStack({
        ...stackOptions,
        version,
      })
      router.use(path.join("/", version), versionResult.router)
      return versionResult
    })
  )

  router.get("/", (req, res) => {
    res.json({
      versions: versions.map((version) => {
        const selfLinkPath = path.join(req.originalUrl, version)
        return {
          name: version,
          links: {
            self: `${req.protocol}://${req.get("host")}${selfLinkPath}`,
          },
        }
      }),
    })
  })

  return { router, versions: result }
}
