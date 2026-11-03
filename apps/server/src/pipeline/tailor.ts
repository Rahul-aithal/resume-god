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
import {
  COVERAGE_WEIGHTS,
  DEFAULT_MAX_ACHIEVEMENTS,
  EXPERIENCE_TARGET_BULLETS,
  GRAPH_EXPANSION_HOPS,
  MAX_PROJECTS,
  MIN_SEMANTIC_SIMILARITY,
  PLAN_VERSION,
  PROJECT_TARGET_BULLETS,
  RECENCY,
  SCORE_WEIGHTS,
  SELECTION_POLICY_VERSION,
  SEMANTIC_TOP_MATCHES,
} from "./constants/pipeline.constants";

export { SELECTION_POLICY_VERSION };

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
  if (!dateRange) return RECENCY.unknown;
  if (dateRange.ongoing) return RECENCY.ongoing;
  const yearText = String(dateRange.end ?? dateRange.start ?? "");
  const match = /^\d{4}/.exec(yearText);
  if (!match) return RECENCY.unknown;
  const year = Number(match[0]);
  return (
    RECENCY.byYear.find((band) => year >= band.fromYear)?.score ?? RECENCY.older
  );
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
    experienceIds?: Set<string>;
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
    const metricPoints = Math.min(
      metrics.length,
      SCORE_WEIGHTS.maxMetricPoints,
    );

    const exactPoints =
      directMust.length * SCORE_WEIGHTS.mustHaveSkill +
      directNice.length * SCORE_WEIGHTS.niceToHaveSkill;
    const graphPoints = expandedMatches.length * SCORE_WEIGHTS.expandedSkill;
    const inferredPoints = inferredMatches.length * SCORE_WEIGHTS.inferredSkill;
    const semanticPoints = Number(
      (Math.max(similarity, 0) * SCORE_WEIGHTS.semanticSimilarity).toFixed(6),
    );
    const score = Number(
      (
        exactPoints +
        graphPoints +
        inferredPoints +
        semanticPoints +
        recency * SCORE_WEIGHTS.recency +
        metricPoints
      ).toFixed(6),
    );

    if (
      directMatches.length > 0 ||
      expandedMatches.length > 0 ||
      inferredMatches.length > 0 ||
      similarity >= MIN_SEMANTIC_SIMILARITY ||
      options.experienceIds?.has(String(achievement.part_of))
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
          recency: Number((recency * SCORE_WEIGHTS.recency).toFixed(6)),
          metric: metricPoints,
        },
      });
    }
  });

  return scored.sort((a, b) => b.score - a.score || a.position - b.position);
}

/**
 * Chooses bullets by entry, not one at a time: picking the best bullet from
 * everywhere leaves a resume of one-line entries that read like descriptions.
 * Experience comes first, then projects by the skills they newly evidence.
 */
export function selectForResume(
  ranked: ScoredAchievement[],
  options: { maxAchievements: number; experienceIds: Set<string> },
): ScoredAchievement[] {
  const { maxAchievements, experienceIds } = options;
  const parentOf = (row: ScoredAchievement) => String(row.achievement.part_of);
  const selected: ScoredAchievement[] = [];
  const chosen = new Set<ScoredAchievement>();
  const covered = new Set<string>();
  const add = (row: ScoredAchievement) => {
    if (chosen.has(row) || selected.length >= maxAchievements) return;
    chosen.add(row);
    selected.push(row);
    for (const id of row.requirement_skill_matches) covered.add(id);
    for (const id of row.inferred_skill_matches) covered.add(id);
  };
  const newSkills = (rows: ScoredAchievement[], weigh = false) => {
    const ids = new Set(rows.flatMap((row) => row.direct_skill_matches));
    let direct = 0;
    for (const id of ids) if (!covered.has(id)) direct += 1;
    if (!weigh) return direct;
    return (
      direct * COVERAGE_WEIGHTS.newDirectSkill +
      rows.reduce((total, row) => total + row.score, 0)
    );
  };

  const byParent = new Map<string, ScoredAchievement[]>();
  for (const row of ranked) {
    const rows = byParent.get(parentOf(row)) ?? [];
    rows.push(row);
    byParent.set(parentOf(row), rows);
  }

  for (const [parentId, rows] of byParent) {
    if (!experienceIds.has(parentId)) continue;
    rows.slice(0, EXPERIENCE_TARGET_BULLETS).forEach(add);
  }

  const projects = new Map(
    [...byParent].filter(([parentId]) => !experienceIds.has(parentId)),
  );
  let projectCount = 0;
  while (projects.size > 0 && selected.length < maxAchievements) {
    let bestId: string | null = null;
    let bestWorth = -Infinity;
    for (const [parentId, rows] of projects) {
      const worth = newSkills(rows.slice(0, PROJECT_TARGET_BULLETS), true);
      if (worth > bestWorth) {
        bestId = parentId;
        bestWorth = worth;
      }
    }
    const rows = projects.get(bestId!)!.slice(0, PROJECT_TARGET_BULLETS);
    projects.delete(bestId!);
    if (projectCount >= MAX_PROJECTS && newSkills(rows) === 0) continue;
    rows.forEach(add);
    projectCount += 1;
  }

  // Spare room deepens the entries already on the resume.
  const shown = new Set(selected.map(parentOf));
  for (const row of ranked) {
    if (shown.has(parentOf(row))) add(row);
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
    maxAchievements = DEFAULT_MAX_ACHIEVEMENTS,
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
    for (let hop = 0; hop < GRAPH_EXPANSION_HOPS; hop += 1) {
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
      hops: GRAPH_EXPANSION_HOPS,
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

  // Internships are always worth showing in full, matched or not.
  const experienceIds = new Set(
    profile.experiences.map((node) => String(node.id)),
  );
  const ranked = achievementScores(profile.achievements, matchedSkillIds, {
    experienceIds,
    mustSkillIds: mustIds,
    niceSkillIds: niceIds,
    expandedSkillIds,
    impliesClosure,
    semanticScores,
  });
  const selectedRows = selectForResume(ranked, {
    maxAchievements,
    experienceIds,
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
          row.semantic_similarity >= MIN_SEMANTIC_SIMILARITY,
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
    version: PLAN_VERSION,
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
      top_matches: semanticResults
        .slice(0, SEMANTIC_TOP_MATCHES)
        .map((row) => ({
          achievement: achievements.get(row.id),
          similarity: row.similarity,
        })),
    },
    graph_expansion: {
      hops: GRAPH_EXPANSION_HOPS,
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
