// NOTE:
// sentry need to be called before all for instrumentation so we need that we avoid generally:
// global (and singletons)
const Sentry = require("./init")

module.exports.create = () => {
  return Sentry
}

module.exports.ctx = require("nctx").create(Symbol(__dirname.split("/").pop()))
