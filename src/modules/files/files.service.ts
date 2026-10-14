// import {
// 	BadRequestException,
// 	HttpException,
// 	ServiceUnavailableException,
// 	ConflictException,
// 	Injectable,
// 	Logger,
// 	NotFoundException,
// } from '@nestjs/common';
// import { Files, FileStatus } from './schemas/files.schema.js';
// import {
// 	DeleteObjectCommand,
// 	HeadObjectCommand,
// 	GetObjectCommand,
// 	PutObjectCommand,
// 	S3Client,
// 	StorageClass,
// } from '@aws-sdk/client-s3';
// import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
// import { Folders } from './schemas/folders.schema.js';
// import { folderPath, folderAncestors } from './folder-path.js';
// import { randomUUID, createHash } from 'crypto';
// import { GetThumbnailObjectDto } from './dto/get-thumbnail-object.dto.js';
// import { UploadObjectDto } from './dto/upload-object.dto.js';
// import { UploadObjectsDto } from './dto/upload-objects.dto.js';
// export const MAX_BATCH_SIZE = 20;

// @Injectable()
// export class FilesService {
// 	constructor(
// 	) {}

// 	async listFolders(userId: string): Promise<string[]> {
// 		const [folders, existingPaths] = await Promise.all([
// 			this.folderModel.find({ userId }).select('pathName').lean().exec(),
// 			this.fileModel.distinct('pathName', { userId }).exec(),
// 		]);
// 		const paths = [
// 			...folders.map((folder) => folder.pathName),
// 			...existingPaths,
// 		].filter(
// 			(path): path is string =>
// 				typeof path === 'string' && path.length > 0,
// 		);
// 		// Existing nested paths remain navigable even when parent records predate folders.
// 		return [...new Set(paths.flatMap(folderAncestors))]
// 			.filter(Boolean)
// 			.sort((a, b) => a.localeCompare(b, 'pt-BR'));
// 	}

// 	async createFolder(
// 		userId: string,
// 		value: unknown,
// 	): Promise<{ path: string }> {
// 		const path = folderPath(value);
// 		// Persist from root to leaf; retries are safe if a previous attempt stopped midway.
// 		for (const currentPath of folderAncestors(path)) {
// 			try {
// 				await this.folderModel
// 					.updateOne(
// 						{ userId, pathName: currentPath },
// 						{ $setOnInsert: { userId, pathName: currentPath } },
// 						{ upsert: true },
// 					)
// 					.exec();
// 			} catch (error) {
// 				if (!(
// 					error &&
// 					typeof error === 'object' &&
// 					'code' in error &&
// 					error.code === 11000
// 				))
// 					throw error;
// 			}
// 		}
// 		return { path };
// 	}

// 	private readonly region = process.env.AWS_REGION;
// 	private readonly bucketName = process.env.AWS_BUCKET;
// 	private readonly client = new S3Client({ region: this.region });
// 	private readonly logger = new Logger(FilesService.name);

// 	private validateFile(file: import('./dto/file.dto.js').FileDto) {
// 		if (
// 			!file ||
// 			typeof file.originalName !== 'string' ||
// 			!file.originalName.trim() ||
// 			file.originalName.length > 255 ||
// 			file.originalName.split('').some((c) => c.charCodeAt(0) < 32) ||
// 			typeof file.contentType !== 'string' ||
// 			!/^[\w.+-]+\/[\w.+-]+$/.test(file.contentType) ||
// 			!Number.isSafeInteger(file.size) ||
// 			file.size < 0 ||
// 			(file.importId !== undefined &&
// 				(typeof file.importId !== 'string' ||
// 					!/^[a-zA-Z0-9-]{1,128}$/.test(file.importId)))
// 		) {
// 			throw new BadRequestException('Metadata de arquivo inválida.');
// 		}
// 	}

