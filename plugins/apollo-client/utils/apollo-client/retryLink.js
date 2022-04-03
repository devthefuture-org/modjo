const { ApolloLink } = require("@apollo/client")
const { RetryLink } = require("@apollo/client/link/retry")
const getStatusCode = require("./getStatusCode")

module.exports = function createRetryLink() {
  const errorRetryLink = new ApolloLink((operation, forward) => {
    return forward(operation).map((data) => {
      if (data && data.errors && data.errors.length > 0) {
        throw { graphQLErrors: data.errors }
      }
      return data
    })
  })

  const maxAttempts = Infinity
  const retryLink = new RetryLink({
    delay: {
      initial: 300,
      max: Infinity,
      jitter: true,
    },
    attempts: (count, _operation, error) => {
      if (!error) {
        return false
      }
      if (count > maxAttempts) {
        return false
      }

      if (error.toString() === "TypeError: Network request failed") {
        error = { networkError: error }
      }
      const statusCode = getStatusCode(error)
      if (statusCode >= 400 && statusCode < 500) {
        return false
      }
      if (statusCode === 0 || statusCode >= 500) {
        return true
      }
      return false
    },
  })

  return retryLink.concat(errorRetryLink)
}
