import { Module } from '@nestjs/common';
import { dynamodbProvider } from './dynamodb.provider.js';
import { DYNAMODB_DOCUMENT_CLIENT } from './dynamodb.constants.js';
import { DynamoDbHealth } from './dynamodb.health.js';

@Module({
	providers: [dynamodbProvider],
	exports: [DYNAMODB_DOCUMENT_CLIENT, DynamoDbHealth],
})
export class DynamoDbModule {}
