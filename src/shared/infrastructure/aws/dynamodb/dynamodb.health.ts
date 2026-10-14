import { Inject, Injectable } from '@nestjs/common';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DYNAMODB_DOCUMENT_CLIENT } from './dynamodb.constants.js';

@Injectable()
export class DynamoDbHealth {
	constructor(
		@Inject(DYNAMODB_DOCUMENT_CLIENT)
		private readonly client: DynamoDBDocumentClient,
	) {}

	async check(): Promise<boolean> {
		try {
			await this.client.send(
				new ListTablesCommand({
					Limit: 1,
				}),
			);

			return true;
		} catch {
			return false;
		}
	}
}
