const minio = require("minio")
const waitOn = require("wait-on")
const nctx = require("nctx")

const ctx = nctx.create(Symbol(__dirname.split("/").pop()))

module.exports = async () => {
  const config = ctx.require("config")

  const { endPoint, port, accessKey, secretKey } = config.minio

  await waitOn({
    resources: [`tcp:${endPoint}:${port}`],
    timeout: 2 * 60 * 1000,
  })

  const minioClient = new minio.Client({
    endPoint,
    port,
    accessKey,
    secretKey,
    useSSL: false,
  })

  const cache = {}
  minioClient.ensureBucketExists = async (bucket, forceCache = false) => {
    if (!cache.audioBucketExists || forceCache) {
      cache.audioBucketExists = await minioClient.bucketExists(bucket)
      if (!cache.audioBucketExists) {
        await minioClient.makeBucket(bucket)
      }
      cache.audioBucketExists = true
    }
  }

  return minioClient
}

module.exports.dependencies = ["config"]

module.exports.ctx = ctx
