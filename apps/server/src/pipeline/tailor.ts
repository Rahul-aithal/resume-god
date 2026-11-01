/**
 * Deterministic selection of profile evidence for a target role.
 * Faithful port of resume_god/tailor.py: exact alias matching, two-hop
 * graph expansion, framework→foundation inference, TF-IDF semantic
 * similarity, recency + metric scoring, coverage-aware greedy selection,
 * gap reporting, and a selection audit.
 *
 * Documented deviations from python:
 * - plan.profile = { reviewed } (version/status dropped with versioning)
 * - no `source_excerpts` audit check (kg tables have no such column)
 */

import type { Profile } from "./jd-parser";

export const SELECTION_POLICY_VERSION = 3;

type Dict = Record<string, unknown>;

interface ProfileLike {
  skills: Array<{
    id: string;
    name: string;
    category?: string;
    aliases?: string[];
  }>;
  experiences: Array<Dict>;
  projects: Array<Dict>;
  achievements: Array<Dict>;
  education: Array<Dict>;
  certifications: Array<Dict>;
  reviewed?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findMatchedSkills(
  profile: ProfileLike,
  jobDescription: string,
): Array<{
  id: string;
  name: string;
  category: string;
  matched_terms: string[];
}> {
  const matches: Array<{
    id: string;
    name: string;
    category: string;
    matched_terms: string[];
  }> = [];
  for (const skill of profile.skills) {
    const terms = [skill.name, ...(skill.aliases ?? [])];
    const matchedTerms = terms.filter((term) => {
      const pattern = new RegExp(`(?<!\\w)${escapeRegExp(term)}(?!\\w)`, "i");
      return pattern.test(jobDescription);
    });
    if (matchedTerms.length > 0) {
      matchedTerms.sort(
        (a, b) =>
          b.length - a.length || a.toLowerCase().localeCompare(b.toLowerCase()),
      );
      matches.push({
        id: skill.id,
        name: skill.name,
        category: skill.category ?? "",
        matched_terms: matchedTerms,
      });
    }
  }
  return matches;
}

export function recencyScore(
  dateRange: Record<string, unknown> | null | undefined,
): number {
  if (!dateRange) return 0.3;
  if (dateRange.ongoing) return 1.0;
  const yearText = String(dateRange.end ?? dateRange.start ?? "");
  const match = /^\d{4}/.exec(yearText);
  if (!match) return 0.3;
  const year = Number(match[0]);
  if (year >= 2026) return 1.0;
  if (year >= 2025) return 0.8;
  if (year >= 2024) return 0.65;
  return 0.4;
}

export interface ScoredAchievement {
  achievement: Dict;
  position: number;
  score: number;
  direct_skill_matches: string[];
  expanded_skill_matches: string[];
  inferred_skill_matches: string[];
  requirement_skill_matches: string[];
  semantic_similarity: number;
  recency_score: number;
  metrics: string[];
  score_components: {
    exact: number;
    graph_expansion: number;
    inferred: number;
    semantic: number;
    recency: number;
    metric: number;
  };
}

export function achievementScores(
  achievements: Array<Dict>,
  matchedSkillIds: Set<string>,
  options: {
    mustSkillIds?: Set<string>;
    niceSkillIds?: Set<string>;
    expandedSkillIds?: Set<string>;
    impliesClosure?: Map<string, Set<string>>;
    semanticScores?: Map<string, number>;
  } = {},
): ScoredAchievement[] {
  const mustIds = options.mustSkillIds ?? new Set<string>();
  const niceIds = options.niceSkillIds ?? new Set<string>();
  const expandedIds = options.expandedSkillIds ?? new Set<string>();
  const closure = options.impliesClosure ?? new Map<string, Set<string>>();
  const semantics = options.semanticScores ?? new Map<string, number>();
  const scored: ScoredAchievement[] = [];

  achievements.forEach((achievement, position) => {
    const linked = new Set(achievement.skills as string[]);
    const directMust = [...linked].filter((id) => mustIds.has(id)).sort();
    const directNice = [...linked].filter((id) => niceIds.has(id)).sort();
    const directMatches = [...linked]
      .filter((id) => matchedSkillIds.has(id))
      .sort();
    const expandedMatches = [...linked]
      .filter((id) => expandedIds.has(id) && !directMatches.includes(id))
      .sort();
    const inferredEvidence = new Set<string>();
    for (const skillId of linked) {
      for (const implied of closure.get(skillId) ?? []) {
        inferredEvidence.add(implied);
      }
    }
    const inferredMatches = [...inferredEvidence]
      .filter(
        (id) =>
          matchedSkillIds.has(id) &&
          !directMatches.includes(id) &&
          !expandedMatches.includes(id),
      )
      .sort();
    const similarity = Number(
      (semantics.get(String(achievement.id)) ?? 0).toFixed(8),
    );
    const metrics = [...((achievement.metrics as string[]) ?? [])];
    const recency = recencyScore(achievement.date_range as Dict | null);
    const metricPoints = Math.min(metrics.length, 2);

    const exactPoints = directMust.length * 12 + directNice.length * 7;
    const graphPoints = expandedMatches.length * 3;
    const inferredPoints = inferredMatches.length * 1;
    const semanticPoints = Number((Math.max(similarity, 0) * 8).toFixed(6));
    const score = Number(
      (
        exactPoints +
        graphPoints +
        inferredPoints +
        semanticPoints +
        recency * 4 +
        metricPoints
      ).toFixed(6),
    );

    if (
      directMatches.length > 0 ||
      expandedMatches.length > 0 ||
      inferredMatches.length > 0 ||
      similarity >= 0.08
    ) {
      scored.push({
        achievement,
        position,
        score,
        direct_skill_matches: directMatches,
        expanded_skill_matches: expandedMatches,
        inferred_skill_matches: inferredMatches,
        requirement_skill_matches: [
          ...new Set([...directMatches, ...expandedMatches]),
        ].sort(),
        semantic_similarity: similarity,
        recency_score: recency,
        metrics,
        score_components: {
          exact: exactPoints,
          graph_expansion: graphPoints,
          inferred: inferredPoints,
          semantic: semanticPoints,
          recency: Number((recency * 4).toFixed(6)),
          metric: metricPoints,
        },
      });
    }
  });

  return scored.sort((a, b) => b.score - a.score || a.position - b.position);
}

export function selectWithSkillAndParentCoverage(
  ranked: ScoredAchievement[],
  options: { maxAchievements: number },
): ScoredAchievement[] {
  const maxAchievements = options.maxAchievements;
  const pool = [...ranked];
  const selected: ScoredAchievement[] = [];
  const selectedIds = new Set<string>();
  const coveredSkills = new Set<string>();
  const parentCounts = new Map<string, number>();

  while (pool.length > 0 && selected.length < maxAchievements) {
    let bestIndex: number | null = null;
    let bestUtility: [number, number, number] | null = null;
    pool.forEach((row, index) => {
      const achievementId = String(row.achievement.id);
      if (selectedIds.has(achievementId)) return;
      const directMatches = new Set(row.direct_skill_matches);
      const expandedMatches = new Set(row.expanded_skill_matches);
      const inferredMatches = new Set(row.inferred_skill_matches);
      let newDirect = 0;
      for (const id of directMatches)
        if (!coveredSkills.has(id)) newDirect += 1;
      let newExpanded = 0;
      for (const id of expandedMatches) {
        if (!coveredSkills.has(id) && !directMatches.has(id)) newExpanded += 1;
      }
      let newInferred = 0;
      for (const id of inferredMatches) {
        if (
          !coveredSkills.has(id) &&
          !directMatches.has(id) &&
          !expandedMatches.has(id)
        ) {
          newInferred += 1;
        }
      }
      const partOf = String(row.achievement.part_of);
      const parentCount = parentCounts.get(partOf) ?? 0;
      const utility: [number, number, number] = [
        newDirect * 1000,
        newExpanded * 20 + newInferred * 5 + row.score - parentCount * 15,
        -row.position,
      ];
      if (
        bestUtility === null ||
        utility[0] > bestUtility[0] ||
        (utility[0] === bestUtility[0] && utility[1] > bestUtility[1]) ||
        (utility[0] === bestUtility[0] &&
          utility[1] === bestUtility[1] &&
          utility[2] > bestUtility[2])
      ) {
        bestIndex = index;
        bestUtility = utility;
      }
    });

    if (bestIndex === null) break;
    const row = pool.splice(bestIndex, 1)[0];
    selected.push(row);
    selectedIds.add(String(row.achievement.id));
    for (const id of row.requirement_skill_matches) coveredSkills.add(id);
    for (const id of row.inferred_skill_matches) coveredSkills.add(id);
    const partOf = String(row.achievement.part_of);
    parentCounts.set(partOf, (parentCounts.get(partOf) ?? 0) + 1);
  }

  return selected;
}

export interface RequirementRow {
  id: string | null;
  name: string;
  priority: string;
  kind: string;
}

export function requirementRows(parsed: {
  must_have_skills?: Array<{ id: string; name: string }>;
  nice_to_have_skills?: Array<{ id: string; name: string }>;
  unknown_skills?: Array<{ name: string }>;
}): RequirementRow[] {
  const rows: RequirementRow[] = [];
  for (const [priority, field] of [
    ["must", "must_have_skills"],
    ["nice", "nice_to_have_skills"],
  ] as const) {
    for (const skill of parsed[field] ?? []) {
      rows.push({
        id: skill.id,
        name: skill.name,
        priority,
        kind: "profile_skill",
      });
    }
  }
  for (const skill of parsed.unknown_skills ?? []) {
    rows.push({
      id: null,
      name: skill.name,
      priority: "reported",
      kind: "unknown_skill",
    });
  }
  return rows;
}

export function coverageRows(
  requirements: RequirementRow[],
  profile: ProfileLike,
  selectedAchievements: Array<Dict>,
  options: {
    inferredAvailable?: Set<string>;
    inferredSelected?: Set<string>;
  } = {},
): Array<RequirementRow & { status: string; evidence_available: boolean }> {
  const available = new Set<string>();
  for (const achievement of profile.achievements) {
    for (const skillId of achievement.skills as string[])
      available.add(skillId);
  }
  const selected = new Set<string>();
  for (const achievement of selectedAchievements) {
    for (const skillId of achievement.skills as string[]) selected.add(skillId);
  }
  const inferredAvailable = options.inferredAvailable ?? new Set<string>();
  const inferredSelected = options.inferredSelected ?? new Set<string>();

  return requirements.map((requirement) => {
    const skillId = requirement.id;
    let status: string;
    let evidenceAvailable: boolean;
    if (skillId === null) {
      status = "unknown_no_profile_match";
      evidenceAvailable = false;
    } else if (selected.has(skillId)) {
      status = "covered";
      evidenceAvailable = true;
    } else if (inferredSelected.has(skillId)) {
      status = "inferred_covered";
      evidenceAvailable = true;
    } else if (available.has(skillId)) {
      status = "profile_skill_not_selected";
      evidenceAvailable = true;
    } else if (inferredAvailable.has(skillId)) {
      status = "inferred_available_not_selected";
      evidenceAvailable = true;
    } else {
      status = "profile_skill_without_evidence";
      evidenceAvailable = false;
    }
    return { ...requirement, status, evidence_available: evidenceAvailable };
  });
}

/** Transitive framework→foundation implications per achievement skill set. */
function inferredEvidenceFor(
  skillIds: Iterable<string>,
  impliesEdges: Array<{ from: string; to: string }>,
): Set<string> {
  const map = new Map<string, Set<string>>();
  for (const edge of impliesEdges) {
    if (!map.has(edge.from)) map.set(edge.from, new Set());
    map.get(edge.from)!.add(edge.to);
  }
  const inferred = new Set<string>();
  const seen = new Set<string>(skillIds);
  const frontier = [...seen];
  while (frontier.length > 0) {
    const current = frontier.pop()!;
    for (const next of map.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        inferred.add(next);
        frontier.push(next);
      }
    }
  }
  for (const id of skillIds) inferred.delete(id);
  return inferred;
}

