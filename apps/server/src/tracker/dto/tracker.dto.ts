import { Type } from "class-transformer";
import { IsIn, IsInt, IsString, Max, Min } from "class-validator";

import {
  OptionalField,
  OptionalText,
  RequiredText,
} from "../../common/validation/decorators";
import {
  ROLE_STATUSES,
  ROLES_DEFAULT_LIMIT,
  ROLES_MAX_LIMIT,
  type RoleStatus,
} from "../constants/tracker.constants";

export const IsRoleStatus = () =>
  IsIn(ROLE_STATUSES, {
    message: ({ value }) =>
      `unknown status: ${String(value)} (use ${ROLE_STATUSES.join(", ")})`,
  });

export class CreateCompanyDto {
  @RequiredText("Company name is required")
  name!: string;

  @OptionalText()
  website?: string;

  @OptionalText()
  location?: string;

  @OptionalText()
  about?: string;

  @OptionalText()
  notes?: string;
}

export class UpdateRoleDto {
  @OptionalField()
  @IsRoleStatus()
  status?: RoleStatus;

  @OptionalText()
  job_url?: string;

  @OptionalText()
  salary?: string;

  @OptionalText()
  location?: string;

  @OptionalText()
  notes?: string;
}

export class CreateRoleDto extends UpdateRoleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  company_id!: number;

  @RequiredText("Target title is required")
  target_title!: string;
}

export class ListRolesQueryDto {
  @OptionalField()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  company_id?: number;

  @OptionalField()
  @IsString()
  status?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ROLES_MAX_LIMIT)
  limit: number = ROLES_DEFAULT_LIMIT;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

export class CompanyIdParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId!: number;
}

export class RoleIdParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roleId!: number;
}
