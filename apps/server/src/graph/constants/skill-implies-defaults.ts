/**
 * Curated framework → foundation implications, keyed by skill NAME.
 * Applied as suggestions when a skill is created (both endpoints must
 * exist); users own the resulting rows in kg_skill_implies and can add
 * or delete edges freely.
 */
export const SKILL_IMPLIES_DEFAULTS: Record<string, string[]> = {
  "Next.js": ["React.js", "TypeScript", "JavaScript"],
  "React.js": ["JavaScript"],
  NestJS: ["Node.js", "TypeScript"],
  "Express.js": ["Node.js", "JavaScript"],
  FastAPI: ["Python"],
  "shadcn/ui": ["React.js", "Tailwind CSS"],
  "Radix UI": ["React.js"],
  "Chakra UI": ["React.js"],
  "TanStack Query": ["React.js", "TypeScript"],
  "TanStack Table": ["React.js", "TypeScript"],
  "Drizzle ORM": ["SQL", "TypeScript"],
  sqlc: ["SQL", "Go"],
  "Docker Compose": ["Docker"],
  "GitHub Actions": ["CI/CD"],
  RabbitMQ: ["Microservices"],
};

/** Curated implications for one skill name (empty when none). */
export function defaultImpliesFor(name: string): string[] {
  return SKILL_IMPLIES_DEFAULTS[name] ?? [];
}
