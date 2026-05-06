import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  private readonly meter = metrics.getMeter('gateway-http-meter');

  private readonly requestsCounter = this.meter.createCounter('http_requests_total', {
    description: 'Total HTTP requests'
  });

  private readonly errorsCounter = this.meter.createCounter('http_errors_total', {
    description: 'Total HTTP errors'
  });

  private readonly durationHistogram = this.meter.createHistogram('http_request_duration_ms', {
    description: 'HTTP request duration in milliseconds',
    unit: 'ms'
  });

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<{ method: string; route?: { path?: string } }>();
    const response = http.getResponse<{ statusCode: number }>();
    const startedAt = process.hrtime.bigint();

    const method = request.method;
    const route = request.route?.path ?? 'unknown';

    return next.handle().pipe(
      tap(() => {
        const status = String(response.statusCode);
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const attrs = { method, route, status };

        this.requestsCounter.add(1, attrs);
        this.durationHistogram.record(durationMs, attrs);
      }),
      catchError((error: unknown) => {
        const status = String(response.statusCode || 500);
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const errorType = error instanceof Error ? error.name : 'UnknownError';
        const attrs = { method, route, status };

        this.requestsCounter.add(1, attrs);
        this.durationHistogram.record(durationMs, attrs);
        this.errorsCounter.add(1, { method, route, error_type: errorType });

        return throwError(() => error);
      })
    );
  }
}
