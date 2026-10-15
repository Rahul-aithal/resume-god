/**
 * Human-reviewable retrieval and selection report.
 * Port of tailor.py render_plan_markdown, adjusted for kg fields
 * (experiences use name/title; no organization field).
 */

import type { TailoringPlan } from "./tailor";

/** Structural subset used by report rendering (skills/parents/achievements). */
export interface ProfileLike {
  skills: Array<{
    id: string;
    name: string;
    category?: string;
    aliases?: string[];
  }>;
  experiences: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  achievements: Array<Record<string, unknown>>;
  education: Array<Record<string, unknown>>;
  certifications: Array<Record<string, unknown>>;
}

export function renderPlanMarkdown(
  plan: TailoringPlan,
  profile: ProfileLike,
): string {
  const skills = new Map(profile.skills.map((skill) => [skill.id, skill]));
  const parents = new Map<string, Record<string, unknown>>();
  for (const node of [...profile.experiences, ...profile.projects]) {
    parents.set(String(node.id), node);
  }
  const achievements = new Map<string, Record<string, unknown>>();
  for (const item of profile.achievements) {
    achievements.set(String(item.id), item);
  }

  const lines: string[] = [
    "# Resume tailoring plan",
    "",
    `Target title: **${plan.target_title}**`,
    "",
    "This artifact selects reviewed profile evidence through exact alias",
    "matching, two-hop graph expansion, local semantic similarity, recency,",
    "and metric scoring. It does not invent or promote unknown skills.",
    "",
    "## Direct job-description skill matches",
    "",
  ];

  if (plan.matched_skills.length > 0) {
    for (const skill of plan.matched_skills) {
      const terms = skill.matched_terms.map((term) => `'${term}'`).join(", ");
      lines.push(`- **${skill.name}** (${skill.category ?? ""}) — ${terms}`);
    }
  } else {
    lines.push("- No canonical skill aliases were directly matched.");
  }

  lines.push("", "## Selected evidence", "");
  if (plan.selected_parents.length === 0) {
    lines.push("No achievements met the retrieval eligibility threshold.");
  } else {
    for (const parentRef of plan.selected_parents) {
      const parent = parents.get(parentRef.id) ?? {};
      const heading =
        parentRef.kind === "experience"
          ? `${parent.name ?? parent.role} — ${parent.title ?? ""}`
          : `${parent.name} — ${parent.title ?? ""}`;
      lines.push(`### ${heading}`, "");
      for (const achievementId of parentRef.achievement_ids) {
        lines.push(`- ${String(achievements.get(achievementId)?.text ?? "")}`);
      }
      lines.push("");
    }
  }

  lines.push("", "## Supporting skills from selected evidence", "");
  if (plan.supporting_skills.length > 0) {
    const byCategory = new Map<string, string[]>();
    for (const skill of plan.supporting_skills) {
      const list = byCategory.get(skill.category) ?? [];
      list.push(skill.name);
      byCategory.set(skill.category, list);
    }
    for (const category of [...byCategory.keys()].sort()) {
      lines.push(`- **${category}:** ${byCategory.get(category)!.join(", ")}`);
    }
  } else {
    lines.push("- None");
  }

  const semantic = plan.semantic_search ?? {};
  lines.push(
    "",
    "## Retrieval details",
    "",
    `- Semantic method: **${semantic.method ?? "not recorded"}**`,
    `- Graph expansion: **${plan.graph_expansion?.hops ?? 0} hop(s)**`,
    `- Expanded canonical skills: **${(plan.graph_expansion?.expanded_skill_ids as string[])?.length ?? 0}**`,
    "",
    "Top semantic matches:",
    "",
  );
  const topSemantic = semantic.top_matches ?? [];
  if (topSemantic.length > 0) {
    for (const row of topSemantic) {
      const achievement = row.achievement as { id?: string } | undefined;
      lines.push(
        `- \`${achievement?.id ?? "?"}\` — similarity ${row.similarity}`,
      );
    }
  } else {
    lines.push("- None");
  }

  lines.push(
    "",
    "## Requirement coverage and gaps",
    "",
    "| Requirement | Priority | Status | Evidence available |",
    "|---|---|---|---|",
  );
  for (const row of plan.requirement_coverage) {
    lines.push(
      `| ${row.name} | ${row.priority} | ${row.status} | ${row.evidence_available ? "yes" : "no"} |`,
    );
  }
  const gaps = plan.gap_report ?? {};
  lines.push(
    "",
    "Unknown skills are retained verbatim in the gap report and are never",
    "converted into profile claims.",
    "",
  );
  const unknownSkills = (gaps.unknown_skills ?? []) as Array<{ name: string }>;
  lines.push(
    unknownSkills.length > 0
      ? `- **Unknown:** ${unknownSkills.map((row) => row.name).join(", ")}`
      : "- **Unknown:** None",
  );
  const unevidenced = (gaps.matched_but_unevidenced_skills ?? []) as Array<{
    name: string;
  }>;
  lines.push(
    unevidenced.length > 0
      ? `- **Matched but unevidenced:** ${unevidenced.map((row) => row.name).join(", ")}`
      : "- **Matched but unevidenced:** None",
  );
  const inferredCovered = (gaps.inferred_covered_skills ?? []) as Array<{
    name: string;
  }>;
  if (inferredCovered.length > 0) {
    lines.push(
      `- **Inferred (framework implies foundation, weaker evidence):** ${inferredCovered
        .map((row) => row.name)
        .join(", ")}`,
    );
  }

  lines.push("", "## Selection audit", "");
  for (const [check, passed] of Object.entries(plan.audit)) {
    lines.push(`- ${passed ? "PASS" : "FAIL"}: ${check.replace(/_/g, " ")}`);
  }
  if (!Object.values(plan.audit).every(Boolean)) {
    lines.push("", "> WARNING: This plan failed at least one audit check.");
  }

  lines.push(
    "",
    "## Ranking rationale",
    "",
    "Scores combine exact must/nice skill coverage, two-hop graph",
    "expansion, cosine similarity, recency, and metrics. Exact requirement",
    "coverage dominates selection; graph expansion and semantic similarity",
    "surface additional reviewed evidence without inventing claims.",
    "",
  );
  for (const row of plan.ranking) {
    const direct = (row.direct_skill_matches as string[])
      .map((id) => skills.get(id)?.name ?? id)
      .join(", ");
    const expanded = (row.expanded_skill_matches as string[])
      .map((id) => skills.get(id)?.name ?? id)
      .join(", ");
    const inferred = (row.inferred_skill_matches as string[])
      .map((id) => skills.get(id)?.name ?? id)
      .join(", ");
    lines.push(
      `- \`${row.achievement_id}\` — score ${row.score}; exact: ${direct || "none"}; expanded: ${expanded || "none"}; inferred: ${inferred || "none"}; semantic: ${row.semantic_similarity}; components: ${JSON.stringify(row.score_components)}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}
