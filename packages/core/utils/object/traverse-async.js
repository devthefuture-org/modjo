module.exports = async function traverseAsync(o, fn, keys = []) {
  for (const [k, v] of Object.entries(o)) {
    const keysBranch = [...keys]
    keysBranch.push(k)
    fn.apply(this, [k, v, o, keysBranch])
    if (o[k] !== null && typeof o[k] === "object") {
      await traverseAsync(o[k], fn, keysBranch)
    }
  }
}
