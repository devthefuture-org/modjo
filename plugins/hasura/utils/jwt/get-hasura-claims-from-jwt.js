const jwtDecode = require("jwt-decode")
const camelCase = require("lodash.camelcase")

const hasuraPrefix = "x-hasura-"
module.exports = function getHasuraClaimsFromJWT(
  jwtoken,
  claimsNamespace = "https://hasura.io/jwt/claims"
) {
  const jwtData = typeof jwtoken === "string" ? jwtDecode(jwtoken) : jwtoken
  const hasuraClaim = jwtData[claimsNamespace]
  const session = {}
  for (const [key, value] of Object.entries(hasuraClaim)) {
    if (key.startsWith(hasuraPrefix)) {
      const k = camelCase(key.slice(hasuraPrefix.length))
      session[k] = value
    }
  }
  return session
}
