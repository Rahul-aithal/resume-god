import { BadRequestException, ValidationPipe } from "@nestjs/common";
import type { ValidationError } from "class-validator";

/** Flattens nested errors into "path: message", the format clients display. */
export function formatValidationErrors(
  errors: ValidationError[],
  parent = "",
): string[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    return [
      ...Object.values(error.constraints ?? {}).map(
        (message) => `${path}: ${message}`,
      ),
      ...formatValidationErrors(error.children ?? [], path),
    ];
  });
}

/** The one request validator, registered as APP_PIPE in the app module. */
export function createValidationPipe() {
  return new ValidationPipe({
    transform: true,
    transformOptions: { exposeDefaultValues: true },
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) =>
      new BadRequestException(formatValidationErrors(errors)),
  });
}
