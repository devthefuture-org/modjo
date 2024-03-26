module.exports = class ReconnectableProxy {
  constructor(target) {
    this.target = target
    this.callLog = []
    this.proxy = new Proxy({}, this.createHandler())
  }

  createHandler() {
    return {
      get: (obj, prop) => {
        if (typeof this.target[prop] === "function") {
          return (...args) => {
            this.callLog.push({ method: prop, args })
            return this.target[prop](...args)
          }
        }
        return this.target[prop]
      },
    }
  }

  setTarget(newTarget) {
    this.target = newTarget
  }

  async reconnect(newTarget) {
    this.target = newTarget
    await this.replayCalls()
  }

  async replayCalls() {
    for (const { method, args } of this.callLog) {
      await this.target[method](...args)
    }
  }

  getProxy() {
    return this.proxy
  }
}
