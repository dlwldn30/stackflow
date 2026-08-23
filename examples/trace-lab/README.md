# Trace Lab

Trace Lab is a small external Spring Boot project for verifying StackFlow's real Redis and PostgreSQL traces.

## 1. Start infrastructure

```bash
cd /Users/jiwoo/Desktop/stackflow/examples/trace-lab
docker compose up -d --wait
```

PostgreSQL listens on `15432` and Redis listens on `16379`.

## 2. Analyze the project

Run StackFlow backend with local targets enabled:

```bash
cd /Users/jiwoo/Desktop/stackflow/backend
STACKFLOW_ALLOW_PRIVATE_TARGETS=true ./gradlew bootRun --args='--server.port=18080'
```

Run the frontend against that backend:

```bash
cd /Users/jiwoo/Desktop/stackflow/frontend
VITE_API_TARGET=http://localhost:18080 npm run dev
```

Select this project in StackFlow:

```text
/Users/jiwoo/Desktop/stackflow/examples/trace-lab
```

## 3. Run with the Java Agent

In `실행 Trace 설정`, enter:

```text
Agent: /Users/jiwoo/.stackflow/agents/opentelemetry-javaagent.jar
Collector: http://localhost:18080
```

Generate the Gradle command and run it from this directory. The app starts on `http://localhost:8091`.

## 4. Verify flows

Use `http://localhost:8091` as the target base URL in StackFlow.

```bash
# Force the next lookup to miss Redis.
curl -X DELETE http://localhost:8091/lab/products/1001/cache

# Redis miss -> PostgreSQL -> Redis save
curl http://localhost:8091/lab/products/1001

# Redis hit; PostgreSQL is skipped
curl http://localhost:8091/lab/products/1001

# Deliberate JDBC failure -> HTTP 500
curl http://localhost:8091/lab/products/database-error
```

To verify Redis failure fallback:

```bash
docker compose stop redis
curl http://localhost:8091/lab/products/1002
docker compose start redis
```

The fallback response uses `"source":"DATABASE_FALLBACK"`. Stop the lab with `docker compose down`; add `-v` to reset its data volumes.
