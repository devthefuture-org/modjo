const cors = require("cors")
const cookieParser = require("cookie-parser")
const nctx = require("nctx")
const express = require("express")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

const { reqCtx } = require("./ctx")

const rawBodySaver = function (req, _res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || "utf8")
  }
}

module.exports.create = () => {
  const config = ctx.require("config")
  const logger = ctx.require("logger")
  const httpServer = ctx.require("httpServer")
  const sentry = ctx.get("sentry")

  // express
  const app = express()

  // express settings https://expressjs.com/en/5x/api.html#app.settings.table
  app.set("env", config.nodeEnv)

  // sentry
  if (sentry) {
    app.use(sentry.Handlers.requestHandler())
  }

  // express parsers
  app.use(express.urlencoded({ extended: false }))
  app.use(express.text())

  app.use(express.json({ verify: rawBodySaver, extended: true }))
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
  if (sentry) {
    app.use(sentry.Handlers.errorHandler())
  }
  app.use((err, _, res, next) => {
    if (err) {
      return res.status(err.status || 500).json({
        message: err.message,
        errors: err.errors,
        ...(res.sentry ? { sentry: res.sentry } : {}),
      })
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