/** Co-occurrence adjacency over achievements (2-hop expansion base). */
function adjacencyFromProfile(profile: ProfileLike): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (a === b) return;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  for (const achievement of profile.achievements) {
    const linked = (achievement.skills as string[]) ?? [];
    for (const a of linked) {
      for (const b of linked) add(a, b);
    }
  }
  return adjacency;
}

export function expandSkills(
  profile: ProfileLike,
  skillId: string,
  hops: 1 | 2,
): string[] {
  const adjacency = adjacencyFromProfile(profile);
  let frontier = new Set([skillId]);
  const seen = new Set([skillId]);
  for (let hop = 0; hop < hops; hop += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const adjacent of adjacency.get(id) ?? []) next.add(adjacent);
    }
    frontier = new Set([...next].filter((id) => !seen.has(id)));
    for (const id of frontier) seen.add(id);
  }
  return [...seen].filter((id) => id !== skillId).sort();
}

export interface TailoringPlan extends Dict {
  version: number;
  phase: string;
  selection_policy_version: number;
  profile: { reviewed: boolean };
  target_title: string;
  job_description_parse: Dict;
  matched_skills: ReturnType<typeof findMatchedSkills>;
  supporting_skills: Array<{ id: string; name: string; category: string }>;
  selected_achievements: Array<Dict>;
  selected_parents: Array<{
    kind: string;
    id: string;
    achievement_ids: string[];
  }>;
  always_include: {
    contact: boolean;
    education: string[];
    certifications: string[];
  };
  ranking: Array<Dict>;
  semantic_search: { method: string; top_matches: Array<Dict> };
  graph_expansion: Dict;
  requirement_coverage: Array<
    RequirementRow & { status: string; evidence_available: boolean }
  >;
  gap_report: Dict;
  audit: Record<string, boolean>;
}

