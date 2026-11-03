import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

import {
  OptionalField,
  OptionalRequiredText,
  OptionalText,
  RequiredText,
} from "../../common/validation/decorators";
import {
  EXPLORE_DEFAULT_HOPS,
  EXPLORE_HOPS,
  IMPORT_FORMATS,
  IMPORT_MODES,
  NODE_ID_PATTERN,
  PARENT_KINDS,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_MIN_LIMIT,
  type ExploreHops,
  type ImportFormat,
  type ImportMode,
  type ParentKind,
} from "../constants/graph.constants";

const OptionalNodeId = () => (object: object, propertyName: string) => {
  OptionalField()(object, propertyName);
  IsString()(object, propertyName);
  Matches(NODE_ID_PATTERN)(object, propertyName);
};

const trimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : item))
    : value;

/** A list of strings with content, trimmed. */
const OptionalTextList = () => (object: object, propertyName: string) => {
  OptionalField()(object, propertyName);
  Transform(trimEach)(object, propertyName);
  IsArray()(object, propertyName);
  IsString({ each: true })(object, propertyName);
  IsNotEmpty({ each: true })(object, propertyName);
};

export class SkillUpdateDto {
  @OptionalRequiredText("Skill name is required")
  name?: string;

  @OptionalText()
  category?: string;

  @OptionalTextList()
  aliases?: string[];
}

export class SkillCreateDto {
  @OptionalNodeId()
  id?: string;

  @RequiredText("Skill name is required")
  name!: string;

  @OptionalText()
  category?: string;

  @OptionalTextList()
  aliases?: string[];
}

export class ParentUpdateDto {
  @OptionalRequiredText("Name is required")
  name?: string;

  @OptionalText()
  title?: string;

  @OptionalText()
  url?: string;

  @OptionalText()
  date_range?: string;
}

export class ParentCreateDto {
  @OptionalNodeId()
  id?: string;

  @IsIn(PARENT_KINDS)
  kind!: ParentKind;

  @RequiredText("Name is required")
  name!: string;

  @OptionalText()
  title?: string;

  @OptionalText()
  url?: string;

  @OptionalText()
  date_range?: string;
}

export class AchievementUpdateDto {
  @OptionalField()
  @IsString()
  @IsNotEmpty()
  parent_id?: string;

  @OptionalRequiredText("Achievement text is required")
  text?: string;

  @OptionalText()
  date_range?: string;

  @OptionalField()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  skills?: string[];

  @OptionalField()
  @IsArray()
  @IsString({ each: true })
  metrics?: string[];
}

export class AchievementCreateDto {
  @OptionalNodeId()
  id?: string;

  @IsString()
  @IsNotEmpty()
  parent_id!: string;

  @RequiredText("Achievement text is required")
  text!: string;

  @OptionalText()
  date_range?: string;

  @OptionalField()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  skills?: string[];

  @OptionalField()
  @IsArray()
  @IsString({ each: true })
  metrics?: string[];
}

export class EducationUpdateDto {
  @OptionalRequiredText("Institution is required")
  institution?: string;

  @OptionalText()
  credential?: string;

  @OptionalText()
  date_range?: string;
}

export class EducationCreateDto {
  @OptionalNodeId()
  id?: string;

  @RequiredText("Institution is required")
  institution!: string;

  @OptionalText()
  credential?: string;

  @OptionalText()
  date_range?: string;
}

export class CertificationUpdateDto {
  @OptionalRequiredText("Name is required")
  name?: string;

  @OptionalText()
  issuer?: string;

  @OptionalText()
  issued_on?: string;
}

export class CertificationCreateDto {
  @OptionalNodeId()
  id?: string;

  @RequiredText("Name is required")
  name!: string;

  @OptionalText()
  issuer?: string;

  @OptionalText()
  issued_on?: string;
}

export class ImpliesEdgeDto {
  @IsString()
  @IsNotEmpty()
  from!: string;

  @IsString()
  @IsNotEmpty()
  to!: string;
}

export class GraphSearchQueryDto {
  @IsString()
  @IsNotEmpty()
  q!: string;

  @Type(() => Number)
  @IsInt()
  @Min(SEARCH_MIN_LIMIT)
  @Max(SEARCH_MAX_LIMIT)
  limit: number = SEARCH_DEFAULT_LIMIT;
}

export class ExploreQueryDto {
  @Type(() => Number)
  @IsIn(EXPLORE_HOPS)
  hops: ExploreHops = EXPLORE_DEFAULT_HOPS;
}

export class ContactUpdateDto {
  @OptionalText()
  location?: string;

  @OptionalText()
  phone?: string;

  @OptionalField()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsEmail({}, { message: "Invalid email" })
  email?: string;

  @OptionalText()
  linkedin?: string;

  @OptionalText()
  github?: string;

  @OptionalText()
  personal_site?: string;
}

export class SoftSkillUpdateDto {
  @OptionalRequiredText("Name is required")
  name?: string;

  @OptionalText()
  detail?: string;
}

export class SoftSkillCreateDto {
  @OptionalNodeId()
  id?: string;

  @RequiredText("Name is required")
  name!: string;

  @OptionalText()
  detail?: string;
}

export class GraphImportDto {
  @IsIn(IMPORT_FORMATS)
  format: ImportFormat = "yaml";

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsIn(IMPORT_MODES)
  mode: ImportMode = "replace";
}
