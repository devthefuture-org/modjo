const path = require("path")
const express = require("express")
const get = require("lodash.get")
const set = require("lodash.set")
const defaultsDeep = require("lodash.defaultsdeep")
const camelCase = require("lodash.camelcase")
const OpenApiValidator = require("express-openapi-validator")
const { default: OpenAPISchemaValidator } = require("openapi-schema-validator")
const { reqCtx } = require("@modjo/express/ctx")
const traverseAsync = require("@modjo/core/utils/object/traverse-async")
const createOptions = require("@modjo/core/utils/schema/options")
const deepMapKeys = require("@modjo/core/utils/object/deep-map-keys")
const ctx = require("./ctx")
const restHttpMethodsList = require("./utils/rest-methods-list")

const {
  defaultOperationIdConvention,
  defaultPathDescription,
  defaultMethodDescription,
  defaultMethodSummary,
  defaultResponseDescription,
  defaultOperationPathParameters,
} = require("./defaults")

const { compileSecuritySets } = require("./sugar")

const pathParamRegex = /\{(.+?)\}/g

// https://swagger.io/docs/specification/paths-and-operations/

const optionsSchema = createOptions(
  {
    defaults: {
      basePath: "/",
      apiPath: "/api",
      oasPath: "/oas",
      version: "1",
      operationIdConvention: defaultOperationIdConvention,
    },
    required: ["version"],
  },
  "createOpenApi"
)

module.exports = async function createOpenApi(options = {}) {
  optionsSchema(options)

  const logger = ctx.require("logger")

  const config = ctx.require("config")

  const { version } = options

  // # API TREE
  const apiTree = require(`${process.cwd()}/build/api`)

  // # SHARED API TREE MERGE AS DEFAULT
  const sharedApiTree = require(`${process.cwd()}/build/sharedApi`)
  for (const key of Object.keys(sharedApiTree)) {
    if (apiTree[version][key] === undefined) {
      apiTree[version][key] = {}
    }
    defaultsDeep(apiTree[version][key], sharedApiTree[key])
  }

  // ## Operations
  const operationsTree = apiTree[version].operations

  // ## Spec
  const apiSpecTree = apiTree[version]["spec-openapi"]
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

  const { basePath, apiPath, oasPath } = options

  const router = express.Router({ strict: true, caseSensitive: true })
  reqCtx.setRouterContext(router)

  const { host = "0.0.0.0", port = 3000 } = config.httpServer || {}
  const apiSpecBase = await createApiSpec({
    path: path.join(basePath, apiPath, version, oasPath),
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
    if (
      !restHttpMethodsList.includes(filenameParts[filenameParts.length - 1])
    ) {
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
    const operationSpec = get(operationsTree, keyPath)
    if (!operationSpec?.spec) {
      set(operationsTree, keyPath, function ({ methods }) {
        return { spec: {}, methods }
      })
    }
  }
  await traverseAsync(operationsTree, operationMethodLoader)
  // console.log("o", operationsTree)

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
    // default path parameters
    spec.parameters.push(...defaultOperationPathParameters(operationPath, spec))

    // default desciptions
    if (!spec.description) {
      spec.description = defaultPathDescription(operationPath, spec)
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
          operationPath,
          spec
        )
      }

      // default method summary
      if (!methodSpec.summary) {
        methodSpec.summary = defaultMethodSummary(method, operationPath, spec)
      }

      // default response description
      for (const [responseKey, responseDef] of Object.entries(
        methodSpec.responses
      )) {
        if (!responseDef.description) {
          responseDef.description = defaultResponseDescription(
            responseKey,
            responseDef,
            method,
            operationPath,
            spec
          )
        }
      }

      // security suggar syntax
      compileSecuritySets(apiSpec["x-security-sets"], methodSpec)
    }

    // register apiSpec
    apiSpec.paths[operationPath] = spec

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

  // final validator middleware config
  const openApiValidatorOptions = ctx.get("openApiValidatorOptions") || {}

  const validator = new OpenAPISchemaValidator({ version: 3 })

  const validated = validator.validate(apiSpec)
  if (validated.errors.length > 0) {
    throw new Error(
      `OpenAPI Schema Error: ${JSON.stringify(validated.errors, null, 2)}`
    )
  }

  const openApiMiddleware = OpenApiValidator.middleware(
    defaultsDeep({}, openApiValidatorOptions, {
      apiSpec,
      validateApiSpec: false,
      validateRequests: {
        allowUnknownQueryParameters: false,
      },
      validateResponses,
      validateSecurity: {
        handlers: securityHandlers,
      },
      validateFormats: true,
      formats,
      fileUploader: {
        // https://github.com/cdimascio/express-openapi-validator#%EF%B8%8F-fileuploader-optional
        // https://github.com/expressjs/multer
        limits: {
          // https://github.com/expressjs/multer#limits
          fileSize: 5 * 1024 * 1024, // (=5M) For multipart forms, the max file size(in bytes)  Infinity
          fields: 20, // Max number of non- file fields   Infinity
          files: 5, // For multipart forms, the max number of file fields   Infinity
          parts: 25, // For multipart forms, the max number of parts(fields + files)  Infinity
        },
      },
    })
  )

  router.use(openApiMiddleware)

  router.use(errorMiddleware, operationsRouter)

  return { router, apiSpec }
}
