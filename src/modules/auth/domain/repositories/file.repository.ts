export interface IFileRepository {
	uploadFile(fileName: string): Promise<string>;
	getFile(fileName: string): Promise<Buffer | null>;
	deleteFile(fileName: string): Promise<void>;
}
