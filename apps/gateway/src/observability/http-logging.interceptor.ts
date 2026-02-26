import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { context, trace } from '@opentelemetry/api';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

type HttpRequest = {
  method: string;
  originalUrl?: string;
  route?: { path?: string };
};

type HttpResponse = {
  statusCode: number;
};

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  public intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (executionContext.getType() !== 'http') {
      return next.handle();
    }

    const startedAt = process.hrtime.bigint();
    const http = executionContext.switchToHttp();
    const req = http.getRequest<HttpRequest>();
    const res = http.getResponse<HttpResponse>();

    return next.handle().pipe(
      tap(() => {
        const log = {
          level: 'info',
          type: 'http_request',
          method: req.method,
          url: req.originalUrl ?? '',
          route: req.route?.path ?? 'unknown',
          status: res.statusCode,
          duration_ms: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
          traceId: this.getTraceId()
        };

        console.log(JSON.stringify(log));
      }),
      catchError((error: unknown) => {
        const err = error instanceof Error ? error : new Error('Unknown error');
        const log = {
          level: 'error',
          type: 'http_error',
          message: err.message,
          stack: err.stack,
          statusCode: res.statusCode || 500,
          route: req.route?.path ?? 'unknown',
          traceId: this.getTraceId()
        };

        console.error(JSON.stringify(log));
        return throwError(() => error);
      })
    );
  }

  private getTraceId(): string | undefined {
    const span = trace.getSpan(context.active());
    return span?.spanContext().traceId;
  }
}
