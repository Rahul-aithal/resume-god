import { Transform, Type, plainToInstance } from "class-transformer";
import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
  validateSync,
} from "class-validator";

import { formatValidationErrors } from "../../common/validation/validation.pipe";

/** YAML reads `date_range: 2024` as a number, so scalars become strings. */
const asText = (value: unknown) =>
  typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : value;

const RequiredDocText = () => (object: object, propertyName: string) => {
  Transform(({ value }) => asText(value))(object, propertyName);
  IsString()(object, propertyName);
  IsNotEmpty()(object, propertyName);
};

/** A blank value in a document (`url:`) is the same as leaving it out. */
const OptionalDocText = () => (object: object, propertyName: string) => {
  Transform(({ value }) => (value == null ? undefined : asText(value)))(
    object,
    propertyName,
  );
  IsOptional()(object, propertyName);
  IsString()(object, propertyName);
};

const OptionalDocList = () => (object: object, propertyName: string) => {
  Transform(({ value }) => (Array.isArray(value) ? value.map(asText) : value))(
    object,
    propertyName,
  );
  IsOptional()(object, propertyName);
  IsArray()(object, propertyName);
  IsString({ each: true })(object, propertyName);
};

const REQUIRED_SECTION = "is a required section and must be a list";

class ProfileSkillDto {
  @RequiredDocText() id!: string;
  @RequiredDocText() name!: string;
  @OptionalDocText() category?: string;
  @OptionalDocList() aliases?: string[];
}

/** Experiences and projects: named by either `role` or `name`. */
class ProfileParentDto {
  @RequiredDocText() id!: string;

  @ValidateIf((row: ProfileParentDto) => !row.name)
  @Transform(({ value }) => asText(value))
  @IsString({ message: "either role or name is required" })
  @IsNotEmpty({ message: "either role or name is required" })
  role?: string;

  @OptionalDocText() name?: string;
  @OptionalDocText() title?: string;
  @OptionalDocText() url?: string;
  @OptionalDocText() date_range?: string;
}

class ProfileAchievementDto {
  @RequiredDocText() id!: string;
  @RequiredDocText() part_of!: string;
  @RequiredDocText() text!: string;
  @OptionalDocText() date_range?: string;
  @OptionalDocList() skills?: string[];
  @OptionalDocList() metrics?: string[];
}

class ProfileEducationDto {
  @OptionalDocText() id?: string;
  @OptionalDocText() institution?: string;
  @OptionalDocText() credential?: string;
  @OptionalDocText() date_range?: string;
}

class ProfileCertificationDto {
  @OptionalDocText() id?: string;
  @OptionalDocText() name?: string;
  @OptionalDocText() issuer?: string;
  @OptionalDocText() issued_on?: string;
}

class ProfileSoftSkillDto {
  @OptionalDocText() id?: string;
  @RequiredDocText() name!: string;
  @OptionalDocText() detail?: string;
}

class ProfileContactDto {
  @OptionalDocText() location?: string;
  @OptionalDocText() phone?: string;
  @OptionalDocText() email?: string;
  @OptionalDocText() linkedin?: string;
  @OptionalDocText() github?: string;
  @OptionalDocText() personal_site?: string;
}

/**
 * The shape of an imported profile. Rules that compare records with each
 * other, such as an achievement's part_of existing, stay in the service.
 */
export class ProfileDocumentDto {
  @IsArray({ message: REQUIRED_SECTION })
  @ValidateNested({ each: true })
  @Type(() => ProfileSkillDto)
  skills!: ProfileSkillDto[];

  @IsArray({ message: REQUIRED_SECTION })
  @ValidateNested({ each: true })
  @Type(() => ProfileParentDto)
  experiences!: ProfileParentDto[];

  @IsArray({ message: REQUIRED_SECTION })
  @ValidateNested({ each: true })
  @Type(() => ProfileParentDto)
  projects!: ProfileParentDto[];

  @IsArray({ message: REQUIRED_SECTION })
  @ValidateNested({ each: true })
  @Type(() => ProfileAchievementDto)
  achievements!: ProfileAchievementDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProfileEducationDto)
  education?: ProfileEducationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProfileCertificationDto)
  certifications?: ProfileCertificationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProfileSoftSkillDto)
  soft_skills?: ProfileSoftSkillDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileContactDto)
  contact?: ProfileContactDto;

  @IsOptional()
  @IsObject()
  skill_implies?: Record<string, unknown>;
}

/** Validates a parsed document, returning it or a list of "path: problem". */
export function parseProfileDocument(
  parsed: object,
): { document: ProfileDocumentDto } | { errors: string[] } {
  const document = plainToInstance(ProfileDocumentDto, parsed);
  // Exports carry extras such as `version`, so unknown keys are only dropped.
  const errors = validateSync(document, { whitelist: true });
  return errors.length > 0
    ? { errors: formatValidationErrors(errors) }
    : { document };
}
