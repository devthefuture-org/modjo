module.exports = function getStatusCode({ networkError, graphQLErrors }) {
  if (networkError) {
    return networkError.statusCode || 0
  }
  // console.log({ graphQLErrors })
  if (graphQLErrors) {
    let code
    for (const err of graphQLErrors) {
      if (err.extensions.http) {
        code = err.extensions.http
        break
      }
      if (err.extensions.code) {
        code = err.extensions.code
        break
      }
    }
    switch (code) {
      case "INTERNAL_SERVER_ERROR":
        return 500
      case "invalid-jwt":
      case "UNAUTHENTICATED":
        return 401
      default:
        return code
    }
  }
  return null
}
