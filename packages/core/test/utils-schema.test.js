const { test, describe } = require("node:test")
const assert = require("node:assert/strict")
const yup = require("yup")

const createOptions = require("../utils/schema/options")

describe("utils/schema/options", () => {
  test("applies defaults onto opts", () => {
    const validate = createOptions({
      defaults: { foo: "bar", count: 1 },
    })
    const opts = {}
    validate(opts)
    assert.deepEqual(opts, { foo: "bar", count: 1 })
  })

  test("merges defaults without overwriting provided values", () => {
    const validate = createOptions({
      defaults: { foo: "bar", count: 1 },
    })
    const opts = { foo: "custom" }
    validate(opts)
    assert.deepEqual(opts, { foo: "custom", count: 1 })
  })

  test("validates with provided yup schema", () => {
    const validate = createOptions(
      { validate: { name: yup.string().required() } },
      "test"
    )
    assert.throws(() => validate({}), /name/)
    assert.doesNotThrow(() => validate({ name: "ok" }))
  })

  test("required list applied via dot path", () => {
    const validate = createOptions({ required: ["name"] }, "test")
    assert.throws(() => validate({}), /name/)
  })

  test("properties.required pushes onto required", () => {
    const validate = createOptions(
      { properties: { name: { required: true } } },
      "test"
    )
    assert.throws(() => validate({}), /name/)
  })

  test("default Symbol funcName works in sync path (uses toString)", () => {
    const validate = createOptions({ required: ["x"] })
    assert.throws(() => validate({}), /Symbol\(undefined\)/)
  })

  test("cast=true assigns coerced values onto opts", () => {
    const validate = createOptions({
      cast: true,
      validate: { count: yup.number() },
    })
    const opts = { count: "42" }
    validate(opts)
    assert.equal(opts.count, 42)
  })

  test("async variant returns a Promise and validates async", async () => {
    const validate = createOptions({
      async: true,
      validate: { name: yup.string().required() },
    })
    await assert.rejects(validate({}), /name/)
    await assert.doesNotReject(validate({ name: "ok" }))
  })

  test("error message is enriched with funcName", () => {
    const validate = createOptions({ required: ["x"] }, "myFunc")
    try {
      validate({})
      assert.fail("expected throw")
    } catch (e) {
      assert.match(e.message, /myFunc/)
    }
  })
})
