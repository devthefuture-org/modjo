const cors = require("cors")
const cookieParser = require("cookie-parser")
const express = require("express")

const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

const { reqCtx } = require("./ctx")

module.exports.create = () => {
  const config = ctx.require("config")
  const logger = ctx.require("logger")
  const httpServer = ctx.require("httpServer")

  // express
  const app = express()

  // express settings https://expressjs.com/en/5x/api.html#app.settings.table
  app.set("env", config.nodeEnv)

  // express parsers
  app.use(express.urlencoded({ extended: false }))
  app.use(express.text())
  app.use(express.json())
  app.use(cookieParser())

  // debug incoming
  // app.use((req, _res, next) => {
  //   console.log(req.headers)
  //   console.log(req.body)
  //   next()
  // })

  // reqCtx
  app.use(reqCtx.createAppMiddleware())

  // middlewares context
  app.use(async (req, _res, next) => {
    const reqLogger = logger.child({ path: req.path })
    req.logger = reqLogger
    reqCtx.set("logger", reqLogger)
    next()
  })

  if (config.express?.logRequests !== false) {
    const httpLogger = ctx.require("httpLogger")
    app.use(httpLogger)
  }

  // cors
  app.use(
    cors({
      credentials: true,
      origin: true,
    })
  )

  // errors
  app.use((err, _, res, next) => {
    if (err) {
      return res.status(err.status || 500).json({
        message: err.message,
        errors: err.errors,
      })
      // sentry.captureException(error);
    }
    return next()
  })

  // only if you're behind a reverse proxy
  app.enable("trust proxy")

  // disable x-powered-by header
  app.disable("x-powered-by")

  // debug
  // app.use((req, _res, next) => {
  //   console.log("req.body", req.body)
  //   next()
  // })

  // httpServer
  httpServer.on("request", app)

  return app
}

module.exports.dependencies = ["config", "logger", "httpLogger", "httpServer"]

module.exports.ctx = ctx
