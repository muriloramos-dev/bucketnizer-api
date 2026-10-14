export class GetThumbnailObjectDto {
	lifecycleVersion: number;
	objectId: string;
	name: string;
	thumbnailUrl: string;
	mimetype: string;
	size: number;

	constructor(data: {
		lifecycleVersion?: number;
		objectId: string;
		name: string;
		thumbnailUrl: string;
		mimetype: string;
		size: number;
	}) {
		this.lifecycleVersion = data.lifecycleVersion ?? 0;
		this.objectId = data.objectId;
		this.name = data.name;
		this.thumbnailUrl = data.thumbnailUrl;
		this.mimetype = data.mimetype;
		this.size = data.size;
	}
}
