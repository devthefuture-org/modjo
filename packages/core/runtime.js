const nctx = require("nctx")

const ctx = require("./ctx")
const { createContainer } = require("./libs/dependencies")

// Programmatic, CLI-free runtime. Use this from tests, embedded contexts,
// lambda handlers, anywhere that doesn't want a commander process.
//
// Each call creates an isolated Container, so running runtime() twice in the
// same process does NOT share singleton state between runs.
//
// `mode` defaults to "dev" (build + start). Pass "build" or "start" to run
// only one phase, mirroring the CLI commands. The optional `dispose` callback
// passed via `opts.onReady` runs inside the same nctx scope after `ready`,
// useful for tests/embedded usage that need to read or close ctx values.
async function runtime(dependency, opts = {}) {
  const { mode = "dev", onReady } = opts
  return ctx.provide(async () => {
    const container = createContainer()
    const root = await container.make(dependency)

    const ctxList = []
    root.recursiveSequential((dep) => {
      ctxList.push(dep.ctx)
    })

    return nctx.provide(ctxList, async () => {
      if (mode === "build" || mode === "dev") {
        await root.recursive(container.build)
      }
      if (mode === "start" || mode === "dev") {
        await root.recursive(container.create)
        await root.recursive(container.ready)
      }
      if (onReady) {
        return onReady({ root, ctx, container })
      }
      return { root, ctx, container }
    })
  })
}

module.exports = runtime
module.exports.ctx = ctx
