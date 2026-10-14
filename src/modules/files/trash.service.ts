// import {
// 	BadRequestException,
// 	ConflictException,
// 	GoneException,
// 	Injectable,
// 	NotFoundException,
// } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model } from 'mongoose';
// import { FilesService } from './files.service.js';
// import { Files, FileStatus } from './schemas/files.schema.js';
// import { EventsService } from '../events/events.service.js';
// export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// export interface LifecycleRequest {
// 	operationId: string;
// 	expectedVersion: number;
// }
// export type LifecycleAction = 'TRASH' | 'RESTORE' | 'PURGE';
// export function lifecycleView(file: Files) {
// 	return {
// 		objectId: file.objectId,
// 		name: file.originalName,
// 		mimetype: file.mimetype,
// 		size: file.size,
// 		path: file.pathName || 'Recentes',
// 		status: file.status,
// 		lifecycleVersion: file.lifecycleVersion ?? 0,
// 		lastOperationId: file.lastLifecycleOperationId ?? null,
// 		trashedAt: file.trashedAt?.getTime() ?? null,
// 		purgeAfter: file.purgeAfter?.getTime() ?? null,
// 		thumbnailUrl: '',
// 		cleanupError: file.purgeError
// 			? 'A limpeza será tentada novamente.'
// 			: null,
// 	};
// }
// @Injectable()
// export class TrashService {
// 	constructor(
// 		@InjectModel(Files.name) private readonly files: Model<Files>,
// 		private readonly events: EventsService,
// 		private readonly storage: FilesService,
// 	) {}
// 	async list(userId: string, cursor?: string) {
// 		if (cursor && !/^[\w-]{1,128}$/.test(cursor))
// 			throw new BadRequestException('Cursor inválido.');
// 		const records = await this.files
// 			.find({
// 				userId,
// 				status: { $in: [FileStatus.TRASHED, FileStatus.DELETING] },
// 				...(cursor ? { objectId: { $gt: cursor } } : {}),
// 			})
// 			.sort({ objectId: 1 })
// 			.limit(51)
// 			.lean()
// 			.exec();
// 		const page = records.slice(0, 50);
// 		const items = await Promise.all(
// 			page.map(async (file) => {
// 				const view = lifecycleView(file);
// 				if (
// 					file.status === FileStatus.TRASHED &&
// 					file.thumbnailKey &&
// 					(file.purgeAfter?.getTime() ?? 0) > Date.now()
// 				) {
// 					view.thumbnailUrl = await this.storage.thumbnailUrl(
// 						file.thumbnailKey,
// 						Math.max(
// 							1,
// 							Math.min(
// 								300,
// 								Math.floor(
// 									(file.purgeAfter!.getTime() - Date.now()) /
// 										1000,
// 								),
// 							),
// 						),
// 					);
// 				}
// 				return view;
// 			}),
// 		);
// 		return {
// 			items,
// 			nextCursor: records.length > 50 ? page.at(-1)!.objectId : null,
// 			serverTime: Date.now(),
// 		};
// 	}
// 	async statuses(userId: string, ids: unknown) {
// 		if (
// 			!Array.isArray(ids) ||
// 			ids.length < 1 ||
// 			ids.length > 100 ||
// 			ids.some((id) => typeof id !== 'string' || !id || id.length > 128)
// 		)
// 			throw new BadRequestException(
// 				'Informe de 1 a 100 identificadores.',
// 			);
// 		const records = await this.files
// 			.find({ userId, objectId: { $in: ids } })
// 			.lean()
// 			.exec();
// 		const mapped = new Map(
// 			records.map((file) => [file.objectId, lifecycleView(file)]),
// 		);
// 		return {
// 			items: ids.map(
// 				(id: string) =>
// 					mapped.get(id) ?? { objectId: id, status: 'MISSING' },
// 			),
// 			serverTime: Date.now(),
// 		};
// 	}
// 	async mutate(
// 		userId: string,
// 		objectId: string,
// 		action: LifecycleAction,
// 		body: LifecycleRequest,
// 	) {
// 		if (
// 			!body ||
// 			typeof body.operationId !== 'string' ||
// 			!/^[\w-]{1,128}$/.test(body.operationId) ||
// 			!Number.isSafeInteger(body.expectedVersion) ||
// 			body.expectedVersion < 0
// 		)
// 			throw new BadRequestException(
// 				'Operação e versão válidas são obrigatórias.',
// 			);
// 		const existing = await this.files
// 			.findOne({ userId, objectId })
// 			.lean()
// 			.exec();
// 		if (!existing) {
// 			if (action === 'PURGE')
// 				return {
// 					item: { objectId, status: 'MISSING' },
// 					serverTime: Date.now(),
// 				};
// 			throw new NotFoundException('Arquivo não encontrado.');
// 		}
// 		if (existing.lastLifecycleOperationId === body.operationId)
// 			return { item: lifecycleView(existing), serverTime: Date.now() };
// 		if ((existing.lifecycleVersion ?? 0) !== body.expectedVersion)
// 			throw new ConflictException(
// 				'O arquivo mudou em outro dispositivo. Atualize e tente novamente.',
// 			);
// 		const now = new Date();
// 		if (
// 			action === 'RESTORE' &&
// 			(!existing.purgeAfter || existing.purgeAfter <= now)
// 		)
// 			throw new GoneException('O prazo de restauração terminou.');
// 		const expectedStatus =
// 			action === 'TRASH' ? FileStatus.READY : FileStatus.TRASHED;
// 		if (existing.status !== expectedStatus)
// 			throw new ConflictException(
// 				'A ação não está disponível no estado atual do arquivo.',
// 			);
// 		const set: Record<string, unknown> = {
// 			lastLifecycleOperationId: body.operationId,
// 			status:
// 				action === 'TRASH'
// 					? FileStatus.TRASHED
// 					: action === 'RESTORE'
// 						? FileStatus.READY
// 						: FileStatus.DELETING,
// 		};
// 		if (action === 'TRASH') {
// 			set.trashedAt = now;
// 			set.purgeAfter = new Date(now.getTime() + RETENTION_MS);
// 		}
// 		if (action === 'PURGE') set.purgeNextAttemptAt = now;
// 		const updated = await this.files
// 			.findOneAndUpdate(
// 				{
// 					userId,
// 					objectId,
// 					status: expectedStatus,
// 					$expr: {
// 						$and: [
// 							{
// 								$eq: [
// 									{ $ifNull: ['$lifecycleVersion', 0] },
// 									body.expectedVersion,
// 								],
// 							},
// 							...(action === 'RESTORE'
// 								? [{ $gt: ['$purgeAfter', '$$NOW'] }]
// 								: []),
// 						],
// 					},
// 					...(action === 'RESTORE'
// 						? { purgeAfter: { $gt: now } }
// 						: {}),
// 				},
// 				{
// 					$set: set,
// 					$inc: { lifecycleVersion: 1 },
// 					...(action === 'RESTORE'
// 						? {
// 								$unset: {
// 									trashedAt: '',
// 									purgeAfter: '',
// 									purgeError: '',
// 									purgeNextAttemptAt: '',
// 									purgeLeaseId: '',
// 									purgeLeaseUntil: '',
// 								},
// 							}
// 						: {}),
// 				},
// 				{ returnDocument: 'after' },
// 			)
// 			.lean()
// 			.exec();
// 		if (!updated)
// 			throw new ConflictException(
// 				'O estado do arquivo mudou. Atualize e tente novamente.',
// 			);
// 		this.events.fileLifecycle(
// 			userId,
// 			objectId,
// 			existing.pathName ?? '',
// 			action === 'TRASH'
// 				? 'file.trashed'
// 				: action === 'RESTORE'
// 					? 'file.restored'
// 					: 'file.deleting',
// 		);
// 		return { item: lifecycleView(updated), serverTime: Date.now() };
// 	}
// }
