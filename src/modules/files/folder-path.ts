import { BadRequestException } from '@nestjs/common';

export function folderPath(value: unknown, allowRoot = false): string {
  if (typeof value !== 'string') {
    if (allowRoot && value === undefined) return '';
    throw new BadRequestException('Informe o nome da pasta.');
  }
  const segments = value
    .trim()
    .split('/')
    .filter(Boolean)
    .map((part) => part.trim());
  if (
    segments.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        part.split('').some(c=>c==='\\'||c.charCodeAt(0)<32||c.charCodeAt(0)===127),
    )
  ) {
    throw new BadRequestException('Nome de pasta inválido.');
  }
  const path = segments.join('/');
  if ((!path && !allowRoot) || path.length > 200) {
    throw new BadRequestException(
      'Selecione uma pasta com nome de até 200 caracteres.',
    );
  }
  return path;
}

// Materialized paths preserve the existing MongoDB/S3/SQS contract.
export function folderAncestors(path: string): string[] {
  const parts = path.split('/');
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}
