const nctx = require("nctx")
const defaultsDeep = require("lodash.defaultsdeep")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports.create = () => {
  return defaultsDeep(
    require(`${process.cwd()}/build/version.json`, {
      version: "0.0.0",
      name: "An awesome project powered by modjo",
    })
  )
}

const { addFile } = require("@modjo/core/libs/build")

module.exports.build = () => {
  addFile("version.json")
}

module.exports.ctx = ctx
