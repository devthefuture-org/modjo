const { test, describe } = require("node:test")
const assert = require("node:assert/strict")

const runtime = require("../runtime")
const entrypoint = require("../index")

describe("runtime() — programmatic API", () => {
  test("dev mode runs build + create + ready, returns root and ctx", async () => {
    const order = []
    const result = await runtime({
      build: () => order.push("build-root"),
      create: () => {
        order.push("create-root")
        return "root"
      },
      ready: () => order.push("ready-root"),
      dependencies: {
        a: {
          build: () => order.push("build-a"),
          create: () => {
            order.push("create-a")
            return "a"
          },
          ready: () => order.push("ready-a"),
        },
      },
    })
    assert.equal(typeof result.root, "object")
    assert.ok(result.ctx)
    assert.ok(result.container)
    // build runs in post-order, create in post-order, ready in post-order
    assert.deepEqual(order, [
      "build-a",
      "build-root",
      "create-a",
      "create-root",
      "ready-a",
      "ready-root",
    ])
  })

  test("mode=build only triggers build phase", async () => {
    const order = []
    await runtime(
      {
        build: () => order.push("build"),
        create: () => order.push("create"),
        ready: () => order.push("ready"),
      },
      { mode: "build" }
    )
    assert.deepEqual(order, ["build"])
  })

  test("mode=start only triggers create + ready (no build)", async () => {
    const order = []
    await runtime(
      {
        build: () => order.push("build"),
        create: () => {
          order.push("create")
          return "x"
        },
        ready: () => order.push("ready"),
      },
      { mode: "start" }
    )
    assert.deepEqual(order, ["create", "ready"])
  })

  test("onReady callback receives root/ctx/container and runs inside scope", async () => {
    let received
    await runtime(
      {
        create: () => "value",
      },
      {
        onReady: ({ root, ctx, container }) => {
          received = { rootKind: typeof root, ctx, container }
        },
      }
    )
    assert.equal(received.rootKind, "object")
    assert.ok(received.ctx)
    assert.ok(received.container)
  })

  test("two consecutive runtime() calls do not share singletons", async () => {
    let calls = 0
    const tree = () => ({
      dependencies: {
        db: {
          key: "db",
          create: () => {
            calls += 1
            return { id: calls }
          },
        },
      },
    })
    await runtime(tree())
    await runtime(tree())
    assert.equal(calls, 2)
  })
})

describe("entrypoint (CLI) — backward-compat surface", () => {
  test("module.exports is a function", () => {
    assert.equal(typeof entrypoint, "function")
  })

  test("module.exports.ctx is exported (used by plugins via destructuring)", () => {
    assert.ok(entrypoint.ctx)
    assert.equal(typeof entrypoint.ctx.provide, "function")
    assert.equal(typeof entrypoint.ctx.set, "function")
    assert.equal(typeof entrypoint.ctx.get, "function")
  })

  test("module.exports exposes runtime, createContainer, errors", () => {
    assert.equal(typeof entrypoint.runtime, "function")
    assert.equal(typeof entrypoint.createContainer, "function")
    assert.equal(typeof entrypoint.errors, "object")
    assert.equal(typeof entrypoint.errors.ModjoError, "function")
  })

  test("entrypoint('build') runs build phase via commander argv", async () => {
    const prevArgv = process.argv
    process.argv = ["node", "modjo", "build"]
    try {
      let buildCalled = false
      await entrypoint({
        build: () => {
          buildCalled = true
        },
        create: () => null,
      })
      assert.equal(buildCalled, true)
    } finally {
      process.argv = prevArgv
    }
  })
})
