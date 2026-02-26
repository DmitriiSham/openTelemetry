import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { BillingClient } from './billing.client';

@Module({
  controllers: [CheckoutController],
  providers: [BillingClient]
})
export class AppModule {}
