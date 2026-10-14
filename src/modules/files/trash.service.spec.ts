// import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// import { Model } from 'mongoose';
// import { TrashService, RETENTION_MS } from './trash.service.js';
// import { TrashWorker } from './trash.worker.js';
// import { Files } from './schemas/files.schema.js';
// import { EventsService } from '../events/events.service.js';
// import { FilesService } from './files.service.js';
// vi.mock('./schemas/files.schema.js', () => ({
// 	Files: class {},
// 	FileStatus: { READY: 'READY', TRASHED: 'TRASHED', DELETING: 'DELETING' },
// }));
// vi.mock('./files.service.js', () => ({ FilesService: class {} }));
// const query = (value: unknown) => ({
// 	lean: () => ({ exec: async () => value }),
// 	exec: async () => value,
// });
// const request = { operationId: 'op-1', expectedVersion: 0 };
// const initial = () => ({
// 	userId: 'owner',
// 	objectId: 'id',
// 	originalName: 'photo.jpg',
// 	mimetype: 'image/jpeg',
// 	size: 10,
// 	pathName: 'A/B',
// 	originalKey: 'originals/owner/A/B/id',
// 	thumbnailKey: 'thumbnails/owner/A/B/id.webp',
// 	status: 'READY',
// 	lifecycleVersion: 0,
// });
// describe('Trash lifecycle', () => {
// 	beforeEach(() => {
// 		vi.useFakeTimers();
// 		vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
// 	});
// 	afterEach(() => vi.useRealTimers());
// 	function setup(record: any = initial()) {
// 		const findOne = vi.fn(() => query(record));
// 		const findOneAndUpdate = vi.fn((_filter: any, update: any) => {
// 			const next = {
// 				...record,
// 				...update.$set,
// 				lifecycleVersion: record.lifecycleVersion + 1,
// 			};
// 			if (update.$unset)
// 				for (const key of Object.keys(update.$unset)) delete next[key];
// 			record = next;
// 			return query(record);
// 		});
// 		const model = { findOne, findOneAndUpdate };
// 		const events = new EventsService();
// 		const notify = vi.spyOn(events, 'fileLifecycle');
// 		return {
// 			service: new TrashService(
// 				model as unknown as Model<Files>,
// 				events,
// 				{} as FilesService,
// 			),
// 			findOne,
// 			findOneAndUpdate,
// 			notify,
// 			get: () => record,
// 		};
// 	}
// 	it('retains keys and sets exactly thirty days, with an atomic owner/version filter', async () => {
// 		const { service, findOneAndUpdate, get } = setup();
// 		const before = initial();
// 		const result = await service.mutate('owner', 'id', 'TRASH', request);
// 		expect(result.item.purgeAfter! - result.item.trashedAt!).toBe(
// 			RETENTION_MS,
// 		);
// 		expect(get().originalKey).toBe(before.originalKey);
// 		expect(get().thumbnailKey).toBe(before.thumbnailKey);
// 		expect(findOneAndUpdate.mock.calls[0][0]).toMatchObject({
// 			userId: 'owner',
// 			objectId: 'id',
// 			status: 'READY',
// 			$expr: {
// 				$and: [{ $eq: [{ $ifNull: ['$lifecycleVersion', 0] }, 0] }],
// 			},
// 		});
// 	});
// 	it('repeated operation keeps its deadline and does not mutate twice', async () => {
// 		const { service, findOneAndUpdate } = setup();
// 		const first = await service.mutate('owner', 'id', 'TRASH', request);
// 		vi.advanceTimersByTime(86400000);
// 		expect(
// 			(await service.mutate('owner', 'id', 'TRASH', request)).item
// 				.purgeAfter,
// 		).toBe(first.item.purgeAfter);
// 		expect(findOneAndUpdate).toHaveBeenCalledOnce();
// 	});
// 	it('restores just before expiry, but rejects at expiry', async () => {
// 		const expiry = Date.now() + RETENTION_MS;
// 		const record = {
// 			...initial(),
// 			status: 'TRASHED',
// 			purgeAfter: new Date(expiry),
// 			trashedAt: new Date(),
// 		};
// 		const before = setup(record);
// 		vi.setSystemTime(expiry - 1);
// 		const restored = await before.service.mutate(
// 			'owner',
// 			'id',
// 			'RESTORE',
// 			request,
// 		);
// 		expect(restored.item.status).toBe('READY');
// 		expect(restored.item.path).toBe('A/B');
// 		expect(restored.item.purgeAfter).toBeNull();
// 		const at = setup(record);
// 		vi.setSystemTime(expiry);
// 		await expect(
// 			at.service.mutate('owner', 'id', 'RESTORE', request),
// 		).rejects.toMatchObject({ status: 410 });
// 		expect(at.findOneAndUpdate).not.toHaveBeenCalled();
// 	});
// 	it('rejects an old retry after a restore and does not reset the new lifecycle', async () => {
// 		const { service, findOneAndUpdate } = setup({
// 			...initial(),
// 			lifecycleVersion: 2,
// 		});
// 		await expect(
// 			service.mutate('owner', 'id', 'TRASH', request),
// 		).rejects.toMatchObject({ status: 409 });
// 		expect(findOneAndUpdate).not.toHaveBeenCalled();
// 	});
// 	it('allows a fresh retention period after restoration', async () => {
// 		const { service } = setup();
// 		await service.mutate('owner', 'id', 'TRASH', request);
// 		vi.advanceTimersByTime(1000);
// 		await service.mutate('owner', 'id', 'RESTORE', {
// 			operationId: 'restore',
// 			expectedVersion: 1,
// 		});
// 		vi.advanceTimersByTime(1000);
// 		const fresh = await service.mutate('owner', 'id', 'TRASH', {
// 			operationId: 'trash-again',
// 			expectedVersion: 2,
// 		});
// 		expect(fresh.item.trashedAt).toBe(Date.now());
// 		expect(fresh.item.purgeAfter).toBe(Date.now() + RETENTION_MS);
// 	});
// 	it('permanent deletion only marks DELETING and accepts an already absent object', async () => {
// 		const { service, get } = setup({
// 			...initial(),
// 			status: 'TRASHED',
// 			purgeAfter: new Date(Date.now() + RETENTION_MS),
// 		});
// 		expect(
// 			(await service.mutate('owner', 'id', 'PURGE', request)).item.status,
// 		).toBe('DELETING');
// 		expect(get().originalKey).toBe(initial().originalKey);
// 		expect(
// 			(await setup(null).service.mutate('owner', 'id', 'PURGE', request))
// 				.item.status,
// 		).toBe('MISSING');
// 	});
// 	it('does not allow restoring a worker-claimed file', async () => {
// 		const { service, findOneAndUpdate } = setup({
// 			...initial(),
// 			status: 'DELETING',
// 			purgeAfter: new Date(Date.now() + 1),
// 		});
// 		await expect(
// 			service.mutate('owner', 'id', 'RESTORE', request),
// 		).rejects.toMatchObject({ status: 409 });
// 		expect(findOneAndUpdate).not.toHaveBeenCalled();
// 	});
// 	it('treats a lost compare-and-swap as a conflict without publishing', async () => {
// 		const { service, findOneAndUpdate, notify } = setup();
// 		findOneAndUpdate.mockImplementation(() => query(null));
// 		await expect(
// 			service.mutate('owner', 'id', 'TRASH', request),
// 		).rejects.toMatchObject({ status: 409 });
// 		expect(notify).not.toHaveBeenCalled();
// 	});
// 	it('validates the operation and rejects foreign/missing files', async () => {
// 		await expect(
// 			setup().service.mutate('owner', 'id', 'TRASH', {} as never),
// 		).rejects.toMatchObject({ status: 400 });
// 		const { service, findOne } = setup(null);
// 		await expect(
// 			service.mutate('other', 'id', 'TRASH', request),
// 		).rejects.toMatchObject({ status: 404 });
// 		expect(findOne).toHaveBeenCalledWith({
// 			userId: 'other',
// 			objectId: 'id',
// 		});
// 	});
// 	it('bounds reconciliation to one hundred IDs', async () => {
// 		await expect(
// 			setup().service.statuses('owner', Array(101).fill('id')),
// 		).rejects.toMatchObject({ status: 400 });
// 	});
// });
// describe('Cleanup worker', () => {
// 	it('claims only expired trash or deleting records, with a lease, and at most two active jobs', async () => {
// 		let remaining = 6,
// 			active = 0,
// 			max = 0;
// 		const findOneAndUpdate = vi.fn((_f: any, u: any) =>
// 			query(
// 				remaining-- > 0
// 					? {
// 							...initial(),
// 							status: 'DELETING',
// 							purgeLeaseId: u.$set.purgeLeaseId,
// 							purgeAttempts: 1,
// 						}
// 					: null,
// 			),
// 		);
// 		const deletion = vi.fn(async () => {
// 			active++;
// 			max = Math.max(max, active);
// 			await new Promise((r) => setTimeout(r, 2));
// 			active--;
// 		});
// 		const events = new EventsService();
// 		const notify = vi.spyOn(events, 'fileLifecycle');
// 		const worker = new TrashWorker(
// 			{ findOneAndUpdate } as unknown as Model<Files>,
// 			{ deleteObject: deletion } as unknown as FilesService,
// 			events,
// 		);
// 		await worker.sweep();
// 		expect(deletion).toHaveBeenCalledTimes(6);
// 		expect(max).toBe(2);
// 		expect(findOneAndUpdate.mock.calls[0][0].$and[0].$or[0]).toMatchObject({
// 			status: 'TRASHED',
// 			purgeAfter: { $lte: expect.any(Date) },
// 		});
// 		expect(deletion.mock.calls[0]).toEqual([
// 			'owner',
// 			'id',
// 			expect.any(String),
// 		]);
// 		expect(
// 			notify.mock.calls.filter((c) => c[3] === 'file.deleted'),
// 		).toHaveLength(6);
// 	});
// 	it('retains failed claims and schedules retry without emitting deleted', async () => {
// 		const claim = vi
// 			.fn()
// 			.mockReturnValueOnce(
// 				query({ ...initial(), status: 'DELETING', purgeAttempts: 1 }),
// 			)
// 			.mockReturnValue(query(null));
// 		const updateOne = vi.fn(() => query({}));
// 		const events = new EventsService();
// 		const notify = vi.spyOn(events, 'fileLifecycle');
// 		const worker = new TrashWorker(
// 			{ findOneAndUpdate: claim, updateOne } as unknown as Model<Files>,
// 			{
// 				deleteObject: vi
// 					.fn()
// 					.mockRejectedValue(new Error('S3 failure')),
// 			} as unknown as FilesService,
// 			events,
// 		);
// 		await worker.sweep();
// 		expect(updateOne).toHaveBeenCalledWith(
// 			expect.objectContaining({
// 				status: 'DELETING',
// 				purgeLeaseId: expect.any(String),
// 			}),
// 			expect.objectContaining({
// 				$set: expect.objectContaining({
// 					purgeNextAttemptAt: expect.any(Date),
// 				}),
// 			}),
// 		);
// 		expect(notify.mock.calls.some((c) => c[3] === 'file.deleted')).toBe(
// 			false,
// 		);
// 	});
// });
