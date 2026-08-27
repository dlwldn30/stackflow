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

PR 2 단계의 StackFlow 기본 화면은 Order Service를 분석합니다. Workspace 전체 서비스 선택 UI는 후속 작업에서 추가합니다. 정적 workspace API는 `/workspace/distributed-trace-lab` 아래 두 서비스를 각각 분석합니다.

종료:

```bash
docker compose down --volumes
```
