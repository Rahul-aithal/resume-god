/**
 * Structured job-description parsing and profile-alias normalization.
 * Faithful port of resume_god/jd_parser.py (deterministic + LLM paths).
 */

import type { LlmProvider } from "../llm/llm-provider.interface";

export const JD_PARSE_VERSION = 1;

export interface ProfileSkill {
  id: string;
  name: string;
  category?: string;
  aliases?: string[];
}

export interface Profile {
  skills: ProfileSkill[];
  [key: string]: unknown;
}

export interface SkillMatch {
  id: string;
  name: string;
  matched_term: string;
}

export interface UnknownSkill {
  name: string;
  status: "unknown";
}

export interface ParsedJobDescription {
  version: number;
  provider: string;
  provider_requested: string;
  provider_fallback_error?: string;
  role_title: string;
  seniority: string;
  must_have_skills: SkillMatch[];
  nice_to_have_skills: SkillMatch[];
  unknown_skills: UnknownSkill[];
  keywords: string[];
  key_responsibilities: string[];
}

// ---- regexes (parity with python) ----

const CANDIDATE_HEADING =
  /^(?:key\s+)?(?:responsibilities|requirements|qualifications|skills|required\s+skills(?:\s+and\s+qualifications)?|desired\s+skills|nice[- ]to[- ]have|preferred qualifications|what you'?ll do|what you'?ll work on)[A-Za-z &/-]*$/i;
const NICE_HEADING =
  /^(?:desired\s+skills|nice[- ]to[- ]have|preferred qualifications|bonus|plus)\b/i;
