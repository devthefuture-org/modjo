const nctx = require("nctx")
// const express = require("express")

const reqCtx = nctx.create(Symbol("express.req"))

reqCtx.createAppMiddleware = () => {
  return (req, res, next) => {
    reqCtx.provide(async () => {
      reqCtx.share(req)
      res.on("finish", () => {
        reqCtx.endShare(req)
      })
      reqCtx.set("req", req)
      next()
    })
  }
}

reqCtx.createRouterMiddleware = () => {
  return function (req, _res, next) {
    reqCtx.provide(() => {
      if (next) {
        next()
      }
    }, req)
  }
}

// const { Router } = express
// express.Router = (...args) => {
//   const router = Router(...args)
//   router.use(reqCtx.createRouterMiddleware())
//   return router
// }

reqCtx.setRouterContext = (router) => {
  router.use(reqCtx.createRouterMiddleware())
}

module.exports = { reqCtx }
