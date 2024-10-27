const path = require("path")
// const express = require("express")
const get = require("lodash.get")
const set = require("lodash.set")
const defaultsDeep = require("lodash.defaultsdeep")
const camelCase = require("lodash.camelcase")
const AsyncApiValidator = require("asyncapi-validator")
const { Parser } = require("@asyncapi/parser")
const { OpenAPISchemaParser } = require("@asyncapi/openapi-schema-parser")
const { reqCtx } = require("@modjo/express/ctx")
const traverseAsync = require("@modjo/core/utils/object/traverse-async")
const createOptions = require("@modjo/core/utils/schema/options")
const deepMapKeys = require("@modjo/core/utils/object/deep-map-keys")

const { Router } = require("websocket-express")

const { ctx: coreCtx } = require("@modjo/core")

const ctx = require("./ctx")
const createValidator = require("./validator")

const {
  defaultOperationIdConvention,
  defaultPathDescription,
  defaultMethodDescription,
  defaultMethodSummary,
  // defaultChannelPathParameters,
} = require("./defaults")

const pathParamRegex = /\{(.+?)\}/g

const asyncMethods = ["pub", "sub"]
const actionByMethod = {
  sub: "send",
  pub: "receive",
}

const optionsSchema = createOptions(
  {
    defaults: {
      basePath: "/",
      apiPath: "/api",
      aasPath: "/aas",
      version: "1",
      operationIdConvention: defaultOperationIdConvention,
    },
    required: ["version"],
  },
  "createAsyncApi"
)

const parser = new Parser()
parser.registerSchemaParser(OpenAPISchemaParser())

