import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

/**
 * Single funnel for every unhandled error: structured log + a consistent
 * JSON envelope ({statusCode, message, error?, timestamp, path}).
 * HttpExceptions keep their own payload (ValidationPipe arrays included).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload = isHttpException ? exception.getResponse() : undefined;
    const message =
      typeof payload === "string"
        ? payload
        : payload && typeof payload === "object" && "message" in payload
          ? ((payload as { message: string | string[] }).message ??
            (exception as HttpException).message)
          : exception instanceof Error
            ? exception.message
            : "Internal server error";

    const error =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error: string }).error
        : isHttpException
          ? HttpStatus[status]
          : "Internal Server Error";

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
