const { ctx } = require("../../ctx")

module.exports = async function errorWrapperFactory(handler) {
  const logger = ctx.require("logger")
  return async (...args) => {
    try {
      const res = await handler(...args)
      return res
    } catch (err) {
      logger.error(err)
      return false
    }
  }
}
