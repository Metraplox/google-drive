import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  if (process.env.NODE_ENV === 'development') {
    app.enableCors({
      origin: 'http://localhost:3001', // Your frontend URL
      credentials: true,
    });
  }
  
  await app.listen(3000);
}
bootstrap();
