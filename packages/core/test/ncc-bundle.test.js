const { test, describe, before } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

// ---------------------------------------------------------------------------
// Static-analysis guard for the NCC inlining contract
// ---------------------------------------------------------------------------
// dynamic-require.js relies on @vercel/ncc statically inlining the contents
// of `${process.cwd()}/build/requires.js` at bundle time. NCC inlines this
// pattern only when it sees the literal template expression — anything else
// (path.join, a getter function, a config-driven path) silently breaks the
// inlining and the bundled service fails at startup with PluginNotFoundError.
//
// The full bundle test below would catch most regressions, but a tiny smoke
// test bundle can't reproduce every NCC inlining edge case (we tried). This
// regex assertion catches the regression class at the source level — the
// equivalent of a lint rule for the contract.
//
// Caught — the hard way — in v1.11.0 on alerte-secours staging.

describe("dynamic-require static-analysis guard", () => {
  test("dynamic-require.js keeps the literal `${process.cwd()}/build/requires.js` require()", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "utils", "fs", "dynamic-require.js"),
      "utf-8"
    )
    // The exact pattern NCC is able to statically inline. Wrapping this in a
    // function call (e.g. path.join(process.cwd(), 'build', 'requires.js'))
    // would technically work in dev mode (running source) but break the
    // NCC-bundled production artifact.
    assert.match(
      src,
      /require\(\s*`\$\{process\.cwd\(\)\}\/build\/requires\.js`\s*\)/,
      "the literal `${process.cwd()}/build/requires.js` require() expression " +
        "must remain inline so @vercel/ncc can statically inline it"
    )
  })
})

// This test reproduces what alerte-secours (and other NCC-bundled consumers)
// actually do in production:
//   1. yarn build  →  node src/index.js build  +  ncc build src/index.js -o dist
//   2. node dist/index.js start
//
// `dynamic-require.js` relies on `${process.cwd()}/build/requires.js` being
// statically inlined by NCC at build time. Anything that defeats this
// inlining (e.g. wrapping the path in a function call) silently passes the
// node:test unit suite (which runs sources, not the bundle) and then breaks
// at runtime in the bundled build with PluginNotFoundError.
//
// Caught — the hard way — in v1.11.0 on alerte-secours staging.

const FIXTURE = path.resolve(__dirname, "fixtures", "ncc-fixture")
// from packages/core/test/ → packages/core → packages → repo root
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..")
const NCC_CLI = path.join(REPO_ROOT, "node_modules", "@vercel", "ncc", "dist", "ncc", "cli.js")
const NCTX_PKG = path.join(REPO_ROOT, "node_modules", "nctx")
const CORE_PKG = path.resolve(__dirname, "..")

// Skip the whole suite if NCC isn't available (e.g. shallow CI env).
const NCC_AVAILABLE = fs.existsSync(NCC_CLI)

describe(
  "NCC-bundled consumer regression suite",
  { skip: NCC_AVAILABLE ? false : "ncc is not installed at the workspace root" },
  () => {
    before(() => {
      // Symlink @modjo/core (pointing at the dev tree) and nctx into
      // the fixture's node_modules so the bundle can resolve them.
      const nm = path.join(FIXTURE, "node_modules")
      const nmModjo = path.join(nm, "@modjo")
      fs.mkdirSync(nmModjo, { recursive: true })
      const ensureSymlink = (target, link) => {
        const stat = fs.lstatSync(link, { throwIfNoEntry: false })
        if (stat) {
          if (stat.isSymbolicLink() || stat.isFile()) {
            fs.unlinkSync(link)
          } else {
            fs.rmSync(link, { recursive: true, force: true })
          }
        }
        fs.symlinkSync(target, link)
      }
      ensureSymlink(CORE_PKG, path.join(nmModjo, "core"))
      ensureSymlink(NCTX_PKG, path.join(nm, "nctx"))

      // clean stale build/dist from a previous run
      for (const dir of ["build", "dist"]) {
        const p = path.join(FIXTURE, dir)
        if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
      }
    })

    test("build phase generates build/requires.js", () => {
      // Mimic `yarn build`: first the modjo build phase that emits
      // build/requires.js, then ncc bundles it in.
      execFileSync(process.execPath, ["src/index.js", "build"], {
        cwd: FIXTURE,
        stdio: "pipe",
      })
      const reqJs = path.join(FIXTURE, "build", "requires.js")
      assert.ok(fs.existsSync(reqJs), "build/requires.js was not generated")
      const content = fs.readFileSync(reqJs, "utf-8")
      assert.match(
        content,
        /~plugins\/dummy/,
        "build/requires.js should register the dummy plugin"
      )
    })

    test("ncc bundles the entrypoint without errors", () => {
      execFileSync(
        process.execPath,
        [NCC_CLI, "build", "src/index.js", "-o", "dist", "--quiet"],
        { cwd: FIXTURE, stdio: "pipe" }
      )
      const bundle = path.join(FIXTURE, "dist", "index.js")
      assert.ok(fs.existsSync(bundle), "ncc did not emit dist/index.js")
    })

    // CRITICAL: the production Dockerfile typically copies ONLY dist/ into
    // the final image — not build/, not node_modules/. NCC must therefore
    // have inlined the contents of build/requires.js AND every required
    // package statically at bundle time. We mimic that layout by stashing
    // build/ AND node_modules/ before running the bundle. If the bundle
    // still works, NCC inlined everything correctly.
    const stashProdLayout = (action) => {
      const buildDir = path.join(FIXTURE, "build")
      const nm = path.join(FIXTURE, "node_modules")
      const buildStash = path.join(FIXTURE, ".build.stash")
      const nmStash = path.join(FIXTURE, ".nm.stash")
      if (fs.existsSync(buildStash))
        fs.rmSync(buildStash, { recursive: true, force: true })
      if (fs.existsSync(nmStash))
        fs.rmSync(nmStash, { recursive: true, force: true })
      if (fs.existsSync(buildDir)) fs.renameSync(buildDir, buildStash)
      if (fs.existsSync(nm)) fs.renameSync(nm, nmStash)
      try {
        return action()
      } finally {
        if (fs.existsSync(buildStash)) {
          if (fs.existsSync(buildDir))
            fs.rmSync(buildDir, { recursive: true, force: true })
          fs.renameSync(buildStash, buildDir)
        }
        if (fs.existsSync(nmStash)) {
          if (fs.existsSync(nm))
            fs.rmSync(nm, { recursive: true, force: true })
          fs.renameSync(nmStash, nm)
        }
      }
    }

    test("@expected: NCC bundle starts WITHOUT build/ and node_modules/ (prod Dockerfile setup)", () => {
      const out = stashProdLayout(() =>
        execFileSync(process.execPath, ["dist/index.js", "start"], {
          cwd: FIXTURE,
          stdio: "pipe",
          encoding: "utf-8",
          timeout: 15000,
        })
      )
      assert.match(
        out,
        /NCC_FIXTURE_READY/,
        "ready hook did not run — NCC failed to inline plugins or build/requires.js"
      )
      assert.doesNotMatch(
        out,
        /PluginNotFoundError/,
        "PluginNotFoundError leaked through the NCC bundle (1.11.0 regression)"
      )
    })

    test("NCC bundle handles `build` mode (no build/ no node_modules/)", () => {
      stashProdLayout(() =>
        execFileSync(process.execPath, ["dist/index.js", "build"], {
          cwd: FIXTURE,
          stdio: "pipe",
          timeout: 15000,
        })
      )
    })
  }
)
