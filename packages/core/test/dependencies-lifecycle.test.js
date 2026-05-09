const { test, describe, beforeEach } = require("node:test")
const assert = require("node:assert/strict")
const nctx = require("nctx")

const { freshRequire } = require("./helpers/cwd")

let ctx
let make
let create
let buildFn
let ready

beforeEach(() => {
  // dependencies.js holds module-level state (registries) → reload between
  // tests to avoid cross-test pollution. This is a known limitation
  // (see plan #4 — to be fixed by encapsulating into a Container).
  for (const k of Object.keys(require.cache)) {
    if (k.includes("/packages/core/") && !k.includes("/node_modules/")) {
      delete require.cache[k]
    }
  }
  ctx = freshRequire("~/ctx")
  const deps = freshRequire("~/libs/dependencies")
  make = deps.make
  create = deps.create
  buildFn = deps.build
  ready = deps.ready
})

async function runFull(tree, { afterReady } = {}) {
  return ctx.provide(async () => {
    const root = await make(tree)
    const ctxList = []
    root.recursiveSequential((dep) => ctxList.push(dep.ctx))
    return nctx.provide(ctxList, async () => {
      await root.recursive(buildFn)
      await root.recursive(create)
      await root.recursive(ready)
      // afterReady runs INSIDE the provide scope so callers can assert
      // ctx values that were set during create()/ready().
      if (afterReady) await afterReady(root)
      return root
    })
  })
}

describe("libs/dependencies — full lifecycle", () => {
  test("create() runs in post-order (children before parent)", async () => {
    const order = []
    await runFull({
      create: () => {
        order.push("root")
      },
      dependencies: {
        a: { create: () => order.push("a") },
        b: { create: () => order.push("b") },
      },
    })
    assert.equal(order[order.length - 1], "root")
    assert.ok(order.includes("a"))
    assert.ok(order.includes("b"))
  })

  test("build() runs in post-order and only when build() defined", async () => {
    const order = []
    await runFull({
      create: () => null,
      build: () => order.push("root"),
      dependencies: {
        a: { create: () => null, build: () => order.push("a") },
        b: { create: () => null }, // no build
      },
    })
    assert.deepEqual(order.sort(), ["a", "root"])
  })

  test("buildParams forwarded to build()", async () => {
    let received
    await runFull({
      create: () => null,
      build: (...args) => {
        received = args
      },
      buildParams: ["x", 42],
    })
    assert.deepEqual(received, ["x", 42])
  })

  test("buildParams as function is called and result forwarded", async () => {
    let received
    await runFull({
      create: () => null,
      build: (a) => {
        received = a
      },
      buildParams: () => "computed",
    })
    assert.equal(received, "computed")
  })

  // @bug: dep.params is documented in code but never actually forwarded to the
  // factory. `let params = []; if (dep.params) { typeof check; if (!isArray(params))... }`
  // mistakenly references the local `params`, never `dep.params`. Latent —
  // no consumer in plugins/microservices/alerte-secours uses `params:`.
  test("@expected: create() factory called with dep.params (array)", async () => {
    let receivedArgs
    await runFull({
      create: (...args) => {
        receivedArgs = args
        return "ok"
      },
      params: ["foo", "bar"],
    })
    assert.deepEqual(receivedArgs, ["foo", "bar"])
  })

  test("dep.context() runs before factory and can populate the dep's own ctx", async () => {
    let valueDuringCreate
    await runFull({
      create: () => {
        // dep.ctx falls back to core ctx; reading via core ctx works
        valueDuringCreate = ctx.get("seeded")
        return null
      },
      context: (_depCtx, coreCtx) => {
        coreCtx.set("seeded", "from-context")
      },
    })
    assert.equal(valueDuringCreate, "from-context")
  })

  test("created instance is exposed on ctx via dep.key (visible inside provide scope)", async () => {
    let observed
    await runFull(
      {
        create: () => null,
        dependencies: {
          myDb: { create: () => "the-db" },
        },
        ready: () => {
          observed = ctx.get("myDb")
        },
      },
    )
    assert.equal(observed, "the-db")
  })

  test("singleton: same dep.key shared across the tree returns same instance", async () => {
    let calls = 0
    const factory = () => {
      calls += 1
      return { id: calls }
    }
    await runFull({
      create: () => null,
      dependencies: {
        a: { key: "shared", create: factory },
        b: { key: "shared", create: factory },
      },
    })
    assert.equal(calls, 1)
  })

  test("ready() runs only when ready() defined and receives the instance", async () => {
    let receivedInstance
    let readyCalls = 0
    await runFull({
      create: () => "the-instance",
      ready: (instance) => {
        readyCalls += 1
        receivedInstance = instance
      },
    })
    assert.equal(readyCalls, 1)
    assert.equal(receivedInstance, "the-instance")
  })
})

describe("libs/dependencies — bugs / regressions", () => {
  // @bug #1: ready() does not await its nctx.fork() callback. An async ready
  // hook returns immediately to the caller, and any error inside is unhandled.
  test("@expected: ready() awaits async hook before returning", async () => {
    let asyncDone = false
    const tree = {
      create: () => null,
      ready: async () => {
        await new Promise((r) => setTimeout(r, 30))
        asyncDone = true
      },
    }
    await runFull(tree)
    assert.equal(asyncDone, true, "ready() must await its async body")
  })

  test("@expected: error thrown inside async ready() propagates to caller", async () => {
    const tree = {
      create: () => null,
      ready: async () => {
        throw new Error("ready-boom")
      },
    }
    await assert.rejects(runFull(tree), /ready-boom/)
  })

  // @bug #5: make() mutates the passed-in tree.
  test("@expected: make() does not mutate the input dependency object", async () => {
    const input = {
      create: () => null,
      dependencies: { a: { create: () => 1 } },
    }
    const before = JSON.stringify(Object.keys(input).sort())
    await runFull(input)
    const after = JSON.stringify(Object.keys(input).sort())
    assert.equal(before, after, "make() should not add fields to the input")
  })

  // @bug #11: cycle detection missing.
  test("@expected: cyclic dependency throws a typed error instead of looping", async () => {
    // Build a cycle via shared factory references.
    const a = { create: () => 1, dependencies: {} }
    const b = { create: () => 2, dependencies: { a } }
    a.dependencies.b = b
    await assert.rejects(runFull(a), /cycle/i)
  })
})
