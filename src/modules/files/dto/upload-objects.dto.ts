import { FileDto } from "./file.dto.js";

export class UploadObjectsDto {
    path?: string | null;
    files: FileDto[];
}