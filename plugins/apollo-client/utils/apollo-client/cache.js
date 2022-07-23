const { InMemoryCache } = require("@apollo/client/core")

// see https://www.apollographql.com/docs/react/caching/cache-field-behavior/
module.exports = function createCache() {
  return new InMemoryCache({})
}
