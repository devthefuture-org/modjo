const { Command } = require("commander")

// const tracePerformances = require("~/libs/trace-perfs")
const ctx = require("~/ctx")

const dependencies = require("~/libs/dependencies")

module.exports = async function entrypoint(dependency) {
  ctx.provide()

  const root = await dependencies.make(dependency)

  const program = new Command()

  program.name("modjo").description("modjo framework")

  root.recursiveSequential((dep) => {
    dep.ctx.provide()
  })

  async function build() {
    await root.recursive(dependencies.build)
  }

  async function start() {
    await root.recursive(dependencies.create)
    await root.recursive(dependencies.ready)
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
    .description("Start entrypoint, usually called from built docker container")
    .action(async () => {
      await start()
    })

  program
    .command("build")
    .description("Build entrypoint, usually called from docker build process")
    .action(async () => {
      await build()
    })

  await program.parseAsync()
}

module.exports.ctx = ctx
