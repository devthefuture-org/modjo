module.exports = (o) => {
  return o && typeof o.then === "function" && typeof o.catch === "function"
}
