module.exports = class HeaderMap extends Map {
  set(key, value) {
    return super.set(key.toLowerCase(), value)
  }

  get(key) {
    return super.get(key.toLowerCase())
  }

  delete(key) {
    return super.delete(key.toLowerCase())
  }

  has(key) {
    return super.has(key.toLowerCase())
  }
}
