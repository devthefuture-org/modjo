const { test, describe } = require("node:test")
const assert = require("node:assert/strict")

const promisePublic = require("../utils/async/promise-public")
const promiseObject = require("../utils/async/promise-object")
const isPromise = require("../utils/async/is-promise")
const findAsync = require("../utils/async/find-async")

describe("utils/async/promise-public", () => {
  test("returns object with promise/resolve/reject", () => {
    const p = promisePublic()
    assert.ok(p.promise instanceof Promise)
    assert.equal(typeof p.resolve, "function")
    assert.equal(typeof p.reject, "function")
  })

  test("external resolve fulfills the promise", async () => {
    const { promise, resolve } = promisePublic()
    resolve("ok")
    assert.equal(await promise, "ok")
  })

  test("external reject rejects the promise", async () => {
    const { promise, reject } = promisePublic()
    const err = new Error("boom")
    reject(err)
    await assert.rejects(promise, /boom/)
  })
})

describe("utils/async/promise-object", () => {
  test("resolves all values in object shape", async () => {
    const result = await promiseObject({
      a: Promise.resolve(1),
      b: Promise.resolve(2),
      c: 3,
    })
    assert.deepEqual(result, { a: 1, b: 2, c: 3 })
  })

  test("rejects if any value rejects", async () => {
    await assert.rejects(
      promiseObject({ a: Promise.resolve(1), b: Promise.reject(new Error("x")) }),
      /x/
    )
  })

  test("preserves keys for empty object", async () => {
    assert.deepEqual(await promiseObject({}), {})
  })
})

describe("utils/async/is-promise", () => {
  test("true for native Promise", () => {
    assert.equal(isPromise(Promise.resolve()), true)
  })
  test("true for thenable with then+catch", () => {
    assert.equal(isPromise({ then: () => {}, catch: () => {} }), true)
  })
  test("false for plain object", () => {
    assert.equal(isPromise({}), false)
  })
  test("strict false for null/undefined", () => {
    assert.equal(isPromise(null), false)
    assert.equal(isPromise(undefined), false)
  })
  test("false for thenable without catch", () => {
    assert.equal(isPromise({ then: () => {} }), false)
  })
})

describe("utils/async/find-async", () => {
  test("returns first truthy item", async () => {
    const found = await findAsync([1, 2, 3], async (x) => x === 2)
    assert.equal(found, 2)
  })
  test("returns undefined when none match", async () => {
    const found = await findAsync([1, 2, 3], async () => false)
    assert.equal(found, undefined)
  })
  test("evaluates predicates concurrently (Promise.all)", async () => {
    let order = []
    const arr = [10, 30, 20]
    await findAsync(arr, async (x) => {
      await new Promise((r) => setTimeout(r, x))
      order.push(x)
      return false
    })
    // All callbacks start synchronously, so order is by delay
    assert.deepEqual(order, [10, 20, 30])
  })
})
