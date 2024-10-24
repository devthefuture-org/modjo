function isRouteRegistered(app, path, method) {
  // eslint-disable-next-line no-underscore-dangle
  const routes = app.router.stack
    .filter((r) => r.route && r.route.path === path) // Check for path match
    .filter((r) => r.route.methods[method]) // Check if the method exists for the path

  return routes.length > 0
}

module.exports = {
  isRouteRegistered,
}
