// import { AuthModule } from './auth/auth.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

// import { FilesModule } from './files/files.module.js';
// import { SqsModule } from './sqs/sqs.module.js';
import { HealthController } from './health/health.controller.js';
import { DbService } from './shared/infrastructure/aws/db/db.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // AuthModule,
    // FilesModule,
    // SqsModule,
  ],
  controllers: [HealthController],
  providers: [DbService],
})
export class AppModule {}