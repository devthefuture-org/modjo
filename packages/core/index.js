const { Command } = require("commander")
const nctx = require("nctx")

// const tracePerformances = require("./libs/trace-perfs")
const dbug = require("@foundernetes/dbug")
const ctx = require("./ctx")

const { createContainer } = require("./libs/dependencies")
const runtime = require("./runtime")

if (!process.env.DISABLE_DBUG_REGISTER) {
  dbug.registerGlobal()
}

// Public CLI-driven entrypoint. Mirrors the historical behavior: parses argv
// via commander and dispatches to dev/start/build. For programmatic /
// embedded use (tests, lambdas), prefer require("@modjo/core/runtime")
// which is identical without the commander dependency.
module.exports = async function entrypoint(dependency) {
  await ctx.provide(async () => {
    const container = createContainer()
    const root = await container.make(dependency)

    const program = new Command()
    program.name("modjo").description("modjo framework")

    const ctxList = []
    root.recursiveSequential((dep) => {
      ctxList.push(dep.ctx)
    })

    await nctx.provide(ctxList, async () => {
      async function build() {
        await root.recursive(container.build)
      }

      async function start() {
        await root.recursive(container.create)
        await root.recursive(container.ready)
        // tracePerformances()
      }

      program
        .command("dev")
        .description("Dev entrypoint, usually called from local machine")
        .action(async () => {
          await build()
          await start()
        })

      program
        .command("start")
        .description(
          "Start entrypoint, usually called from built docker container"
        )
        .action(async () => {
          await start()
        })

      program
        .command("build")
        .description(
          "Build entrypoint, usually called from docker build process"
        )
        .action(async () => {
          await build()
        })

      await program.parseAsync()
    })
  })
}

module.exports.ctx = ctx
module.exports.runtime = runtime
module.exports.createContainer = createContainer
module.exports.errors = require("./libs/errors")
