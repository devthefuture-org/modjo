function compileSecuritySets(securitySets, methodSpec) {
  const xSecurity = methodSpec["x-security"]
  if (!securitySets || !xSecurity) {
    return
  }
  if (!methodSpec.security) {
    methodSpec.security = []
  }
  const { security } = methodSpec
  for (const securityDef of xSecurity) {
    const [key] = Object.keys(securityDef)
    const securitySet = securitySets[key]
    if (!securitySet) {
      throw new Error(`missing x-security: ${key}`)
    }
    const scopes = securityDef[key]
    security.push(
      ...securitySet.map((name) => {
        return { [name]: scopes }
      })
    )
  }
}

module.exports = {
  compileSecuritySets,
}
