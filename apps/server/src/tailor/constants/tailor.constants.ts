import { KNOWN_PROVIDERS } from "../../llm/constants/llm.constants";

/** What a run can ask for: a provider, or "auto", or fully offline. */
export const PROVIDER_CHOICES = ["auto", "deterministic", ...KNOWN_PROVIDERS];
export const DEFAULT_PROVIDER_CHOICE = "auto";

export const MIN_ACHIEVEMENTS = 1;
export const MAX_ACHIEVEMENTS = 50;
export const DEFAULT_MAX_ACHIEVEMENTS = 14;

/** How many jobs one server runs at once. */
export const JOB_CONCURRENCY = 2;
/** Finds queued work missed by the direct kick, such as after a restart. */
export const JOB_POLL_MS = 5_000;
export const JOB_HEARTBEAT_MS = 30_000;
/** A running job this quiet belonged to a process that died. */
export const JOB_STALE_AFTER_MS = 2 * 60_000;
export const JOB_MAX_ATTEMPTS = 3;
/** Per user, so one account can't fill the queue or spend unbounded LLM calls. */
export const JOB_MAX_ACTIVE_PER_USER = 10;
export const JOB_LIST_LIMIT = 50;
/** Enough to find an existing role when recording a finished job. */
export const JOB_ROLE_LOOKUP_LIMIT = 500;

/** Keep in step with docker/Dockerfile.server. */
export const TYPST_VERSION = "0.13.1";
export const TYPST_ERROR_MAX_CHARS = 800;
