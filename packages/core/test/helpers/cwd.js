const fs = require("node:fs")
const path = require("node:path")

const FIXTURE_CWD = path.resolve(__dirname, "..", "fixtures", "cwd")

const CORE_ROOT = path.resolve(__dirname, "..", "..")

function clearCoreModuleCache() {
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(`${CORE_ROOT}/`) && !k.includes("/node_modules/")) {
      delete require.cache[k]
    }
    if (k.startsWith(`${FIXTURE_CWD}/`)) {
      delete require.cache[k]
    }
  }
}

function ensureEmptyRequiresFile() {
  // dynamic-require currently relies on `${cwd}/build/requires.js` existing
  // when looking up a plugin that hasn't been registered yet (otherwise an
  // ENOENT escapes the catch). In production the build phase creates it.
  // Tests cold-start, so we seed it. See @bug note in plugins/dynamic-require.
  const buildDir = path.join(FIXTURE_CWD, "build")
  fs.mkdirSync(buildDir, { recursive: true })
  fs.writeFileSync(path.join(buildDir, "requires.js"), "module.exports={}")
}

function withFixtureCwd(fn) {
  const prev = process.cwd()
  process.chdir(FIXTURE_CWD)
  clearCoreModuleCache()
  ensureEmptyRequiresFile()
  try {
    return fn()
  } finally {
    process.chdir(prev)
    clearCoreModuleCache()
    const buildDir = path.join(FIXTURE_CWD, "build")
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true, force: true })
    }
  }
}

async function withFixtureCwdAsync(fn) {
  const prev = process.cwd()
  process.chdir(FIXTURE_CWD)
  clearCoreModuleCache()
  ensureEmptyRequiresFile()
  try {
    return await fn()
  } finally {
    process.chdir(prev)
    clearCoreModuleCache()
    const buildDir = path.join(FIXTURE_CWD, "build")
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true, force: true })
    }
  }
}

function freshRequire(modulePath) {
  const resolved = require.resolve(modulePath)
  delete require.cache[resolved]
  return require(modulePath)
}

module.exports = { FIXTURE_CWD, withFixtureCwd, withFixtureCwdAsync, freshRequire }
