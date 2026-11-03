import { Transform } from "class-transformer";
import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  registerDecorator,
} from "class-validator";

import { OptionalField } from "../../common/validation/decorators";
import { KNOWN_PROVIDERS } from "../../llm/constants/llm.constants";
import {
  API_KEY_MAX_LENGTH,
  API_KEY_MIN_LENGTH,
  API_KEY_PATTERN,
} from "../constants/settings.constants";

/** Every comma-separated item must be a provider, and at least one present. */
function IsProviderOrder() {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: "isProviderOrder",
      target: object.constructor,
      propertyName,
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== "string" || !value) return false;
          return value
            .split(",")
            .every((item) =>
              (KNOWN_PROVIDERS as readonly string[]).includes(item),
            );
        },
        defaultMessage: (args) => {
          if (typeof args?.value !== "string" || !args.value) {
            return "cannot be empty";
          }
          const invalid = args.value
            .split(",")
            .filter(
              (item: string) =>
                !(KNOWN_PROVIDERS as readonly string[]).includes(item),
            );
          return `unknown providers: ${invalid.join(", ")} (use ${KNOWN_PROVIDERS.join("/")})`;
        },
      },
    });
  };
}

const OptionalModel = () => (object: object, propertyName: string) => {
  OptionalField()(object, propertyName);
  IsString()(object, propertyName);
  IsNotEmpty()(object, propertyName);
};

export class UpdateSettingsDto {
  /** Normalizes "Gemini , GLM " to "gemini,glm". */
  @Transform(({ value }) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
          .join(",")
      : value,
  )
  @OptionalField()
  @IsProviderOrder()
  llm_order?: string;

  @OptionalModel()
  gemini_model?: string;

  @OptionalModel()
  glm_model?: string;

  @OptionalModel()
  openai_model?: string;

  @OptionalModel()
  default_font?: string;
}

export class SaveApiKeyDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(API_KEY_MIN_LENGTH, { message: "That key looks too short" })
  @MaxLength(API_KEY_MAX_LENGTH, { message: "That key looks too long" })
  @Matches(API_KEY_PATTERN, { message: "API keys can't contain spaces" })
  api_key!: string;
}

export class ProviderParamDto {
  @IsIn(KNOWN_PROVIDERS, {
    message: `Unknown provider. Use ${KNOWN_PROVIDERS.join(", ")}.`,
  })
  provider!: (typeof KNOWN_PROVIDERS)[number];
}
