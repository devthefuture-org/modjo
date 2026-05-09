const { test, describe } = require("node:test")
const assert = require("node:assert/strict")

const traverse = require("../utils/object/traverse")
const traverseAsync = require("../utils/object/traverse-async")
const deepmerge = require("../utils/object/deepmerge")
const deepMapKeys = require("../utils/object/deep-map-keys")

describe("utils/object/traverse", () => {
  test("visits each key/value pair (top-level)", () => {
    const visits = []
    traverse({ a: 1, b: 2 }, (k, v, _o, keys) => {
      visits.push([k, v, keys])
    })
    assert.deepEqual(visits, [
      ["a", 1, ["a"]],
      ["b", 2, ["b"]],
    ])
  })

  test("descends into nested objects with cumulative key path", () => {
    const visits = []
    traverse({ a: { b: { c: 1 } } }, (k, _v, _o, keys) => {
      visits.push([k, keys.slice()])
    })
    assert.deepEqual(visits, [
      ["a", ["a"]],
      ["b", ["a", "b"]],
      ["c", ["a", "b", "c"]],
    ])
  })

  test("descends into arrays (treated as objects)", () => {
    const visits = []
    traverse({ a: [10, 20] }, (k) => visits.push(k))
    assert.deepEqual(visits, ["a", "0", "1"])
  })
})

describe("utils/object/traverse-async", () => {
  test("visits each key with sync callback (current sync flow)", async () => {
    const visits = []
    await traverseAsync({ a: 1, b: { c: 2 } }, (k, _v, _o, keys) => {
      visits.push(keys.slice())
    })
    assert.deepEqual(visits, [["a"], ["b"], ["b", "c"]])
  })

  // @bug #2: traverseAsync should await async callbacks but currently does not.
  // This test asserts the EXPECTED behavior (will fail before fix #2).
  test("@expected: awaits async callbacks before recursing", async () => {
    const order = []
    await traverseAsync({ a: 1, b: { c: 2 } }, async (k) => {
      await new Promise((r) => setImmediate(r))
      order.push(k)
    })
    // expected: a, b, c (each visit completes before the next)
    assert.deepEqual(order, ["a", "b", "c"])
  })
})

describe("utils/object/deepmerge", () => {
  test("merges nested objects", () => {
    const r = deepmerge({ a: { x: 1 } }, { a: { y: 2 } })
    assert.deepEqual(r, { a: { x: 1, y: 2 } })
  })

  test("arrays are REPLACED, not concatenated (intentional)", () => {
    const r = deepmerge({ a: [1, 2, 3] }, { a: [9] })
    assert.deepEqual(r, { a: [9] })
  })

  test("scalar override wins", () => {
    const r = deepmerge({ a: 1 }, { a: 2 })
    assert.deepEqual(r, { a: 2 })
  })

  test("supports more than two sources", () => {
    const r = deepmerge({ a: 1 }, { b: 2 }, { c: 3 })
    assert.deepEqual(r, { a: 1, b: 2, c: 3 })
  })
})

describe("utils/object/deep-map-keys", () => {
  test("renames top-level keys", () => {
    const r = deepMapKeys({ a: 1, b: 2 }, (k) => k.toUpperCase())
    assert.deepEqual(r, { A: 1, B: 2 })
  })

  test("renames nested keys", () => {
    const r = deepMapKeys({ a: { b: 1 } }, (k) => `_${k}`)
    assert.deepEqual(r, { _a: { _b: 1 } })
  })

  test("renames keys inside array items", () => {
    const r = deepMapKeys({ list: [{ id: 1 }, { id: 2 }] }, (k) =>
      k.toUpperCase()
    )
    assert.deepEqual(r, { LIST: [{ ID: 1 }, { ID: 2 }] })
  })

  test("non-object input returned as-is", () => {
    assert.equal(deepMapKeys(null), null)
    assert.equal(deepMapKeys(42), 42)
    assert.equal(deepMapKeys("x"), "x")
  })
})
