import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientProxy, ClientProxyFactory, NatsRecordBuilder, Transport } from '@nestjs/microservices';
import { context as otelContext, propagation, trace, SpanStatusCode, metrics } from '@opentelemetry/api';
import { lastValueFrom, timeout } from 'rxjs';
import { NatsHeadersCarrier, createHeaders } from './tracing/nats-carrier';

@Injectable()
export class BillingClient implements OnModuleInit, OnModuleDestroy {
  private client?: ClientProxy;

  private readonly tracer = trace.getTracer('gateway-billing-client');
  private readonly meter = metrics.getMeter('gateway-nats-meter');
  private readonly natsMessagesCounter = this.meter.createCounter('nats_messages_total');
  private readonly natsDurationHistogram = this.meter.createHistogram('nats_message_duration_ms', { unit: 'ms' });

  public async onModuleInit(): Promise<void> {
    const maxRetries = 10;
    const retryDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.client = ClientProxyFactory.create({
          transport: Transport.NATS,
          options: {
            servers: [process.env.NATS_SERVERS ?? 'nats://nats:4222']
          }
        });
        await this.client.connect();
        console.log('Successfully connected to NATS');
        return;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`NATS connection attempt ${attempt}/${maxRetries} failed:`, message);
        if (attempt === maxRetries) {
          throw error instanceof Error ? error : new Error(message);
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  public async charge(amount: number): Promise<{ approved: boolean; total: number; commission: number }> {
    if (!this.client) {
      throw new Error('NATS connection is not initialized');
    }
    const client = this.client;

    const requestTimeout = Number(process.env.NATS_REQUEST_TIMEOUT_MS ?? 10000);
    const maxAttempts = 3;
    return await this.tracer.startActiveSpan('nats.request billing.charge', async (span) => {
      span.setAttributes({
        'messaging.system': 'nats',
        'messaging.destination': 'billing.charge',
        'messaging.operation': 'request'
      });

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const startedAt = process.hrtime.bigint();
        try {
          const hdrs = createHeaders();
          propagation.inject(otelContext.active(), new NatsHeadersCarrier(hdrs));
          const payload = new NatsRecordBuilder({ amount }).setHeaders(hdrs).build();

          this.natsMessagesCounter.add(1, { subject: 'billing.charge', role: 'producer' });

          const response = await lastValueFrom(
            client.send<{ approved: boolean; total: number; commission: number }>('billing.charge', payload).pipe(timeout(requestTimeout))
          );

          const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
          this.natsDurationHistogram.record(durationMs, { subject: 'billing.charge', attempt: String(attempt) });

          span.end();
          return response;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          span.recordException(error instanceof Error ? error : new Error(message));
          span.setStatus({ code: SpanStatusCode.ERROR });

          if (attempt === maxAttempts) {
            span.end();
            throw error instanceof Error ? error : new Error(message);
          }

          console.log(`billing.charge request attempt ${attempt}/${maxAttempts} failed: ${message}. retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      span.end();
      throw new Error('billing.charge failed after retries');
    });
  }
}
