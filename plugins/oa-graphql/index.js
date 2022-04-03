const path = require("path")

const ctx = require("./ctx")

const createOpenApiToGraphqlServer = require("./openapi-to-graphql")

module.exports.create = async () => {
  // const config = ctx.require("config")
  // const logger = ctx.require("logger")
  const oa = ctx.require("oa")
  const { router, basePath, apiPath, version, apiSpec } = oa.versions[0]

  const graphqlUrlSegment = "/graphql"
  const graphqlEndpoint = path.join(
    basePath,
    apiPath,
    version,
    graphqlUrlSegment
  )
  const { router: graphqlRouter } = await createOpenApiToGraphqlServer({
    apiSpec,
    graphqlEndpoint,
  })
  router.use(graphqlUrlSegment, graphqlRouter)
}

module.exports.dependencies = [
  "oa",
  "logger",
  "graphqlPubsub",
  "shutdownHandlers",
  "httpServer",
]

module.exports.ctx = ctx
