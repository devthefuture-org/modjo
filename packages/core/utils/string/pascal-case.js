const capitalize = require("lodash.capitalize")
const camelCase = require("lodash.camelcase")

module.exports = function pascalCase(str) {
  return capitalize(camelCase(str))
}
