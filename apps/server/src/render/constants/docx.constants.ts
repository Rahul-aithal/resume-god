export const DOCX_FONT = "Arial";

/** Sizes are in half-points, so 22 is 11pt. */
export const DOCX_SIZE_NORMAL = 22;
export const DOCX_SIZE_NAME = 36;
export const DOCX_SIZE_SECTION = 24;

export const DOCX_COLOR_DARK = "1A1A1A";
export const DOCX_COLOR_MID = "333333";
export const DOCX_COLOR_LIGHT = "666666";
export const DOCX_COLOR_LINK = "1155CC";

/** Spacing, indents, and page dimensions are in twentieths of a point. */
export const DOCX_SPACING = {
  sectionHeading: { before: 180, after: 60 },
  bullet: { before: 35, after: 35 },
  entryHeading: { before: 140, after: 40 },
  entryDetail: { before: 40, after: 40 },
  contact: { before: 0, after: 60 },
  summary: { before: 0, after: 80 },
  listItem: { before: 80, after: 30 },
} as const;

export const DOCX_BULLET_INDENT = { left: 480, hanging: 280 } as const;
/** US Letter. */
export const DOCX_PAGE_SIZE = { width: 12240, height: 15840 } as const;
export const DOCX_PAGE_MARGIN = 1008;

/** The line under section headings. */
export const DOCX_SECTION_RULE = {
  size: 6,
  color: "2C2C2C",
  space: 2,
} as const;
