export const ROLE_STATUSES = [
  "wishlist",
  "applied",
  "oa",
  "interview",
  "offer",
  "rejected",
] as const;

export type RoleStatus = (typeof ROLE_STATUSES)[number];

export const DEFAULT_ROLE_STATUS: RoleStatus = "applied";

export const ROLES_DEFAULT_LIMIT = 100;
export const ROLES_MAX_LIMIT = 500;
export const DASHBOARD_RECENT_ROLES = 10;
export const DASHBOARD_RECENT_ARTIFACTS = 8;
