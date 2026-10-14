import type { TrashService } from './trash.service.js';
vi.mock('./trash.service.js', () => ({ TrashService: class {} }));
import { vi } from 'vitest';
import { FilesController } from './files.controller.js';
import type { FilesService } from './files.service.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
vi.mock('./files.service.js', () => ({ FilesService: class {} }));

const req = {
	user: { sub: 'authenticated-owner', exp: 9999999999 },
	headers: {},
} as AuthenticatedRequest;
it('ignores a forged upload owner from the request body', async () => {
	const sendObject = vi
		.fn()
		.mockResolvedValue({ objectId: 'id', url: 'url' });
	const controller = new FilesController(
		{ sendObject } as unknown as FilesService,
		{} as TrashService,
	);
	const body = {
		userId: 'victim',
		path: 'Recentes',
		file: { originalName: 'photo.jpg', contentType: 'image/jpeg', size: 1 },
	};
	await controller.sendObject(req, body);
	expect(sendObject).toHaveBeenCalledWith('authenticated-owner', body);
});
it('scopes every file and folder operation to the verified subject', async () => {
	const methods = {
		listFolders: vi.fn(),
		createFolder: vi.fn(),
		getThumbnails: vi.fn(),
		getStatus: vi.fn(),
		getObject: vi.fn(),
		changeObjectFileName: vi.fn(),
		deleteObject: vi.fn(),
	};
	const controller = new FilesController(
		methods as unknown as FilesService,
		{ mutate: methods.deleteObject } as unknown as TrashService,
	);
	await controller.listFolders(req);
	await controller.createFolder(req, { path: 'Recentes' });
	await controller.getThumbnails(req, 'Recentes');
	await controller.getStatus(req, 'id');
	await controller.getObject(req, 'id');
	await controller.changeObjectFileName(req, 'id', 'new.jpg');
	await controller.deleteObject(req, 'id', {
		operationId: 'op',
		expectedVersion: 0,
	});
	for (const method of Object.values(methods))
		expect(method.mock.calls[0][0]).toBe('authenticated-owner');
});
