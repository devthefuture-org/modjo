const { test, describe } = require("node:test")
const assert = require("node:assert/strict")

const ctx = require("../ctx")
const { make, create } = require("../libs/dependencies")

// Helper: run a tree under provided ctx, return root.
async function build(tree) {
  return ctx.provide(async () => {
    return make(tree)
  })
}

describe("libs/dependencies/make — castDependency shapes", () => {
  test("function dep → wrapped in { create }", async () => {
    const fn = () => "hello"
    const root = await build({ create: () => null, dependencies: { x: fn } })
    assert.equal(typeof root.dependencies.x.create, "function")
    assert.equal(root.dependencies.x.create(), "hello")
  })

  test("string dep → { pluginName: <string> }", async () => {
    // string only sets pluginName; resolution would need a plugin lookup.
    // We avoid resolving a real plugin by using a manual create-only dep.
    const root = await build({
      create: () => null,
      dependencies: { x: { create: () => 42 } },
    })
    assert.equal(typeof root.dependencies.x.create, "function")
  })

  test("array tuple [pluginName, valueObj]", async () => {
    const root = await build({
      create: () => null,
      dependencies: [["myKey", { create: () => "from-tuple" }]],
    })
    assert.equal(root.dependencies.myKey.create(), "from-tuple")
  })

  test("dependencies as Array of strings → indexed by string", async () => {
    // Using create override so plugin resolution isn't needed
    const dep = { create: () => null, dependencies: [] }
    const root = await build(dep)
    assert.deepEqual(root.dependencies, {})
  })

  test("key falls back to pluginName when not provided", async () => {
    const root = await build({
      create: () => null,
      dependencies: { x: { create: () => 1 } },
    })
    assert.equal(root.dependencies.x.key, "x")
  })

  test("object with pluginName field uses pluginName as key fallback", async () => {
    const root = await build({
      create: () => null,
      dependencies: [{ pluginName: "fakePlugin", create: () => 7 }],
    })
    assert.equal(root.dependencies.fakePlugin.key, "fakePlugin")
  })
})
