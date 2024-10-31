module.exports = function createValidator({
  apiSpec,
  validator,
  msgIdentifier,
  validateResponses,
  securityHandlers,
  formats,
}) {
  // TODO
  // - validate types of messages
  // - validate formats
  // - validate headers
  // - security at operation layer
  // - validateResponses
  // - log channel open/close

  return async (req, res, next) => {
    const { channelId, channelSpec, operationsSpec } = req.asyncapi
    const channelSecurity = channelSpec["x-security"] || [] // wait for answer to https://github.com/asyncapi/spec/issues/306#issuecomment-2440008824
    for (const security of channelSecurity) {
      const securityKey = Object.keys(security)[0]
      const authenticate = securityHandlers[securityKey]
      if (!authenticate) {
        throw new Error(`Security handler ${securityKey} not found`)
      }
      const scopes = security[securityKey]
      const authenticated = await authenticate(req, scopes)
      if (!authenticated) {
        res.reject(401, "Unauthorized")
        return
      }
    }

    if (res.ws) {
      next()
      return
    }

    await res.accept()

    const { ws } = res

    const originalOn = ws.on.bind(ws)

    const messageListeners = []

    const eventListeners = {}

    const validatedMessage = async (message) => {
      await Promise.all([
        ...messageListeners.map((listener) => listener.apply(ws, [message])),
        ...(eventListeners[message[msgIdentifier]] || []).map((listener) =>
          listener.apply(ws, [message.payload, message])
        ),
      ])
    }

    ws.on("message", async (message) => {
      let messageObject
      try {
        messageObject = JSON.parse(message)
        const name = messageObject[msgIdentifier]
        const { payload } = messageObject
        await validator.validate(name, payload, channelId, "receive")
      } catch (err) {
        // console.error("Invalid message:", err)
        ws.send(
          JSON.stringify({
            code: 422,
            error: "Invalid message",
            details: err.message,
          })
        )
        return
      }
      await validatedMessage(messageObject)
    })

    ws.on = function (event, listener) {
      if (event === "message") {
        messageListeners.push(listener)
      } else if (event.startsWith("event.")) {
        const eventName = event.slice("event.".length)
        if (!eventListeners[eventName]) {
          eventListeners[eventName] = []
        }
        eventListeners[eventName].push(listener)
      } else {
        originalOn(event, listener)
      }
    }

    next()
  }
}
