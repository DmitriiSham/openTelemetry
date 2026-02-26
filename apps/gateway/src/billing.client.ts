import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { context as otelContext, propagation, trace, SpanStatusCode, metrics } from '@opentelemetry/api';
import { connect, type NatsConnection } from 'nats';
import { NatsHeadersCarrier, createHeaders } from './tracing/nats-carrier';

@Injectable()
export class BillingClient implements OnModuleInit, OnModuleDestroy {
  private connection?: NatsConnection;

  private readonly tracer = trace.getTracer('gateway-billing-client');
  private readonly meter = metrics.getMeter('gateway-nats-meter');
  private readonly natsMessagesCounter = this.meter.createCounter('nats_messages_total');
  private readonly natsDurationHistogram = this.meter.createHistogram('nats_message_duration_ms', { unit: 'ms' });

  public async onModuleInit(): Promise<void> {
    this.connection = await connect({
      servers: process.env.NATS_SERVERS ?? 'nats://nats:4222'
    });
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
    }
  }

  public async charge(amount: number): Promise<{ approved: boolean; total: number; commission: number }> {
    if (!this.connection) {
      throw new Error('NATS connection is not initialized');
    }

    return await this.tracer.startActiveSpan('nats.request billing.charge', async (span) => {
      const startedAt = process.hrtime.bigint();
      span.setAttributes({
        'messaging.system': 'nats',
        'messaging.destination': 'billing.charge',
        'messaging.operation': 'request'
      });

      try {
        const hdrs = createHeaders();
        propagation.inject(otelContext.active(), new NatsHeadersCarrier(hdrs));

        this.natsMessagesCounter.add(1, { subject: 'billing.charge', role: 'producer' });

        const msg = await this.connection.request('billing.charge', JSON.stringify({ amount }), { headers: hdrs, timeout: 3000 });
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        this.natsDurationHistogram.record(durationMs, { subject: 'billing.charge' });

        const payload = JSON.parse(new TextDecoder().decode(msg.data)) as {
          approved: boolean;
          total: number;
          commission: number;
        };

        span.end();
        return payload;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
        throw error;
      }
    });
  }
}
