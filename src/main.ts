// backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS so your Vercel frontend can talk to this backend
  app.enableCors({
    origin: '*', // Allow all origins (Easiest for troubleshooting)
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // CRITICAL CHANGE: Use the PORT provided by Render, or fallback to 3000 for local
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  
  console.log(`Backend running on port ${port}`);
}
bootstrap();