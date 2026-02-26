import './otel';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpLoggingInterceptor } from './observability/http-logging.interceptor';
import { HttpMetricsInterceptor } from './observability/http-metrics.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new HttpLoggingInterceptor(), new HttpMetricsInterceptor());
  await app.listen(3000, '0.0.0.0');
}

void bootstrap();
