module.exports = function stringifyJS(objFromJson) {
  if (typeof objFromJson !== "object" || Array.isArray(objFromJson)) {
    return objFromJson
  }
  const props = Object.keys(objFromJson)
    .map((key) => `${JSON.stringify(key)}:${stringifyJS(objFromJson[key])}`)
    .join(",")
  return `{${props}}`
}
