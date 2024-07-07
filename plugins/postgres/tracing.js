const {
  SpanKind,
  // SpanOptions,
  SpanStatusCode,
  // Tracer,
  context,
} = require("@opentelemetry/api")

const {
  hrTime,
  hrTimeDuration,
  hrTimeToMilliseconds,
} = require("@opentelemetry/core")

const {
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_NET_PEER_NAME,
} = require("@opentelemetry/semantic-conventions")

module.exports = function tracingQueryHandler(tracer, serverName) {
  return () => {
    const startTime = hrTime()

    return (q) => {
      const queuedTimeMs = hrTimeToMilliseconds(
        hrTimeDuration(startTime, hrTime())
      )
      const spanOptions = {
        kind: SpanKind.CLIENT,
        attributes: {
          [SEMATTRS_NET_PEER_NAME]: serverName,
          [SEMATTRS_DB_STATEMENT]: q.strings.join("?"),
          "db.postgresjs.queued_time_ms": queuedTimeMs,
        },
      }

      const ctx = context.active()
      const span = tracer.startSpan("query", spanOptions, ctx)

      q.then(
        () => {
          span.setStatus({ code: SpanStatusCode.OK })
          span.end()
        },
        (e) => {
          span.recordException(e)
          span.setStatus({ message: e.message, code: SpanStatusCode.ERROR })
          span.end()
        }
      )
    }
  }
}