// 	async sendObject(
// 		userId: string,
// 		dto: UploadObjectDto,
// 	): Promise<{ objectId: string; url: string; status?: string }> {
// 		this.validateFile(dto?.file);
// 		const file = dto.file;
// 		const path = folderPath(dto.path ?? '', true) || 'Recentes';
// 		await this.createFolder(userId, path);
// 		// Stable per-user intent: retries never allocate a second remote object.
// 		const objectId = file.importId
// 			? createHash('sha256')
// 					.update(userId + '\0' + file.importId)
// 					.digest('hex')
// 			: randomUUID();
// 		const originalKey = [
// 			'originals',
// 			userId,
// 			...path.split('/'),
// 			objectId,
// 		].join('/');
// 		let existing = file.importId
// 			? await this.fileModel.findOne({ userId, objectId }).lean().exec()
// 			: null;
// 		if (!existing) {
// 			try {
// 				await this.fileModel.create({
// 					userId,
// 					objectId,
// 					originalName: file.originalName,
// 					originalKey,
// 					mimetype: file.contentType,
// 					size: file.size,
// 					s3Class: StorageClass.STANDARD,
// 					status: FileStatus.PENDING_UPLOAD,
// 					pathName: path,
// 				});
// 			} catch (error) {
// 				if (!(
// 					file.importId &&
// 					error &&
// 					typeof error === 'object' &&
// 					'code' in error &&
// 					error.code === 11000
// 				))
// 					throw error;
// 				existing = await this.fileModel
// 					.findOne({ userId, objectId })
// 					.lean()
// 					.exec();
// 				if (!existing)
// 					throw new ServiceUnavailableException(
// 						'Não foi possível recuperar o ticket.',
// 					);
// 			}
// 		}
// 		if (existing) {
// 			if (
// 				existing.pathName !== path ||
// 				existing.size !== file.size ||
// 				existing.mimetype !== file.contentType ||
// 				existing.originalName !== file.originalName
// 			)
// 				throw new ConflictException(
// 					'A intenção de upload já existe com outra metadata.',
// 				);
// 			if (
// 				existing.status === FileStatus.READY ||
// 				existing.status === FileStatus.PROCESSING
// 			)
// 				return { objectId, url: '', status: existing.status };
// 			if (existing.status !== FileStatus.PENDING_UPLOAD)
// 				throw new ConflictException(
// 					'Este arquivo não aceita um novo upload.',
// 				);
// 			try {
// 				const head = await this.client.send(
// 					new HeadObjectCommand({
// 						Bucket: this.bucketName,
// 						Key: originalKey,
// 					}),
// 				);
// 				if (head.ContentLength !== file.size)
// 					throw new ConflictException(
// 						'O original existente tem tamanho diferente.',
// 					);
// 				return { objectId, url: '', status: FileStatus.PROCESSING };
// 			} catch (error) {
// 				const e = error as {
// 					name?: string;
// 					$metadata?: { httpStatusCode?: number };
// 				};
// 				if (
// 					e.name !== 'NotFound' &&
// 					e.$metadata?.httpStatusCode !== 404
// 				)
// 					throw error;
// 			}
// 		}
// 		const url = await getSignedUrl(
// 			this.client,
// 			new PutObjectCommand({
// 				Bucket: this.bucketName,
// 				Key: originalKey,
// 				ContentType: file.contentType,
// 				StorageClass: StorageClass.STANDARD,
// 			}),
// 			{ expiresIn: 500 },
// 		);
// 		this.logger.debug('Upload ticket created');
// 		return { objectId, url };
// 	}

// 	thumbnailUrl(key: string, expiresIn = 300) {
// 		return getSignedUrl(
// 			this.client,
// 			new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
// 			{ expiresIn },
// 		);
// 	}

// 	async getThumbnails(
// 		userId: string,
// 		path: string,
// 	): Promise<GetThumbnailObjectDto[]> {
// 		this.logger.debug(
// 			`[FilesService.getThumbnails] Fetching thumbnails for userId: ${userId}, path: ${path}`,
// 		);

// 		path = folderPath(path, true);
// 		const files = await this.fileModel
// 			.find({
// 				userId,
// 				pathName: path,
// 				status: FileStatus.READY,
// 				thumbnailKey: {
// 					$exists: true,
// 					$ne: null,
// 				},
// 			})
// 			.sort({ createdAt: -1 })
// 			.limit(20)
// 			.exec();

// 		if (files.length === 0) {
// 			this.logger.debug(
// 				`[FilesService.getThumbnails] No thumbnails found for userId: ${userId}, path: ${path}`,
// 			);
// 			return [];
// 		}

// 		this.logger.debug(
// 			`[FilesService.getThumbnails] Found ${files.length} thumbnails for userId: ${userId}, path: ${path}`,
// 		);

