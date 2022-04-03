const util = require("util")
const get = require("lodash.get")
const set = require("lodash.set")
const defaultsDeep = require("lodash.defaultsdeep")

const yup = require("yup")

const optionsSchema = yup.object({
  async: yup.bool(),
  cast: yup.bool(),
  errorFull: yup.bool(),
  errorDepth: yup.number().positive().integer(),
  defaults: yup.object(),
  validate: yup.object(),
  properties: yup.object().shape({
    required: yup.bool(),
    validate: yup.object(),
  }),
  required: yup.array().of(yup.string()),
})

const defaultOptions = {
  async: false,
  cast: false,
  errorFull: false,
  errorDepth: 2,
  defaults: {},
  validate: {},
  required: [],
  properties: {},
}

function mergeSchemas(...schemas) {
  const [first, ...rest] = schemas.filter((schema) => !!schema)
  const merged = rest.reduce(
    (mergedSchemas, schema) => mergedSchemas.concat(schema),
    first
  )
  return merged
}

module.exports = function createOptions(
  options = {},
  funcName = Symbol("undefined")
) {
  defaultsDeep(options, defaultOptions)
  optionsSchema.validateSync(options)

  const { validate } = options

  const { properties } = options
  const { required } = options

  for (const [k, prop] of Object.entries(properties)) {
    const key = k.split(".").join(".fields.")
    const validator = get(validate, key)
    const { validate: validateProp, required: requiredProp } = prop
    if (requiredProp) {
      required.push(k)
    }
    set(validate, key, mergeSchemas(validator, validateProp))
  }

  for (const k of required) {
    const key = k.split(".").join(".fields.")
    const validator = get(validate, key)
    if (validator) {
      set(validate, key, validator.required())
    } else {
      set(validate, key, yup.mixed().required())
    }
  }

  const { cast, errorFull, errorDepth } = options
  const validator = yup.object(validate)

  if (options.async) {
    return async (opts) => {
      defaultsDeep(opts, options.defaults)
      try {
        await validator.validate(opts)
      } catch (e) {
        if (funcName) {
          e.message += ` calling function "${funcName.toString()}"`
        }
        if (!errorFull) {
          e.value = util.inspect(e.value, { depth: errorDepth })
        }
        throw e
      }
      if (cast) {
        Object.assign(opts, validator.cast(opts))
      }
    }
  }

  return (opts) => {
    defaultsDeep(opts, options.defaults)
    try {
      validator.validateSync(opts)
    } catch (e) {
      if (funcName) {
        e.message += ` calling function "${funcName}"`
      }
      if (!errorFull) {
        e.value = util.inspect(e.value, { depth: errorDepth })
      }
      throw e
    }
    if (cast) {
      Object.assign(opts, validator.cast(opts))
    }
  }
}