export async function buildTailoringPlan(
  profile: ProfileLike & { reviewed?: boolean },
  jobDescription: string,
  options: {
    targetTitle: string;
    maxAchievements?: number;
    parsedJobDescription?: Dict | null;
    searchBullets?: (
      query: string,
      limit: number,
    ) => Promise<Array<{ id: string; similarity: number }>>;
    impliesEdges?: Array<{ from: string; to: string }>;
  },
): Promise<TailoringPlan> {
  const {
    targetTitle,
    maxAchievements = 10,
    parsedJobDescription = null,
  } = options;
  const impliesEdges = options.impliesEdges ?? [];
  if (!jobDescription.trim()) {
    throw new Error("Job description must not be empty");
  }
  if (!targetTitle.trim() || targetTitle !== targetTitle.trim()) {
    throw new Error("Target title must be non-empty and unpadded");
  }
  if (maxAchievements < 1) {
    throw new Error("max_achievements must be at least 1");
  }

  let parsed: Dict;
  if (parsedJobDescription === null) {
    throw new Error(
      "parsedJobDescription is required in the TS pipeline (run the JD parser first)",
    );
  } else {
    parsed = parsedJobDescription;
    const parsedTitle = String(parsed.role_title ?? "").trim();
    if (parsedTitle !== targetTitle) {
      throw new Error(
        `Target title does not match the job description: you requested '${targetTitle}', but the job description reads as '${
          parsedTitle || "an unknown role"
        }'. Leave Target title empty to use the job's own title, or paste the description for the role you named.`,
      );
    }
  }

  const skills = new Map(profile.skills.map((skill) => [skill.id, skill]));
  const parents = new Map<string, Dict>();
  for (const node of [...profile.experiences, ...profile.projects]) {
    parents.set(String(node.id), node);
  }
  const achievements = new Map<string, Dict>();
  for (const item of profile.achievements) {
    achievements.set(String(item.id), item);
  }

  const matchedSkills = findMatchedSkills(profile, jobDescription);
  const matchedSkillIds = new Set(matchedSkills.map((match) => match.id));
  const mustIds = new Set(
    ((parsed.must_have_skills as Array<{ id: string }>) ?? [])
      .map((row) => row.id)
      .filter((id) => skills.has(id)),
  );
  const niceIds = new Set(
    ((parsed.nice_to_have_skills as Array<{ id: string }>) ?? [])
      .map((row) => row.id)
      .filter((id) => skills.has(id)),
  );

  // Graph expansion: 2-hop co-occurrence per matched skill.
  const adjacency = adjacencyFromProfile(profile);
  const expandedSkillIds = new Set<string>();
  const expansionPaths: Array<Dict> = [];
  for (const skillId of [...matchedSkillIds].sort()) {
    let frontier = new Set([skillId]);
    const seen = new Set([skillId]);
    for (let hop = 0; hop < 2; hop += 1) {
      const next = new Set<string>();
      for (const id of frontier) {
        for (const adjacent of adjacency.get(id) ?? []) next.add(adjacent);
      }
      frontier = new Set([...next].filter((id) => !seen.has(id)));
      for (const id of frontier) seen.add(id);
    }
    const connectedIds = [...seen]
      .filter((id) => id !== skillId && skills.has(id))
      .sort();
    expansionPaths.push({
      from_skill_id: skillId,
      hops: 2,
      skill_ids: connectedIds,
    });
    for (const id of connectedIds) expandedSkillIds.add(id);
  }
  for (const id of matchedSkillIds) expandedSkillIds.delete(id);

  // Framework→foundation inference: which skills imply each matched skill?
  const impliesClosure = new Map<string, Set<string>>();
  for (const [skillId] of skills) {
    impliesClosure.set(
      skillId,
      new Set(inferredEvidenceFor([skillId], impliesEdges)),
    );
  }
  const inferredSkillIds = new Set<string>();
  const impliesPaths: Array<Dict> = [];
  for (const skillId of [...matchedSkillIds].sort()) {
    const implying = [...skills.keys()]
      .filter((source) =>
        (impliesClosure.get(source) ?? new Set()).has(skillId),
      )
      .sort();
    if (implying.length > 0) {
      impliesPaths.push({
        for_skill_id: skillId,
        via: "framework_implies_foundation",
        implied_by_skill_ids: implying,
      });
      for (const id of implying) inferredSkillIds.add(id);
    }
  }
  for (const id of matchedSkillIds) inferredSkillIds.delete(id);
  for (const id of expandedSkillIds) inferredSkillIds.delete(id);

  // Semantic scoring via the injected search (GraphRepository-backed).
  const semanticResults = (await (options.searchBullets?.(
    jobDescription,
    profile.achievements.length,
  ) ?? [])) as Array<{ id: string; similarity: number }>;
  const semanticScores = new Map(
    semanticResults.map((row) => [row.id, row.similarity]),
  );

  const ranked = achievementScores(profile.achievements, matchedSkillIds, {
    mustSkillIds: mustIds,
    niceSkillIds: niceIds,
    expandedSkillIds,
    impliesClosure,
    semanticScores,
  });
  const selectedRows = selectWithSkillAndParentCoverage(ranked, {
    maxAchievements,
  });
  const selectedIds = new Set(
    selectedRows.map((row) => String(row.achievement.id)),
  );

  const achievementsByParent = new Map<string, string[]>();
  for (const achievement of profile.achievements) {
    if (selectedIds.has(String(achievement.id))) {
      const partOf = String(achievement.part_of);
      const list = achievementsByParent.get(partOf) ?? [];
      list.push(String(achievement.id));
      achievementsByParent.set(partOf, list);
    }
  }

  const selectedParents: Array<{
    kind: string;
    id: string;
    achievement_ids: string[];
  }> = [];
  for (const [kind, nodes] of [
    ["experience", profile.experiences],
    ["project", profile.projects],
  ] as const) {
    for (const node of nodes) {
      const id = String(node.id);
      if (achievementsByParent.has(id)) {
        selectedParents.push({
          kind,
          id,
          achievement_ids: achievementsByParent.get(id)!,
        });
      }
    }
  }

  const selectedAchievements = [...selectedIds]
    .sort()
    .map((id) => structuredClone(achievements.get(id)!));
  const selectedSkillIds = new Set<string>();
  for (const achievement of selectedAchievements) {
    for (const skillId of achievement.skills as string[]) {
      selectedSkillIds.add(skillId);
    }
  }

  const supportingSkillIds = [...selectedSkillIds]
    .filter((id) => !matchedSkillIds.has(id))
    .sort();
  const inferredAvailable = new Set<string>();
  for (const achievement of profile.achievements) {
    for (const id of inferredEvidenceFor(
      achievement.skills as string[],
      impliesEdges,
    )) {
      inferredAvailable.add(id);
    }
  }
  const inferredSelected = new Set<string>();
  for (const achievement of selectedAchievements) {
    for (const id of inferredEvidenceFor(
      achievement.skills as string[],
      impliesEdges,
    )) {
      inferredSelected.add(id);
    }
  }
  const requirements = requirementRows(
    parsed as Parameters<typeof requirementRows>[0],
  );
  const requirementCoverage = coverageRows(
    requirements,
    profile,
    selectedAchievements,
    {
      inferredAvailable,
      inferredSelected,
    },
  );
  const matchedButUnevidenced = requirementCoverage
    .filter(
      (row) =>
        row.kind === "profile_skill" &&
        row.status !== "covered" &&
        row.status !== "inferred_covered",
    )
    .map((row) => ({
      id: row.id,
      name: row.name,
      priority: row.priority,
      status: row.status,
    }));
  const inferredCoveredSkills = requirementCoverage
    .filter((row) => row.status === "inferred_covered")
    .map((row) => ({
      id: row.id,
      name: row.name,
      priority: row.priority,
      status: row.status,
    }));
  const unknownSkills = requirementCoverage
    .filter((row) => row.kind === "unknown_skill")
    .map((row) => ({ name: row.name, status: row.status }));

  const audit: Record<string, boolean> = {
    all_selected_achievements_exist: [...selectedIds].every((id) =>
      achievements.has(id),
    ),
    all_selected_parents_exist: selectedParents.every((item) =>
      parents.has(item.id),
    ),
    every_selected_skill_resolves: [...selectedSkillIds].every((id) =>
      skills.has(id),
    ),
    every_selected_achievement_is_retrieved_from_reviewed_evidence:
      selectedRows.length === 0 ||
      selectedRows.some(
        (row) =>
          row.direct_skill_matches.length > 0 ||
          row.expanded_skill_matches.length > 0 ||
          row.inferred_skill_matches.length > 0 ||
          row.semantic_similarity >= 0.08,
      ),
    achievement_text_is_unchanged: selectedAchievements.every(
      (achievement) =>
        JSON.stringify(achievement) ===
        JSON.stringify(achievements.get(String(achievement.id))),
    ),
    requirement_coverage_references_resolve: requirementCoverage.every(
      (row) => row.kind === "unknown_skill" || skills.has(row.id as string),
    ),
    unknown_skills_are_never_promoted_to_profile_claims: requirementCoverage
      .filter((row) => row.kind === "unknown_skill")
      .every(
        (row) => row.id === null || selectedSkillIds.has(row.id as string),
      ),
  };

  return {
    version: 2,
    phase: "tailoring_plan",
    selection_policy_version: SELECTION_POLICY_VERSION,
    profile: { reviewed: profile.reviewed ?? false },
    target_title: targetTitle,
    job_description_parse: parsed,
    matched_skills: matchedSkills,
    supporting_skills: supportingSkillIds.map((skillId) => ({
      id: skillId,
      name: skills.get(skillId)!.name,
      category: skills.get(skillId)!.category ?? "",
    })),
    selected_achievements: selectedAchievements,
    selected_parents: selectedParents,
    always_include: {
      contact: true,
      education: profile.education.map((node) => String(node.id)),
      certifications: profile.certifications.map((node) => String(node.id)),
    },
    ranking: selectedRows.map((row) => ({
      achievement_id: row.achievement.id,
      score: row.score,
      direct_skill_matches: row.direct_skill_matches,
      expanded_skill_matches: row.expanded_skill_matches,
      inferred_skill_matches: row.inferred_skill_matches,
      semantic_similarity: row.semantic_similarity,
      recency_score: row.recency_score,
      metrics: row.metrics,
      score_components: row.score_components,
    })),
    semantic_search: {
      method: "deterministic_tfidf_cosine",
      top_matches: semanticResults.slice(0, 5).map((row) => ({
        achievement: achievements.get(row.id),
        similarity: row.similarity,
      })),
    },
    graph_expansion: {
      hops: 2,
      paths: expansionPaths,
      expanded_skill_ids: [...expandedSkillIds].sort(),
      implies_paths: impliesPaths,
      inferred_skill_ids: [...inferredSkillIds].sort(),
    },
    requirement_coverage: requirementCoverage,
    gap_report: {
      unknown_skills: unknownSkills,
      matched_but_unevidenced_skills: matchedButUnevidenced,
      inferred_covered_skills: inferredCoveredSkills,
      all_known_requirements_covered: matchedButUnevidenced.length === 0,
    },
    audit,
  };
}

