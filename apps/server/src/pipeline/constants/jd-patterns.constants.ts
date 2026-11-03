/** Heading, role, seniority, and technology patterns for parsing job descriptions. */

export const CANDIDATE_HEADING =
  /^(?:key\s+)?(?:responsibilities|requirements|qualifications|skills|required\s+skills(?:\s+and\s+qualifications)?|desired\s+skills|nice[- ]to[- ]have|preferred qualifications|what you'?ll do|what you'?ll work on)[A-Za-z &/-]*$/i;

export const NICE_HEADING =
  /^(?:desired\s+skills|nice[- ]to[- ]have|preferred qualifications|bonus|plus)\b/i;

export const ROLE_LABEL =
  /^(?:job\s+(?:role|title)|role|position)\s*:\s*(.+)$/i;

export const TECH_TERM =
  /(?<![\w])(?:\.NET|C\+\+|C#|Node\.js|React(?:\.js)?|Next\.js|Express(?:\.js)?|TypeScript|JavaScript|Python|Java|Go|Golang|PostgreSQL|MySQL|MongoDB|SQL|NoSQL|REST(?:ful)?\s+APIs?|GitHub(?:\s+Actions)?|Git|Docker|Kubernetes|Azure|AWS|GCP|RAG|LLM|MCP|Flask|FastAPI|Angular|Vue(?:\.js)?|Svelte|Tailwind(?:\s+CSS)?|GraphQL|Kafka|RabbitMQ|Redis|Jest|Vitest)(?![\w])/gi;

export const EXTRA_UNKNOWN = [
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

export const SENIORITIES: Array<[RegExp, string]> = [
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

export const ROLE_AS_AN =
  /^as\s+(?:an?\s+)?([A-Za-z][A-Za-z /. -]{2,60}?)(?:\s+at\b|,|\.|\()/gim;

export const ROLE_LOOKING_FOR =
  /looking for\s+(?:talented\s+)?([A-Za-z][A-Za-z /.-]{2,60}?Developers)\b/i;

/** A short title-case line inside a section, not a bullet. */
export const SUBHEADING = /^[A-Z][A-Za-z /,&+-]{3,60}$/;
