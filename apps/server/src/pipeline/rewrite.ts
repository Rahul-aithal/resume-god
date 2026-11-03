import {
  AMOUNT_WORDS,
  NUMBER_WORDS,
  REWRITE_MAX_BULLETS_PER_SOURCE,
  REWRITE_MAX_EXTRA_CHARS,
  REWRITE_POLICY_VERSION,
} from "./constants/pipeline.constants";

/**
 * Constrained achievement rewriting with deterministic grounding checks.
 * Port of resume_data.py's page-budget-free variant of rewrite.py:
 * assembly keeps ALL ranked achievements (multi-page by design) but
 * preserves the score-ordered parent grouping.
 */

export { REWRITE_POLICY_VERSION };

/** Any amount, so "5M" and "1,000" can't slip past as non-numbers. */
const NUMBER = /(?<![\w.])\d+(?:[.,]\d+)*(?:%|ms|[smxkKMB])?(?![a-zA-Z])/g;
/** Capitalized mid-sentence, which is how invented names like "Agile" appear. */
const NAME = /(?<=[a-z,;)] )[A-Z][\w.+#-]*/g;
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

function withoutEdgePunctuation(token: string): string {
  return token.replace(/[.,;:-]+$/, "");
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
    [...found]
      .map((value) => withoutEdgePunctuation(value).toLowerCase())
      .filter(Boolean),
  );
}

function numbers(text: string): Set<string> {
  const digits = text.replace(/\b[a-z]+\b/gi, (word) => {
    return NUMBER_WORDS[word.toLowerCase()] ?? word;
  });
  return new Set([
    ...[...digits.matchAll(NUMBER)].map((match) => match[0]),
    ...[...text.matchAll(AMOUNT_WORDS)].map((match) => match[0].toLowerCase()),
  ]);
}

function names(text: string): string[] {
  return [...text.matchAll(NAME)].map((match) =>
    withoutEdgePunctuation(match[0]),
  );
}

/**
 * What a bullet says with nothing rewritten: its text, its metrics, and one
 * line per sentence. Metrics are reviewed facts, so they belong on the page.
 */
