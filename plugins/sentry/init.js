const Sentry = require("@sentry/node")
const { nodeProfilingIntegration } = require("@sentry/profiling-node")

const sentryEnvironment = process.env.SENTRY_ENVIRONMENT

const isProduction = sentryEnvironment === "production"

const defaultTraceSampleRate = isProduction ? 0.1 : 1.0
const defaultProfilesSampleRate = isProduction ? 0.1 : 1.0
const tracesSampleRate =
  process.env.SENTRY_TRACE_SAMPLE_RATE || defaultTraceSampleRate
const profilesSampleRate =
  process.env.SENTRY_PROFILES_SAMPLE_RATE || defaultProfilesSampleRate

const { modjoSentryConfig = {} } = global
const { options = {} } = modjoSentryConfig

const pkg = modjoSentryConfig.package

const release = process.env.SENTRY_RELEASE || (pkg ? pkg.version : undefined)

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // debug: process.env.NODE_ENV !== "production",
  environment: sentryEnvironment,
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate,
  profilesSampleRate,
  release,
  ...options,
})

module.exports = Sentry
