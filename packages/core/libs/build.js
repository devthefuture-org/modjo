const path = require("path")
const fs = require("fs-extra")
const yaml = require("js-yaml")
const dirtree2static = require("~/utils/fs/dirtree2static")
const getDirsSync = require("~/utils/fs/get-dirs-sync")

const srcDir = `${process.cwd()}/src`
const buildDir = `${process.cwd()}/build`

function ensureFileHasDir(file) {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}
function addFile(relPath, defaultContent = "{}") {
  const content = fs.pathExistsSync(`${process.cwd()}/${relPath}`)
    ? fs.readFileSync(`${process.cwd()}/${relPath}`, "utf-8")
    : defaultContent
  const dest = `${buildDir}/${relPath}`
  ensureFileHasDir(dest)
  fs.writeFileSync(dest, content)
}

function compileDirList(dir) {
  const dirPath = path.resolve(srcDir, dir)
  const dirList = getDirsSync(dirPath)
  const dest = path.join(buildDir, `${dir}.dirs.js`)
  ensureFileHasDir(dest)
  fs.writeFileSync(dest, `module.exports=${JSON.stringify(dirList)}`)
}

function treeFileLoader(filename) {
  const ext = path.extname(filename)
  if (ext === ".yaml" || ext === ".yml") {
    return JSON.stringify(yaml.load(fs.readFileSync(filename)))
  }
  const src = path.join(path.dirname(filename), path.basename(filename, ext))
  return `require("${src}")`
}

function buildDirTree(treeDirs, { filter } = {}) {
  for (const { dir, pattern, dirName } of treeDirs) {
    const dirPath = path.resolve(srcDir, dir)
    const content = fs.existsSync(dirPath)
      ? dirtree2static(dirPath, { pattern, loader: treeFileLoader, filter })
      : JSON.stringify({})
    const dest = path.join(buildDir, `${dirName || dir}.js`)
    ensureFileHasDir(dest)
    fs.writeFileSync(dest, `module.exports=${content}`)
  }
}

module.exports = {
  addFile,
  srcDir,
  buildDir,
  compileDirList,
  treeFileLoader,
  buildDirTree,
  ensureFileHasDir,
}
