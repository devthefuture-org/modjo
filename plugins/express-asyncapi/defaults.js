const capitalize = require("lodash.capitalize")
const camelCase = require("lodash.camelcase")

const pathParamRegex = /\{(.+?)\}/g

function defaultOperationIdConvention(operationPath, method) {
  const keys = operationPath.split("/")
  keys.shift()
  // fix this to index=many, else = one
  const perPrefix = operationPath.endsWith("/") ? "many" : "one"
  keys.unshift(perPrefix)

  const methodPrefix = method
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

function defaultChannelPathParameters(operationPath, spec) {
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
    case "pub":
      return `Default description: Publish mutation: ${operationId}`
    case "sub":
      return `Default description: Subscribe mutation: ${operationId}`
    default:
      throw new Error(
        `Unexpected ws method: ${method}, for operationId ${operationId}`
      )
  }
}
function defaultMethodSummary(method, _operationPath, spec) {
  const { operationId } = spec[method]
  switch (method) {
    case "pub":
      return `${operationId}`
    case "sub":
      return `${operationId}`
    default:
      throw new Error(
        `Unexpected ws method: ${method}, for operationId ${operationId}`
      )
  }
}

module.exports = {
  defaultOperationIdConvention,
  defaultChannelPathParameters,
  defaultPathDescription,
  defaultMethodDescription,
  defaultMethodSummary,
}