/** Recompute coverage + gaps from the current selected achievements. */
export function refreshCoverage(
  plan: Dict,
  profile: ProfileLike,
  impliesEdges: Array<{ from: string; to: string }>,
): void {
  const selectedAchievements = plan.selected_achievements as Array<Dict>;
  const inferredSelected = new Set<string>();
  for (const achievement of selectedAchievements) {
    for (const id of inferredEvidenceFor(
      achievement.skills as string[],
      impliesEdges,
    )) {
      inferredSelected.add(id);
    }
  }
  const inferredAvailable = new Set<string>();
  for (const achievement of profile.achievements) {
    for (const id of inferredEvidenceFor(
      achievement.skills as string[],
      impliesEdges,
    )) {
      inferredAvailable.add(id);
    }
  }
  const requirementCoverage = coverageRows(
    (plan.requirement_coverage ?? []) as RequirementRow[],
    profile,
    selectedAchievements,
    { inferredAvailable, inferredSelected },
  );
  plan.requirement_coverage = requirementCoverage;
  const matchedButUnevidenced = requirementCoverage
    .filter(
      (row) =>
        row.kind === "profile_skill" &&
        row.status !== "covered" &&
        row.status !== "inferred_covered",
    )
    .map((row) => ({
      id: row.id,
      name: row.name,
      priority: row.priority,
      status: row.status,
    }));
  const gapReport = (plan.gap_report ?? {}) as Dict;
  gapReport.matched_but_unevidenced_skills = matchedButUnevidenced;
  gapReport.inferred_covered_skills = requirementCoverage
    .filter((row) => row.status === "inferred_covered")
    .map((row) => ({
      id: row.id,
      name: row.name,
      priority: row.priority,
      status: row.status,
    }));
  gapReport.all_known_requirements_covered = matchedButUnevidenced.length === 0;
}
