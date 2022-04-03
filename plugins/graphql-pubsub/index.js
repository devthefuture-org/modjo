const { EventEmitter2 } = require("eventemitter2")
const { PubSub } = require("graphql-subscriptions")
const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports.create = () => {
  const eventEmitter = new EventEmitter2({
    wildcard: true,
    delimiter: "/",
  })
  const graphqlPubsub = new PubSub(eventEmitter)
  return graphqlPubsub
}

module.exports.ctx = ctx
