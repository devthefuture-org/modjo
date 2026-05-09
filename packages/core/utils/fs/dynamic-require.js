const path = require("path")
const fs = require("fs")

// see https://github.com/vercel/ncc/issues/74#issuecomment-1085719145
//
// IMPORTANT: the `${process.cwd()}/build/requires.js` template literal must
// stay inline so @vercel/ncc can statically detect and inline the require().
// Wrapping the path in a function (or path.join, etc.) defeats the inlining
// and breaks plugin resolution in NCC-bundled builds (alerte-secours and
// other consumers ship as ncc bundles in production). Caught in v1.11.0.

const dynamicFilename = `${process.cwd()}/build/requires.js`
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
  fs.mkdirSync(path.dirname(dynamicFilename), { recursive: true })
  fs.writeFileSync(dynamicFilename, `module.exports={${exports.join(",")}}`)
  delete require.cache[require.resolve(dynamicFilename)]
}

// Treat MODULE_NOT_FOUND with the relevant key, and ENOENT (file deleted
// after path-resolve cached) as "no plugin here, keep looking down the
// resolver chain".
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
    // keep the literal `${process.cwd()}/build/requires.js` shape so NCC
    // can statically inline the bundle target — see top-of-file note
    const requireRegistry = require(`${process.cwd()}/build/requires.js`)
    return requireRegistry[key]
  } catch (err) {
    if (!isExpectedMiss(err, key)) {
      throw err
    }
    return undefined
  }
}

module.exports = dynamicRequire
