// fixture entry point that mirrors a real consumer service:
// — uses local plugins (resolved via getPluginLocal → dynamicRequire)
// — exercises the lifecycle (build phase, then create + ready)
// — emits a deterministic stdout marker on completion so the test runner
//   can grep it instead of relying on exit code alone

const modjo = require("@modjo/core")

// Mix two resolver paths so the test exercises both code paths in
// libs/plugins.js:
//   - dummy           → getPluginLocal   (src/plugins/dummy)
//   - logger          → getPluginOfficial (@modjo/logger — exactly the
//                       resolver path that crashed in 1.11.0 because NCC
//                       needs to inline the require statically)
modjo({
  plugins: {
    config: {
      context: (ctx) => {
        ctx.set("customConfig", () => ({}))
      },
    },
  },
  dependencies: {
    dummy: { pluginName: "dummy" },
    logger: { pluginName: "logger" },
  },
  ready: () => {
    process.stdout.write("NCC_FIXTURE_READY\n")
  },
})
