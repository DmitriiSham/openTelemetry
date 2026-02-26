import { Controller } from '@nestjs/common';
import { Ctx, MessagePattern, NatsContext, Payload } from '@nestjs/microservices';
import { context as otelContext, propagation, trace, SpanStatusCode, metrics } from '@opentelemetry/api';
import { NatsHeadersCarrier } from './tracing/nats-carrier';

type BillingChargePayload = {
  amount: number;
};

@Controller()
export class BillingController {
  private readonly tracer = trace.getTracer('billing-consumer');
  private readonly meter = metrics.getMeter('billing-nats-meter');
  private readonly natsMessagesCounter = this.meter.createCounter('nats_messages_total');
  private readonly natsDurationHistogram = this.meter.createHistogram('nats_message_duration_ms', { unit: 'ms' });

  @MessagePattern('billing.charge')
  public async handleCharge(
    @Payload() payload: BillingChargePayload,
    @Ctx() natsContext: NatsContext
  ): Promise<{ approved: boolean; total: number; commission: number }> {
    const startedAt = process.hrtime.bigint();
    const headers = natsContext.getHeaders();
    const parentContext = headers
      ? propagation.extract(otelContext.active(), new NatsHeadersCarrier(headers))
      : otelContext.active();

    this.natsMessagesCounter.add(1, { subject: 'billing.charge', role: 'consumer' });

    return await this.tracer.startActiveSpan(
      'nats.consume billing.charge',
      {
        attributes: {
          'messaging.system': 'nats',
          'messaging.destination': 'billing.charge',
          'messaging.operation': 'consume'
        }
      },
      parentContext,
      async (consumeSpan) => {
        try {
          const commission = await this.tracer.startActiveSpan('calculate_commission', async (commissionSpan) => {
            const computed = Number((payload.amount * 0.03).toFixed(2));
            commissionSpan.setAttribute('billing.commission_percent', 3);
            commissionSpan.end();
            return computed;
          });

          const total = Number((payload.amount + commission).toFixed(2));
          const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
          this.natsDurationHistogram.record(durationMs, { subject: 'billing.charge' });

          consumeSpan.end();
          return {
            approved: true,
            total,
            commission
          };
        } catch (error) {
          consumeSpan.recordException(error as Error);
          consumeSpan.setStatus({ code: SpanStatusCode.ERROR });
          consumeSpan.end();
          throw error;
        }
      }
    );
  }
}
