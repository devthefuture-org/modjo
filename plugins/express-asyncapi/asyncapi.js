const path = require("path")
const express = require("express")
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
const ctx = require("./ctx")
const createAsyncApiValidatorMiddleware = require("./middlewares/asyncapi-validator")

const pathParamRegex = /\{(.+?)\}/g

function compileSecuritySets(securitySets, methodSpec) {
  const xSecurity = methodSpec["x-security"]
  if (!securitySets || !xSecurity) {
    return
  }
  if (!methodSpec.security) {
    methodSpec.security = []
  }
  const { security } = methodSpec
  for (const securityDef of xSecurity) {
    const [key] = Object.keys(securityDef)
    const securitySet = securitySets[key]
    if (!securitySet) {
      throw new Error(`missing x-security: ${key}`)
    }
    const scopes = securityDef[key]
    security.push(
      ...securitySet.map((name) => {
        return { [name]: scopes }
      })
    )
  }
}

// function filterOpenApiSpec(schema) {
//   const openApiFields = ["openapi", "paths", "servers", "tags"]
//   openApiFields.forEach((field) => {
//     if (Object.keys(schema).includes(field)) {
//       delete schema[field]
//     }
//   })
//   return schema
// }

const optionsSchema = createOptions(
  {
    defaults: {
      basePath: "/",
      apiPath: "/api",
      aasPath: "/aas",
      version: "1",
    },
    required: ["version"],
  },
  "createAsyncApi"
)

const parser = new Parser()
parser.registerSchemaParser(OpenAPISchemaParser())

module.exports = async function createAsyncApi(options = {}) {
  optionsSchema(options)

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

  const router = express.Router({ strict: true, caseSensitive: true })
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

  const operationsRouter = express.Router({ strict: true, caseSensitive: true })
  reqCtx.setRouterContext(operationsRouter)

  // load methods
  const apiMethods = {}
  function operationMethodLoader(filename, factory, _dirFiles, keys) {
    if (typeof factory !== "function") {
      return
    }
    const filenameParts = filename.split(".")
    if (!filenameParts[filenameParts.length - 1] !== "sub") {
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
    const operationPath = `/${keys.join("/")}`

    // operationId
    const { operationIdConvention } = options
    for (const [method, methodDef] of Object.entries(methods)) {
      if (spec[method] === undefined && methodDef.spec === undefined) {
        throw new Error(
          `missing spec for method "${method}" in path ${operationPath}"`
        )
      }
      if (methodDef.spec !== undefined) {
        spec[method] = defaultsDeep(methodDef.spec, spec[method] || {})
      }
      const specMethod = spec[method]
      if (specMethod.operationId === undefined) {
        specMethod.operationId = operationIdConvention(
          operationPath,
          method,
          spec,
          apiSpec
        )
      }
    }

    // operation path parameters
    if (!spec.parameters) {
      spec.parameters = []
    }
    // // default path parameters
    // spec.parameters.push(...defaultOperationPathParameters(operationPath, spec))

    // // default desciptions
    // if (!spec.description) {
    //   spec.description = defaultPathDescription(operationPath, spec)
    // }

    for (const [method] of Object.entries(methods)) {
      const methodSpec = spec[method]
      if (!methodSpec) {
        continue
      }

      // // default method desciptions
      // if (!methodSpec.description) {
      //   methodSpec.description = defaultMethodDescription(
      //     method,
      //     operationPath,
      //     spec
      //   )
      // }

      // // default method summary
      // if (!methodSpec.summary) {
      //   methodSpec.summary = defaultMethodSummary(method, operationPath, spec)
      // }

      // // default response description
      // for (const [responseKey, responseDef] of Object.entries(
      //   methodSpec.responses
      // )) {
      //   if (!responseDef.description) {
      //     responseDef.description = defaultResponseDescription(
      //       responseKey,
      //       responseDef,
      //       method,
      //       operationPath,
      //       spec
      //     )
      //   }
      // }

      // security suggar syntax
      compileSecuritySets(apiSpec["x-security-sets"], methodSpec)
    }

    // register apiSpec
    apiSpec.paths[operationPath] = spec
    console.log("methods", methods)
    // register routes
    for (const [method, handlerStack] of Object.entries(methods)) {
      const expressFormatedOperationPath = operationPath.replace(
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
              res.json(result)
            }
          } catch (err) {
            next(err)
          }
        }
      })
      handlers.unshift((req, _res, next) => {
        reqCtx.share(req)
        next()
      })
      console.log("method", method)
      operationsRouter[method](expressFormatedOperationPath, ...handlers)
    }
  }
  await traverseAsync(operationsTree, operationLoader)

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

  // errors handling
  function errorMiddleware(err, _, res, _next) {
    const { status, errors, message } = err
    logger.debug(
      { status, errors, message },
      "openapi request_validation error"
    )
    res.status(status || 500).json({
      error: {
        type: "request_validation",
        message,
        errors,
      },
    })
  }

  // validate responses config
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

  const { document, diagnostics } = await parser.parse(apiSpec)

  if (document === undefined) {
    const errorMessage = `invalid asyncapi schema: contains ${diagnostics.length} errors`
    logger.error(`${errorMessage}. Schema: ${JSON.stringify(apiSpec, null, 2)}`)
    for (const diagnostic of diagnostics) {
      logger.error(diagnostic, "asyncapi schema diagnostic")
    }
    throw new Error(errorMessage)
  }

  // final validator middleware config
  const asyncApiValidatorOptions = defaultsDeep(
    {},
    ctx.get("asyncApiValidatorOptions") || {},
    {}
  )
  const validator = await AsyncApiValidator.fromSource(apiSpec, {
    msgIdentifier: "name",
    ignoreArray: true,
    ...asyncApiValidatorOptions,
  })

  const validatorMiddleware = createAsyncApiValidatorMiddleware(validator)
  router.use(validatorMiddleware)

  // TODO register sub operations to the router

  router.use(errorMiddleware, operationsRouter)

  return { router, apiSpec }
}
