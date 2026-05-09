const { test, describe } = require("node:test")
const assert = require("node:assert/strict")
const nctx = require("nctx")

const ctx = require("../ctx")
const { createContainer } = require("../libs/dependencies")

async function runFull(container, tree, { afterReady } = {}) {
  return ctx.provide(async () => {
    const root = await container.make(tree)
    const ctxList = []
    root.recursiveSequential((dep) => ctxList.push(dep.ctx))
    return nctx.provide(ctxList, async () => {
      await root.recursive(container.build)
      await root.recursive(container.create)
      await root.recursive(container.ready)
      if (afterReady) await afterReady(root)
      return root
    })
  })
}

describe("createContainer — isolation between runs", () => {
  test("two containers do not share singleton state", async () => {
    let calls = 0
    const factory = () => {
      calls += 1
      return { id: calls }
    }
    const tree = () => ({
      create: () => null,
      dependencies: { db: { key: "db", create: factory } },
    })

    const c1 = createContainer()
    await runFull(c1, tree())

    const c2 = createContainer()
    await runFull(c2, tree())

    // each container should call the factory once → 2 total
    assert.equal(calls, 2)
  })

  test("two containers do not share build markers", async () => {
    let buildCalls = 0
    const tree = () => ({
      create: () => null,
      build: () => {
        buildCalls += 1
      },
    })

    const c1 = createContainer()
    await runFull(c1, tree())
    const c2 = createContainer()
    await runFull(c2, tree())

    assert.equal(buildCalls, 2)
  })

  test("two containers do not share ready markers", async () => {
    let readyCalls = 0
    const tree = () => ({
      create: () => null,
      ready: () => {
        readyCalls += 1
      },
    })

    const c1 = createContainer()
    await runFull(c1, tree())
    const c2 = createContainer()
    await runFull(c2, tree())

    assert.equal(readyCalls, 2)
  })
})

describe("createContainer — dispose phase", () => {
  test("dispose() runs only when dep.dispose is defined", async () => {
    const calls = []
    const tree = {
      create: () => "root-instance",
      dispose: (instance) => {
        calls.push(["root", instance])
      },
      dependencies: {
        a: { create: () => "a-instance", dispose: (i) => calls.push(["a", i]) },
        b: { create: () => "b-instance" }, // no dispose, must be skipped
      },
    }
    const container = createContainer()
    await ctx.provide(async () => {
      const root = await container.make(tree)
      const ctxList = []
      root.recursiveSequential((dep) => ctxList.push(dep.ctx))
      await nctx.provide(ctxList, async () => {
        await root.recursive(container.build)
        await root.recursive(container.create)
        await root.recursive(container.ready)
        await root.recursive(container.dispose)
      })
    })

    // both root and a disposed; b skipped
    const labels = calls.map(([l]) => l).sort()
    assert.deepEqual(labels, ["a", "root"])
    // each received its instance
    assert.equal(calls.find(([l]) => l === "root")[1], "root-instance")
    assert.equal(calls.find(([l]) => l === "a")[1], "a-instance")
  })

  test("dispose() runs at most once per dep (idempotent)", async () => {
    let disposeCount = 0
    const tree = { create: () => null, dispose: () => disposeCount++ }
    const container = createContainer()
    await ctx.provide(async () => {
      const root = await container.make(tree)
      const ctxList = []
      root.recursiveSequential((dep) => ctxList.push(dep.ctx))
      await nctx.provide(ctxList, async () => {
        await root.recursive(container.build)
        await root.recursive(container.create)
        await root.recursive(container.ready)
        await root.recursive(container.dispose)
        await root.recursive(container.dispose)
      })
    })
    assert.equal(disposeCount, 1)
  })
})
