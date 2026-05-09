const capitalize = require("lodash/capitalize")
const camelCase = require("lodash/camelCase")

module.exports = function pascalCase(str) {
  return capitalize(camelCase(str))
}
