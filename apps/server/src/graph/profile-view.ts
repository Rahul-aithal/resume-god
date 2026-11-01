import type { GraphRepository } from "../graph/graph.repository";
import type { Profile } from "../pipeline/jd-parser";

/**
 * Assembles the pipeline's profile view from knowledge-graph tables.
 * The pipeline algorithms stay pure — they consume this plain object.
 *
 * Deviations from the legacy profile YAML:
 * - `reviewed` replaces the version/status pair (versioning dropped).
 * - `soft_skills` is always [] until a table exists for it.
 * - achievements carry no `source_excerpts` (no provenance column yet).
 */
export interface ProfileView extends Omit<Profile, "skills"> {
  reviewed: boolean;
  skills: Array<{
    id: string;
    name: string;
    category: string;
    aliases: string[];
  }>;
  experiences: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  achievements: Array<Record<string, unknown>>;
  education: Array<Record<string, unknown>>;
  certifications: Array<Record<string, unknown>>;
  soft_skills: Array<{ name: string; detail: string }>;
  contact: Record<string, unknown>;
}

export async function buildProfileView(
  userId: string,
  repo: GraphRepository,
  reviewed: boolean,
): Promise<ProfileView> {
  const skills = await repo.listSkills(userId);
  const parents = await repo.listParents(userId);
  const achievements = await repo.listAchievements(userId);

  return {
    reviewed,
    skills: skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      aliases: skill.aliases,
    })),
    experiences: parents
      .filter((parent) => parent.kind === "experience")
      .map((parent) => ({
        id: parent.id,
        name: parent.name,
        title: parent.title,
        url: parent.url || undefined,
        date_range: parent.dateRange || undefined,
      })),
    projects: parents
      .filter((parent) => parent.kind === "project")
      .map((parent) => ({
        id: parent.id,
        name: parent.name,
        url: parent.url || undefined,
        date_range: parent.dateRange || undefined,
      })),
    achievements: achievements.map((achievement) => ({
      id: achievement.id,
      part_of: achievement.parentId,
      text: achievement.text,
      skills: achievement.skills,
      metrics: achievement.metrics,
      date_range: achievement.dateRange || undefined,
    })),
    education: (await repo.listEducation(userId)).map((row) => ({
      id: row.id,
      institution: row.institution,
      credential: row.credential,
      date_range: row.dateRange || undefined,
    })),
    certifications: (await repo.listCertifications(userId)).map((row) => ({
      id: row.id,
      name: row.name,
      issuer: row.issuer,
      issued_on: row.issuedOn,
    })),
    soft_skills: (await repo.listSoftSkills(userId)).map((row) => ({
      name: row.name,
      detail: row.detail,
    })),
    contact: {},
  };
}
