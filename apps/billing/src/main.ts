import './otel';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap(): Promise<void> {
  const maxRetries = 10;
  const retryDelay = 1000; // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
        transport: Transport.NATS,
        options: {
          servers: [process.env.NATS_SERVERS ?? 'nats://nats:4222'],
          queue: 'billing-workers'
        }
      });

      await app.listen();
      console.log('Billing microservice successfully connected to NATS');
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`NATS microservice connection attempt ${attempt}/${maxRetries} failed:`, message);
      if (attempt === maxRetries) {
        throw error instanceof Error ? error : new Error(message);
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

void bootstrap();
