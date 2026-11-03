/**
 * Grounding-validated resume-data builder (schema v1) — the JSON the
 * Typst v2 template renders. Port of resume_data.py + render.py helpers,
 * operating on the kg-normalized profile view (dates are display-ready
 * strings; no page-budget trimming by user decision).
 */

import { firstNonEmpty } from "../config/env-utils";
import {
  DEFAULT_FONT,
  RESUME_DATA_VERSION,
  SUMMARY_MAX_FEATURED_SKILLS,
  SUMMARY_MAX_NAMED_PROJECTS,
} from "./constants/pipeline.constants";
import { groundedText } from "./rewrite";

export { DEFAULT_FONT, RESUME_DATA_VERSION };

export interface ContactView {
  name: string;
  location: string;
  phone: string;
  email: string;
  linkedin: string;
  github: string;
  personal_site: string;
}

export interface ResumeData {
  version: number;
  target_title: string;
  summary: string;
  font: string;
  contact: ContactView;
  skills: Array<{ category: string; names: string[] }>;
  sections: Array<Record<string, unknown>>;
  education: Array<Record<string, unknown>>;
  certifications: Array<Record<string, unknown>>;
  soft_skills: Array<{ name: string; detail: string }>;
  achievement_ids_by_section?: Record<string, string[]>;
  [key: string]: unknown;
}

// ---- selected skill rows (target-first ordering) ----

export function selectedSkillRows(
  plan: {
    selected_achievements: Array<{ skills: string[] }>;
    matched_skills: Array<{ id: string }>;
  },
  profile: {
    skills: Array<{ id: string; name: string; category?: string }>;
  },
): Array<{ id: string; name: string; category: string; matched: boolean }> {
  const selectedIds = new Set(
    plan.selected_achievements.flatMap((achievement) => achievement.skills),
  );
  const matchedIds = new Set(plan.matched_skills.map((item) => item.id));
  const frequency = new Map<string, number>();
  for (const achievement of plan.selected_achievements) {
    for (const skillId of achievement.skills) {
      frequency.set(skillId, (frequency.get(skillId) ?? 0) + 1);
    }
  }
  const profileSkills = new Map(
    profile.skills.map((skill, index) => [
      skill.id,
      { ...skill, matched: matchedIds.has(skill.id), index },
    ]),
  );

  const orderedIds = [...selectedIds].sort((a, b) => {
    const rowA = profileSkills.get(a);
    const rowB = profileSkills.get(b);
    if (!rowA || !rowB) return 0;
    if (rowA.matched !== rowB.matched) return rowA.matched ? -1 : 1;
    const freqDiff = (frequency.get(b) ?? 0) - (frequency.get(a) ?? 0);
    if (freqDiff !== 0) return freqDiff;
    return rowA.index - rowB.index;
  });
  return orderedIds
    .filter((id) => profileSkills.has(id))
    .map((id) => {
      const row = profileSkills.get(id)!;
      return {
        id: row.id,
        name: row.name,
        category: row.category ?? "",
        matched: row.matched,
      };
    });
}

export function defaultSummary(
  plan: {
    target_title: string;
    matched_skills: Array<{ id: string }>;
    selected_parents: Array<{ kind: string; id: string }>;
    selected_achievements: Array<{ skills: string[] }>;
  },
  profile: {
    experiences: Array<Record<string, unknown>>;
    projects: Array<Record<string, unknown>>;
    skills: Array<{ id: string; name: string }>;
  },
): string {
  const parents = new Map<string, Record<string, unknown>>();
  for (const node of [...profile.experiences, ...profile.projects]) {
    parents.set(String(node.id), node);
  }
  const selectedByKind = new Map<string, Record<string, unknown>[]>();
  for (const reference of plan.selected_parents) {
    const list = selectedByKind.get(reference.kind) ?? [];
    const node = parents.get(reference.id);
    if (node) list.push(node);
    selectedByKind.set(reference.kind, list);
  }

  const anchors: string[] = [];
  const joinNames = (names: string[]): string =>
    names.length <= 2
      ? names.join(" and ")
      : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;

  const experiences = selectedByKind.get("experience") ?? [];
  if (experiences.length > 0) {
    const labels = joinNames(
      experiences.map(
        (node) =>
          `${node.name} at ${node.title ?? node.organization ?? node.name}`,
      ),
    );
    anchors.push(`hands-on experience as ${labels}`);
  }
  const projects = selectedByKind.get("project") ?? [];
  if (projects.length > 0) {
    const named = projects
      .slice(0, SUMMARY_MAX_NAMED_PROJECTS)
      .map((node) => String(node.name));
    anchors.push(`projects including ${joinNames(named)}`);
  }

  const featured = selectedSkillRows(plan, profile)
    .map((row) => row.name)
    .slice(0, SUMMARY_MAX_FEATURED_SKILLS);
  return `${plan.target_title} with ${anchors.join(", and ")}. Core skills: ${featured.join(", ")}.`;
}

// ---- resume-data builder ----

