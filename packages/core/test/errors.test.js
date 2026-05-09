const { test, describe } = require("node:test")
const assert = require("node:assert/strict")

const errors = require("../libs/errors")
const ctx = require("../ctx")
const { createContainer } = require("../libs/dependencies")
const { withFixtureCwd } = require("./helpers/cwd")

describe("libs/errors", () => {
  test("ModjoError is the common base", () => {
    assert.ok(new errors.PluginNotFoundError("x") instanceof errors.ModjoError)
    assert.ok(new errors.DependencyCycleError("a > b") instanceof errors.ModjoError)
    assert.ok(new errors.InvalidDependencyError({}) instanceof errors.ModjoError)
  })

  test("each error carries its own name", () => {
    assert.equal(new errors.PluginNotFoundError("x").name, "PluginNotFoundError")
    assert.equal(new errors.DependencyCycleError("a").name, "DependencyCycleError")
    assert.equal(new errors.InvalidDependencyError({}).name, "InvalidDependencyError")
  })

  test("PluginNotFoundError keeps the plugin name as field", () => {
    const e = new errors.PluginNotFoundError("foo")
    assert.equal(e.pluginName, "foo")
    assert.match(e.message, /"foo"/)
  })
})

describe("typed errors at lifecycle boundaries", () => {
  test("getPlugin throws PluginNotFoundError", () => {
    withFixtureCwd(() => {
      const { getPlugin } = require("../libs/plugins")
      // re-require errors inside fixture: clearCoreModuleCache invalidates
      // class identity from the outer require
      const localErrors = require("../libs/errors")
      assert.throws(
        () => getPlugin("totally-missing-plugin"),
        (e) => e instanceof localErrors.PluginNotFoundError
      )
    })
  })

  test("cyclic dependency throws DependencyCycleError", async () => {
    const a = { create: () => 1, dependencies: {} }
    const b = { create: () => 2, dependencies: { a } }
    a.dependencies.b = b

    const c = createContainer()
    await ctx.provide(async () => {
      await assert.rejects(
        c.make(a),
        (e) => e instanceof errors.DependencyCycleError
      )
    })
  })

  test("invalid dependency item throws InvalidDependencyError", async () => {
    const c = createContainer()
    await ctx.provide(async () => {
      await assert.rejects(
        c.make({ create: () => null, dependencies: [42] }),
        (e) => e instanceof errors.InvalidDependencyError
      )
    })
  })
})
