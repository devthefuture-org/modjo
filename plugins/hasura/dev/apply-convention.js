const path = require("path")
const fs = require("fs-extra")

const camelCase = require("lodash.camelcase")
const yaml = require("js-yaml")
const postgres = require("postgres")

module.exports = async (options = {}) => {
  const {
    postgres: postgresConfig = {},
    hasuraPath = `${process.cwd()}/hasura`,
  } = options
  const tablesDir = `${hasuraPath}/metadata/databases/default/tables`
  const files = await fs.readdir(tablesDir)

  const { dsn, ...postgresOptions } = postgresConfig
  let sql
  if (dsn) {
    sql = postgres(dsn, postgresOptions)
  } else {
    sql = postgres(postgresOptions)
  }
  for (const file of files) {
    if (file.startsWith("public_")) {
      const filePath = path.join(tablesDir, file)
      const content = await fs.readFile(filePath, { encoding: "utf-8" })
      const data = yaml.load(content)
      if (!data.configuration) {
        data.configuration = {}
      }
      const { configuration, table } = data

      // custom root fields
      if (!configuration.custom_root_fields) {
        configuration.custom_root_fields = {}
      }
      const genRootFieldName = (...prefixs) => {
        return camelCase([...prefixs, table.name].join("."))
      }
      Object.assign(configuration.custom_root_fields, {
        delete: genRootFieldName("delete", "many"),
        delete_by_pk: genRootFieldName("delete", "one"),
        insert: genRootFieldName("insert", "many"),
        insert_one: genRootFieldName("insert", "one"),
        select: genRootFieldName("select", "many"),
        select_aggregate: genRootFieldName("select", "agg"),
        select_by_pk: genRootFieldName("select", "one"),
        update: genRootFieldName("update", "many"),
        update_by_pk: genRootFieldName("update", "one"),
      })

      // custom column names
      // if (!configuration.custom_column_names){
      configuration.custom_column_names = {}
      // }
      const tableName = table.name
      const columns = await sql`
        SELECT
          *
        FROM
          information_schema.columns
        WHERE
          table_schema = 'public'
          AND table_name = ${tableName};
        `
      const columnNames = columns.map(
        ({ column_name: columnName }) => columnName
      )
      for (const columnName of columnNames) {
        const ccColumnName = camelCase(columnName)
        if (columnName != ccColumnName) {
          configuration.custom_column_names[columnName] = ccColumnName
        }
      }

      const newContent = yaml.dump(data)
      await fs.writeFile(filePath, newContent)
    }
  }

  console.log(
    "don't forget to run: docker-compose restart hasura hasura_console"
  )
}
