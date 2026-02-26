# NestJS + NATS + OpenTelemetry demo

Мини-проект показывает observability для цепочки `HTTP -> NATS request/reply -> billing`.

## Запуск

```bash
cd deploy
docker compose up --build
```

## Пример запроса

```bash
curl "http://localhost:3000/checkout?amount=100"
```

Ожидаемый ответ:

```json
{"status":"ok","data":{"approved":true,"total":103,"commission":3}}
```

## Куда смотреть

- Prometheus: http://localhost:9090
- Jaeger UI: http://localhost:16686
- Grafana: http://localhost:3001

## Ожидаемый trace

`HTTP GET /checkout -> nats.request billing.charge -> nats.consume billing.charge -> calculate_commission`

## Метрики

- `http_requests_total{method,route,status}`
- `http_request_duration_ms{method,route,status}`
- `http_errors_total{method,route,error_type}`
- `nats_messages_total{subject,role}`
- `nats_message_duration_ms{subject}`

RPS в Prometheus:

```promql
sum(rate(http_requests_total[1m])) by (route)
```

Latency p95/p99:

```promql
histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le, route))
histogram_quantile(0.99, sum(rate(http_request_duration_ms_bucket[5m])) by (le, route))
```
