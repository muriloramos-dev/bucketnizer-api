// import {
// 	Injectable,
// 	Logger,
// 	OnModuleDestroy,
// 	OnModuleInit,
// } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model } from 'mongoose';
// import { randomUUID } from 'node:crypto';
// import { Files, FileStatus } from './schemas/files.schema.js';
// import { FilesService } from './files.service.js';
// import { EventsService } from '../events/events.service.js';
// const LEASE_MS = 5 * 60 * 1000;
// @Injectable()
// export class TrashWorker implements OnModuleInit, OnModuleDestroy {
// 	private timer?: ReturnType<typeof setTimeout>;
// 	private stopping = false;
// 	private running = false;
// 	private readonly logger = new Logger(TrashWorker.name);
// 	constructor(
// 		@InjectModel(Files.name) private readonly files: Model<Files>,
// 		private readonly service: FilesService,
// 		private readonly events: EventsService,
// 	) {}
// 	onModuleInit() {
// 		void this.loop();
// 	}
// 	onModuleDestroy() {
// 		this.stopping = true;
// 		clearTimeout(this.timer);
// 	}
// 	private async loop() {
// 		try {
// 			await this.sweep();
// 		} catch {
// 			this.logger.error(
// 				'Não foi possível consultar a lixeira. Nova tentativa em um minuto.',
// 			);
// 		} finally {
// 			if (!this.stopping)
// 				this.timer = setTimeout(() => void this.loop(), 60_000);
// 		}
// 	}
// 	async sweep() {
// 		if (this.running) return;
// 		this.running = true;
// 		try {
// 			// At most fifty claims per sweep, two operations active at a time.
// 			for (let i = 0; i < 25 && !this.stopping; i++) {
// 				const results = await Promise.all([this.one(), this.one()]);
// 				if (results.every((found) => !found)) break;
// 			}
// 		} finally {
// 			this.running = false;
// 		}
// 	}
// 	private async one() {
// 		const now = new Date(),
// 			leaseId = randomUUID();
// 		const file = await this.files
// 			.findOneAndUpdate(
// 				{
// 					$and: [
// 						{
// 							$or: [
// 								{
// 									status: FileStatus.TRASHED,
// 									purgeAfter: { $lte: now },
// 								},
// 								{ status: FileStatus.DELETING },
// 							],
// 						},
// 						{
// 							$or: [
// 								{ purgeNextAttemptAt: { $exists: false } },
// 								{ purgeNextAttemptAt: { $lte: now } },
// 							],
// 						},
// 						{
// 							$or: [
// 								{ purgeLeaseUntil: { $exists: false } },
// 								{ purgeLeaseUntil: { $lte: now } },
// 							],
// 						},
// 					],
// 				},
// 				{
// 					$set: {
// 						status: FileStatus.DELETING,
// 						purgeLeaseId: leaseId,
// 						purgeLeaseUntil: new Date(now.getTime() + LEASE_MS),
// 					},
// 					$inc: { purgeAttempts: 1, lifecycleVersion: 1 },
// 				},
// 				{ returnDocument: 'after', sort: { purgeAfter: 1 } },
// 			)
// 			.lean()
// 			.exec();
// 		if (!file) return false;
// 		const filter = {
// 			userId: file.userId,
// 			objectId: file.objectId,
// 			purgeLeaseId: leaseId,
// 			status: FileStatus.DELETING,
// 		};
// 		const renew = setInterval(() => {
// 			void this.files
// 				.updateOne(filter, {
// 					$set: { purgeLeaseUntil: new Date(Date.now() + LEASE_MS) },
// 				})
// 				.exec()
// 				.catch(() =>
// 					this.logger.warn(
// 						'Não foi possível renovar o lease da limpeza.',
// 					),
// 				);
// 		}, 60_000);
// 		try {
// 			this.events.fileLifecycle(
// 				file.userId,
// 				file.objectId,
// 				file.pathName ?? '',
// 				'file.deleting',
// 			);
// 			await this.service.deleteObject(
// 				file.userId,
// 				file.objectId,
// 				leaseId,
// 			);
// 			this.events.fileLifecycle(
// 				file.userId,
// 				file.objectId,
// 				file.pathName ?? '',
// 				'file.deleted',
// 			);
// 			this.logger.log('Original, miniatura e registro removidos.');
// 		} catch {
// 			const delay = Math.min(
// 				3_600_000,
// 				60_000 * 2 ** Math.min(6, (file.purgeAttempts ?? 1) - 1),
// 			);
// 			await this.files
// 				.updateOne(filter, {
// 					$set: {
// 						purgeNextAttemptAt: new Date(Date.now() + delay),
// 						purgeError: 'Falha na limpeza remota',
// 					},
// 					$unset: { purgeLeaseId: '', purgeLeaseUntil: '' },
// 				})
// 				.exec();
// 			this.logger.warn('Limpeza parcial preservada para nova tentativa.');
// 		} finally {
// 			clearInterval(renew);
// 		}
// 		return true;
// 	}
// }
