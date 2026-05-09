const { test, describe, before, after } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")

const getDirsSync = require("../utils/fs/get-dirs-sync")
const dirtree2static = require("../utils/fs/dirtree2static")

let tmpRoot
before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "modjo-utils-fs-"))
})
after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe("utils/fs/get-dirs-sync", () => {
  test("returns directory names only", () => {
    const root = path.join(tmpRoot, "getdirs")
    fs.mkdirSync(path.join(root, "a"), { recursive: true })
    fs.mkdirSync(path.join(root, "b"), { recursive: true })
    fs.writeFileSync(path.join(root, "file.txt"), "")
    const dirs = getDirsSync(root).sort()
    assert.deepEqual(dirs, ["a", "b"])
  })

  test("returns empty array for empty dir", () => {
    const root = path.join(tmpRoot, "empty")
    fs.mkdirSync(root, { recursive: true })
    assert.deepEqual(getDirsSync(root), [])
  })
})

describe("utils/fs/dirtree2static", () => {
  test("emits a JS source string for a tree of .js files", () => {
    const root = path.join(tmpRoot, "tree")
    fs.mkdirSync(path.join(root, "sub"), { recursive: true })
    fs.writeFileSync(path.join(root, "a.js"), "module.exports = 1")
    fs.writeFileSync(path.join(root, "sub/b.js"), "module.exports = 2")
    const src = dirtree2static(root)
    // root return is JS source ready to be assigned
    assert.match(src, /"a":require\("[^"]+a"\)/)
    assert.match(src, /"sub":\{"b":require\("[^"]+b"\)\}/)
  })

  test("filter callback can exclude files/dirs", () => {
    const root = path.join(tmpRoot, "filter")
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(path.join(root, "keep.js"), "module.exports = 1")
    fs.writeFileSync(path.join(root, "skip.js"), "module.exports = 2")
    const src = dirtree2static(root, { filter: (f) => f === "keep.js" })
    assert.match(src, /"keep":/)
    assert.doesNotMatch(src, /"skip":/)
  })

  test("custom loader replaces default require()", () => {
    const root = path.join(tmpRoot, "loader")
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(path.join(root, "a.js"), "")
    const src = dirtree2static(root, {
      loader: () => '"loaded"',
    })
    assert.match(src, /"a":"loaded"/)
  })

  test("yaml loader pattern (custom) parses files", () => {
    const root = path.join(tmpRoot, "yaml")
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(path.join(root, "a.yaml"), "k: v")
    const src = dirtree2static(root, {
      pattern: /\.(yaml|yml)$/,
      loader: () => '{"k":"v"}',
    })
    assert.match(src, /"a":\{"k":"v"\}/)
  })
})
