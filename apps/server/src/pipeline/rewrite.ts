/**
 * Constrained achievement rewriting with deterministic grounding checks.
 * Port of resume_data.py's page-budget-free variant of rewrite.py:
 * assembly keeps ALL ranked achievements (multi-page by design) but
 * preserves the score-ordered parent grouping.
 */

export const REWRITE_POLICY_VERSION = 1;

const NUMBER = /(?<![\w])\d+(?:\.\d+)?(?:%|ms|s|x)?(?![\w])/g;
const ACRONYM = /(?<![A-Za-z])[A-Z][A-Z0-9+#.-]{1,}(?![A-Za-z])/g;
const DOT_TECH =
  /(?<![A-Za-z])(?:[A-Za-z][A-Za-z0-9+#.-]*\.[A-Za-z][A-Za-z0-9+#.-]*)(?![A-Za-z])/g;
const COMMON_TECH = [
  "Kubernetes",
  "Rust",
  "Spring",
  "Spring Boot",
  "Terraform",
  "Jenkins",
  "Kafka",
  "GraphQL",
  "Angular",
  "Vue",
  "Svelte",
  "MySQL",
  "Azure",
  "GCP",
  "LangChain",
  "OpenAI",
  "PyTorch",
  "TensorFlow",
  "Redux",
  "SASS",
  "Less",
];

export interface RewriteVerdict {
  passed: boolean;
  issues: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function knownTerms(profile: {
  skills: Array<{ id: string; name: string; aliases?: string[] }>;
}): Map<string, string> {
  const terms = new Map<string, string>();
  for (const skill of profile.skills) {
    for (const term of [skill.name, ...(skill.aliases ?? [])]) {
      terms.set(term.toLowerCase(), skill.id);
    }
  }
  return terms;
}

function profileSkillIds(
  text: string,
  terms: Map<string, string>,
): Set<string> {
  const found = new Set<string>();
  for (const [term, skillId] of terms) {
    const pattern = new RegExp(`(?<!\\w)${escapeRegExp(term)}(?!\\w)`, "i");
    if (pattern.test(text)) found.add(skillId);
  }
  return found;
}

function technologyTokens(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(ACRONYM)) found.add(match[0]);
  for (const match of text.matchAll(DOT_TECH)) found.add(match[0]);
  for (const value of COMMON_TECH) {
    const pattern = new RegExp(`(?<!\\w)${escapeRegExp(value)}(?!\\w)`, "i");
    if (pattern.test(text)) found.add(value);
  }
  return new Set(
    [...found].filter(Boolean).map((value) => value.toLowerCase()),
  );
}

function numbers(text: string): Set<string> {
  return new Set([...text.matchAll(NUMBER)].map((match) => match[0]));
}

export function validateRewrite(
  sourceText: string,
  rewrittenText: string,
  achievement: { part_of?: string },
  profile: { skills: Array<{ id: string; name: string; aliases?: string[] }> },
): RewriteVerdict {
  const issues: string[] = [];
  if (typeof rewrittenText !== "string" || !rewrittenText.trim()) {
    return { passed: false, issues: ["rewrite is empty or not text"] };
  }
  if (rewrittenText !== rewrittenText.trim()) {
    issues.push("rewrite has leading or trailing padding");
  }

  const terms = knownTerms(profile);
  const sourceSkills = profileSkillIds(sourceText, terms);
  const rewrittenSkills = profileSkillIds(rewrittenText, terms);
  const newSkills = [...rewrittenSkills].filter((id) => !sourceSkills.has(id));
  if (newSkills.length > 0) {
    issues.push(
      `new profile skills introduced: ${newSkills.sort().join(", ")}`,
    );
  }

  const sourceTech = technologyTokens(sourceText);
  const rewrittenTech = technologyTokens(rewrittenText);
  const newTech = [...rewrittenTech].filter((id) => !sourceTech.has(id));
  if (newTech.length > 0) {
    issues.push(
      `new technology names introduced: ${newTech.sort().join(", ")}`,
    );
  }

  const sourceNumbers = numbers(sourceText);
  const rewrittenNumbers = numbers(rewrittenText);
  const newNumbers = [...rewrittenNumbers].filter(
    (id) => !sourceNumbers.has(id),
  );
  if (newNumbers.length > 0) {
    issues.push(
      `new numeric claims introduced: ${newNumbers.sort().join(", ")}`,
    );
  }

  if (rewrittenText.length > sourceText.length + 160) {
    issues.push("rewrite is too long and may contain keyword stuffing");
  }

  if (!achievement.part_of) {
    issues.push("source achievement has no parent relationship");
  }
  return { passed: issues.length === 0, issues };
}

export function rewritePrompt(
  plan: { target_title: string; job_description_parse?: unknown },
  bullets: Array<{ id: string; text: string }>,
): string {
  const payload = bullets.map((achievement) => ({
    achievement_id: achievement.id,
    source_text: achievement.text,
  }));
  return `Lightly adapt each resume bullet toward this target role.

Rules:
- Preserve every technology, number, employer, project, date, and metric.
- Do not add skills or keyword stuffing.
- Keep each bullet as one concise sentence.
- Return JSON exactly as {"rewrites":[{"achievement_id":"...","text":"..."}]}.

Target title: ${plan.target_title}
Parsed requirements: ${JSON.stringify(plan.job_description_parse ?? {})}
Bullets: ${JSON.stringify(payload)}`;
}

export interface RewriteRecord {
  source_text: string;
  rewritten_text: string;
  status: "used" | "fallback_original";
  used_rewrite: boolean;
  validation_passed: boolean;
  issues: string[];
}

/**
 * Multi-page variant: no page-budget trimming — the assembly keeps every
 * ranked achievement, grouped by parent in best-rank order.
 */
export async function rewritePlan(
  plan: {
    target_title: string;
    audit: Record<string, boolean>;
    ranking: Array<{ achievement_id: string }>;
    selected_parents: Array<{
      kind: string;
      id: string;
      achievement_ids: string[];
    }>;
    job_description_parse?: unknown;
  },
  profile: {
    achievements: Array<Record<string, unknown>>;
    skills: Array<{ id: string; name: string; aliases?: string[] }>;
  },
  provider: {
    name: string;
    completeJson: (prompt: string) => Promise<Record<string, unknown>>;
  } | null,
): Promise<Record<string, unknown>> {
  if (!plan.ranking || plan.ranking.length === 0) {
    throw new Error("Cannot assemble a plan with no ranked achievements");
  }
  if (!Object.values(plan.audit ?? {}).every(Boolean)) {
    throw new Error("Cannot assemble a plan with failed audit checks");
  }

  const achievements = new Map(
    profile.achievements.map((item) => [String(item.id), item]),
  );

  // Multi-page assembly: retain every ranked achievement, order parents by
  // best rank, and order each parent's achievements by rank.
  const retained = plan.ranking.map((row) => row.achievement_id);
  const rankPosition = new Map(retained.map((id, index) => [id, index]));
  const parentKind = new Map(
    plan.selected_parents.map((reference) => [reference.id, reference.kind]),
  );
  const parentRows: Array<{
    kind: string;
    id: string;
    achievement_ids: string[];
    best_rank: number;
  }> = [];
  for (const achievementId of retained) {
    const achievement = achievements.get(achievementId);
    if (!achievement) continue;
    const parentId = String(achievement.part_of ?? "");
    if (!parentKind.has(parentId)) {
      throw new Error(`Ranked achievement has unknown parent: ${parentId}`);
    }
    const existing = parentRows.find((row) => row.id === parentId);
    if (existing) {
      existing.achievement_ids.push(achievementId);
    } else {
      parentRows.push({
        kind: parentKind.get(parentId)!,
        id: parentId,
        achievement_ids: [achievementId],
        best_rank: rankPosition.get(achievementId)!,
      });
    }
  }
  parentRows.sort((a, b) => a.best_rank - b.best_rank);
  for (const row of parentRows) {
    row.achievement_ids.sort(
      (a, b) => (rankPosition.get(a) ?? 0) - (rankPosition.get(b) ?? 0),
    );
  }
  const selectedParents = parentRows.map(({ kind, id, achievement_ids }) => ({
    kind,
    id,
    achievement_ids,
  }));

  const selected = retained
    .map((id) => achievements.get(id))
    .filter((item): item is Record<string, unknown> => item != null)
    .map((item) => ({
      ...item,
      id: String(item.id),
      text: String(item.text ?? ""),
      part_of: String(item.part_of ?? ""),
    }));

  const rawRewrites = new Map<string, string>();
  let rewriteProvider = "deterministic";
  const rewriteRequested = provider?.name ?? "deterministic";
  let rewriteFallbackError: string | undefined;
  if (provider != null) {
    try {
      const prompt = rewritePrompt(
        plan,
        selected.map((a) => ({ id: a.id, text: a.text })),
      );
      const response = await provider.completeJson(prompt);
      rewriteProvider = rewriteRequested;
      const rows = Array.isArray(response.rewrites) ? response.rewrites : [];
      for (const row of rows) {
        if (
          row == null ||
          typeof row !== "object" ||
          !("achievement_id" in row)
        )
          continue;
        const record = row as { achievement_id?: unknown; text?: unknown };
        const achievementId = String(record.achievement_id);
        if (
          achievements.has(achievementId) &&
          typeof record.text === "string"
        ) {
          rawRewrites.set(achievementId, record.text);
        }
      }
    } catch (error) {
      rewriteProvider = "deterministic";
      rewriteFallbackError =
        error instanceof Error ? error.message : String(error);
    }
  }

  const records: Record<string, RewriteRecord> = {};
  let usedCount = 0;
  let fallbackCount = 0;
  for (const achievement of selected) {
    const sourceText = achievement.text;
    const candidate = rawRewrites.get(achievement.id);
    let passed = false;
    let issues = ["no provider rewrite supplied"];
    if (candidate != null) {
      const verdict = validateRewrite(
        sourceText,
        candidate,
        achievement,
        profile,
      );
      passed = verdict.passed;
      issues = verdict.issues;
    }
    if (candidate != null && passed) {
      usedCount += 1;
      records[achievement.id] = {
        source_text: sourceText,
        rewritten_text: candidate,
        status: "used",
        used_rewrite: true,
        validation_passed: true,
        issues: [],
      };
    } else {
      fallbackCount += 1;
      records[achievement.id] = {
        source_text: sourceText,
        rewritten_text: sourceText,
        status: "fallback_original",
        used_rewrite: false,
        validation_passed: false,
        issues,
      };
    }
  }

  const audit = {
    all_rewritten_achievements_exist: Object.keys(records).every((id) =>
      achievements.has(id),
    ),
    every_source_text_matches_reviewed_profile: Object.entries(records).every(
      ([id, record]) => record.source_text === achievements.get(id)?.text,
    ),
    every_used_rewrite_passed_grounding_validation: Object.values(
      records,
    ).every((record) => !record.used_rewrite || record.validation_passed),
    every_failed_rewrite_falls_back_to_original: Object.values(records).every(
      (record) =>
        !record.used_rewrite || record.rewritten_text === record.source_text,
    ),
    no_new_technology_or_numeric_claims: Object.values(records).every(
      (record) => !record.used_rewrite || record.validation_passed,
    ),
  };

  // python apply_assembly parity: deep-copy the plan and override only the
  // selection fields, so matched_skills / job_description_parse survive for
  // downstream stages (default summary, resume-data).
  const assembled = structuredClone(plan) as Record<string, unknown>;
  assembled.selected_achievements = selected;
  assembled.selected_parents = selectedParents;
  assembled.ranking = plan.ranking.filter((row) =>
    retained.includes(row.achievement_id),
  );

  return {
    ...assembled,
    rewrites: records,
    rewrite_policy_version: REWRITE_POLICY_VERSION,
    rewrite_provider: rewriteProvider,
    rewrite_provider_requested: rewriteRequested,
    ...(rewriteFallbackError != null
      ? { rewrite_provider_fallback_error: rewriteFallbackError }
      : {}),
    rewrite_audit: audit,
    rewrite_summary: {
      selected_achievement_count: Object.keys(records).length,
      used_rewrite_count: usedCount,
      fallback_count: fallbackCount,
    },
  };
}
