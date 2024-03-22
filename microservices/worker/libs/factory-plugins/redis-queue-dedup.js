const { setTimeout: sleep } = require("timers/promises")
const murmurhash = require("murmurhash").v3

const { ctx } = require("../../ctx")

/*
Goals:
- allow watchers to scale
- allow worker retry while interrupted without duplication

TODO:
- add logging
*/

function hashJsonObjectForRedisKey(jsonObject) {
  const serialized = JSON.stringify(jsonObject)
  const hash = murmurhash(serialized).toString(36)
  return hash
}

function getTimestamp() {
  return Math.ceil(Date.now() / 1000)
}

async function recurseDedup(queueName, data, handler, options, hash) {
  const { okTTL = 900, delayMargin = 5 } = options
  const waitTTL = handler.waitTTL || options.waitTTL || 600

  const baseKey = `qd:${queueName}:${hash}`
  const keyGo = `${baseKey}:go`
  const keyOK = `${baseKey}:ok`

  const redis = ctx.require("redisQueueDedup")

  const keyOKExists = await redis.exists(keyOK)
  if (keyOKExists) {
    return null
  }

  const inserted = await redis.set(keyGo, getTimestamp(), "EX", waitTTL, "NX")
  if (!inserted) {
    const startedTime = await redis.get(keyGo)
    const expires = parseInt(startedTime, 10) + waitTTL
    const delay = expires * 1000 - Date.now()
    await sleep(delay + delayMargin * 1000)
    return recurseDedup(queueName, data, handler, options, hash)
  }

  const res = await handler(data)

  redis.pipeline().set(keyOK, getTimestamp(), "EX", okTTL).delete(keyGo).exec()

  return res
}

async function runWithDedup(queueName, data, handler, options = {}) {
  const hash = hashJsonObjectForRedisKey(data)
  return recurseDedup(queueName, data, handler, options, hash)
}

module.exports = async function redisQueueDedupFactory(handler, q, options) {
  return async (data) => {
    return runWithDedup(q, data, handler, options)
  }
}
