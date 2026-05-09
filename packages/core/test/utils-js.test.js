const { test, describe } = require("node:test")
const assert = require("node:assert/strict")

const stringifyJS = require("../utils/js/stringify-js")

describe("utils/js/stringify-js", () => {
  test("returns scalar inputs unchanged (number/string/null)", () => {
    assert.equal(stringifyJS(42), 42)
    assert.equal(stringifyJS("foo"), "foo")
    assert.equal(stringifyJS(null), null)
  })

  test("returns array unchanged (not deep-stringified)", () => {
    const arr = [1, 2, 3]
    assert.equal(stringifyJS(arr), arr)
  })

  test("stringifies plain object as JS source (no quoting on values)", () => {
    const r = stringifyJS({ a: "x", b: "y" })
    // values produced via recursion: a is a string, value passes through
    assert.equal(r, '{"a":x,"b":y}')
  })

  test("stringifies nested objects recursively", () => {
    const r = stringifyJS({ a: { b: "c" } })
    assert.equal(r, '{"a":{"b":c}}')
  })

  test("preserves require()-like raw strings as values (use case)", () => {
    const r = stringifyJS({ mod: 'require("foo")' })
    assert.equal(r, '{"mod":require("foo")}')
  })
})
