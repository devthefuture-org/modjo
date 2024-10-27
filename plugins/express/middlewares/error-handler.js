const httpError = require("http-errors")
const { ctx } = require("../ctx")

module.exports = () => {
  const logger = ctx.require("logger")
  return function errorsHandler(err, _req, res, next) {
    const isHttp = httpError.isHttpError(err)
    if (!isHttp || err.statusCode >= 500) {
      logger.error(err.message)
      logger.error(err.stack)
    }
    if (res.headersSent) {
      next(err)
    } else if (isHttp && err.expose) {
      res
        .status(err.statusCode)
        .send({ code: err.statusCode, message: err.message })
    } else {
      res.status(500).send({
        code: 500,
        message: "Internal Server Error",
        ...(res.sentry ? { sentry: res.sentry } : {}),
      })
    }
  }
}
