const path = require("path")
const kebabcase = require("lodash/kebabCase")

const dynamicRequire = require("../utils/fs/dynamic-require")
const { PluginNotFoundError } = require("./errors")

const plugins = {}

const getPluginRegistry = (name) => {
  return plugins[name]
}

const getPluginLocal = (name) => {
  const customDir = path.join(process.cwd(), "src", "plugins")
  const lookup = [name, `${kebabcase(name)}`]
  for (const f of lookup) {
    const custom = path.join(customDir, f)
    const r = dynamicRequire(custom, `~plugins/${f}`)
    if (r) {
      return r
    }
  }
}

// MODULE_NOT_FOUND is the expected miss when a name is not present in the
// scope being probed. Every other error bubbles up to the caller (avoids
// silently swallowing real load failures like syntax errors in a plugin).
const isExpectedMiss = (err) => err.code === "MODULE_NOT_FOUND"

const getPluginOfficial = (name) => {
  try {
    return dynamicRequire(`@modjo/${kebabcase(name)}`)
  } catch (err) {
    if (!isExpectedMiss(err)) throw err
  }
}

const getPluginContrib = (name) => {
  try {
    return dynamicRequire(`modjo-plugins-${kebabcase(name)}`)
  } catch (err) {
    if (!isExpectedMiss(err)) throw err
  }
}

const getPluginFail = (name) => {
  throw new PluginNotFoundError(name)
}

const getPluginMethods = [
  getPluginRegistry,
  getPluginLocal,
  getPluginOfficial,
  getPluginContrib,
  getPluginFail,
]
const getPlugin = (name) => {
  for (const method of getPluginMethods) {
    const dep = method(name)
    if (dep) {
      plugins[name] = dep
      return dep
    }
  }
}

module.exports = {
  getPlugin,
}
