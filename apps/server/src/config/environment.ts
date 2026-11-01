import { Transform } from "class-transformer";
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

/**
 * Single declaration of every environment variable: shape, coercion,
 * normalization, and defaults live here (validated at bootstrap via
 * validate()). Cross-variable fallback chains live at the two
 * consumption sites (auth options builder, LLM chain) — a transform
 * only ever sees its own property.
 */

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const splitList = ({ value }: { value: unknown }) =>
  typeof value === "string"
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

export class EnvironmentVariables {
  @IsIn(["development", "production", "test"])
  NODE_ENV: string = "development";

  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsOptional()
  @IsString()
  @Transform(trim)
  OUTPUTS_DIR?: string;

  @IsString()
  DATABASE_URL: string =
    "postgresql://resume_god:resume-god-local@localhost:5432/resume_god";

  @IsOptional()
  @IsString()
  @Transform(trim)
  BETTER_AUTH_SECRET?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  SESSION_SECRET?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  BETTER_AUTH_URL?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  OAUTH_REDIRECT_BASE_URL?: string;

  @Transform(splitList)
  AUTH_TRUSTED_ORIGINS: string[] = [];

  @IsOptional()
  @IsString()
  @Transform(trim)
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  GOOGLE_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  GEMINI_API_KEY?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  GOOGLE_API_KEY?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  GLM_API_KEY?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  ZAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  Z_AI_API_KEY?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  ZHIPU_API_KEY?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  OPENAI_API_KEY?: string;

  /** Normalized + lowercased per item. */
  @Transform(({ value }) =>
    splitList({ value }).map((item) => item.toLowerCase()),
  )
  RESUME_GOD_LLM_ORDER: string[] = [];

  @IsString()
  @Transform(trim)
  GEMINI_MODEL: string = "gemini-3-flash-preview";

  @IsString()
  @Transform(trim)
  GLM_MODEL: string = "glm-4.6";

  @IsString()
  @Transform(trim)
  OPENAI_MODEL: string = "gpt-4.1";

  @IsString()
  @Transform(trim)
  GLM_API_URL: string = "https://api.z.ai/api/paas/v4/chat/completions";

  @IsString()
  @Transform(trim)
  OPENAI_API_URL: string = "https://api.openai.com/v1";

  @IsString()
  @Transform(trim)
  PIPELINE_UPSTREAM: string = "http://localhost:8000";

  /** Typst binary for resume-PDF compilation (default: PATH "typst"). */
  @IsOptional()
  @IsString()
  @Transform(trim)
  TYPST_BIN?: string;
}
