export const NODE_ID_PATTERN = /^[a-z0-9_]+$/;
export const NODE_ID_MESSAGE =
  "id must contain only lowercase letters, digits, and underscores";

export const NODE_ID_PREFIX: Record<string, string> = {
  skill: "skill",
  experience: "experience",
  project: "project",
  achievement: "achievement",
  education: "education",
  certification: "certification",
};

export const PARENT_KINDS = ["experience", "project"] as const;
export type ParentKind = (typeof PARENT_KINDS)[number];

export const SLUG_MAX_LENGTH = 48;
/** Characters of an achievement's text used to name its id. */
export const ACHIEVEMENT_SLUG_SOURCE_LENGTH = 40;
export const ACHIEVEMENT_LABEL_MAX_LENGTH = 64;

export const SEARCH_MIN_LIMIT = 1;
export const SEARCH_MAX_LIMIT = 50;
export const SEARCH_DEFAULT_LIMIT = 5;

export const EXPLORE_HOPS = [1, 2] as const;
export type ExploreHops = (typeof EXPLORE_HOPS)[number];
export const EXPLORE_DEFAULT_HOPS: ExploreHops = 2;

export const IMPORT_FORMATS = ["yaml", "json"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];
export const IMPORT_MODES = ["replace", "merge"] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export const EXPORT_VERSION = 2;
