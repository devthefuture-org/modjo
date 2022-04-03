const { ApolloLink, Observable } = require("@apollo/client/core")
const { print } = require("graphql")
const { createClient } = require("graphql-ws")

module.exports = class WebSocketLink extends ApolloLink {
  constructor(options) {
    super()
    this.client = createClient(options)
  }

  request(operation) {
    return new Observable((sink) => {
      return this.client.subscribe(
        { ...operation, query: print(operation.query) },
        {
          next: sink.next.bind(sink),
          complete: sink.complete.bind(sink),
          error: (err) => {
            if (Array.isArray(err)) {
              return sink.error(
                new Error(err.map(({ message }) => message).join(", "))
              )
            }

            if (err.code) {
              return sink.error(
                new Error(
                  `Socket closed with event ${err.code} ${err.reason || ""}` // reason will be available on clean closes only
                )
              )
            }

            return sink.error(err)
          },
        }
      )
    })
  }
}
