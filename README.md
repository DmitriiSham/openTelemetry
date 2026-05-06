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

- Prometheus: http://localhost:9090 — сбор и просмотр метрик, временных рядов и вычислений на основе данных приложения.
- Jaeger UI: http://localhost:16686 — трассировка распределённых запросов, визуализация цепочки вызовов и latencies.
- Grafana: http://localhost:3001 — дашборды и визуализация метрик из Prometheus, удобный мониторинг системы.

### Grafana логин

- логин: `admin`
- пароль: `admin`

## Ожидаемый trace

Трассировка показывает путь запроса через систему:
- входящий HTTP-запрос на `/checkout`
- отправка NATS-запроса `billing.charge`
- обработка запроса в сервисе billing
- ответ и завершение операции `calculate_commission`

`HTTP GET /checkout -> nats.request billing.charge -> nats.consume billing.charge -> calculate_commission`

## Метрики

Метрики помогают понять, как работает приложение и где появляются задержки или ошибки.
- `http_requests_total{method,route,status}` — общее число HTTP-запросов, сгруппированных по методу, пути и статусу.
- `http_request_duration_ms{method,route,status}` — сколько миллисекунд занял каждый HTTP-запрос.
- `http_errors_total{method,route,error_type}` — количество ошибок по типу и маршруту.
- `nats_messages_total{subject,role}` — число сообщений NATS по теме и роли (producer/consumer).
- `nats_message_duration_ms{subject}` — время обработки сообщений NATS по теме.

### RPS в Prometheus

RPS (requests per second) показывает скорость входящих запросов за единицу времени. В Prometheus это рассчитывается как скорость прироста счетчика запросов за последнюю минуту.

```promql
sum(rate(http_requests_total[1m])) by (route)
```

### Latency p95/p99

`p95` и `p99` показывают, сколько времени занимает большинство запросов с учётом медленных хвостов:
- `p95` — задержка, ниже которой находятся 95% запросов;
- `p99` — задержка, ниже которой находятся 99% запросов.

Это полезно, чтобы увидеть реальные «медленные» запросы, а не только среднее время.

```promql
histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le, route))
histogram_quantile(0.99, sum(rate(http_request_duration_ms_bucket[5m])) by (le, route))
```
