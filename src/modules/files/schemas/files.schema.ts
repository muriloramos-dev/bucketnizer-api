export enum FileStatus {
	PENDING_UPLOAD = 'PENDING_UPLOAD',
	PROCESSING = 'PROCESSING',
	READY = 'READY',
	TRASHED = 'TRASHED',
	DELETING = 'DELETING',
	FAILED = 'FAILED',
}

export class Files {
	userId: string;

	objectId: string;

	originalName: string;

	originalKey: string;

	thumbnailKey?: string;

	mimetype: string;

	size: number;

	s3Class: string;

	status: FileStatus;

	pathName?: string;

	processingError?: string;

	lastLifecycleOperationId?: string;

	purgeLeaseId?: string;

	purgeLeaseUntil?: Date;

	purgeAttempts: number;

	purgeNextAttemptAt?: Date;
	
	purgeError?: string;
}
