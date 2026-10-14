import { vi, expect, it } from 'vitest';
import type { Model } from 'mongoose';
import { SqsService } from './sqs.service.js';
import { EventsService } from '../../../../modules/events/events.service.js';
import type { FilesDocument } from '../../../../modules/files/schemas/files.schema.js';

vi.mock('../files/schemas/files.schema.js', () => ({
	Files: class Files {},
	FileStatus: { READY: 'READY', TRASHED: 'TRASHED', DELETING: 'DELETING' },
}));
const message = {
	event: 'THUMBNAIL_CREATED' as const,
	userId: 'userId',
	objectId: 'id',
	pathName: 'Viagens/Praia',
	originalKey: 'originals/userId/Viagens/Praia/id',
	thumbnailKey: 'thumbnails/userId/Viagens/Praia/id.webp',
};

it('only notifies after Mongo confirms READY', async () => {
	let finish!: (value: { matchedCount: number }) => void;
	const updateOne = vi.fn(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const events = new EventsService();
	const notify = vi.spyOn(events, 'fileReady');
	const service = new SqsService(
		{
			updateOne,
			exists: vi.fn().mockResolvedValue(null),
		} as unknown as Model<FilesDocument>,
		events,
	);
	const processing = service['processMessage'](message);
	expect(notify).not.toHaveBeenCalled();
	finish({ matchedCount: 1 });
	await processing;
	expect(notify).toHaveBeenCalledWith('userId', 'id', 'Viagens/Praia');
});
it('does not notify when the record does not exist or the database fails', async () => {
	const updateOne = vi
		.fn()
		.mockResolvedValueOnce({ matchedCount: 0 })
		.mockRejectedValueOnce(new Error('offline'));
	const events = new EventsService();
	const notify = vi.spyOn(events, 'fileReady');
	const service = new SqsService(
		{
			updateOne,
			exists: vi.fn().mockResolvedValue(null),
		} as unknown as Model<FilesDocument>,
		events,
	);
	await expect(service['processMessage'](message)).resolves.toBeUndefined();
	await expect(service['processMessage'](message)).rejects.toThrow('offline');
	expect(notify).not.toHaveBeenCalled();
});
it('a failed local notification does not prevent acknowledging the successful processing', async () => {
	const events = new EventsService();
	vi.spyOn(events, 'fileReady').mockImplementation(() => {
		throw new Error('notification failed');
	});
	const service = new SqsService(
		{
			updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
		} as unknown as Model<FilesDocument>,
		events,
	);
	await expect(service['processMessage'](message)).resolves.toBeUndefined();
});

it('does not restore or notify a deleting file on a delayed event', async () => {
	const events = new EventsService();
	const notify = vi.spyOn(events, 'fileReady');
	const updateOne = vi.fn().mockResolvedValue({ matchedCount: 0 });
	const service = new SqsService(
		{
			updateOne,
			exists: vi.fn().mockResolvedValue({ _id: 'id' }),
		} as unknown as Model<FilesDocument>,
		events,
	);
	await expect(service['processMessage'](message)).resolves.toBeUndefined();
	expect(updateOne.mock.calls[0][0]).toMatchObject({
		status: { $nin: ['TRASHED', 'DELETING'] },
	});
	expect(notify).not.toHaveBeenCalled();
});
