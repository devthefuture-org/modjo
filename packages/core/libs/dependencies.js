const nctx = require("nctx")
const defaultsDeep = require("lodash.defaultsdeep")
const { getPlugin } = require("~/libs/plugins")

const promiseObject = require("~/utils/async/promise-object")

const ctx = require("~/ctx")

const castDependency = (dependency) => {
  if (typeof dependency === "function") {
    dependency = { create: dependency, ...dependency }
  } else if (Array.isArray(dependency)) {
    const [key, val] = dependency
    if (typeof val === "string") {
      dependency = { pluginName: val }
    } else {
      dependency = { pluginName: key, ...val }
    }
  } else if (typeof dependency === "string") {
    dependency = { pluginName: dependency }
  }

  if (dependency.key === undefined && dependency.pluginName) {
    dependency.key = dependency.pluginName
  }

  return dependency
}

const castDependencies = (dependencies = {}) => {
  if (Array.isArray(dependencies)) {
    dependencies = dependencies.reduce((acc, item) => {
      if (Array.isArray(item)) {
        const [key, val] = item
        if (typeof val === "string") {
          acc[key] = { pluginName: val }
        } else {
          acc[key] = { pluginName: key, ...val }
        }
      } else if (typeof item === "string") {
        acc[item] = { pluginName: item }
      } else if (typeof item.pluginName === "string") {
        acc[item.pluginName] = item
      } else {
        throw new Error(
          `Unexpected type of dependency item: ${item}, expected string or array[string, object] or object{pluginName: string}`
        )
      }
      return acc
    }, {})
  }
  return dependencies
}

const mergePluginToDependency = (dependency, plugin = {}) => {
  plugin = castDependency(plugin)
  plugin.dependencies = castDependencies(plugin.dependencies)
  defaultsDeep(dependency, plugin)
}

const make = async (
  dependency,
  scope = ["root"],
  branchPlugins = new Map()
) => {
  dependency = castDependency(dependency)

  if (
    dependency.key &&
    !dependency.create &&
    branchPlugins.has(dependency.key)
  ) {
    const plugin = branchPlugins.get(dependency.key)
    mergePluginToDependency(dependency, plugin)
  }

  dependency.dependencies = castDependencies(dependency.dependencies)

  if (dependency.pluginName && !dependency.plugin && !dependency.create) {
    dependency.plugin = getPlugin(dependency.pluginName)
  }

  mergePluginToDependency(dependency, dependency.plugin)

  if (!dependency.ctx) {
    dependency.ctx =
      (dependency.plugin && dependency.plugin.ctx) ||
      nctx.create(Symbol(dependency.pluginName || scope.join(".")))
  }
  dependency.ctx.fallback(ctx)

  dependency.recursiveSync = (callback, desc = false) => {
    let trunk
    if (desc) {
      trunk = callback(dependency)
    }
    const branches = Object.values(dependency.dependencies).map((d) =>
      d.recursiveSync(callback, desc)
    )
    if (!desc) {
      trunk = callback(dependency)
    }
    return { trunk, branches }
  }

  dependency.recursive = async (
    callback,
    desc = false,
    parent = null,
    key = null
  ) => {
    let trunk
    if (desc) {
      trunk = await callback(dependency, parent, key)
    }
    const branches = await promiseObject(
      Object.entries(dependency.dependencies).reduce((acc, [k, d]) => {
        acc[k] = d.recursive(callback, desc, dependency, k)
        return acc
      }, {})
    )
    if (!desc) {
      trunk = await callback(dependency, parent, key, branches)
    }
    return { trunk, branches }
  }

  const newBranchPlugins = new Map(branchPlugins)
  for (const k of Object.keys(dependency.plugins || {})) {
    newBranchPlugins.set(k, dependency.plugins[k])
  }

  await Promise.all(
    Object.keys(dependency.dependencies).map(async (k) => {
      const childScope = [...scope, k]
      dependency.dependencies[k] = await make(
        dependency.dependencies[k],
        childScope,
        newBranchPlugins
      )
    })
  )

  return dependency
}

const flatInstancesRegistry = new Map()
const treeRegistry = new Map()
const create = async (dep, _parent, _key, branches) => {
  return nctx.fork(async () => {
    const treeCtx = { branches: {} }
    for (const key of Object.keys(branches)) {
      const instance = await branches[key].trunk
      dep.ctx.set(key, instance)
      treeCtx.branches[key] = instance
    }
    if (dep.context) {
      await dep.context(dep.ctx, ctx)
    }
    let params = []
    if (dep.params) {
      if (typeof dep.params === "function") {
        params = await params()
      }
      if (!Array.isArray(dep.params)) {
        params = [params]
      }
    }
    let instance
    if (dep.key !== undefined) {
      if (flatInstancesRegistry.has(dep.key)) {
        instance = flatInstancesRegistry.get(dep.key)
      } else {
        instance = await (dep.create ? dep.create(...params) : null)
        flatInstancesRegistry.set(dep.key, instance)
      }
    } else {
      instance = await (dep.create ? dep.create(...params) : null)
    }
    treeCtx.trunk = instance
    treeRegistry.set(dep, treeCtx)
    return instance
  }, [dep.ctx])
}

const builtRegistry = new Set()
const build = async (dep) => {
  if (builtRegistry.has(dep.key || dep) || !dep.build) {
    return
  }
  builtRegistry.add(dep.key || dep)
  let params = dep.buildParams || []
  if (typeof params === "function") {
    params = await params()
  }
  if (!Array.isArray(params)) {
    params = [params]
  }
  await dep.build(...params)
}

const ready = async (dep) => {
  const treeCtx = treeRegistry.get(dep)
  nctx.fork(async () => {
    for (const key of Object.keys(treeCtx.branches)) {
      dep.ctx.set(key, treeCtx.branches[key])
    }
    if (dep.ready) {
      await dep.ready(treeCtx.trunk)
    }
  }, [dep.ctx])
}

module.exports = {
  build,
  create,
  make,
  ready,
}