export function buildResumeData(
  plan: {
    target_title: string;
    generated_summary?: string;
    matched_skills: Array<{ id: string }>;
    selected_achievements: Array<{ id: string; skills: string[] }>;
    selected_parents: Array<{
      kind: string;
      id: string;
      achievement_ids: string[];
    }>;
    rewrites?: Record<
      string,
      { used_rewrite?: boolean; rewritten_text?: string }
    >;
  },
  profile: {
    experiences: Array<Record<string, unknown>>;
    projects: Array<Record<string, unknown>>;
    achievements: Array<Record<string, unknown>>;
    education: Array<Record<string, unknown>>;
    certifications: Array<Record<string, unknown>>;
    skills: Array<{ id: string; name: string; category?: string }>;
    soft_skills?: Array<{ name: string; detail: string }>;
  },
  contact: ContactView,
  options: {
    font?: string | null;
    summary?: string | null;
    techStackByParent?: Record<string, string>;
  } = {},
): ResumeData {
  const achievements = new Map(
    profile.achievements.map((item) => [String(item.id), item]),
  );
  const parents = new Map<string, Record<string, unknown>>();
  for (const node of [...profile.experiences, ...profile.projects]) {
    parents.set(String(node.id), node);
  }

  const bulletText = (achievementId: string): string => {
    const record = plan.rewrites?.[achievementId];
    if (record?.used_rewrite && record.rewritten_text) {
      return String(record.rewritten_text);
    }
    const achievement = achievements.get(achievementId);
    return groundedText(
      String(achievement?.text ?? ""),
      achievement?.metrics as string[] | undefined,
    );
  };

  const summary =
    options.summary?.trim() ||
    plan.generated_summary ||
    defaultSummary(plan, profile);

  const sections = plan.selected_parents.map((reference) => {
    const node = parents.get(reference.id) ?? {};
    const bullets = reference.achievement_ids.map(bulletText);
    if (reference.kind === "experience") {
      return {
        kind: "experience",
        role: String(node.name ?? ""),
        organization: String(node.title ?? ""),
        location: "",
        dates: String(node.date_range ?? ""),
        bullets,
        achievement_ids: [...reference.achievement_ids],
      };
    }
    const name = String(node.name ?? "");
    const title = String(node.title ?? "");
    return {
      kind: "project",
      name,
      role: name === title || !title ? "" : title,
      url: String(node.url ?? ""),
      tech_stack: options.techStackByParent?.[reference.id] ?? "",
      dates: String(node.date_range ?? ""),
      bullets,
      achievement_ids: [...reference.achievement_ids],
    };
  });

  const education = profile.education.map((node) => ({
    institution: String(node.institution ?? ""),
    location: "",
    dates: String(node.date_range ?? ""),
    degree: String(node.credential ?? ""),
    details: [] as string[],
  }));

  const certifications = profile.certifications.map((node) => ({
    name: String(node.name ?? ""),
    issuer: String(node.issuer ?? ""),
    date: String(node.issued_on ?? ""),
  }));

  const categories = new Map<string, string[]>();
  for (const row of selectedSkillRows(plan, profile)) {
    const list = categories.get(row.category) ?? [];
    list.push(row.name);
    categories.set(row.category, list);
  }

  return {
    version: RESUME_DATA_VERSION,
    target_title: plan.target_title,
    summary,
    font: (firstNonEmpty(options.font ?? "") || DEFAULT_FONT).trim(),
    contact,
    skills: [...categories].map(([category, names]) => ({ category, names })),
    sections,
    education,
    certifications,
    soft_skills: profile.soft_skills ?? [],
  };
}

// ---- grounding gate ----

export interface ValidationResult {
  data: ResumeData;
  dropped_bullets: string[];
  fallback_bullets: string[];
  issues: string[];
}

export function validateResumeData(
  data: ResumeData,
  profile: {
    achievements: Array<{
      id: string;
      text: string;
      part_of?: string;
      metrics?: string[];
      skills?: string[];
    }>;
  },
  validateRewriteFn: (
    sourceText: string,
    rewrittenText: string,
    achievement: {
      text: string;
      part_of?: string;
      metrics?: string[];
      skills?: string[];
    },
  ) => { passed: boolean; issues: string[] },
): ValidationResult {
  const achievements = new Map(
    profile.achievements.map((item) => [String(item.id), item]),
  );
  const cleaned: ResumeData = structuredClone(data);
  const dropped: string[] = [];
  const fallback: string[] = [];
  const issues: string[] = [];

  if (cleaned.version !== RESUME_DATA_VERSION) {
    issues.push(`unsupported resume-data version: ${cleaned.version}`);
  }
  if (typeof cleaned.font !== "string" || !cleaned.font.trim()) {
    issues.push("font must be a non-empty string");
  }

  for (const section of cleaned.sections as Array<{
    achievement_ids: string[];
    bullets: string[];
  }>) {
    const ids = section.achievement_ids ?? [];
    const texts = section.bullets ?? [];
    const keptIds: string[] = [];
    const keptTexts: string[] = [];
    ids.forEach((achievementId, index) => {
      const text = index < texts.length ? texts[index] : "";
      const achievement = achievements.get(achievementId);
      if (!achievement) {
        dropped.push(achievementId);
        issues.push(`dropped unknown achievement id: ${achievementId}`);
        return;
      }
      const sourceText = String(achievement.text ?? "");
      const verdict = validateRewriteFn(sourceText, text, {
        text: sourceText,
        part_of: achievement.part_of as string | undefined,
        metrics: achievement.metrics,
        skills: achievement.skills,
      });
      if (verdict.passed) {
        keptIds.push(achievementId);
        keptTexts.push(...text.split("\n").filter((line) => line.trim()));
      } else {
        keptIds.push(achievementId);
        keptTexts.push(
          ...groundedText(sourceText, achievement.metrics).split("\n"),
        );
        fallback.push(achievementId);
        issues.push(
          `bullet fell back to reviewed original ${achievementId}: ${verdict.issues.join("; ")}`,
        );
      }
    });
    section.achievement_ids = keptIds;
    section.bullets = keptTexts;
  }

  return {
    data: cleaned,
    dropped_bullets: dropped,
    fallback_bullets: fallback,
    issues,
  };
}
