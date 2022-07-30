const path = require("path")
const fs = require("fs")

// see https://github.com/vercel/ncc/issues/74#issuecomment-1085719145

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
const dynamicRequire = (r, key = r) => {
  if (process.env.MODJO_DISABLE_NCC_REQUIRE) {
    return require(r)
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
  return require(`${process.cwd()}/build/requires.js`)[key]
}

module.exports = dynamicRequire
