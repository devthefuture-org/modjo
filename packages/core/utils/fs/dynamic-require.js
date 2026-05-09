const path = require("path")
const fs = require("fs")

// see https://github.com/vercel/ncc/issues/74#issuecomment-1085719145

// Lazy filename so a chdir() after module load (tests, embedded usage) still
// resolves the correct build directory.
const getDynamicFilename = () =>
  path.join(process.cwd(), "build", "requires.js")

const dynamicRequires = {}
const dynamicRequireRegister = (src, key) => {
  if (dynamicRequires[key] === src) {
    return
  }
  dynamicRequires[key] = src
  const exports = Object.entries(dynamicRequires).reduce((acc, [k, req]) => {
    const target = !req.startsWith(".") ? req : path.join(process.cwd(), req)
    acc.push(`${JSON.stringify(k)}: require(${JSON.stringify(target)})`)
    return acc
  }, [])
  const dynamicFilename = getDynamicFilename()
  fs.mkdirSync(path.dirname(dynamicFilename), { recursive: true })
  fs.writeFileSync(dynamicFilename, `module.exports={${exports.join(",")}}`)
  delete require.cache[require.resolve(dynamicFilename)]
}

// Treat both MODULE_NOT_FOUND and ENOENT as "no plugin here, keep looking".
// The ENOENT case happens when require() reuses a cached _resolveFilename
// path whose underlying file has been deleted (test fixtures, hot reloads).
const isExpectedMiss = (err, key) => {
  if (err.code === "MODULE_NOT_FOUND") {
    return (
      err.message.includes(`"${key}"`) ||
      err.message.includes("/build/requires.js")
    )
  }
  if (err.code === "ENOENT") {
    return true
  }
  return false
}

const dynamicRequire = (r, key = r) => {
  if (process.env.MODJO_DISABLE_NCC_REQUIRE) {
    let req
    try {
      req = require(r)
    } catch (err) {
      if (err.code !== "MODULE_NOT_FOUND") {
        throw err
      }
    }
    return req
  }
  let requirable
  try {
    require.resolve(r)
    requirable = true
  } catch (err) {
    if (err.code !== "MODULE_NOT_FOUND") {
      throw err
    }
  }
  if (requirable) {
    dynamicRequireRegister(r, key)
  }
  try {
    const requireRegistry = require(getDynamicFilename())
    return requireRegistry[key]
  } catch (err) {
    if (!isExpectedMiss(err, key)) {
      throw err
    }
    // expected miss: caller will try the next resolver in the chain
    return undefined
  }
}

module.exports = dynamicRequire