module.exports = async function createAsyncApi(options = {}) {
  optionsSchema(options)
  coreCtx.share(ctx.pluginSymbol)

  const logger = ctx.require("logger")

  const config = ctx.require("config")

  const { version } = options

  // # API TREE
  const apiTree = require(`${process.cwd()}/build/asyncapi`)

  // # SHARED API TREE MERGE AS DEFAULT
  const sharedApiTree = require(`${process.cwd()}/build/sharedAsyncapi`)
  for (const key of Object.keys(sharedApiTree)) {
    if (apiTree[version][key] === undefined) {
      apiTree[version][key] = {}
    }
    defaultsDeep(apiTree[version][key], sharedApiTree[key])
  }

  // ## Operations
  const operationsTree = apiTree[version].operations

  // ## Spec
  const apiSpecTree = apiTree[version]["spec-asyncapi"]
  const createApiSpec = apiSpecTree.index
  delete apiSpecTree.index

  // ## Formats
  const formatsTree = apiTree[version].formats

  // ## Security handlers
  const securityTree = apiTree[version].security

  // ## Addons Factories
  // ### Validators
  const addonNames = ["validators", "services"]
  const addonTrees = addonNames.reduce((acc, addonName) => {
    acc[addonName] = apiTree[version][addonName]
    return acc
  }, {})

  const { basePath, apiPath, aasPath } = options

  const httpServer = ctx.require("httpServer")

  const router = new Router({ strict: true, caseSensitive: true })

  reqCtx.setRouterContext(router)

  const { host = "0.0.0.0", port = 3000 } = config.httpServer || {}
  const apiSpecBase = await createApiSpec({
    path: path.join(basePath, apiPath, version, aasPath),
    host,
    port,
    version,
  })
  const apiSpec = deepMapKeys(apiSpecTree, camelCase)
  defaultsDeep(apiSpec, apiSpecBase)

  // load addons handlers
  const addonsHandlers = {}
  for (const addonName of addonNames) {
    addonsHandlers[addonName] = {}
  }
  for (const addonName of addonNames) {
    const addonTree = addonTrees[addonName]
    const addonHandlers = addonsHandlers[addonName]
    const addonLoader = (_filename, factory, _dirFiles, keys) => {
      const name = camelCase(keys.join("."))
      const addonHandler = factory(addonsHandlers)
      addonHandlers[name] = addonHandler
    }
    await traverseAsync(addonTree, addonLoader)
  }

  // load formats
  const formats = {}
  function formatsLoader(_filename, factory, _dirFiles, keys) {
    const format = factory(addonsHandlers)
    if (!format.name) {
      format.name = camelCase(keys.join("."))
    }
    formats[format.name] = format
  }
  await traverseAsync(formatsTree, formatsLoader)

  // load security handlers
  const securityHandlers = {}
  function securityLoader(_filename, factory, _dirFiles, keys) {
    const securityHandler = factory(addonsHandlers)
    const name = camelCase(keys.join("."))
    securityHandlers[name] = async (req, ...args) => {
      return reqCtx.provide(async () => {
        try {
          const authenticated = await securityHandler(req, ...args)
          return authenticated
        } catch (err) {
          logger.error(err)
        }
        return false
      }, req)
    }
  }
  await traverseAsync(securityTree, securityLoader)

  // const operationsRouter = express.Router({ strict: true, caseSensitive: true })
  const operationsRouter = new Router({ strict: true, caseSensitive: true })
  reqCtx.setRouterContext(operationsRouter)

  // load spec
  const apiMethods = {}
  function operationMethodLoader(filename, factory, _dirFiles, keys) {
    if (filename.endsWith(".chan.spec")) {
      const basename = filename.substring(
        0,
        filename.length - ".chan.spec".length
      )
      const channelKeys = [...keys.slice(0, -1), basename]
      if (channelKeys[channelKeys.length - 1] === "index") {
        channelKeys.pop()
        channelKeys.push("")
      }
      const channelId = channelKeys.join(".")
      const channelPath = `/${channelKeys.join("/")}`
      if (!apiSpec.channels[channelId]) {
        apiSpec.channels[channelId] = { address: channelPath, messages: {} }
      }
      const spec = apiSpec.channels[channelId]
      Object.assign(spec, factory)

      if (!spec.parameters) {
        spec.parameters = {}
      }

      if (!spec.description) {
        spec.description = defaultPathDescription(channelPath, spec)
      }
      return
    }
    if (typeof factory !== "function") {
      return
    }
    const filenameParts = filename.split(".")
    if (!asyncMethods.includes(filenameParts[filenameParts.length - 1])) {
      return
    }
    const apiMethod = factory(addonsHandlers)
    const method = filenameParts[filenameParts.length - 1]
    filenameParts.pop()
    const pathFilename = filenameParts.join(".")
    const apiMethodFullPath = path.join(
      keys.slice(0, -1).join("/"),
      pathFilename
    )
    if (apiMethods[apiMethodFullPath] === undefined) {
      apiMethods[apiMethodFullPath] = {}
    }
    apiMethods[apiMethodFullPath][method] = apiMethod

    // load method spec file
    const specKeyPath = [
      ...keys.slice(0, -1),
      [keys.slice(-1), "spec"].join("."),
    ]
    let specFileContent = get(operationsTree, specKeyPath)
    if (specFileContent) {
      if (typeof specFileContent === "function") {
        specFileContent = specFileContent()
      }
      apiMethod.spec = defaultsDeep(apiMethod.spec || {}, specFileContent)
    }

    // register default root path of methods
    const keyPath = apiMethodFullPath.split("/")
    if (!get(operationsTree, keyPath)) {
      set(operationsTree, keyPath, function ({ methods }) {
        return { spec: {}, methods }
      })
    }
  }
  await traverseAsync(operationsTree, operationMethodLoader)

  const deferredOperationsRegister = []
  // load operations
  async function operationLoader(filename, factory, _dirFiles, keys) {
    if (typeof factory !== "function") {
      return
    }
    if (filename.includes(".")) {
      return
    }

    // load method files
    const apiMethodFullPath = path.join(keys.slice(0, -1).join("/"), filename)
    const decoupledMethods = apiMethods[apiMethodFullPath] || {}

    const operations = factory({ ...addonsHandlers, methods: decoupledMethods })
    const { spec = {}, methods } = operations

    // load spec file
    const specKeyPath = [
      ...keys.slice(0, -1),
      [keys.slice(-1), "spec"].join("."),
    ]
    let specFileContent = get(operationsTree, specKeyPath)
    if (specFileContent) {
      if (typeof specFileContent === "function") {
        specFileContent = specFileContent()
      }
      defaultsDeep(spec, specFileContent)
    }

    // operationPath
    if (keys[keys.length - 1] === "index") {
      keys.pop()
      keys.push("")
    }

    const channelPath = `/${keys.join("/")}`
    const channelId = keys.join(".")

    // operationId
    const { operationIdConvention } = options
    for (const [method, methodDef] of Object.entries(methods)) {
      if (spec[method] === undefined && methodDef.spec === undefined) {
        methodDef.spec = {}
      }
      if (methodDef.spec !== undefined) {
        spec[method] = defaultsDeep(methodDef.spec, spec[method] || {})
      }
      const specMethod = spec[method]
      if (specMethod.operationId === undefined) {
        specMethod.operationId = operationIdConvention(
          channelPath,
          method,
          spec,
          apiSpec
        )
      }
    }

    if (!apiSpec.channels[channelId]) {
      apiSpec.channels[channelId] = { address: channelPath, messages: {} }
    }

    const messageSpecs = apiSpec.channels[channelId].messages
    for (const messageKey of Object.keys(messageSpecs)) {
      if (!messageSpecs[messageKey].name) {
        messageSpecs[messageKey].name = messageKey
      }
    }

    for (const [method] of Object.entries(methods)) {
      const methodSpec = spec[method]
      if (!methodSpec) {
        continue
      }

      // default method desciptions
      if (!methodSpec.description) {
        methodSpec.description = defaultMethodDescription(
          method,
          channelPath,
          spec
        )
      }

      // default method summary
      if (!methodSpec.summary) {
        methodSpec.summary = defaultMethodSummary(method, channelPath, spec)
      }

      if (!apiSpec.operations) {
        apiSpec.operations = {}
      }
      const operation = {
        action: actionByMethod[method],
        channel: { $ref: `#/channels/${channelId}` },
        description: methodSpec.description,
        summary: methodSpec.summary,
        title: methodSpec.title || "",
        messages: methodSpec.messages || [],
      }

      apiSpec.operations[methodSpec.operationId] = operation
    }

    // register routes
    for (const [method, handlerStack] of Object.entries(methods)) {
      const expressFormatedChannelPath = channelPath.replace(
        pathParamRegex,
        function (_, param) {
          return `:${param}`
        }
      )
      let handlers = await handlerStack
      handlers = await Promise.all(
        Array.isArray(handlers) ? [...handlers] : [handlers]
      )
      handlers = handlers.map((handler) => {
        return async (req, res, next) => {
          try {
            const result = await handler(req, res, next)
            if (result && result !== res) {
              const { ws } = res
              if (ws) {
                ws.send(JSON.stringify(result))
                ws.close()
              }
            }
            next()
          } catch (err) {
            next(err)
          }
        }
      })
      const specMiddleware = (req, _res, next) => {
        req.asyncapi = {
          channelId,
          channelSpec: apiSpec.channels[channelId],
          operationsSpec: spec,
        }
        next()
      }
      const contextMiddleware = (req, _res, next) => {
        reqCtx.share(req)
        coreCtx.provide(async () => {
          coreCtx.share(ctx.pluginSymbol)
          next()
        })
      }
      deferredOperationsRegister.push((validatorMiddleware) => {
        handlers.unshift(specMiddleware, contextMiddleware, validatorMiddleware)
        operationsRouter.ws(expressFormatedChannelPath, ...handlers)
      })
    }
  }
  await traverseAsync(operationsTree, operationLoader)

  // validation middleware
  const validateResponses = config.isDev
    ? {
        onError: (error, body, req) => {
          logger.warn(`Response body fails validation: `, error)
          logger.warn(`Emitted from:`, req.originalUrl)
          logger.warn(body)
          throw error
        },
      }
    : false

  const asyncApiValidatorOptions = defaultsDeep(
    {},
    ctx.get("asyncApiValidatorOptions") || {},
    {}
  )

  const msgIdentifier = "name"
  const validator = await AsyncApiValidator.fromSource(apiSpec, {
    msgIdentifier,
    ignoreArray: true,
    ...asyncApiValidatorOptions,
  })
  const validatorMiddleware = createValidator({
    apiSpec,
    validator,
    validateResponses,
    securityHandlers,
    formats,
    msgIdentifier,
  })

  // register defered operation
  for (const deferred of deferredOperationsRegister) {
    deferred(validatorMiddleware)
  }

  const { document, diagnostics } = await parser.parse(apiSpec)

  if (document === undefined) {
    const errorMessage = `invalid asyncapi schema: contains ${diagnostics.length} errors`
    logger.error(`${errorMessage}. Schema: ${JSON.stringify(apiSpec, null, 2)}`)
    for (const diagnostic of diagnostics) {
      logger.error(diagnostic, "asyncapi schema diagnostic")
    }
    throw new Error(errorMessage)
  }

  router.use(operationsRouter)

  return { router, apiSpec }
}
