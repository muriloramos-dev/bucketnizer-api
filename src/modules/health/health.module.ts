import { Module } from '@nestjs/common';
import { DynamoDbModule } from '../../shared/infrastructure/aws/dynamodb/dynamodb.module.js';
import { HealthController } from './presentation/health.controller.js';

@Module({
	imports: [DynamoDbModule],
	controllers: [HealthController],
})
export class HealthModule {}
