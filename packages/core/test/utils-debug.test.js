const { test, describe } = require("node:test")
const assert = require("node:assert/strict")

const timeLogger = require("../utils/debug/time-logger")
const memoryUsage = require("../utils/debug/memory-usage")

describe("utils/debug/time-logger", () => {
  test("returns instance with end()", () => {
    const t = timeLogger()
    assert.equal(typeof t.end, "function")
  })

  test("calls logger[level] with elapsed message", () => {
    const calls = []
    const logger = { debug: (...args) => calls.push(["debug", ...args]) }
    const t = timeLogger({ logger, label: "boot" })
    t.end()
    assert.equal(calls.length, 1)
    assert.equal(calls[0][0], "debug")
    assert.match(calls[0][1], /^boot: /)
  })

  test("end() can override logger / label / logLevel", () => {
    const calls = []
    const logger = { info: (...args) => calls.push(["info", ...args]) }
    const t = timeLogger()
    t.end({ logger, label: "override", logLevel: "info" })
    assert.equal(calls[0][0], "info")
    assert.match(calls[0][1], /^override: /)
  })

  test("exposes TimeLogger class on factory", () => {
    assert.equal(typeof timeLogger.TimeLogger, "function")
  })
})

describe("utils/debug/memory-usage", () => {
  test("returns object with rss/heapTotal/heapUsed/external strings", () => {
    const u = memoryUsage()
    assert.ok(typeof u.rss === "string")
    assert.ok(typeof u.heapTotal === "string")
    assert.ok(typeof u.heapUsed === "string")
    assert.ok(typeof u.external === "string")
    assert.match(u.rss, / MB ->/)
  })
})
