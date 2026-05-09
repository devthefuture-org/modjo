#!/usr/bin/env bash
# Capture deterministic API responses for non-regression diff.
# Usage: ./capture-api-responses.sh <output-dir>
set -euo pipefail

OUT="${1:-/tmp/modjo-resp}"
mkdir -p "$OUT"

API="http://localhost:4200/api/v1/oas"
FILES="http://localhost:4292"
HASURA="http://localhost:4201/v1"
HASURA_ADMIN_SECRET="admin"

echo "[capture] OpenAPI specs"
curl -sS "$API/../spec" > "$OUT/api-openapi-spec.json"
curl -sS "$FILES/api/v1/spec" > "$OUT/files-openapi-spec.json"

echo "[capture] /jwks"
curl -sS "$API/jwks" > "$OUT/api-jwks.json"

echo "[capture] auth public endpoints (status + body)"
for p in /auth/email/verify /auth/email/connect /auth/init/token /auth/login/token; do
  fn=$(echo "$p" | tr '/' '_')
  body=$(curl -sS -X POST -H 'content-type: application/json' "$API$p" -d '{}' || true)
  status=$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' "$API$p" -d '{}' || true)
  echo "$status" > "$OUT/auth$fn.status"
  echo "$body" > "$OUT/auth$fn.body"
done

echo "[capture] auth-required endpoints unauthenticated (expect 401)"
for p in /dev /user/id /info/what3words /info/nominatim /info/nominatim-search /alert/close /alert/send-alert /geoloc/sync /radar/people-count; do
  fn=$(echo "$p" | tr '/' '_')
  status=$(curl -sS -o /dev/null -w '%{http_code}' "$API$p" || true)
  echo "$status" > "$OUT/protected$fn.status"
done

echo "[capture] GraphQL introspection (api remote schema)"
curl -sS -X POST "$API/../graphql" \
  -H 'content-type: application/json' \
  -d '{"query":"query { __schema { queryType { name } mutationType { name } types { name kind } } }"}' \
  > "$OUT/api-graphql-introspection.json"

echo "[capture] Hasura GraphQL introspection (admin)"
curl -sS -X POST "$HASURA/graphql" \
  -H 'content-type: application/json' \
  -H "x-hasura-admin-secret: $HASURA_ADMIN_SECRET" \
  -d '{"query":"query { __schema { queryType { name } mutationType { name } types { name kind } } }"}' \
  > "$OUT/hasura-graphql-introspection.json"

echo "[capture] done → $OUT"
ls -la "$OUT"
