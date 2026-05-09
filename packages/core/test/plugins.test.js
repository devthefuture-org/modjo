const { test, describe } = require("node:test")
const assert = require("node:assert/strict")

const { withFixtureCwd } = require("./helpers/cwd")

describe("libs/plugins/getPlugin", () => {
  test("resolves a local plugin by exact name (src/plugins/<name>/index.js)", () => {
    withFixtureCwd(() => {
      const { getPlugin } = require("../libs/plugins")
      const dep = getPlugin("foo")
      assert.equal(dep.marker, "local-foo")
      assert.equal(typeof dep.create, "function")
    })
  })

  test("resolves a local plugin via kebab-case fallback (camelCase → kebab-case)", () => {
    withFixtureCwd(() => {
      const { getPlugin } = require("../libs/plugins")
      const dep = getPlugin("barBaz")
      assert.equal(dep.marker, "local-bar-baz")
    })
  })

  test("caches the resolved plugin (second call returns same object)", () => {
    withFixtureCwd(() => {
      const { getPlugin } = require("../libs/plugins")
      const a = getPlugin("foo")
      const b = getPlugin("foo")
      assert.equal(a, b)
    })
  })

  test("throws an explicit error when plugin cannot be found anywhere", () => {
    withFixtureCwd(() => {
      const { getPlugin } = require("../libs/plugins")
      assert.throws(
        () => getPlugin("definitely-does-not-exist-xyz"),
        /required plugin not found/
      )
    })
  })
})
