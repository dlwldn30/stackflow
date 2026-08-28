# Order·Product Distributed Trace Lab

두 Spring Boot JVM에서 하나의 W3C Trace Context가 이어지는 과정을 검증하는 StackFlow 데모 workspace입니다.

```text
Order Service :8092
→ Java HTTP Client
→ Product Service :8091
→ Redis :16379
→ PostgreSQL :15432
```

## Docker 실행

저장소 루트에서 실행합니다.

```bash
docker compose up --build --wait
./scripts/verify-demo.sh
```

StackFlow UI는 [http://localhost:5173](http://localhost:5173), backend는 `http://localhost:18080`에서 실행됩니다.

UI는 `/workspace/distributed-trace-lab`을 자동 분석합니다.

1. 프로젝트 구조에서 `order-service`를 선택합니다.
2. API 요청에서 `GET /lab/orders/{orderId}` 또는 timeout endpoint를 선택합니다.
3. 기본 `orderId`인 `2001`로 `요청 보내고 Trace 보기`를 실행합니다.
4. Trace의 Waterfall과 그래프에서 `order-service → product-service` 경계를 확인합니다.

## 분산 Trace API

```bash
# 정상: Order → Product → Redis/PostgreSQL
curl http://localhost:8092/lab/orders/2001

# 장애: Product PostgreSQL timeout → Order HTTP 504
curl http://localhost:8092/lab/orders/2001/product-timeout
```

정상 응답 예시:

```json
{
  "orderId": 2001,
  "status": "CONFIRMED",
  "product": {
    "id": 1001,
    "name": "Trace Keyboard",
    "price": 129000,
    "source": "DATABASE"
  }
}
```

## 프로젝트 구성

- `order-service`: 주문 매핑과 Product HTTP Client 호출
- `product-service`: Redis cache, PostgreSQL 조회와 실제 query timeout

StackFlow는 Workspace 아래 두 서비스를 각각 분석하고 서비스 선택을 도메인·API 선택보다 먼저 표시합니다. 각 서비스의 Java Agent는 동일한 W3C Trace Context를 이어받으며, 서비스 관계는 정적 추측이 아니라 실제 span 부모·자식 관계로만 표시합니다.

## 자동 검증

```bash
# 6개 API·인프라 시나리오
./scripts/verify-demo.sh

# 정상 분산 요청과 timeout UI 시나리오
cd frontend
npx playwright install chromium
npm run test:e2e
```

Playwright는 정상 요청의 Waterfall·그래프 서비스 경계와 timeout 요청의 PostgreSQL 원인·Order 전파 경로, 390×844 화면 overflow를 검증합니다.

종료:

```bash
docker compose down --volumes
```
