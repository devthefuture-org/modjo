const cloneDeep = require("lodash.clonedeep")
const omit = require("lodash.omit")
const { createGraphQLSchema } = require("openapi-to-graphql")
const { execute, subscribe } = require("graphql")
// const { printSchema } = require("graphql")
const { SubscriptionServer } = require("subscriptions-transport-ws")

const { ApolloServer } = require("@apollo/server")
const {
  ApolloServerPluginDrainHttpServer,
} = require("@apollo/server/plugin/drainHttpServer")
const {
  ApolloServerPluginLandingPageGraphQLPlayground,
} = require("@apollo/server-plugin-landing-page-graphql-playground")

const { GraphQLError } = require("graphql")
const { reqCtx } = require("@modjo/express/ctx")
const restHttpMethodsList = require("@modjo/oa/utils/rest-methods-list")
const expressMiddleware = require("./express-middleware")
const ctx = require("./ctx")

module.exports = async function createOpenApiToGraphqlServer({
  apiSpec: paramApiSpec,
  graphqlEndpoint,
}) {
  const config = ctx.require("config")
  const logger = ctx.require("logger")
  const shutdownHandlers = ctx.require("shutdownHandlers")
  const pubsub = ctx.require("graphqlPubsub")
  const httpServer = ctx.require("httpServer")

  const apiSpec = cloneDeep(paramApiSpec)

  // auto set types names for input types name generation based on convention ${typename}Input
  for (const [key, spec] of Object.entries(apiSpec.components.schemas)) {
    if (!spec["x-graphql-type-name"]) {
      spec["x-graphql-type-name"] = key
    }
  }

  // disable security scheme OpenAPI-to-GraphQL handler
  delete apiSpec.components.securitySchemes
  for (const [_key, spec] of Object.entries(apiSpec.paths)) {
    for (const method of restHttpMethodsList) {
      if (spec[method] && spec[method].security) {
        delete spec[method].security
      }
    }
  }

  // let OpenAPI-to-GraphQL create the schema
  const omitHeaders = ["content-type"]
  const { host = "0.0.0.0", port = 3000 } = config.httpServer || {}
  const { schema } = await createGraphQLSchema(apiSpec, {
    // https://github.com/IBM/openapi-to-graphql/blob/master/packages/openapi-to-graphql/README.md
    createSubscriptionsFromCallbacks: true,
    baseUrl: `http://${host}:${port}/api/v1/oas`,
    strict: true,
    operationIdFieldNames: true,
    fillEmptyResponses: true,
    simpleEnumValues: true,
    viewer: false,
    provideErrorExtensions: true,
    // equivalentToMessages: false,
    headers: (_method, _operationPath, _title, _resolverParams) => {
      const req = reqCtx.get("req")
      return {
        ...omit(req.headers, omitHeaders),
        "x-origin": "GraphQL",
      }
    },
  })

  // Log GraphQL schema...
  // const myGraphQLSchema = printSchema(schema)
  // log(myGraphQLSchema)

  const gqlServer = new ApolloServer({
    schema,
    logger,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      ApolloServerPluginLandingPageGraphQLPlayground({
        endpoint: graphqlEndpoint,
      }),
    ],
    formatError: (err) => {
      console.log("err: ", err)
      const { extensions } = err
      const { statusCode } = extensions
      switch (statusCode) {
        case 401: {
          return new GraphQLError("Unauthorized", 401, { http: 401 })
        }
        default: {
          const sentry = ctx.get("sentry")
          if (
            sentry &&
            config.openapiToGraphql?.sentryEnabled !== false &&
            config.oa?.sentryEnabled !== false
          ) {
            sentry.captureException(err, {
              tags: {
                modjoPlugin: "openapi-to-graphql",
              },
            })
          }

          const error = cloneDeep(err)
          if (error.extensions?.exception?.stacktrace) {
            delete error.extensions.exception.stacktrace
          }
          if (error.extensions?.stacktrace) {
            delete error.extensions.stacktrace
          }
          if (!config.isDev) {
            if (error.message.startsWith("Database Error: ")) {
              return new Error("Internal server error")
            }
          }
          return error
        }
      }
    },
    introspection: true,
  })
  await gqlServer.start()
  shutdownHandlers.push(async () => {
    await gqlServer.stop()
  })

  // https://github.com/IBM/openapi-to-graphql/blob/master/packages/openapi-to-graphql/docs/subscriptions.md
  const subscriptionServer = SubscriptionServer.create(
    {
      execute,
      subscribe,
      schema,
      onConnect: (_params, _socket, _ctx) => {
        // Add pubsub to context to be used by GraphQL subscribe field
        return { pubsub }
      },
    },
    {
      server: httpServer,
      path: "/subscriptions",
    }
  )

  const router = expressMiddleware(gqlServer)

  return {
    router,
    subscriptionServer,
  }
}
