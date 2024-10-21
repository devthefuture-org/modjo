const ctx = require("./ctx")

module.exports.create = async () => {
  const config = ctx.require("config")
  const logger = ctx.require("logger")
  const httpServer = ctx.require("httpServer")
  const sentry = ctx.get("sentry")

  const app = ctx.require("express")

  console.log("hello")
}

module.exports.dependencies = [
  "config",
  "express",
  "logger",
  "shutdownHandlers",
  "httpServer",
  "sentry",
]

module.exports.ctx = ctx
