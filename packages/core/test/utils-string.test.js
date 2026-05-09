const { test, describe } = require("node:test")
const assert = require("node:assert/strict")

const pascalCase = require("../utils/string/pascal-case")

describe("utils/string/pascal-case", () => {
  test("simple word", () => {
    assert.equal(pascalCase("hello"), "Hello")
  })
  test("kebab-case input", () => {
    assert.equal(pascalCase("hello-world"), "Helloworld")
  })
  test("snake_case input", () => {
    assert.equal(pascalCase("hello_world"), "Helloworld")
  })
  test("space-separated input", () => {
    assert.equal(pascalCase("hello world"), "Helloworld")
  })
  // Note: this is the actual current behavior (lodash.capitalize lowercases the rest)
  // It is NOT real PascalCase ("HelloWorld") despite the function name.
})
