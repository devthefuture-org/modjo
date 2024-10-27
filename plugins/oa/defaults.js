const capitalize = require("lodash.capitalize")
const camelCase = require("lodash.camelcase")

const httpMethodToOperationIdPrefixConvention = {
  get: "get",
  post: "add",
  put: "set",
  delete: "del",
  patch: "do",
}

const pathParamRegex = /\{(.+?)\}/g

function defaultOperationIdConvention(operationPath, method) {
  const keys = operationPath.split("/")
  keys.shift()

  if (method !== "patch") {
    const perPrefix =
      operationPath[operationPath.length - 1] === "/" ? "many" : "one"
    keys.unshift(perPrefix)
  }

  const methodPrefix = httpMethodToOperationIdPrefixConvention[method]
  keys.unshift(methodPrefix)

  const parts = []
  const pathParams = []
  for (const key of keys) {
    if (key.match(pathParamRegex)) {
      pathParams.push(
        key.replace(pathParamRegex, function (_, param) {
          return `by${capitalize(camelCase(param))}`
        })
      )
    } else {
      parts.push(key)
    }
  }

  parts.push(pathParams.join("-and-"))

  const operationId = camelCase(parts.join("-"))
  return operationId
}

function defaultOperationPathParameters(operationPath, spec) {
  const params = []
  const paramVars = operationPath.matchAll(pathParamRegex)
  for (const [_, name] of paramVars) {
    if (spec.parameters.some((param) => param.name === name)) {
      continue
    }
    params.push({
      name,
      in: "path",
      required: true,
      schema: {
        type: "string",
      },
    })
  }
  return params
}

function defaultPathDescription(operationPath, _spec) {
  return `${operationPath}`
}
function defaultMethodDescription(method, _operationPath, spec) {
  const { operationId } = spec[method]
  switch (method) {
    case "get":
      return `Default description: Query: ${operationId}`
    case "post":
      return `Default description: Insert mutation: ${operationId}`
    case "put":
      return `Default description: Update mutation: ${operationId}`
    case "patch":
      return `Default description: Custom mutation with side effects: ${operationId}`
    case "delete":
      return `Default description: Delete mutation: ${operationId}`
    default:
      throw new Error(
        `Unexpected http method: ${method}, for operationId ${operationId}`
      )
  }
}
function defaultMethodSummary(method, _operationPath, spec) {
  const { operationId } = spec[method]
  switch (method) {
    case "get":
      return `${operationId}`
    case "post":
      return `${operationId}`
    case "put":
      return `${operationId}`
    case "patch":
      return `${operationId}`
    case "delete":
      return `${operationId}`
    default:
      throw new Error(
        `Unexpected http method: ${method}, for operationId ${operationId}`
      )
  }
}
function defaultResponseDescription(
  responseKey,
  _responseDef,
  method,
  _operationPath,
  spec
) {
  const { operationId } = spec[method]
  switch (responseKey) {
    case "200":
      return `Default description: Success results ${operationId}`
    default:
      return `Default description: HTTP ${responseKey} for ${operationId}`
  }
}

module.exports = {
  defaultOperationIdConvention,
  defaultOperationPathParameters,
  defaultPathDescription,
  defaultMethodDescription,
  defaultMethodSummary,
  defaultResponseDescription,
}
