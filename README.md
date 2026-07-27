# StackFlow

StackFlow is a vertical-slice MVP for visualizing how a request moves through a backend flow and where a failure occurs.

## What is implemented

- `backend/`
  - Spring Boot + Gradle
  - `GET /api/products/{productId}`
  - `GET /api/traces`
  - `GET /api/traces/{traceId}`
  - in-memory trace/event capture for `Client -> Controller -> Service -> Redis -> Repository -> MySQL -> Response`
  - scenario support for:
    - normal flow
    - cache hit / cache miss
    - Redis fallback
    - DB timeout
    - service error
- `frontend/`
  - React + Vite + TypeScript
  - request runner
  - request flow graph with React Flow
  - node detail panel
  - recent trace list

## Why Redis/MySQL are simulated

This first slice keeps Redis/MySQL as named components in the trace model, but uses in-memory services to make the flow runnable without external infrastructure.

That keeps the important part stable first:

- trace shape
- error location rendering
- status mapping
- node detail behavior

Actual Redis/MySQL containers can replace the in-memory services in the next phase without changing the frontend model.

## Run locally

### Backend

```bash
cd backend
./gradlew bootRun
```

Backend runs on `http://localhost:8080`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

Vite proxies `/api` requests to the backend.

## Sample scenarios

- Normal:
  - `1001` first request -> cache miss
  - `1001` second request -> cache hit
- Redis fallback:
  - scenario `redis-down`
- Database timeout:
  - scenario `db-timeout`
- Service exception:
  - scenario `service-error`

## Verification

Backend:

```bash
cd backend
./gradlew test
```

Frontend:

```bash
cd frontend
npm run build
```
