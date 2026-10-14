import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { S3ServiceException } from '@aws-sdk/client-s3';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();

      const exceptionResponse = exception.getResponse();

      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message;
    }

    if (exception instanceof S3ServiceException) {
      switch (exception.name) {
        case 'NoSuchKey':
          status = HttpStatus.NOT_FOUND;
          message = 'File not found';
          break;

        case 'EntityTooLarge':
          status = HttpStatus.PAYLOAD_TOO_LARGE;
          message = 'File is too large';
          break;

        case 'SlowDown':
        case 'ServiceUnavailable':
          status = HttpStatus.SERVICE_UNAVAILABLE;
          message = 'Storage temporarily unavailable';
          break;

        default:
          status = HttpStatus.BAD_GATEWAY;
          message = 'Storage operation failed';
      }
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
