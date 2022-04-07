module.exports = function traverse(o, fn, keys = []) {
  for (const [k, v] of Object.entries(o)) {
    const keysBranch = [...keys]
    keysBranch.push(k)
    fn.apply(this, [k, v, o, keysBranch])
    if (o[k] !== null && typeof o[k] === "object") {
      traverse(o[k], fn, keysBranch)
    }
  }
}
