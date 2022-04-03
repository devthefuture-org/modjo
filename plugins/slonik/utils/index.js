const { sql } = require("slonik")
const { raw } = require("slonik-sql-tag-raw")

const format = require("pg-format")

const snakeCase = require("lodash.snakecase")

const manyValues = (rows, types) => {
  return raw(
    rows
      .map((row) => {
        const formattedRow = []
        for (let i = 0; i < types.length; i++) {
          const type = types[i]
          const col = row[i]
          let sqlString
          if (Array.isArray(type)) {
            const [t, field] = type
            sqlString = `${field}::${t}`
          } else {
            sqlString = `%L::${type}`
          }
          let vars
          if (Array.isArray(col)) {
            vars = col
          } else {
            vars = [col]
          }
          formattedRow.push(format(sqlString, vars))
        }
        return `(${formattedRow.join(",")})`
      })
      .join(",")
  )
}

const columns = (col) => {
  if (!Array.isArray(col)) {
    col = Object.keys(col)
  }
  return raw(col.map((key) => `"${snakeCase(key)}"`).join(","))
}

const values = (val) => {
  if (!Array.isArray(val)) {
    val = Object.values(val)
  }
  return sql.join(Object.values(val), sql`, `)
}

function createGeopoint(longitude, latitude) {
  return sql`ST_SetSRID (ST_MakePoint (${longitude}, ${latitude}), 4326)`
}

module.exports = {
  createGeopoint,
  columns,
  values,
  manyValues,
}
