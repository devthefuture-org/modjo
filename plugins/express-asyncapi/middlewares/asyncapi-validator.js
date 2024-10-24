module.exports = function createAsyncApiValidatorMiddleware(validator) {
  return function (channel, operation) {
    return function (ws, _req) {
      const originalOn = ws.on.bind(ws)

      ws.on("message", async (message) => {
        try {
          const parsedMessage = JSON.parse(message)
          await validator.validate(parsedMessage, channel, operation)
          // Proceed to the next handler
          ws.emit("validatedMessage", parsedMessage)
        } catch (err) {
          console.error("Invalid message:", err)
          ws.send(
            JSON.stringify({ error: "Invalid message", details: err.message })
          )
        }
      })

      // Override 'on' to prevent adding more 'message' handlers
      ws.on = function (event, listener) {
        if (event === "message") {
          // Ignore additional 'message' event handlers
        } else if (event === "validatedMessage") {
          originalOn(event, listener)
        } else {
          originalOn(event, listener)
        }
      }
    }
  }
}
