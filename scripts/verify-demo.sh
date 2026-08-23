#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_URL="${STACKFLOW_BACKEND_URL:-http://localhost:18080}"
TARGET_URL="${STACKFLOW_TARGET_URL:-http://trace-lab:8091}"

cd "$ROOT_DIR"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "필수 명령을 찾을 수 없습니다: $1" >&2
    exit 1
  }
}

external_request() {
  local method="$1"
  local endpoint="$2"
  local capture_trace="$3"

  curl --fail --silent --show-error "$BACKEND_URL/api/external/request" \
    --header 'Content-Type: application/json' \
    --data "$(jq --null-input \
      --arg targetBaseUrl "$TARGET_URL" \
      --arg method "$method" \
      --arg path "$endpoint" \
      --argjson captureTrace "$capture_trace" \
      '{targetBaseUrl: $targetBaseUrl, method: $method, path: $path, queryParams: [], headers: [], requestBody: "", captureTrace: $captureTrace}')"
}

wait_for_trace() {
  local trace_id="$1"
  local trace=''

  for _ in $(seq 1 30); do
    if trace="$(curl --fail --silent "$BACKEND_URL/api/traces/$trace_id" 2>/dev/null)" \
      && [[ "$(jq '.events | length' <<<"$trace")" -gt 0 ]]; then
      printf '%s' "$trace"
      return 0
    fi
    sleep 1
  done

  echo "Trace 수집 시간 초과: $trace_id" >&2
  return 1
}

assert_equals() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  [[ "$actual" == "$expected" ]] || {
    echo "$label: 기대값=$expected 실제값=$actual" >&2
    exit 1
  }
}

has_component() {
  local trace="$1"
  local component="$2"
  jq --exit-status --arg component "$component" \
    'any(.events[]; .component == $component)' <<<"$trace" >/dev/null
}

require_command curl
require_command docker
require_command jq

analysis="$(curl --fail --silent --show-error "$BACKEND_URL/api/project/structure/analyze" \
  --header 'Content-Type: application/json' \
  --data '{"projectPath":"/workspace/trace-lab"}')"
assert_equals SUCCESS "$(jq --raw-output '.analysisStatus' <<<"$analysis")" '프로젝트 분석 상태'
assert_equals 5 "$(jq --raw-output '.analysisCoverage.detectedEndpoints' <<<"$analysis")" '감지 API 수'

external_request DELETE /lab/products/1001/cache false >/dev/null

miss_response="$(external_request GET /lab/products/1001 true)"
miss_trace="$(wait_for_trace "$(jq --raw-output '.traceId' <<<"$miss_response")")"
assert_equals DATABASE "$(jq --raw-output '.responseBody | fromjson | .source' <<<"$miss_response")" 'cache miss 응답 출처'
has_component "$miss_trace" REDIS
has_component "$miss_trace" POSTGRESQL
echo 'PASS cache miss: Redis -> PostgreSQL -> Redis save'

hit_response="$(external_request GET /lab/products/1001 true)"
hit_trace="$(wait_for_trace "$(jq --raw-output '.traceId' <<<"$hit_response")")"
assert_equals CACHE "$(jq --raw-output '.responseBody | fromjson | .source' <<<"$hit_response")" 'cache hit 응답 출처'
has_component "$hit_trace" REDIS
if has_component "$hit_trace" POSTGRESQL; then
  echo 'cache hit Trace에 PostgreSQL span이 포함됐습니다.' >&2
  exit 1
fi
echo 'PASS cache hit: Redis only'

external_request DELETE /lab/products/1002/cache false >/dev/null
docker compose stop redis >/dev/null
trap 'docker compose start redis >/dev/null 2>&1 || true' EXIT

fallback_response="$(external_request GET /lab/products/1002 true)"
fallback_trace="$(wait_for_trace "$(jq --raw-output '.traceId' <<<"$fallback_response")")"
assert_equals DATABASE_FALLBACK "$(jq --raw-output '.responseBody | fromjson | .source' <<<"$fallback_response")" 'Redis 장애 응답 출처'
has_component "$fallback_trace" REDIS
has_component "$fallback_trace" POSTGRESQL
echo 'PASS Redis failure: PostgreSQL fallback'

docker compose start redis >/dev/null
for _ in $(seq 1 30); do
  [[ "$(docker inspect --format '{{.State.Health.Status}}' stackflow-demo-redis-1)" == healthy ]] && break
  sleep 1
done
assert_equals healthy "$(docker inspect --format '{{.State.Health.Status}}' stackflow-demo-redis-1)" 'Redis 복구 상태'
trap - EXIT

timeout_response="$(external_request GET /lab/products/1001/database-timeout true)"
timeout_trace="$(wait_for_trace "$(jq --raw-output '.traceId' <<<"$timeout_response")")"
assert_equals 504 "$(jq --raw-output '.httpStatus' <<<"$timeout_response")" 'DB timeout HTTP 상태'
assert_equals TIMEOUT "$(jq --raw-output '.resultStatus' <<<"$timeout_trace")" 'DB timeout Trace 상태'
jq --exit-status \
  'any(.events[]; .component == "POSTGRESQL" and (.status == "ERROR" or .status == "TIMEOUT") and .durationMs >= 900)' \
  <<<"$timeout_trace" >/dev/null
echo 'PASS PostgreSQL timeout: HTTP 504 and failed database span'

echo 'StackFlow Docker 데모 4개 시나리오 검증 완료'
