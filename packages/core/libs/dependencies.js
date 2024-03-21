const nctx = require("nctx")
const defaultsDeep = require("lodash.defaultsdeep")
const { getPlugin } = require("~/libs/plugins")

const promiseObject = require("~/utils/async/promise-object")

const ctx = require("~/ctx")

const castDependency = (dependency, key) => {
  if (typeof dependency === "function") {
    dependency = { create: dependency, ...dependency }
  } else if (Array.isArray(dependency)) {
    const [dkey, val] = dependency
    if (typeof val === "string") {
      dependency = { pluginName: val }
    } else {
      dependency = { pluginName: dkey, ...val }
    }
  } else if (typeof dependency === "string") {
    dependency = { pluginName: dependency }
  }

  if (dependency.key === undefined && key) {
    dependency.key = key
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
  branchPlugins = new Map(),
  key = null
) => {
  dependency = castDependency(dependency, key)
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

  dependency.recursiveSequential = (callback, desc = false) => {
    let trunk
    if (desc) {
      trunk = callback(dependency)
    }
    const branches = Object.values(dependency.dependencies).map((d) => {
      return d.recursiveSequential(callback, desc)
    })
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
        newBranchPlugins,
        k
      )
    })
  )

  return dependency
}

const flatInstancesRegistry = new Map()
const treeRegistry = new Map()
const create = async (dep, _parent, _key, branches) => {
  return nctx.fork([dep.ctx], async () => {
    const treeCtx = { branches: {} }
    for (const key of Object.keys(branches)) {
      const instance = await branches[key].trunk
      dep.ctx.set(key, instance)
      treeCtx.branches[key] = instance
    }

    let instancePromise
    if (dep.key !== undefined && flatInstancesRegistry.has(dep.key)) {
      instancePromise = flatInstancesRegistry.get(dep.key)
    } else {
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
      instancePromise = dep.create ? dep.create(...params) : null
      if (dep.key !== undefined) {
        flatInstancesRegistry.set(dep.key, instancePromise)
      }
    }

    const trunk = (async () => {
      const instance = await instancePromise
      if (dep.key) {
        ctx.set(dep.key, instance)
      }
      return instance
    })()
    treeCtx.trunk = trunk
    treeRegistry.set(dep, treeCtx)
    return trunk
  })
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

const readyRegistry = new Set()
const ready = async (dep) => {
  if (readyRegistry.has(dep.key || dep) || !dep.ready) {
    return
  }
  readyRegistry.add(dep.key || dep)
  const treeCtx = treeRegistry.get(dep)
  nctx.fork([dep.ctx], async () => {
    for (const key of Object.keys(treeCtx.branches)) {
      dep.ctx.set(key, treeCtx.branches[key])
    }
    if (dep.ready) {
      await dep.ready(await treeCtx.trunk)
    }
  })
}

module.exports = {
  build,
  create,
  make,
  ready,
}
