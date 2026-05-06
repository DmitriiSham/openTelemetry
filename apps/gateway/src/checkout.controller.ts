import { Controller, Get, ParseFloatPipe, Query } from '@nestjs/common';
import { BillingClient } from './billing.client';

@Controller()
export class CheckoutController {
  public constructor(private readonly billingClient: BillingClient) {}

  @Get('/checkout')
  public async checkout(@Query('amount', new ParseFloatPipe()) amount: number): Promise<{ status: string; data: unknown }> {
    const data = await this.billingClient.charge(amount);
    return {
      status: 'ok',
      data
    };
  }
}
