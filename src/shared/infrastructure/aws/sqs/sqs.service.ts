// import {
//   Injectable,
//   Logger,
//   OnModuleDestroy,
//   OnModuleInit,
// } from '@nestjs/common';
// import { EventsService } from '../events/events.service.js';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model } from 'mongoose';

// import {
//   DeleteMessageCommand,
//   ReceiveMessageCommand,
//   SQSClient,
// } from '@aws-sdk/client-sqs';

// import {
//   Files,
//   FilesDocument,
//   FileStatus,
// } from '../files/schemas/files.schema.js';

// interface ThumbnailCreatedMessage {
//   event: 'THUMBNAIL_CREATED';
//   userId: string;
//   pathName: string;
//   objectId: string;
//   originalKey: string;
//   thumbnailKey: string;
// }

// @Injectable()
// export class SqsService implements OnModuleInit, OnModuleDestroy {
//   private readonly logger = new Logger(SqsService.name);

//   private readonly sqsClient = new SQSClient({
//     region: process.env.AWS_REGION ?? 'sa-east-1',
//   });

//   private readonly queueUrl = process.env.THUMBNAIL_QUEUE_URL;

//   private running = true;

//   constructor(
//     @InjectModel(Files.name)
//     private readonly fileModel: Model<FilesDocument>,
//     private readonly events: EventsService,
//   ) {}

//   onModuleInit(): void {
//     if (!this.queueUrl) {
//       throw new Error('THUMBNAIL_QUEUE_URL não foi configurada.');
//     }

//     this.logger.log('Iniciando consumer do SQS...');

//     void this.consumeMessages();
//   }

//   onModuleDestroy(): void {
//     this.logger.log('Parando consumer do SQS...');
//     this.running = false;
//   }

//   private async consumeMessages(): Promise<void> {
//     while (this.running) {
//       try {
//         const response = await this.sqsClient.send(
//           new ReceiveMessageCommand({
//             QueueUrl: this.queueUrl,
//             MaxNumberOfMessages: 10,
//             WaitTimeSeconds: 20,
//             VisibilityTimeout: 30,
//           }),
//         );

//         if (!response.Messages?.length) {
//           continue;
//         }

//         for (const message of response.Messages) {
//           try {
//             if (!message.Body) {
//               this.logger.warn(`Mensagem ${message.MessageId} sem Body.`);

//               continue;
//             }

//             const body = JSON.parse(message.Body) as ThumbnailCreatedMessage;

//             this.logger.log(`Mensagem recebida: ${body.objectId}`);

//             await this.processMessage(body);

//             /*
//              * Só deletamos a mensagem do SQS depois
//              * que ela foi processada com sucesso.
//              */
//             if (message.ReceiptHandle) {
//               await this.sqsClient.send(
//                 new DeleteMessageCommand({
//                   QueueUrl: this.queueUrl,
//                   ReceiptHandle: message.ReceiptHandle,
//                 }),
//               );
//             }

//             this.logger.log(
//               `Mensagem ${message.MessageId} processada e removida do SQS.`,
//             );
//           } catch (error) {
//             /*
//              * NÃO deletamos a mensagem em caso de erro.
//              *
//              * Depois que o VisibilityTimeout expirar,
//              * o SQS poderá entregar a mensagem novamente.
//              */
//             this.logger.error(
//               `Erro ao processar mensagem ${message.MessageId}`,
//               error instanceof Error ? error.stack : String(error),
//             );
//           }
//         }
//       } catch (error) {
//         this.logger.error(
//           'Erro ao consultar fila SQS',
//           error instanceof Error ? error.stack : String(error),
//         );

//         /*
//          * Evita ficar fazendo requisições freneticamente
//          * se houver problema com AWS, credenciais etc.
//          */
//         await this.sleep(5000);
//       }
//     }
//   }

//   private async processMessage(
//     message: ThumbnailCreatedMessage,
//   ): Promise<void> {
//     if (message.event !== 'THUMBNAIL_CREATED') {
//       throw new Error(`Evento SQS desconhecido: ${String(message.event)}`);
//     }

//     if (!message.userId || !message.objectId || !message.thumbnailKey) {
//       throw new Error('Mensagem THUMBNAIL_CREATED inválida.');
//     }

//     const result = await this.fileModel.updateOne(
//       {
//         userId: message.userId,
//         objectId: message.objectId,
//         status: { $nin: [FileStatus.TRASHED, FileStatus.DELETING] },
//       },
//       {
//         $set: {
//           thumbnailKey: message.thumbnailKey,
//           status: FileStatus.READY,
//         },

//         $unset: {
//           processingError: '',
//         },
//       },
//     );

//     if (result.matchedCount === 0) {
//       // Missing records were purged; never recreate them or poison the queue.
//       return;
//     }

//     // MongoDB is authoritative. A disconnected client must not prevent the SQS ack.
//     try {
//       this.events.fileReady(
//         message.userId,
//         message.objectId,
//         message.pathName ?? '',
//       );
//     } catch (error) {
//       this.logger.warn(
//         `Arquivo pronto, mas a notificação local falhou: ${String(error)}`,
//       );
//     }
//     this.logger.log(`Arquivo ${message.objectId} atualizado para READY.`);
//   }

//   private sleep(milliseconds: number): Promise<void> {
//     return new Promise((resolve) => setTimeout(resolve, milliseconds));
//   }
// }
