module.exports = function deepMapKeys(originalObject, callback) {
  if (typeof originalObject !== "object" || originalObject === null) {
    return originalObject
  }

  return Object.keys(originalObject || {}).reduce((newObject, key) => {
    const newKey = callback(key)
    const originalValue = originalObject[key]
    let newValue = originalValue
    if (Array.isArray(originalValue)) {
      newValue = originalValue.map((item) => deepMapKeys(item, callback))
    } else {
      newValue = deepMapKeys(originalValue, callback)
    }
    return {
      ...newObject,
      [newKey]: newValue,
    }
  }, {})
}