// 		const response = await Promise.all(
// 			files.map(async (file) => {
// 				const thumbnailUrl = await this.thumbnailUrl(
// 					file.thumbnailKey!,
// 				);

// 				return new GetThumbnailObjectDto({
// 					lifecycleVersion: file.lifecycleVersion ?? 0,
// 					objectId: file.objectId,
// 					name: file.originalName,
// 					thumbnailUrl,
// 					mimetype: file.mimetype,
// 					size: file.size,
// 				});
// 			}),
// 		);

// 		this.logger.debug(
// 			`[FilesService.getThumbnails] Returning ${response.length} thumbnail DTOs for userId: ${userId}, path: ${path}`,
// 		);

// 		return response;
// 	}

// 	async getStatus(userId: string, objectId: string) {
// 		const file = await this.fileModel
// 			.findOne({ userId, objectId })
// 			.select('objectId pathName status thumbnailKey processingError')
// 			.lean()
// 			.exec();
// 		if (!file) throw new NotFoundException('File not found');
// 		return {
// 			objectId: file.objectId,
// 			pathName: file.pathName ?? '',
// 			status: file.status,
// 			ready:
// 				file.status === FileStatus.READY && Boolean(file.thumbnailKey),
// 			processingError: file.processingError,
// 		};
// 	}

// 	async getObject(
// 		userId: string,
// 		objectId: string,
// 	): Promise<{ url: string }> {
// 		this.logger.debug(
// 			`[FilesService.getObject] Fetching object for userId: ${userId}, objectId: ${objectId}`,
// 		);

// 		const file = await this.fileModel
// 			.findOne({
// 				userId,
// 				objectId,
// 			})
// 			.exec();

// 		if (!file) {
// 			this.logger.warn(
// 				`[FilesService.getObject] File not found for userId: ${userId}, objectId: ${objectId}`,
// 			);
// 			throw new NotFoundException('File not found');
// 		}

// 		if (file.status !== FileStatus.READY) {
// 			this.logger.warn(
// 				`[FilesService.getObject] File is not ready for download. Current status: ${file.status} for userId: ${userId}, objectId: ${objectId}`,
// 			);
// 			throw new ConflictException(
// 				`File is not ready for download. Current status: ${file.status}`,
// 			);
// 		}

// 		this.logger.debug(
// 			`[FilesService.getObject] Generating signed URL for file download for userId: ${userId}, objectId: ${objectId}`,
// 		);

// 		const command = new GetObjectCommand({
// 			Bucket: this.bucketName,
// 			Key: file.originalKey,
// 			ResponseContentType: file.mimetype,
// 			ResponseContentDisposition: `attachment; filename="${encodeURIComponent(
// 				file.originalName,
// 			)}"`,
// 		});

// 		this.logger.debug('[FilesService.getObject] Signing original download');

// 		const url = await getSignedUrl(this.client, command, {
// 			expiresIn: 300,
// 		});

// 		this.logger.log(
// 			`[FilesService.getObject] Download URL generated for userId=${userId}, objectId=${objectId}`,
// 		);

// 		return { url };
// 	}

// 	async changeObjectFileName(
// 		userId: string,
// 		objectId: string,
// 		newFileName: unknown,
// 	): Promise<{ objectId: string; name: string }> {
// 		if (typeof newFileName !== 'string') {
// 			throw new BadRequestException(
// 				'Informe o novo nome do arquivo como texto.',
// 			);
// 		}
// 		if (
// 			newFileName
// 				.split('')
// 				.some(
// 					(c) =>
// 						c === '/' ||
// 						c === '\\' ||
// 						c.charCodeAt(0) < 32 ||
// 						c.charCodeAt(0) === 127,
// 				)
// 		) {
// 			throw new BadRequestException(
// 				'O nome não pode conter barras ou caracteres de controle.',
// 			);
// 		}
// 		const name = newFileName.trim();
// 		if (!name || name === '.' || name === '..' || name.length > 255) {
// 			throw new BadRequestException(
// 				'Informe um nome válido com até 255 caracteres.',
// 			);
// 		}

// 		const file = await this.fileModel.findOne({ userId, objectId }).exec();
// 		if (!file) {
// 			throw new NotFoundException('File not found');
// 		}

// 		if (file.status !== FileStatus.READY)
// 			throw new ConflictException(
// 				'Restaure o arquivo antes de renomear.',
// 			);
// 		file.originalName = name;
// 		await file.save();

