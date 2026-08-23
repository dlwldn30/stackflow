# Redis·PostgreSQL Trace Lab

StackFlow의 정적 분석과 실제 OpenTelemetry Trace를 검증하기 위한 독립 Spring Boot 앱입니다.

## 가장 빠른 실행

저장소 루트에서 전체 데모를 실행합니다.

```bash
docker compose up --build --wait
./scripts/verify-demo.sh
```

| 서비스 | 주소 |
| --- | --- |
| StackFlow UI | `http://localhost:5173` |
| StackFlow backend | `http://localhost:18080` |
| Trace Lab | `http://localhost:8091` |
| PostgreSQL | `localhost:15432` |
| Redis | `localhost:16379` |

Demo Compose는 Trace Lab에 OpenTelemetry Java Agent를 적용하고 backend의 `/v1/traces`로 span을 전송합니다.

## 실험 API

```bash
# 다음 조회를 cache miss로 만듭니다.
curl -X DELETE http://localhost:8091/lab/products/1001/cache

# 첫 조회: Redis miss -> PostgreSQL -> Redis save
curl http://localhost:8091/lab/products/1001

# 재조회: Redis hit
curl http://localhost:8091/lab/products/1001

# 실제 PostgreSQL query timeout -> HTTP 504
curl http://localhost:8091/lab/products/1001/database-timeout

# 존재하지 않는 테이블을 조회하는 모의 DB 오류 -> HTTP 500
curl http://localhost:8091/lab/products/database-error
```

Redis 장애 fallback:

```bash
docker compose stop redis
curl http://localhost:8091/lab/products/1002
docker compose start redis
```

정상 응답의 `source` 값은 `DATABASE`, `CACHE`, `DATABASE_FALLBACK` 중 하나입니다.

## Native 실행

PostgreSQL과 Redis만 실행합니다.

```bash
cd examples/trace-lab
docker compose up -d --wait
```

StackFlow에서 이 디렉터리를 분석하고 `실행 Trace 설정`의 Gradle 명령으로 앱을 시작합니다. 기본 앱 주소는 `http://localhost:8091`입니다.

정리:

```bash
docker compose down
```

`--volumes`를 추가하면 저장된 PostgreSQL·Redis 데이터도 삭제합니다.
