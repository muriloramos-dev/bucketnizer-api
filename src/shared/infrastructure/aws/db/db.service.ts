import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DbService {

    private readonly logger: Logger = new Logger(DbService.name);

    constructor() {}

    async init() {
        const client = new DynamoDBClient({
            region: process.env.AWS_REGION,
            endpoint: process.env.AWS_DYNAMODB_ENDPOINT
        });
        this.logger.log(`Checking if DynamoDB table exists...`);
    }

}
