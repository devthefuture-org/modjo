const fs = require("fs")
const path = require("path")
const defaultsDeep = require("lodash.defaultsdeep")
const stringifyJS = require("../js/stringify-js")

function getName(filename) {
  return path.basename(filename, path.extname(filename))
}

const defaultOptions = {
  pattern: /\.(js)$/,
  loader: (filename) => {
    const src = path.join(
      path.dirname(filename),
      path.basename(filename, path.extname(filename))
    )
    return `require("${src}")`
  },
}

module.exports = function dirtree2static(
  filename,
  options = {},
  rootDir = null
) {
  const isRoot = !rootDir
  if (isRoot) {
    defaultsDeep(options, defaultOptions)
    rootDir = filename
  }
  const { pattern, loader } = options
  const stats = fs.lstatSync(filename)
  if (stats.isDirectory()) {
    const files = fs.readdirSync(filename).filter((file) => {
      const absPath = `${filename}/${file}`
      const relPath = absPath.slice(rootDir.length)
      return (
        (typeof pattern === "function"
          ? pattern(relPath)
          : relPath.match(pattern)) ||
        fs.lstatSync(`${filename}/${file}`).isDirectory()
      )
    })

    const results = {}
    for (const file of files) {
      const name = getName(file)
      const result = dirtree2static(`${filename}/${file}`, options, rootDir)
      results[name] = result
    }
    if (isRoot) {
      return stringifyJS(results)
    }
    return results
  }
  return loader(filename)
}
