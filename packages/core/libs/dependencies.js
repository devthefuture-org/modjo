const nctx = require("nctx")
const defaultsDeep = require("lodash/defaultsDeep")
const { getPlugin } = require("./plugins")
const {
  DependencyCycleError,
  InvalidDependencyError,
} = require("./errors")

const promiseObject = require("../utils/async/promise-object")

const ctx = require("../ctx")
const promisePublic = require("../utils/async/promise-public")
const isPromise = require("../utils/async/is-promise")

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
  } else {
    // shallow clone so make() does not leak mutations (ctx, recursive, ...)
    // back to the caller's tree
    dependency = { ...dependency }
  }

  if (dependency.key === undefined && key) {
    dependency.key = key
  }
  if (dependency.key === undefined && dependency.pluginName) {
    dependency.key = dependency.pluginName
  }
  if (!dependency.pluginName && dependency.key) {
    dependency.pluginName = dependency.key
  }
  return dependency
}

const castDependencies = (dependencies = {}) => {
  if (Array.isArray(dependencies)) {
    return dependencies.reduce((acc, item) => {
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
        throw new InvalidDependencyError(item)
      }
      return acc
    }, {})
  }
  // shallow clone the dependencies map so make() can rewrite entries
  // without mutating the caller's tree
  return { ...dependencies }
}

const mergePluginToDependency = (dependency, plugin = {}) => {
  plugin = castDependency(plugin)
  plugin.dependencies = castDependencies(plugin.dependencies)
  defaultsDeep(dependency, plugin)
}

// Each call returns an isolated lifecycle container. Two concurrent
// entrypoint() invocations no longer share state (singletons, build/ready
// markers). The previous module-level Maps caused cross-run pollution and
// made tests impossible without cache hacks.
function createContainer() {
  const flatInstancesRegistry = new Map()
  const treeRegistry = new Map()
  const builtRegistry = new Set()
  const readyRegistry = new Set()
  const disposeRegistry = new Set()

  const make = async (
    dependency,
    scope = ["root"],
    branchPlugins = new Map(),
    key = null,
    ancestorPath = new Set()
  ) => {
    if (
      dependency !== null &&
      typeof dependency === "object" &&
      !Array.isArray(dependency) &&
      ancestorPath.has(dependency)
    ) {
      throw new DependencyCycleError([...scope].join(" > "))
    }
    const nextPath = new Set(ancestorPath)
    if (
      dependency !== null &&
      typeof dependency === "object" &&
      !Array.isArray(dependency)
    ) {
      nextPath.add(dependency)
    }
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
      cbKey = null
    ) => {
      let trunk
      if (desc) {
        trunk = await callback(dependency, parent, cbKey)
      }
      const branches = await promiseObject(
        Object.entries(dependency.dependencies).reduce((acc, [k, d]) => {
          acc[k] = d.recursive(callback, desc, dependency, k)
          return acc
        }, {})
      )
      if (!desc) {
        trunk = await callback(dependency, parent, cbKey, branches)
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
          k,
          nextPath
        )
      })
    )

    return dependency
  }

  const registerSyncFlatInstanceRegistry = (dep) => {
    let instancePromise
    let registerPromise
    if (dep.key !== undefined && flatInstancesRegistry.has(dep.key)) {
      instancePromise = flatInstancesRegistry.get(dep.key)
    } else {
      const publicPromise = promisePublic()
      instancePromise = publicPromise.promise
      if (dep.key !== undefined) {
        flatInstancesRegistry.set(dep.key, instancePromise)
      }
      registerPromise = (factoryPromise) => {
        factoryPromise
          .then(publicPromise.resolve.bind(factoryPromise))
          .catch(publicPromise.reject.bind(factoryPromise))
      }
    }
    return { instancePromise, registerPromise }
  }

  const create = async (dep, _parent, _key, branches) => {
    return nctx.fork([dep.ctx], async () => {
      const treeCtx = { branches: {} }
      for (const key of Object.keys(branches)) {
        const instance = await branches[key].trunk
        dep.ctx.set(key, instance)
        treeCtx.branches[key] = instance
      }

      const { instancePromise, registerPromise } =
        registerSyncFlatInstanceRegistry(dep)

      if (registerPromise) {
        if (dep.context) {
          await dep.context(dep.ctx, ctx)
        }
        let params = dep.params || []
        if (typeof params === "function") {
          params = await params()
        }
        if (!Array.isArray(params)) {
          params = [params]
        }
        const factoryResult = dep.create ? dep.create(...params) : null

        const factoryPromise = isPromise(factoryResult)
          ? factoryResult
          : Promise.resolve(factoryResult)

        registerPromise(factoryPromise)
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
    if (readyRegistry.has(dep.key || dep) || !dep.ready) {
      return
    }
    readyRegistry.add(dep.key || dep)
    const treeCtx = treeRegistry.get(dep)
    return nctx.fork([dep.ctx], async () => {
      for (const key of Object.keys(treeCtx.branches)) {
        dep.ctx.set(key, treeCtx.branches[key])
      }
      if (dep.ready) {
        await dep.ready(await treeCtx.trunk)
      }
    })
  }

  // Symmetric teardown hook. Walks in reverse-post-order (root → leaves
  // when called via root.recursive(dispose, true)). dep.dispose receives the
  // resolved instance, mirroring dep.ready.
  const dispose = async (dep) => {
    if (disposeRegistry.has(dep.key || dep) || !dep.dispose) {
      return
    }
    disposeRegistry.add(dep.key || dep)
    const treeCtx = treeRegistry.get(dep)
    return nctx.fork([dep.ctx], async () => {
      const instance = treeCtx ? await treeCtx.trunk : undefined
      await dep.dispose(instance)
    })
  }

  return { make, create, build, ready, dispose }
}

// Default container preserved for backward compatibility with anyone
// importing make/create/build/ready directly. New code should call
// createContainer() to get an isolated lifecycle.
const defaultContainer = createContainer()

module.exports = {
  ...defaultContainer,
  createContainer,
}
