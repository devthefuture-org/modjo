const nctx = require("nctx")
const createApolloClient = require("./utils/apollo-client")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports.create = () => {
  const config = ctx.require("config")
  const apolloClient = { ...(config.apolloClient || {}) }

  if (typeof apolloClient.cache === "function") {
    apolloClient.cache = apolloClient.cache()
  }

  return createApolloClient({
    ...apolloClient,
    headers: {
      "Content-Type": "application/json",
      ...(apolloClient.headers || {}),
    },
  })
}

module.exports.dependencies = ["config"]

module.exports.ctx = ctx
