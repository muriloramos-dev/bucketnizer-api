import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/filters/global.excpetion.filter.js';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.enableCors({
		origin: [
			'http://127.0.0.1:1420',
			'http://localhost:1420',
			'tauri://localhost',
			'http://tauri.localhost',
			'https://tauri.localhost',
		],
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization'],
	});
	app.useGlobalFilters(new GlobalExceptionFilter());

	await app.listen(process.env.PORT ?? 3010);
}
await bootstrap();
