// Typed errors for the core. Allows callers to discriminate failure modes
// (catch by class) instead of pattern-matching message strings.

class ModjoError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = this.constructor.name
  }
}

class PluginNotFoundError extends ModjoError {
  constructor(pluginName) {
    super(
      `required plugin not found (or missing required file during plugin load): "${pluginName}"`
    )
    this.pluginName = pluginName
  }
}

class DependencyCycleError extends ModjoError {
  constructor(scopePath) {
    super(`dependency cycle detected at ${scopePath}`)
    this.scopePath = scopePath
  }
}

class InvalidDependencyError extends ModjoError {
  constructor(item) {
    super(
      `Unexpected type of dependency item: ${item}, expected string or array[string, object] or object{pluginName: string}`
    )
    this.item = item
  }
}

module.exports = {
  ModjoError,
  PluginNotFoundError,
  DependencyCycleError,
  InvalidDependencyError,
}
