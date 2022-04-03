const { default: axios } = require("axios")
const waitOn = require("wait-on")
const defaultsDeep = require("lodash.defaultsdeep")

const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports.create = async () => {
  const config = ctx.require("config")

  const { uri, adminSecret } = config.hasura
  const url = new URL(uri)

  const hasuraApi = async (data) => {
    let res
    try {
      res = await axios.request({
        url: `${url.origin}/v1/metadata`,
        method: "post",
        headers: {
          "Content-Type": "application/json",
          "X-Hasura-Role": "admin",
          "X-Hasura-Admin-Secret": adminSecret,
        },
        data,
      })
      // console.log(res.data.message)
    } catch (e) {
      console.error(e.response.data.error)
    }

    return res
  }

  // await hasuraApi({
  //   type: "remove_remote_schema",
  //   args: {
  //     name: "api",
  //   },
  // })

  // await hasuraApi({
  //   type: "add_remote_schema",
  //   args: {
  //     name: "api",
  //     comment: "",
  //     definition: {
  //       forward_client_headers: true,
  //       timeout_seconds: 60,
  //       headers: [],
  //       url_from_env: "HASURA_REMOTE_SCHEMA_API_GRAPHQL_ENDPOINT",
  //     },
  //   },
  // })

  const reloadRemoteSchema = () =>
    hasuraApi({
      type: "reload_remote_schema",
      args: {
        name: "api",
      },
    })

  const waitReady = () =>
    waitOn({
      resources: [`tcp:${url.host}`],
      timeout: 2 * 60 * 1000,
    })

  return {
    reloadRemoteSchema,
    waitReady,
  }
}

module.exports.ready = (hasura) => {
  const config = ctx.get("config")
  const logger = ctx.get("logger")
  const hasuraConfig = defaultsDeep({}, config.hasura, {
    reloadSchemaOnDevStart: config.isDev,
  })
  if (hasuraConfig.reloadSchemaOnDevStart) {
    ;(async () => {
      logger.trace("waiting hasura on tcp")
      await hasura.waitReady()
      await hasura.reloadRemoteSchema()
      logger.trace("hasura remote schema reloaded")
    })()
  }
}

module.exports.dependencies = ["config"]

module.exports.ctx = ctx
