// import { TrashService, type LifecycleRequest } from './trash.service.js';
// import type { AuthenticatedRequest } from '../auth/auth.guard.js';
// import {
// 	Body,
// 	Req,
// 	Delete,
// 	HttpCode,
// 	Controller,
// 	Get,
// 	Param,
// 	Post,
// 	Put,
// 	Query,
// } from '@nestjs/common';

// import { FilesService } from './files.service.js';
// import { GetThumbnailObjectDto } from './dto/get-thumbnail-object.dto.js';
// import { UploadObjectDto } from './dto/upload-object.dto.js';
// import { UploadObjectsDto } from './dto/upload-objects.dto.js';

// @Controller('files')
// export class FilesController {
// 	constructor(
// 		private readonly filesService: FilesService,
// 		private readonly trash: TrashService,
// 	) {}

// 	@Get('trash')
// 	listTrash(
// 		@Req() req: AuthenticatedRequest,
// 		@Query('cursor') cursor?: string,
// 	) {
// 		return this.trash.list(req.user.sub, cursor);
// 	}
// 	@Post('statuses')
// 	statuses(
// 		@Req() req: AuthenticatedRequest,
// 		@Body() body: { objectIds: string[] },
// 	) {
// 		return this.trash.statuses(req.user.sub, body?.objectIds);
// 	}
// 	@Post(':objectId/restore')
// 	restore(
// 		@Req() req: AuthenticatedRequest,
// 		@Param('objectId') id: string,
// 		@Body() body: LifecycleRequest,
// 	) {
// 		return this.trash.mutate(req.user.sub, id, 'RESTORE', body);
// 	}
// 	@Delete(':objectId/permanent')
// 	@HttpCode(202)
// 	permanent(
// 		@Req() req: AuthenticatedRequest,
// 		@Param('objectId') id: string,
// 		@Body() body: LifecycleRequest,
// 	) {
// 		return this.trash.mutate(req.user.sub, id, 'PURGE', body);
// 	}
// 	@Get('folders')
// 	listFolders(@Req() req: AuthenticatedRequest) {
// 		return this.filesService.listFolders(req.user.sub);
// 	}

// 	@Post('folders')
// 	createFolder(
// 		@Req() req: AuthenticatedRequest,
// 		@Body() body: { path: string },
// 	) {
// 		return this.filesService.createFolder(req.user.sub, body?.path);
// 	}

// 	@Post('upload')
// 	async sendObject(
// 		@Req() req: AuthenticatedRequest,
// 		@Body() body: UploadObjectDto,
// 	): Promise<{
// 		objectId: string;
// 		url: string;
// 	}> {
// 		return this.filesService.sendObject(req.user.sub, body);
// 	}

// 	@Post('uploads')
// 	async sendObjects(
// 		@Req() req: AuthenticatedRequest,
// 		@Body() body: UploadObjectsDto,
// 	): Promise<{ objectId: string; url: string }[]> {
// 		return this.filesService.sendObjects(req.user.sub, body);
// 	}

// 	@Get('thumbnails')
// 	async getThumbnails(
// 		@Req() req: AuthenticatedRequest,
// 		@Query('path') path: string,
// 	): Promise<GetThumbnailObjectDto[]> {
// 		const userId = req.user.sub;

// 		return this.filesService.getThumbnails(userId, path);
// 	}

// 	@Get(':objectId/status')
// 	getStatus(
// 		@Req() req: AuthenticatedRequest,
// 		@Param('objectId') objectId: string,
// 	) {
// 		return this.filesService.getStatus(req.user.sub, objectId);
// 	}

// 	@Get(':objectId')
// 	async getObject(
// 		@Req() req: AuthenticatedRequest,
// 		@Param('objectId') objectId: string,
// 	) {
// 		const userId = req.user.sub;

// 		return this.filesService.getObject(userId, objectId);
// 	}

// 	@Put(':objectId/rename')
// 	async changeObjectFileName(
// 		@Req() req: AuthenticatedRequest,
// 		@Param('objectId') objectId: string,
// 		@Body('newFileName') newFileName: unknown,
// 	): Promise<{ objectId: string; name: string }> {
// 		const userId = req.user.sub;
// 		return this.filesService.changeObjectFileName(
// 			userId,
// 			objectId,
// 			newFileName,
// 		);
// 	}
// 	@Delete(':objectId')
// 	@HttpCode(200)
// 	deleteObject(
// 		@Req() req: AuthenticatedRequest,
// 		@Param('objectId') id: string,
// 		@Body() body: LifecycleRequest,
// 	) {
// 		return this.trash.mutate(req.user.sub, id, 'TRASH', body);
// 	}
// }
