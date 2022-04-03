const Crypto = require("crypto")
const { ApolloLink, ApolloClient, HttpLink, split } = require("@apollo/client")
const { getMainDefinition } = require("@apollo/client/utilities")
const ws = require("ws")
const fetch = require("cross-fetch")
const createRetryLink = require("./retryLink")
const createCache = require("./cache")
const WebSocketLink = require("./WebSocketLink")

module.exports = async function createApolloClient({ uri, headers }) {
  const authLink = new ApolloLink((operation, forward) => {
    const ctxHeaders = operation.getContext().headers || {}
    operation.setContext({
      headers: {
        ...headers,
        ctxHeaders,
      },
    })
    return forward(operation)
  })

  const retryLink = createRetryLink()

  const httpLink = new HttpLink({
    fetch,
    uri,
  })

  const url = new URL(uri)
  const wsProto = url.protocol === "https:" ? "wss" : "ws"
  const wsURL = `${wsProto}://${url.host}${url.pathname}`

  const wsLink = new WebSocketLink({
    webSocketImpl: ws,
    url: wsURL,
    connectionParams: () => {
      return {
        headers: {
          "Sec-WebSocket-Protocol": "graphql-transport-ws",
          ...headers,
        },
      }
    },
    generateID: () =>
      ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
        // eslint-disable-next-line no-bitwise
        (c ^ (Crypto.randomBytes(1)[0] & (15 >> (c / 4)))).toString(16)
      ),
  })

  const splitLink = split(
    ({ query }) => {
      const definition = getMainDefinition(query)
      return (
        definition.kind === "OperationDefinition" &&
        definition.operation === "subscription"
      )
    },
    wsLink,
    httpLink
  )

  const link = ApolloLink.from([retryLink, authLink, splitLink])

  const cache = createCache()

  const apolloClient = new ApolloClient({
    // connectToDevTools: true,
    link,
    resolvers: {},
    ssrMode: false,
    cache,
    defaultOptions: {
      watchQuery: {
        fetchPolicy: "no-cache",
        errorPolicy: "ignore",
      },
      query: {
        fetchPolicy: "no-cache",
        errorPolicy: "all",
      },
    },
  })
  return apolloClient
}
