import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import {
  IsNotEmpty,
  IsString,
  ValidateIf,
  type ValidationOptions,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/** May be left out, but not null. @IsOptional allows null too, which would
 * reach NOT NULL columns and fail as a server error instead of a bad request. */
export const OptionalField = () =>
  ValidateIf((_object, value) => value !== undefined);

/** A required string with content once trimmed. */
export const RequiredText = (message?: string) => {
  const options: ValidationOptions | undefined = message
    ? { message }
    : undefined;
  return applyDecorators(
    Transform(trim),
    IsString(options),
    IsNotEmpty(options),
  );
};

/** A string that may be left out or empty. */
export const OptionalText = () => applyDecorators(OptionalField(), IsString());

/** Like RequiredText, for updates that may leave the field out. */
export const OptionalRequiredText = (message?: string) =>
  applyDecorators(OptionalField(), RequiredText(message));