export function groundedText(text: string, metrics: string[] = []): string {
  const inText = numbers(text);
  const missing = metrics.filter((metric) => {
    const claimed = [...numbers(metric)];
    return claimed.length === 0
      ? !text.toLowerCase().includes(metric.toLowerCase())
      : !claimed.every((value) => inText.has(value));
  });
  const lines = text.trim().split(/(?<=[a-z0-9)][.!?])\s+(?=[A-Z])|\n+/);
  if (missing.length > 0) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].replace(/\.$/, "")}; ${missing.join("; ")}.`;
  }
  return lines.join("\n");
}

/** Every fact a bullet may state: its text, metrics, and linked skills. */
function evidence(
  sourceText: string,
  achievement: { metrics?: unknown; skills?: unknown },
  profile: { skills: Array<{ id: string; name: string; aliases?: string[] }> },
): string {
  const linked = new Set((achievement.skills as string[] | undefined) ?? []);
  return [
    sourceText,
    ...((achievement.metrics as string[] | undefined) ?? []),
    ...profile.skills
      .filter((skill) => linked.has(skill.id))
      .flatMap((skill) => [skill.name, ...(skill.aliases ?? [])]),
  ].join(" \n ");
}

export function validateRewrite(
  sourceText: string,
  rewrittenText: string,
  achievement: { part_of?: string; metrics?: unknown; skills?: unknown },
  profile: { skills: Array<{ id: string; name: string; aliases?: string[] }> },
): RewriteVerdict {
  const issues: string[] = [];
  if (typeof rewrittenText !== "string" || !rewrittenText.trim()) {
    return { passed: false, issues: ["rewrite is empty or not text"] };
  }
  if (rewrittenText !== rewrittenText.trim()) {
    issues.push("rewrite has leading or trailing padding");
  }

  const allowed = evidence(sourceText, achievement, profile);
  const terms = knownTerms(profile);
  const sourceSkills = profileSkillIds(allowed, terms);
  const rewrittenSkills = profileSkillIds(rewrittenText, terms);
  const newSkills = [...rewrittenSkills].filter((id) => !sourceSkills.has(id));
  if (newSkills.length > 0) {
    issues.push(
      `new profile skills introduced: ${newSkills.sort().join(", ")}`,
    );
  }

  const sourceTech = technologyTokens(allowed);
  const rewrittenTech = technologyTokens(rewrittenText);
  const newTech = [...rewrittenTech].filter((id) => !sourceTech.has(id));
  if (newTech.length > 0) {
    issues.push(
      `new technology names introduced: ${newTech.sort().join(", ")}`,
    );
  }

  const sourceNumbers = numbers(allowed);
  const rewrittenNumbers = numbers(rewrittenText);
  const newNumbers = [...rewrittenNumbers].filter(
    (id) => !sourceNumbers.has(id),
  );
  if (newNumbers.length > 0) {
    issues.push(
      `new numeric claims introduced: ${newNumbers.sort().join(", ")}`,
    );
  }

  const allowedLower = allowed.toLowerCase();
  const newNames = names(rewrittenText).filter(
    (name) => !allowedLower.includes(name.toLowerCase()),
  );
  if (newNames.length > 0) {
    issues.push(`new names introduced: ${[...new Set(newNames)].join(", ")}`);
  }

  if (rewrittenText.split("\n").length > REWRITE_MAX_BULLETS_PER_SOURCE + 1) {
    issues.push("rewrite splits one source into too many bullets");
  }

  if (
    rewrittenText.length >
    groundedText(sourceText, achievement.metrics as string[] | undefined)
      .length +
      REWRITE_MAX_EXTRA_CHARS
  ) {
    issues.push("rewrite is too long and may contain keyword stuffing");
  }

  if (!achievement.part_of) {
    issues.push("source achievement has no parent relationship");
  }
  return { passed: issues.length === 0, issues };
}

export function rewritePrompt(
  plan: { target_title: string; job_description_parse?: unknown },
  bullets: Array<{
    id: string;
    text: string;
    metrics?: string[];
    linked_skills?: string[];
  }>,
): string {
  const payload = bullets.map((achievement) => ({
    achievement_id: achievement.id,
    source_text: achievement.text,
    metrics: achievement.metrics ?? [],
    linked_skills: achievement.linked_skills ?? [],
  }));
  const parse = (plan.job_description_parse ?? {}) as {
    must_have_skills?: Array<{ name?: string }>;
    responsibilities?: string[];
  };
  const wanted = {
    must_have_skills: (parse.must_have_skills ?? []).map((row) => row.name),
    responsibilities: parse.responsibilities ?? [],
  };
  return `Rewrite these resume points as strong, scannable resume bullets for the target role.

Every bullet:
- Starts with a specific past-tense action verb. Vary the verbs; don't repeat one across bullets. Never start with "Responsible for", "Worked on", or "Helped".
- Follows: what you did, how (the named technology), and the measurable result or scope.
- Leads with numbers. Put every number from source_text and metrics in the bullet, as digits ("four stages" becomes "4 stages").
- States scope from the source when there is no metric: how many features, services, or stages, or which named systems.
- Is one line of at most 25 words, with no first person and no filler such as "robust", "seamless", "various", or "leveraging".

Facts, which are checked automatically:
- Use only facts in source_text, metrics, and linked_skills. Never invent a number, percentage, user count, outcome, or technology, even a plausible one.
- With no number available, leave the number out. Don't imply one with words like "significantly".
- Don't describe the project as a paragraph. If a source_text holds two distinct facts, return up to ${REWRITE_MAX_BULLETS_PER_SOURCE} bullets for it.
- Favor wording from the job's requirements only where the source supports it.

Also write "summary": 2 sentences for the top of this resume, with no first person, using only facts given here.

Return JSON exactly as {"summary":"...","rewrites":[{"achievement_id":"...","bullets":["..."]}]}.

Examples:
Source: "Built a TypeScript CLI that runs four stages across three APIs, with SQLite caching." Metrics: []
Bullets: ["Engineered a TypeScript CLI that orchestrates 4 stages across 3 APIs, caching results in SQLite"]
Source: "Set up CI and shipped versioned releases." Metrics: ["8 tagged releases"]
Bullets: ["Shipped 8 tagged releases through an automated CI pipeline"]