const ROLE_LABEL = /^(?:job\s+(?:role|title)|role|position)\s*:\s*(.+)$/i;
const TECH_TERM =
  /(?<![\w])(?:\.NET|C\+\+|C#|Node\.js|React(?:\.js)?|Next\.js|Express(?:\.js)?|TypeScript|JavaScript|Python|Java|Go|Golang|PostgreSQL|MySQL|MongoDB|SQL|NoSQL|REST(?:ful)?\s+APIs?|GitHub(?:\s+Actions)?|Git|Docker|Kubernetes|Azure|AWS|GCP|RAG|LLM|MCP|Flask|FastAPI|Angular|Vue(?:\.js)?|Svelte|Tailwind(?:\s+CSS)?|GraphQL|Kafka|RabbitMQ|Redis|Jest|Vitest)(?![\w])/gi;
const EXTRA_UNKNOWN = [
  ".NET",
  "C#",
  "Java",
  "MySQL",
  "Angular",
  "Vue.js",
  "Svelte",
  "Azure",
  "Kubernetes",
  "RAG",
  "Flask",
  "AWS",
  "GCP",
  "GraphQL",
  "Kafka",
  "Spring Boot",
  "Django",
  "LangChain",
  "OpenAI",
  "Terraform",
  "Jenkins",
];
const SENIORITIES: Array<[RegExp, string]> = [
  [/\bprincipal\b/, "principal"],
  [/\bstaff\b/, "staff"],
  [/\bsenior\b/, "senior"],
  [/\bjunior\b/, "junior"],
  [/\bentry.level\b/, "entry-level"],
  [/\bearly.career\b/, "early-career"],
  [/\bsde[ -]?1\b/, "SDE1 / junior"],
  [/\bsoftware engineer i\b/, "junior"],
  [/\blead(?:er|ership)?\b/, "lead"],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- skill alias table ----

type SkillTerm = { skillId: string; skill: ProfileSkill };
type SkillTerms = Map<string, SkillTerm>;

export function skillTerms(profile: Profile): SkillTerms {
  const terms: SkillTerms = new Map();
  for (const skill of profile.skills) {
    for (const term of [skill.name, ...(skill.aliases ?? [])]) {
      terms.set(term.toLowerCase(), { skillId: skill.id, skill });
    }
  }
  return terms;
}

function skillRows(
  names: string[],
  terms: SkillTerms,
): { rows: SkillMatch[]; unknown: string[] } {
  const rows: SkillMatch[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = String(raw).trim();
    if (!name) continue;
    const key = name.toLowerCase();
    let match = terms.get(key);
    if (!match) {
      for (const [termKey, value] of terms) {
        if (termKey.toLowerCase() === key) {
          match = value;
          break;
        }
      }
    }
    if (!match) {
      if (!unknown.includes(name)) unknown.push(name);
    } else if (!seen.has(match.skillId)) {
      seen.add(match.skillId);
      rows.push({
        id: match.skill.id,
        name: match.skill.name,
        matched_term: name,
      });
    }
  }
  return { rows, unknown };
}

// ---- deterministic matching ----

function knownMatches(
  profile: Profile,
  jobDescription: string,
): {
  matches: { must: SkillMatch[]; nice: SkillMatch[] };
  knownIds: Set<string>;
} {
  const terms = skillTerms(profile);
  const matches: { must: SkillMatch[]; nice: SkillMatch[] } = {
    must: [],
    nice: [],
  };
  const knownIds = new Set<string>();
  let nice = false;
  for (const line of jobDescription.split("\n")) {
    const stripped = line.trim();
    if (CANDIDATE_HEADING.test(stripped)) {
      nice = NICE_HEADING.test(stripped);
      continue;
    }
    if (!stripped) continue;
    for (const [term, { skillId, skill }] of terms) {
      const pattern = new RegExp(`(?<!\\w)${escapeRegExp(term)}(?!\\w)`, "i");
      if (pattern.test(stripped) && !knownIds.has(skillId)) {
        knownIds.add(skillId);
        const bucket = nice ? "nice" : "must";
        matches[bucket].push({
          id: skill.id,
          name: skill.name,
          matched_term: term,
        });
      }
    }
  }
  return { matches, knownIds };
}

// ---- role title / seniority / responsibilities ----

export function roleTitle(
  jobDescription: string,
  targetTitle?: string | null,
): string {
  if (targetTitle && targetTitle.trim()) return targetTitle.trim();
  for (const line of jobDescription.split("\n")) {
    const stripped = line.trim();
    const match = ROLE_LABEL.exec(stripped);
    if (match) return match[1].trim();
  }
  const explicit =
    /^as\s+(?:an?\s+)?([A-Za-z][A-Za-z /. -]{2,60}?)(?:\s+at\b|,|\.|\()/gim.exec(
      jobDescription,
    );
  if (explicit) return explicit[1].trim();
  const lookingFor =
    /looking for\s+(?:talented\s+)?([A-Za-z][A-Za-z /.-]{2,60}?Developers)\b/i.exec(
      jobDescription,
    );
  if (lookingFor) return lookingFor[1].trim();
  for (const line of jobDescription.split("\n")) {
    const stripped = line.trim();
    if (
      stripped &&
      stripped.length <= 80 &&
      !/[:.]|^(?:company|about|location|experience)\b/i.test(stripped) &&
      /engineer|developer|manager|analyst|designer|architect/i.test(stripped)
    ) {
      return stripped;
    }
  }
  throw new Error("Could not determine role title; pass --target-title");
}

export function seniority(
  jobDescription: string,
  roleTitleValue: string,
): string {
  const detect = (value: string): string | null => {
    const lowered = value.toLowerCase();
    for (const [pattern, label] of SENIORITIES) {
      if (pattern.test(lowered)) return label;
    }
    return null;
  };

  const explicit = detect(roleTitleValue);
  if (explicit) return explicit;

  const found: string[] = [];
  const lowered = jobDescription.toLowerCase();
  for (const [pattern, label] of SENIORITIES) {
    if (pattern.test(lowered) && !found.includes(label)) found.push(label);
  }
  if (found.length === 0) return "not specified";
  if (found.includes("junior") && found.includes("senior")) {
    return "junior to senior";
  }
  if (found.includes("entry-level") && found.includes("senior")) {
    return "entry-level to senior";
  }
  return found.join(" / ");
}

export function responsibilities(jobDescription: string): string[] {
  const rows: string[] = [];
  let active = false;
  for (const raw of jobDescription.split("\n")) {
    const stripped = raw
      .trim()
      .replace(/^[-•* ]+/, "")
      .trim();
    const heading = CANDIDATE_HEADING.test(stripped);
    if (heading) {
      active = /responsib|what you'?ll(?: do| work on)/i.test(stripped);
      continue;
    }
    if (!stripped) continue;
    if (active && stripped.length > 15 && !rows.includes(stripped)) {
      rows.push(stripped);
    } else if (active && /^[A-Z][A-Za-z /,&+-]{3,60}$/.test(stripped)) {
      continue;
    } else if (active) {
      active = false;
    }
  }
  return rows.slice(0, 12);
}

// ---- unknown skills ----

function unknownSkills(
  jobDescription: string,
  knownIds: Set<string>,
  profile: Profile,
  terms: SkillTerms,
): UnknownSkill[] {
  const knownNames = new Set(
    profile.skills
      .filter((skill) => knownIds.has(skill.id))
      .map((skill) => skill.name.toLowerCase()),
  );
  const aliases = new Set(
    [...terms.keys()]
      .filter((key) => knownIds.has(terms.get(key)!.skillId))
      .map((key) => key.toLowerCase()),
  );
  const values: string[] = [];
  for (const match of jobDescription.matchAll(TECH_TERM)) {
    const value = match[0];
    const lowered = value.toLowerCase();
    if (!knownNames.has(lowered) && !aliases.has(lowered)) {
      if (!values.includes(value)) values.push(value);
    }
  }
  for (const value of EXTRA_UNKNOWN) {
    const pattern = new RegExp(`(?<!\\w)${escapeRegExp(value)}(?!\\w)`, "i");
    if (pattern.test(jobDescription) && !values.includes(value)) {
      values.push(value);
    }
  }
  if (values.includes("RESTful APIs") && values.includes("RESTful API")) {
    const index = values.indexOf("RESTful API");
    values.splice(index, 1);
  }
  return values.map((name) => ({ name, status: "unknown" as const }));
}

function keywords(
  matches: { must: SkillMatch[]; nice: SkillMatch[] },
  unknown: UnknownSkill[],
): string[] {
  const values = [
    ...matches.must.map((row) => row.name),
    ...matches.nice.map((row) => row.name),
    ...unknown.map((row) => row.name),
  ];
  return [...new Set(values)].slice(0, 20);
}

// ---- LLM prompt (parity with python _prompt) ----

export function buildParserPrompt(
  profile: Profile,
  jobDescription: string,
  targetTitle?: string | null,
): string {
  const aliases: Record<string, string[]> = {};
  for (const skill of profile.skills) {
    aliases[skill.name] = skill.aliases ?? [];
  }
  return `Extract this job description into JSON.

Return exactly these keys:
- role_title: string
- seniority: string
- must_have_skills: array of strings
- nice_to_have_skills: array of strings
- keywords: array of strings
- key_responsibilities: array of strings

Normalize skills through this alias table when possible: ${JSON.stringify(aliases)}
Common abbreviations to normalize: JS→JavaScript, TS→TypeScript, Next→Next.js,
Nest→NestJS, PG/Postgres→PostgreSQL, Mongo→MongoDB, GHA→GitHub Actions,
CI/CD→CI/CD, REST→REST APIs, OAuth→OAuth2, React→React.js, Node→Node.js.
Keep unknown skills unchanged. Do not invent facts or merge distinct technologies.
Suggested target title: ${targetTitle || "(not provided)"}

Job description:
${jobDescription}`;
}

// ---- main entry ----

function deterministicResult(
  profile: Profile,
  jobDescription: string,
  roleTitleValue: string,
  requested: string,
  fallbackError?: string,
): ParsedJobDescription {
  const terms = skillTerms(profile);
  const { matches, knownIds } = knownMatches(profile, jobDescription);
  const unknown = unknownSkills(jobDescription, knownIds, profile, terms);
  const result: ParsedJobDescription = {
    version: JD_PARSE_VERSION,
    provider: "deterministic",
    provider_requested: requested,
    role_title: roleTitleValue,
    seniority: seniority(jobDescription, roleTitleValue),
    must_have_skills: matches.must,
    nice_to_have_skills: matches.nice,
    unknown_skills: unknown,
    keywords: keywords(matches, unknown),
    key_responsibilities: responsibilities(jobDescription),
  };
  if (fallbackError !== undefined) {
    result.provider_fallback_error = fallbackError;
  }
  return result;
}

export async function parseJobDescription(
  profile: Profile,
  jobDescription: string,
  options?: {
    provider?: LlmProvider | null;
    targetTitle?: string | null;
  },
): Promise<ParsedJobDescription> {
  const terms = skillTerms(profile);
  if (!jobDescription.trim()) {
    throw new Error("Job description must not be empty");
  }

  const roleTitleValue = roleTitle(jobDescription, options?.targetTitle);
  const provider = options?.provider ?? null;

  if (provider === null) {
    return deterministicResult(
      profile,
      jobDescription,
      roleTitleValue,
      "deterministic",
    );
  }

  const requested = provider.name;
  let raw: Record<string, unknown>;
  try {
    raw = await provider.completeJson(
      buildParserPrompt(profile, jobDescription, options?.targetTitle),
    );
  } catch (error) {
    // network/auth/model failure → offline fallback
    return deterministicResult(
      profile,
      jobDescription,
      roleTitleValue,
      requested,
      error instanceof Error ? error.message : String(error),
    );
  }

  const mustNames = Array.isArray(raw.must_have_skills)
    ? raw.must_have_skills.map((item) => String(item))
    : [];
  const niceNames = Array.isArray(raw.nice_to_have_skills)
    ? raw.nice_to_have_skills.map((item) => String(item))
    : [];
  const mustParsed = skillRows(mustNames, terms);
  const niceParsed = skillRows(niceNames, terms);
  const unknown = [
    ...mustParsed.unknown,
    ...niceParsed.unknown.filter((item) => !mustParsed.unknown.includes(item)),
  ];
  return {
    version: JD_PARSE_VERSION,
    provider: provider.name,
    provider_requested: requested,
    role_title: String(raw.role_title || options?.targetTitle || "").trim(),
    seniority: String(raw.seniority || "not specified"),
    must_have_skills: mustParsed.rows,
    nice_to_have_skills: niceParsed.rows,
    unknown_skills: unknown.map((item) => ({
      name: item,
      status: "unknown" as const,
    })),
    keywords: (Array.isArray(raw.keywords)
      ? raw.keywords.map(String)
      : []
    ).slice(0, 20),
    key_responsibilities: (Array.isArray(raw.key_responsibilities)
      ? raw.key_responsibilities.map(String)
      : []
    ).slice(0, 12),
  };
}
