#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_URL="${STACKFLOW_BACKEND_URL:-http://localhost:18080}"
PRODUCT_TARGET_URL="${STACKFLOW_PRODUCT_TARGET_URL:-http://product-service:8091}"
ORDER_TARGET_URL="${STACKFLOW_ORDER_TARGET_URL:-http://order-service:8092}"

cd "$ROOT_DIR"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "필수 명령을 찾을 수 없습니다: $1" >&2
    exit 1
  }
}

external_request() {
	local target_url="$1"
	local method="$2"
	local endpoint="$3"
	local capture_trace="$4"

  curl --fail --silent --show-error "$BACKEND_URL/api/external/request" \
    --header 'Content-Type: application/json' \
    --data "$(jq --null-input \
		--arg targetBaseUrl "$target_url" \
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

assert_distributed_parent_link() {
  local trace="$1"
  jq --exit-status '
    [.events[] | select(.serviceName == "order-service" and .component == "HTTP_CLIENT")] as $clients
    | [.events[] | select(.serviceName == "product-service" and .spanKind == "SERVER")] as $servers
    | any($servers[]; .parentSpanId as $parent | any($clients[]; .spanId == $parent))
  ' <<<"$trace" >/dev/null
}

require_command curl
require_command docker
require_command jq

analysis="$(curl --fail --silent --show-error "$BACKEND_URL/api/project/workspace/analyze" \
  --header 'Content-Type: application/json' \
  --data '{"workspacePath":"/workspace/distributed-trace-lab"}')"
assert_equals 2 "$(jq '.services | length' <<<"$analysis")" '감지 서비스 수'
assert_equals 2 "$(jq '[.services[] | select(.structure.analysisStatus == "SUCCESS")] | length' <<<"$analysis")" '분석 성공 서비스 수'
assert_equals 2 "$(jq '.services[] | select(.serviceId == "order-service") | .structure.analysisCoverage.detectedEndpoints' <<<"$analysis")" 'Order API 수'
assert_equals 5 "$(jq '.services[] | select(.serviceId == "product-service") | .structure.analysisCoverage.detectedEndpoints' <<<"$analysis")" 'Product API 수'

external_request "$PRODUCT_TARGET_URL" DELETE /lab/products/1001/cache false >/dev/null

miss_response="$(external_request "$PRODUCT_TARGET_URL" GET /lab/products/1001 true)"
miss_trace="$(wait_for_trace "$(jq --raw-output '.traceId' <<<"$miss_response")")"
assert_equals DATABASE "$(jq --raw-output '.responseBody | fromjson | .source' <<<"$miss_response")" 'cache miss 응답 출처'
has_component "$miss_trace" REDIS
has_component "$miss_trace" POSTGRESQL
echo 'PASS cache miss: Redis -> PostgreSQL -> Redis save'

hit_response="$(external_request "$PRODUCT_TARGET_URL" GET /lab/products/1001 true)"
hit_trace="$(wait_for_trace "$(jq --raw-output '.traceId' <<<"$hit_response")")"
assert_equals CACHE "$(jq --raw-output '.responseBody | fromjson | .source' <<<"$hit_response")" 'cache hit 응답 출처'
has_component "$hit_trace" REDIS
if has_component "$hit_trace" POSTGRESQL; then
  echo 'cache hit Trace에 PostgreSQL span이 포함됐습니다.' >&2
  exit 1
fi
echo 'PASS cache hit: Redis only'

external_request "$PRODUCT_TARGET_URL" DELETE /lab/products/1002/cache false >/dev/null
docker compose stop redis >/dev/null
trap 'docker compose start redis >/dev/null 2>&1 || true' EXIT

fallback_response="$(external_request "$PRODUCT_TARGET_URL" GET /lab/products/1002 true)"
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

timeout_response="$(external_request "$PRODUCT_TARGET_URL" GET /lab/products/1001/database-timeout true)"
timeout_trace="$(wait_for_trace "$(jq --raw-output '.traceId' <<<"$timeout_response")")"
assert_equals 504 "$(jq --raw-output '.httpStatus' <<<"$timeout_response")" 'DB timeout HTTP 상태'
assert_equals TIMEOUT "$(jq --raw-output '.resultStatus' <<<"$timeout_trace")" 'DB timeout Trace 상태'
jq --exit-status \
  'any(.events[]; .component == "POSTGRESQL" and (.status == "ERROR" or .status == "TIMEOUT") and .durationMs >= 900)' \
  <<<"$timeout_trace" >/dev/null
echo 'PASS PostgreSQL timeout: HTTP 504 and failed database span'

external_request "$PRODUCT_TARGET_URL" DELETE /lab/products/1001/cache false >/dev/null
order_response="$(external_request "$ORDER_TARGET_URL" GET /lab/orders/2001 true)"
order_trace="$(wait_for_trace "$(jq --raw-output '.traceId' <<<"$order_response")")"
assert_equals 200 "$(jq --raw-output '.httpStatus' <<<"$order_response")" 'Order HTTP 상태'
assert_equals CONFIRMED "$(jq --raw-output '.responseBody | fromjson | .status' <<<"$order_response")" 'Order 상태'
assert_equals order-service "$(jq --raw-output '.serviceName' <<<"$order_trace")" '진입 서비스'
assert_equals 2 "$(jq '.serviceNames | length' <<<"$order_trace")" '분산 Trace 서비스 수'
jq --exit-status '.serviceNames == ["order-service", "product-service"]' <<<"$order_trace" >/dev/null
assert_distributed_parent_link "$order_trace"
has_component "$order_trace" REDIS
has_component "$order_trace" POSTGRESQL
echo 'PASS distributed order: Order HTTP Client -> Product -> Redis/PostgreSQL'

distributed_timeout_response="$(external_request "$ORDER_TARGET_URL" GET /lab/orders/2001/product-timeout true)"
distributed_timeout_trace="$(wait_for_trace "$(jq --raw-output '.traceId' <<<"$distributed_timeout_response")")"
assert_equals 504 "$(jq --raw-output '.httpStatus' <<<"$distributed_timeout_response")" '분산 timeout HTTP 상태'
assert_equals DOWNSTREAM_PRODUCT_TIMEOUT "$(jq --raw-output '.responseBody | fromjson | .code' <<<"$distributed_timeout_response")" '분산 timeout 오류 코드'
assert_equals TIMEOUT "$(jq --raw-output '.resultStatus' <<<"$distributed_timeout_trace")" '분산 timeout Trace 상태'
assert_equals order-service "$(jq --raw-output '.serviceName' <<<"$distributed_timeout_trace")" '분산 timeout 진입 서비스'
assert_distributed_parent_link "$distributed_timeout_trace"
jq --exit-status '
  any(.events[]; .serviceName == "product-service" and .component == "POSTGRESQL" and (.status == "ERROR" or .status == "TIMEOUT"))
' <<<"$distributed_timeout_trace" >/dev/null
echo 'PASS distributed timeout: Product PostgreSQL -> Order HTTP 504'

echo 'StackFlow Docker 데모 6개 시나리오 검증 완료'