Target title: ${plan.target_title}
Job requirements: ${JSON.stringify(wanted)}
Points: ${JSON.stringify(payload)}`;
}

/** Checked like a bullet, against everything selected for this resume. */
function groundedSummary(
  summary: string,
  targetTitle: string,
  extraFacts: string[],
  selected: Array<Record<string, unknown>>,
  profile: {
    skills: Array<{ id: string; name: string; aliases?: string[] }>;
    experiences?: Array<Record<string, unknown>>;
    projects?: Array<Record<string, unknown>>;
  },
): string | undefined {
  const source = [
    targetTitle,
    ...extraFacts,
    ...selected.flatMap((item) =>
      evidence(String(item.text ?? ""), item, profile),
    ),
    ...[...(profile.experiences ?? []), ...(profile.projects ?? [])].flatMap(
      (node) => [String(node.name ?? ""), String(node.title ?? "")],
    ),
  ].join(" \n ");
  const text = summary.trim();
  const verdict = validateRewrite(
    source,
    text,
    { part_of: "summary" },
    profile,
  );
  return verdict.passed ? text : undefined;
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
    experiences?: Array<Record<string, unknown>>;
    projects?: Array<Record<string, unknown>>;
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
      metrics: (item.metrics as string[] | undefined) ?? [],
      skills: (item.skills as string[] | undefined) ?? [],
    }));

  const rawRewrites = new Map<string, string>();
  let rewriteProvider = "deterministic";
  const rewriteRequested = provider?.name ?? "deterministic";
  let rewriteFallbackError: string | undefined;
  let generatedSummary: string | undefined;
  if (provider != null) {
    try {
      const skillNames = new Map(
        profile.skills.map((skill) => [skill.id, skill.name]),
      );
      const prompt = rewritePrompt(
        plan,
        selected.map((a) => ({
          id: a.id,
          text: a.text,
          metrics: a.metrics,
          linked_skills: a.skills
            .map((id) => skillNames.get(id))
            .filter((name): name is string => Boolean(name)),
        })),
      );
      const response = await provider.completeJson(prompt);
      rewriteProvider = rewriteRequested;
      if (typeof response.summary === "string") {
        generatedSummary = groundedSummary(
          response.summary,
          plan.target_title,
          [
            String(
              (plan.job_description_parse as { role_title?: unknown })
                ?.role_title ?? "",
            ),
          ],
          selected,
          profile,
        );
      }
      const rows = Array.isArray(response.rewrites) ? response.rewrites : [];
      for (const row of rows) {
        if (
          row == null ||
          typeof row !== "object" ||
          !("achievement_id" in row)
        )
          continue;
        const record = row as {
          achievement_id?: unknown;
          bullets?: unknown;
          text?: unknown;
        };
        const achievementId = String(record.achievement_id);
        const lines = Array.isArray(record.bullets)
          ? record.bullets.filter((line) => typeof line === "string")
          : [record.text];
        if (achievements.has(achievementId) && lines.length > 0) {
          if (lines.every((line) => typeof line === "string")) {
            rawRewrites.set(achievementId, lines.join("\n").trim());
          }
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
    // A rewrite can't lose a reviewed number: metrics are put back, and one
    // that drops a number from the source isn't an improvement.
    const raw = rawRewrites.get(achievement.id);
    const candidate = raw && groundedText(raw, achievement.metrics);
    const lost = [...numbers(sourceText)].filter(
      (value) => candidate != null && !numbers(candidate).has(value),
    );
    let passed = false;
    let issues = ["no provider rewrite supplied"];
    if (candidate != null) {
      const verdict = validateRewrite(
        sourceText,
        candidate,
        achievement,
        profile,
      );
      passed = verdict.passed && lost.length === 0;
      issues = [
        ...verdict.issues,
        ...(lost.length > 0 ? [`dropped numbers: ${lost.join(", ")}`] : []),
      ];
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
        rewritten_text: groundedText(sourceText, achievement.metrics),
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
      (record) => record.used_rewrite || record.status === "fallback_original",
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
    ...(generatedSummary ? { generated_summary: generatedSummary } : {}),
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
