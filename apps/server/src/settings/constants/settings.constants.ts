export const DEFAULT_SETTINGS = {
  llm_order: "gemini,glm,openai",
  gemini_model: "gemini-3-flash-preview",
  glm_model: "glm-4.6",
  openai_model: "gpt-4.1",
  default_font: "Calibri",
};

export const API_KEY_MIN_LENGTH = 8;
export const API_KEY_MAX_LENGTH = 512;
export const API_KEY_PATTERN = /^\S+$/;
/** Characters kept in clear so a user can recognise their key. */
export const API_KEY_VISIBLE_SUFFIX = 4;

export const API_KEY_CIPHER = "aes-256-gcm";
export const API_KEY_FORMAT_VERSION = "v1";
export const API_KEY_HKDF_DIGEST = "sha256";
export const API_KEY_HKDF_INFO = "resume-god:user-api-keys:v1";
export const API_KEY_DERIVED_KEY_BYTES = 32;
export const API_KEY_IV_BYTES = 12;
