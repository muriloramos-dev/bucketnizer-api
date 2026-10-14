import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DynamoDbHealth } from '../../../shared/infrastructure/aws/dynamodb/dynamodb.health.js';

@Controller('health')
export class HealthController {
	constructor(private readonly dynamodbHealth: DynamoDbHealth) {}

	@Get('ready')
	async readiness() {
		const healthy = await this.dynamodbHealth.check();

		if (!healthy) {
			throw new ServiceUnavailableException({
				status: 'unhealthy',
				services: {
					dynamodb: 'down',
				},
			});
		}

		return {
			status: 'healthy',
			services: {
				dynamodb: 'up',
			},
		};
	}
}
