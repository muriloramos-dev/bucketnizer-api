import { FileDto } from "./file.dto.js";

export class UploadObjectDto {
    path?: string | null;
	file: FileDto;
}
