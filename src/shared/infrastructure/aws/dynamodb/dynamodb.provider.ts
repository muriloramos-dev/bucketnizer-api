import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DYNAMODB_DOCUMENT_CLIENT } from './dynamodb.constants.js';

export const dynamodbProvider: Provider = {
	provide: DYNAMODB_DOCUMENT_CLIENT,
	inject: [ConfigService],

	useFactory: (config: ConfigService): DynamoDBDocumentClient => {
		const endpoint = config.get<string>('AWS_ENDPOINT');

		const client = new DynamoDBClient({
			region: config.getOrThrow<string>('AWS_REGION'),

			...(endpoint && {
				endpoint,
			}),
		});

		return DynamoDBDocumentClient.from(client, {
			marshallOptions: {
				removeUndefinedValues: true,
			},
		});
	},
};
