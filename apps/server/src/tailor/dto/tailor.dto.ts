import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

import {
  OptionalField,
  OptionalRequiredText,
  OptionalText,
} from "../../common/validation/decorators";
import { IsRoleStatus } from "../../tracker/dto/tracker.dto";
import type { RoleStatus } from "../../tracker/constants/tracker.constants";
import {
  MAX_ACHIEVEMENTS,
  MIN_ACHIEVEMENTS,
  PROVIDER_CHOICES,
} from "../constants/tailor.constants";

export class TailorRequestDto {
  @IsString()
  @IsNotEmpty()
  jd_text!: string;

  @OptionalText()
  target_title?: string;

  @OptionalField()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_ACHIEVEMENTS)
  @Max(MAX_ACHIEVEMENTS)
  max_achievements?: number;

  @OptionalField()
  @IsIn(PROVIDER_CHOICES)
  provider?: string;

  @OptionalText()
  font?: string;

  @OptionalText()
  summary?: string;
}

export class TailorJobRequestDto extends TailorRequestDto {
  @OptionalField()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  company_id?: number;

  @OptionalRequiredText()
  company_name?: string;

  @OptionalText()
  job_url?: string;

  @OptionalField()
  @IsRoleStatus()
  role_status?: RoleStatus;
}

export class RetryTailorJobDto {
  /** Replaces the failed job's input. Absent means retry it unchanged. */
  @OptionalField()
  @ValidateNested()
  @Type(() => TailorJobRequestDto)
  request?: TailorJobRequestDto;
}

class ReviewEditsDto {
  @IsObject()
  rewritten_text!: Record<string, string>;

  /** Null and absent both mean "keep the current summary". */
  @IsOptional()
  @IsString()
  summary?: string | null;
}

export class ReviewRequestDto {
  @IsObject()
  plan!: Record<string, unknown>;

  @ValidateNested()
  @Type(() => ReviewEditsDto)
  edits!: ReviewEditsDto;

  @OptionalText()
  font?: string;

  /** The job this plan came from, so reopening it brings back these edits. */
  @OptionalText()
  job_id?: string;
}

export class RenderRequestDto {
  @IsObject()
  resume_data!: Record<string, unknown>;
}