// 		return { objectId: file.objectId, name };
// 	}

// 	async deleteObject(
// 		userId: string,
// 		objectId: string,
// 		leaseId: string,
// 	): Promise<void> {
// 		// Only the cleanup worker can supply the current lease; never delete a READY file.
// 		if (!leaseId)
// 			throw new ConflictException('Lease de exclusão obrigatório.');
// 		const file = await this.fileModel
// 			.findOneAndUpdate(
// 				{
// 					userId,
// 					objectId,
// 					status: FileStatus.DELETING,
// 					purgeLeaseId: leaseId,
// 				},
// 				{ $set: { status: FileStatus.DELETING } },
// 				{ returnDocument: 'after' },
// 			)
// 			.exec();
// 		if (!file) {
// 			const existing = await this.fileModel
// 				.findOne({ userId, objectId })
// 				.exec();
// 			if (!existing) throw new NotFoundException('File not found');
// 			throw new ConflictException(
// 				'O arquivo não está reservado para exclusão.',
// 			);
// 		}

// 		let stage = 'original no S3';
// 		try {
// 			// With versioning disabled, deleting an already absent key is safe to retry.
// 			for (const key of [file.originalKey, file.thumbnailKey].filter(
// 				Boolean,
// 			)) {
// 				stage =
// 					key === file.originalKey
// 						? 'original no S3'
// 						: 'thumbnail no S3';
// 				await this.client.send(
// 					new DeleteObjectCommand({
// 						Bucket: this.bucketName,
// 						Key: key,
// 					}),
// 				);
// 			}
// 			stage = 'registro no MongoDB';
// 			const removed = await this.fileModel
// 				.deleteOne({
// 					userId,
// 					objectId,
// 					status: FileStatus.DELETING,
// 					purgeLeaseId: leaseId,
// 				})
// 				.exec();
// 			if (removed.deletedCount !== 1)
// 				throw new ConflictException('A reserva da limpeza mudou; a conclusão será reconciliada.');
// 		} catch (error) {
// 			const cause = error as {
// 				name?: string;
// 				message?: string;
// 				code?: string | number;
// 				$metadata?: { httpStatusCode?: number; requestId?: string };
// 			} | null;
// 			this.logger.error({
// 				message: 'Exclusão incompleta; registro mantido como DELETING.',
// 				objectId,
// 				stage,
// 				errorName: cause?.name,
// 				errorCode: cause?.code,
// 				errorMessage: cause?.message?.replace(
// 					/https?:\/\/\S+/g,
// 					'[URL omitida]',
// 				),
// 				httpStatusCode: cause?.$metadata?.httpStatusCode,
// 				requestId: cause?.$metadata?.requestId,
// 			});
// 			const hint =
// 				cause?.name === 'AccessDenied'
// 					? ' O S3 negou a operação; verifique a permissão s3:DeleteObject no backend.'
// 					: ' Tente novamente com o mesmo arquivo.';
// 			throw new ServiceUnavailableException(
// 				`Não foi possível excluir ${stage}.${hint}`,
// 			);
// 		}
// 	}

// 	async sendObjects(userId: string, dto: UploadObjectsDto) {
// 		if (
// 			!dto ||
// 			!Array.isArray(dto.files) ||
// 			dto.files.length === 0 ||
// 			dto.files.length > MAX_BATCH_SIZE
// 		)
// 			throw new BadRequestException(
// 				'Envie de 1 a 20 arquivos por solicitação de tickets.',
// 			);
// 		folderPath(dto.path ?? '', true);
// 		return Promise.all(
// 			dto.files.map(async (file) => {
// 				try {
// 					return await this.sendObject(userId, {
// 						path: dto.path,
// 						file,
// 					});
// 				} catch (error) {
// 					const status =
// 						error instanceof HttpException
// 							? error.getStatus()
// 							: 503;
// 					return {
// 						objectId: '',
// 						url: '',
// 						error: {
// 							code: 'UPLOAD_TICKET_ERROR',
// 							status,
// 							message:
// 								status >= 500
// 									? 'Não foi possível preparar o ticket. Tente novamente.'
// 									: error instanceof Error
// 										? error.message
// 										: 'Metadata inválida.',
// 						},
// 					};
// 				}
// 			}),
// 		);
// 	}
// }
