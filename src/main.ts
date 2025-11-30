// backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS with specific origins
  app.enableCors({
    origin: [
      'http://localhost:5173',              // Admin Dev Local
      'http://localhost:8081',              // Local Development
      'https://voltvault.com',              // Mobile App hardcoded URL
      'https://voltvault-web.vercel.app', // ⭐ REPLACE THIS with your actual Vercel URL
      /\.vercel\.app$/                      // Allows all Vercel preview URLs (Regex)
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true, // This is fine ONLY if origin is NOT '*'
  });

  // Use the PORT provided by Render
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  
  console.log(`Backend running on port ${port}`);
}
bootstrap();