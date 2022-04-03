const defaultsDeep = require("lodash.defaultsdeep")
const swaggerUi = require("swagger-ui-express")

const defaultOptions = {
  swaggerOptions: {},
}

function createSwaggerServer(options = {}) {
  defaultsDeep(options, defaultOptions)

  const swaggerUiOptions = {
    swaggerOptions: options.swaggerOptions,
  }
  return [swaggerUi.serve, swaggerUi.setup(null, swaggerUiOptions)]
}

module.exports = createSwaggerServer
