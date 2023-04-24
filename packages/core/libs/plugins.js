const path = require("path")
const kebabcase = require("lodash.kebabcase")

const dynamicRequire = require("~/utils/fs/dynamic-require")

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

const getPluginOfficial = (name) => {
  try {
    const req = `@modjo/${kebabcase(name)}`
    return dynamicRequire(req)
  } catch (err) {
    console.log(err)
    if (err.code !== "MODULE_NOT_FOUND") {
      throw err
    }
  }
}

const getPluginContrib = (name) => {
  try {
    const req = `modjo-plugins-${kebabcase(name)}`
    return dynamicRequire(req)
  } catch (_e) {
    // do nothing
  }
}

const getPluginFail = (name) => {
  throw new Error(`required plugin not found: "${name}"`)
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
