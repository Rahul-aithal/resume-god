import { Inject, Injectable } from "@nestjs/common";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { parse as parseYaml } from "yaml";

import { firstNonEmpty } from "../config/env-utils";
import { APP_DB } from "../db/database.module";
import type { AppDb } from "../db/client";
import { userSettings } from "../db/schema";
import { impliedClosure, searchDocs } from "./graph-search";
import {
  GraphRepository,
  type AchievementRow,
  type ParentRow,
  type SkillRow,
} from "./graph.repository";
import { defaultImpliesFor } from "./skill-implies-defaults";

const PREFIX: Record<string, string> = {
  skill: "skill",
  experience: "experience",
  project: "project",
  achievement: "achievement",
  education: "education",
  certification: "certification",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

@Injectable()
export class GraphService {
  constructor(
    // Bun does not emit design:paramtypes for symbol tokens; explicit is required.
    @Inject(APP_DB) private readonly db: AppDb,
    private readonly repo: GraphRepository,
  ) {}

  // ---- slugs ----

  private async uniqueId(
    userId: string,
    kind: string,
    name: string,
    requested?: string,
  ): Promise<string> {
    const prefix = PREFIX[kind] ?? kind;
    const base = requested?.trim() || `${prefix}_${slugify(name)}`;
    if (!/^[a-z0-9_]+$/.test(base)) {
      throw new BadRequestException(
        "id must contain only lowercase letters, digits, and underscores",
      );
    }
    const taken = new Set(
      (await this.repo.listSkills(userId))
        .map((row) => row.id)
        .concat((await this.repo.listParents(userId)).map((row) => row.id))
        .concat(
          (await this.repo.listAchievements(userId)).map((row) => row.id),
        ),
    );
    if (!taken.has(base)) return base;
    let counter = 2;
    while (taken.has(`${base}_${counter}`)) counter += 1;
    return `${base}_${counter}`;
  }

  // ---- projection ----

  async projection(userId: string) {
    const skills = await this.repo.listSkills(userId);
    const parents = await this.repo.listParents(userId);
    const achievements = await this.repo.listAchievements(userId);
    const education = await this.repo.listEducation(userId);
    const certifications = await this.repo.listCertifications(userId);
    const implies = await this.repo.listImplies(userId);
    const skillNames = new Map(skills.map((skill) => [skill.id, skill.name]));
    const parentNames = new Map(parents.map((parent) => [parent.id, parent]));

    const nodes: Array<{
      id: string;
      kind: string;
      label: string;
      detail: string;
    }> = [
      ...skills.map((skill) => ({
        id: skill.id,
        kind: "skill",
        label: skill.name,
        detail: [skill.category, ...skill.aliases].filter(Boolean).join(" · "),
      })),
      ...parents.map((parent) => ({
        id: parent.id,
        kind: parent.kind,
        label: parent.name,
        detail: [parent.title, parent.dateRange].filter(Boolean).join(" · "),
      })),
      ...achievements.map((achievement) => ({
        id: achievement.id,
        kind: "achievement",
        label:
          achievement.text.length > 64
            ? `${achievement.text.slice(0, 64)}…`
            : achievement.text,
        detail: parentNames.get(achievement.parentId)?.name ?? "",
      })),
      ...education.map((row) => ({
        id: row.id,
        kind: "education",
        label: row.institution,
        detail: [row.credential, row.dateRange].filter(Boolean).join(" · "),
      })),
      ...certifications.map((row) => ({
        id: row.id,
        kind: "certification",
        label: row.name,
        detail: [row.issuer, row.issuedOn].filter(Boolean).join(" · "),
      })),
    ];

    const edges: Array<{ from: string; to: string; type: string }> = [];
    for (const achievement of achievements) {
      edges.push({
        from: achievement.id,
        to: achievement.parentId,
        type: "PART_OF",
      });
      for (const skillId of achievement.skills) {
        edges.push({
          from: achievement.id,
          to: skillId,
          type: "DEMONSTRATES",
        });
      }
    }
    for (const parent of parents) {
      for (const skillId of await this.repo.skillsForParent(
        userId,
        parent.id,
      )) {
        edges.push({ from: parent.id, to: skillId, type: "USES" });
      }
    }
    for (const edge of implies) {
      edges.push({ from: edge.from, to: edge.to, type: "IMPLIES" });
    }

    return {
      reviewed_at: await this.reviewedAt(userId),
      nodes,
      edges,
      stats: {
        skills: skills.length,
        parents: parents.length,
        achievements: achievements.length,
        education: education.length,
        certifications: certifications.length,
        edges: edges.length,
      },
    };
  }

  // ---- review gate ----

  async reviewedAt(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    return row?.reviewedAt ? row.reviewedAt.toISOString() : null;
  }

  async setReviewed(userId: string, reviewed: boolean) {
    const reviewedAt = reviewed ? new Date() : null;
    const [existing] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    if (existing) {
      await this.db
        .update(userSettings)
        .set({ reviewedAt })
        .where(eq(userSettings.userId, userId));
    } else {
      await this.db.insert(userSettings).values({ userId, reviewedAt });
    }
    return { reviewed, reviewed_at: reviewedAt?.toISOString() ?? null };
  }

  /** Rendering/tailoring gate: data must be reviewed. */
  async isReviewed(userId: string): Promise<boolean> {
    return (await this.reviewedAt(userId)) != null;
  }

  // ---- skills ----

  async createSkill(
    userId: string,
    input: { id?: string; name: string; category?: string; aliases?: string[] },
  ): Promise<SkillRow> {
    const id = await this.uniqueId(userId, "skill", input.name, input.id);
    const row: SkillRow = {
      userId,
      id,
      name: input.name,
      category: input.category ?? "",
      aliases: input.aliases ?? [],
    };
    await this.db.transaction(async (tx) => {
      const txRepo = new GraphRepository(tx as unknown as AppDb);
      await txRepo.insertSkill(row);
      // Auto-link curated implications when both endpoints exist (by name).
      const all = await txRepo.listSkills(userId);
      const byName = new Map(all.map((skill) => [skill.name, skill.id]));
      for (const target of defaultImpliesFor(input.name)) {
        const targetId = byName.get(target);
        if (targetId) await txRepo.insertImplies(userId, id, targetId);
      }
    });
    return (await this.repo.getSkill(userId, id))!;
  }

  async updateSkill(
    userId: string,
    id: string,
    patch: { name?: string; category?: string; aliases?: string[] },
  ): Promise<SkillRow> {
    if (!(await this.repo.getSkill(userId, id))) {
      throw new NotFoundException(`Skill not found: ${id}`);
    }
    await this.repo.updateSkill(userId, id, patch);
    return (await this.repo.getSkill(userId, id))!;
  }

  async deleteSkill(userId: string, id: string): Promise<void> {
    if (!(await this.repo.getSkill(userId, id))) {
      throw new NotFoundException(`Skill not found: ${id}`);
    }
    if (await this.repo.skillUsed(userId, id)) {
      throw new BadRequestException(
        `Skill ${id} is demonstrated by achievements; remove those links first`,
      );
    }
    await this.repo.deleteSkill(userId, id);
  }

  async listImplies(userId: string) {
    return await this.repo.listImplies(userId);
  }

  async addImplies(userId: string, from: string, to: string): Promise<void> {
    await this.assertSkill(userId, from);
    await this.assertSkill(userId, to);
    if (from === to) {
      throw new BadRequestException("A skill cannot imply itself");
    }
    await this.repo.insertImplies(userId, from, to);
  }

  async deleteImplies(userId: string, from: string, to: string): Promise<void> {
    await this.repo.deleteImplies(userId, from, to);
  }

  /** Transitive implications for one skill (curated + user edges). */
  async impliedSkills(userId: string, skillId: string): Promise<string[]> {
    await this.assertSkill(userId, skillId);
    return impliedClosure(skillId, await this.repo.listImplies(userId));
  }

  private async assertSkill(userId: string, id: string): Promise<void> {
    if (!(await this.repo.getSkill(userId, id))) {
      throw new NotFoundException(`Skill not found: ${id}`);
    }
  }

  // ---- parents ----

  async listParents(userId: string, kind?: "experience" | "project") {
    return (await this.repo.listParents(userId, kind)).map((row) =>
      this.parentResponse(row),
    );
  }

  async getParent(userId: string, id: string) {
    const row = await this.repo.getParent(userId, id);
    if (!row) throw new NotFoundException(`Parent not found: ${id}`);
    return {
      ...this.parentResponse(row),
      skills: await this.repo.skillsForParent(userId, id),
    };
  }

  async createParent(
    userId: string,
    input: {
      id?: string;
      kind: "experience" | "project";
      name: string;
      title?: string;
      url?: string;
      date_range?: string;
    },
  ) {
    const id = await this.uniqueId(userId, input.kind, input.name, input.id);
    await this.repo.insertParent({
      userId,
      id,
      kind: input.kind,
      name: input.name,
      title: input.title ?? "",
      url: input.url ?? "",
      dateRange: input.date_range ?? "",
    });
    const row = (await this.repo.getParent(userId, id))!;
    return { ...this.parentResponse(row), skills: [] };
  }

  async updateParent(
    userId: string,
    id: string,
    patch: { name?: string; title?: string; url?: string; date_range?: string },
  ) {
    if (!(await this.repo.getParent(userId, id))) {
      throw new NotFoundException(`Parent not found: ${id}`);
    }
    await this.repo.updateParent(userId, id, {
      name: patch.name,
      title: patch.title,
      url: patch.url,
      dateRange: patch.date_range,
    });
    const row = (await this.repo.getParent(userId, id))!;
    return {
      ...this.parentResponse(row),
      skills: await this.repo.skillsForParent(userId, id),
    };
  }

  async deleteParent(userId: string, id: string): Promise<void> {
    if (!(await this.repo.getParent(userId, id))) {
      throw new NotFoundException(`Parent not found: ${id}`);
    }
    if (await this.repo.parentUsed(userId, id)) {
      throw new BadRequestException(
        `Parent ${id} has achievements; move or delete them first`,
      );
    }
    await this.repo.deleteParent(userId, id);
  }

  private async parentResponse(row: ParentRow) {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      title: row.title,
      url: row.url,
      date_range: row.dateRange,
    };
  }

  // ---- achievements ----

  async listAchievements(userId: string) {
    return (await this.repo.listAchievements(userId)).map((row) =>
      this.achievementResponse(row),
    );
  }

  async getSkill(userId: string, id: string) {
    const row = await this.repo.getSkill(userId, id);
    if (!row) throw new NotFoundException(`Skill not found: ${id}`);
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      aliases: row.aliases,
    };
  }

  async getAchievement(userId: string, id: string) {
    const row = await this.repo.getAchievement(userId, id);
    if (!row) throw new NotFoundException(`Achievement not found: ${id}`);
    return this.achievementResponse(row);
  }

  async createAchievement(
    userId: string,
    input: {
      id?: string;
      parent_id: string;
      text: string;
      date_range?: string;
      skills?: string[];
      metrics?: string[];
    },
  ) {
    await this.assertParent(userId, input.parent_id);
    await this.assertSkills(userId, input.skills ?? []);
    const id = await this.uniqueId(
      userId,
      "achievement",
      input.text.slice(0, 40),
      input.id,
    );
    await this.repo.insertAchievement({
      userId,
      id,
      parentId: input.parent_id,
      text: input.text,
      dateRange: input.date_range ?? "",
      skills: input.skills ?? [],
      metrics: input.metrics ?? [],
    });
    return this.achievementResponse(
      (await this.repo.getAchievement(userId, id))!,
    );
  }

  async updateAchievement(
    userId: string,
    id: string,
    patch: {
      parent_id?: string;
      text?: string;
      date_range?: string;
      skills?: string[];
      metrics?: string[];
    },
  ) {
    const current = await this.repo.getAchievement(userId, id);
    if (!current) throw new NotFoundException(`Achievement not found: ${id}`);
    if (patch.parent_id) await this.assertParent(userId, patch.parent_id);
    await this.assertSkills(userId, patch.skills ?? current.skills);
    await this.repo.updateAchievement(userId, id, {
      parentId: patch.parent_id,
      text: patch.text,
      dateRange: patch.date_range,
      skills: patch.skills,
      metrics: patch.metrics,
    });
    return this.achievementResponse(
      (await this.repo.getAchievement(userId, id))!,
    );
  }

  async deleteAchievement(userId: string, id: string): Promise<void> {
    if (!(await this.repo.getAchievement(userId, id))) {
      throw new NotFoundException(`Achievement not found: ${id}`);
    }
    await this.repo.deleteAchievement(userId, id);
  }

  private async assertParent(userId: string, id: string): Promise<void> {
    if (!(await this.repo.getParent(userId, id))) {
      throw new NotFoundException(`Parent not found: ${id}`);
    }
  }

  private async assertSkills(userId: string, ids: string[]): Promise<void> {
    for (const id of ids) await this.assertSkill(userId, id);
  }

  private async achievementResponse(row: AchievementRow) {
    return {
      id: row.id,
      parent_id: row.parentId,
      text: row.text,
      date_range: row.dateRange,
      skills: row.skills,
      metrics: row.metrics,
    };
  }

  // ---- education / certifications ----

  async listEducation(userId: string) {
    return (await this.repo.listEducation(userId)).map((row) => ({
      id: row.id,
      institution: row.institution,
      credential: row.credential,
      date_range: row.dateRange,
    }));
  }

  async createEducation(
    userId: string,
    input: {
      id?: string;
      institution: string;
      credential?: string;
      date_range?: string;
    },
  ) {
    const id = await this.uniqueId(
      userId,
      "education",
      input.institution,
      input.id,
    );
    await this.repo.insertEducation({
      userId,
      id,
      institution: input.institution,
      credential: input.credential ?? "",
      dateRange: input.date_range ?? "",
    });
    return (await this.listEducation(userId)).find((row) => row.id === id)!;
  }

  async updateEducation(
    userId: string,
    id: string,
    patch: { institution?: string; credential?: string; date_range?: string },
  ) {
    if (!(await this.repo.getEducation(userId, id))) {
      throw new NotFoundException(`Education not found: ${id}`);
    }
    await this.repo.updateEducation(userId, id, {
      institution: patch.institution,
      credential: patch.credential,
      dateRange: patch.date_range,
    });
    return (await this.listEducation(userId)).find((row) => row.id === id)!;
  }

  async deleteEducation(userId: string, id: string): Promise<void> {
    if (!(await this.repo.getEducation(userId, id))) {
      throw new NotFoundException(`Education not found: ${id}`);
    }
    await this.repo.deleteEducation(userId, id);
  }

  async listCertifications(userId: string) {
    return (await this.repo.listCertifications(userId)).map((row) => ({
      id: row.id,
      name: row.name,
      issuer: row.issuer,
      issued_on: row.issuedOn,
    }));
  }

  async createCertification(
    userId: string,
    input: { id?: string; name: string; issuer?: string; issued_on?: string },
  ) {
    const id = await this.uniqueId(
      userId,
      "certification",
      input.name,
      input.id,
    );
    await this.repo.insertCertification({
      userId,
      id,
      name: input.name,
      issuer: input.issuer ?? "",
      issuedOn: input.issued_on ?? "",
    });
    return (await this.listCertifications(userId)).find(
      (row) => row.id === id,
    )!;
  }

  async updateCertification(
    userId: string,
    id: string,
    patch: { name?: string; issuer?: string; issued_on?: string },
  ) {
    if (!(await this.repo.getCertification(userId, id))) {
      throw new NotFoundException(`Certification not found: ${id}`);
    }
    await this.repo.updateCertification(userId, id, {
      name: patch.name,
      issuer: patch.issuer,
      issuedOn: patch.issued_on,
    });
    return (await this.listCertifications(userId)).find(
      (row) => row.id === id,
    )!;
  }

  async deleteCertification(userId: string, id: string): Promise<void> {
    if (!(await this.repo.getCertification(userId, id))) {
      throw new NotFoundException(`Certification not found: ${id}`);
    }
    await this.repo.deleteCertification(userId, id);
  }

  // ---- semantic search / expansion ----

  async search(userId: string, query: string, limit: number) {
    const skills = await this.repo.listSkills(userId);
    const parents = await this.repo.listParents(userId);
    const achievements = await this.repo.listAchievements(userId);
    const skillNames = new Map(skills.map((skill) => [skill.id, skill.name]));
    const parentNames = new Map(
      parents.map((parent) => [parent.id, parent.name]),
    );
    const docs = achievements.map((achievement) => ({
      id: achievement.id,
      document: [
        achievement.text,
        parentNames.get(achievement.parentId) ?? "",
        ...achievement.skills.map((skillId) => skillNames.get(skillId) ?? ""),
      ].join(" "),
    }));
    return {
      results: searchDocs(query, docs, limit).map((hit) => {
        const achievement = achievements.find((row) => row.id === hit.id)!;
        return {
          id: achievement.id,
          text: achievement.text,
          parent_name: parentNames.get(achievement.parentId) ?? "",
          skills: achievement.skills.map(
            (skillId) => skillNames.get(skillId) ?? skillId,
          ),
          similarity: hit.similarity,
        };
      }),
    };
  }

  async explore(userId: string, skillId: string, hops: 1 | 2) {
    await this.assertSkill(userId, skillId);
    const achievements = await this.repo.listAchievements(userId);
    const adjacency = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      adjacency.get(a)!.add(b);
    };
    for (const achievement of achievements) {
      for (const a of achievement.skills) {
        for (const b of achievement.skills) {
          if (a !== b) add(a, b);
        }
        add(a, achievement.parentId);
        add(achievement.parentId, a);
      }
    }
    const skills = await this.repo.listSkills(userId);
    const names = new Map(skills.map((skill) => [skill.id, skill.name]));
    return {
      skill_id: skillId,
      hops,
      skills: expandSkillIds(skillId, adjacency, hops).map((id) => ({
        id,
        name: names.get(id) ?? id,
      })),
    };
  }

  // ---- contact (kg row wins; falls back to the auth account) ----

  async contact(userId: string, fallbackName: string, fallbackEmail: string) {
    const row = await this.repo.getContact(userId);
    if (!row) {
      return {
        name: firstNonEmpty(fallbackName, "Your Name"),
        location: "",
        phone: "",
        email: fallbackEmail,
        linkedin: "",
        github: "",
        personal_site: "",
        source: "account" as const,
      };
    }
    return {
      name: firstNonEmpty(fallbackName, "Your Name"),
      location: row.location,
      phone: row.phone,
      email: firstNonEmpty(row.email, fallbackEmail),
      linkedin: row.linkedin,
      github: row.github,
      personal_site: row.personalSite,
      source: "profile" as const,
    };
  }

  async updateContact(
    userId: string,
    patch: {
      location?: string;
      phone?: string;
      email?: string;
      linkedin?: string;
      github?: string;
      personal_site?: string;
    },
  ) {
    await this.repo.upsertContact(userId, {
      location: patch.location,
      phone: patch.phone,
      email: patch.email,
      linkedin: patch.linkedin,
      github: patch.github,
      personalSite: patch.personal_site,
    });
    return {
      updated: true,
      source: "profile" as const,
    };
  }

  // ---- soft skills ----

  async listSoftSkills(userId: string) {
    return (await this.repo.listSoftSkills(userId)).map((row) => ({
      id: row.id,
      name: row.name,
      detail: row.detail,
    }));
  }

  async createSoftSkill(
    userId: string,
    input: { id?: string; name: string; detail?: string },
  ) {
    const slug = await this.uniqueId(
      userId,
      "certification",
      input.name,
      input.id,
    );
    const id = slug.replace(/^certification_/, "softskill_");
    let unique = id;
    let counter = 2;
    while (await this.repo.getSoftSkill(userId, unique)) {
      unique = `${id}_${counter}`;
      counter += 1;
    }
    await this.repo.insertSoftSkill({
      userId,
      id: unique,
      name: input.name,
      detail: input.detail ?? "",
    });
    return { id: unique, name: input.name, detail: input.detail ?? "" };
  }

  async updateSoftSkill(
    userId: string,
    id: string,
    patch: { name?: string; detail?: string },
  ) {
    if (!(await this.repo.getSoftSkill(userId, id))) {
      throw new NotFoundException(`Soft skill not found: ${id}`);
    }
    await this.repo.updateSoftSkill(userId, id, patch);
    return (await this.listSoftSkills(userId)).find((row) => row.id === id)!;
  }

  async deleteSoftSkill(userId: string, id: string): Promise<void> {
    if (!(await this.repo.getSoftSkill(userId, id))) {
      throw new NotFoundException(`Soft skill not found: ${id}`);
    }
    await this.repo.deleteSoftSkill(userId, id);
  }

  // ---- import / export (files are transport, never storage) ----

  async exportProfile(userId: string): Promise<Record<string, unknown>> {
    const skills = await this.repo.listSkills(userId);
    const parents = await this.repo.listParents(userId);
    const achievements = await this.repo.listAchievements(userId);
    return {
      version: 2,
      reviewed_at: await this.reviewedAt(userId),
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
          role: parent.name,
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
        metrics:
          achievement.metrics.length > 0 ? achievement.metrics : undefined,
        date_range: achievement.dateRange || undefined,
      })),
      education: (await this.repo.listEducation(userId)).map((row) => ({
        id: row.id,
        institution: row.institution,
        credential: row.credential,
        date_range: row.dateRange || undefined,
      })),
      certifications: (await this.repo.listCertifications(userId)).map(
        (row) => ({
          id: row.id,
          name: row.name,
          issuer: row.issuer,
          issued_on: row.issuedOn,
        }),
      ),
      soft_skills: (await this.repo.listSoftSkills(userId)).map((row) => ({
        id: row.id,
        name: row.name,
        detail: row.detail || undefined,
      })),
      contact: await this.contactRow(userId),
      skill_implies: Object.fromEntries(
        (await this.repo.listImplies(userId)).reduce((map, edge) => {
          const list = map.get(edge.from) ?? [];
          list.push(edge.to);
          map.set(edge.from, list);
          return map;
        }, new Map<string, string[]>()),
      ),
    };
  }

  async importProfile(
    userId: string,
    input: {
      format: "yaml" | "json";
      content: string;
      mode: "replace" | "merge";
    },
  ): Promise<{ imported: Record<string, number> }> {
    let parsed: unknown;
    if (input.format === "json") {
      try {
        parsed = JSON.parse(input.content);
      } catch (error) {
        throw new BadRequestException(
          `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      try {
        parsed = parseYaml(input.content);
      } catch (error) {
        throw new BadRequestException(
          `Invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new BadRequestException("Profile document must be a mapping");
    }
    const doc = parsed as Record<string, unknown>;
    const required = [
      "skills",
      "achievements",
      "experiences",
      "projects",
    ] as const;
    const missing = required.filter((key) => !Array.isArray(doc[key]));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Profile is missing required sections: ${missing.join(", ")}`,
      );
    }

    const asArray = (value: unknown): Array<Record<string, unknown>> =>
      Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
    const str = (value: unknown, fallback = ""): string =>
      typeof value === "string" ? value : fallback;
    const strList = (value: unknown): string[] =>
      Array.isArray(value) ? value.map((item) => String(item)) : [];

    const skills = asArray(doc.skills).map((row) => ({
      id: str(row.id),
      name: str(row.name),
      category: str(row.category),
      aliases: strList(row.aliases),
    }));
    if (skills.some((skill) => !skill.id || !skill.name)) {
      throw new BadRequestException("Every skill needs id and name");
    }

    const parents: ParentRow[] = [
      ...asArray(doc.experiences).map((row) => ({
        userId,
        id: str(row.id),
        kind: "experience" as const,
        name: str(row.role) || str(row.name),
        title: str(row.title) || str(row.role),
        url: str(row.url),
        dateRange: str(row.date_range),
      })),
      ...asArray(doc.projects).map((row) => ({
        userId,
        id: str(row.id),
        kind: "project" as const,
        name: str(row.name) || str(row.role),
        title: str(row.title),
        url: str(row.url),
        dateRange: str(row.date_range),
      })),
    ];
    if (parents.some((parent) => !parent.id || !parent.name)) {
      throw new BadRequestException(
        "Every experience/project needs id and name/role",
      );
    }

    const parentIdSet = new Set(parents.map((parent) => parent.id));
    const achievements: AchievementRow[] = asArray(doc.achievements).map(
      (row) => ({
        userId,
        id: str(row.id),
        parentId: str(row.part_of),
        text: str(row.text),
        dateRange: str(row.date_range),
        skills: strList(row.skills),
        metrics: strList(row.metrics),
      }),
    );
    if (
      achievements.some(
        (achievement) =>
          !achievement.id ||
          !achievement.text ||
          !parentIdSet.has(achievement.parentId),
      )
    ) {
      throw new BadRequestException(
        "Every achievement needs id, text, and a part_of that matches an experience/project id",
      );
    }
    const skillIdSet = new Set(skills.map((skill) => skill.id));
    for (const achievement of achievements) {
      const unknownRefs = achievement.skills.filter(
        (skillId) => !skillIdSet.has(skillId),
      );
      if (unknownRefs.length > 0) {
        throw new BadRequestException(
          `Achievement ${achievement.id} references unknown skills: ${unknownRefs.join(", ")}`,
        );
      }
    }

    const education = asArray(doc.education).map((row) => ({
      userId,
      id: str(row.id),
      institution: str(row.institution),
      credential: str(row.credential),
      dateRange: str(row.date_range),
    }));
    const certifications = asArray(doc.certifications).map((row) => ({
      userId,
      id: str(row.id),
      name: str(row.name),
      issuer: str(row.issuer),
      issuedOn: str(row.issued_on),
    }));

    const softSkills = asArray(doc.soft_skills).map((row) => ({
      userId,
      id: str(row.id) || `softskill_${slugify(str(row.name))}`,
      name: str(row.name),
      detail: str(row.detail),
    }));
    if (softSkills.some((row) => !row.name)) {
      throw new BadRequestException("Every soft skill needs a name");
    }
    const contactRaw = (doc.contact ?? {}) as Record<string, unknown>;
    const contact = {
      location: str(contactRaw.location),
      phone: str(contactRaw.phone),
      email: str(contactRaw.email),
      linkedin: str(contactRaw.linkedin),
      github: str(contactRaw.github),
      personalSite: str(contactRaw.personal_site),
    };

    const impliesRaw = (doc.skill_implies ?? {}) as Record<string, unknown>;
    const implies: Array<{ from: string; to: string }> = [];
    for (const [from, targets] of Object.entries(impliesRaw)) {
      for (const to of strList(targets)) {
        if (skillIdSet.has(from) && skillIdSet.has(to)) {
          implies.push({ from, to });
        }
      }
    }

    if (input.mode === "replace") {
      await this.wipeGraph(userId);
    }

    const imported = {
      skills: 0,
      parents: 0,
      achievements: 0,
      education: 0,
      certifications: 0,
      implies: 0,
    };
    await this.db.transaction(async (tx) => {
      const txRepo = new GraphRepository(tx as unknown as AppDb);
      for (const skill of skills) {
        if (
          input.mode === "merge" &&
          (await txRepo.getSkill(userId, skill.id))
        ) {
          await txRepo.updateSkill(userId, skill.id, skill);
        } else {
          await txRepo.insertSkill({ userId, ...skill });
          imported.skills += 1;
        }
      }
      for (const parent of parents) {
        if (
          input.mode === "merge" &&
          (await txRepo.getParent(userId, parent.id))
        ) {
          await txRepo.updateParent(userId, parent.id, parent);
        } else {
          await txRepo.insertParent(parent);
          imported.parents += 1;
        }
      }
      for (const achievement of achievements) {
        if (
          input.mode === "merge" &&
          (await txRepo.getAchievement(userId, achievement.id))
        ) {
          await txRepo.updateAchievement(userId, achievement.id, achievement);
        } else {
          await txRepo.insertAchievement(achievement);
          imported.achievements += 1;
        }
      }
      for (const row of education) {
        if (
          input.mode === "merge" &&
          (await txRepo.getEducation(userId, row.id))
        ) {
          await txRepo.updateEducation(userId, row.id, row);
        } else {
          await txRepo.insertEducation(row);
          imported.education += 1;
        }
      }
      for (const row of certifications) {
        if (
          input.mode === "merge" &&
          (await txRepo.getCertification(userId, row.id))
        ) {
          await txRepo.updateCertification(userId, row.id, row);
        } else {
          await txRepo.insertCertification(row);
          imported.certifications += 1;
        }
      }
      for (const edge of implies) {
        await txRepo.insertImplies(userId, edge.from, edge.to);
        imported.implies += 1;
      }
      await txRepo.wipeAndSetSoftSkills(
        userId,
        softSkills,
        input.mode === "merge",
      );
      await txRepo.upsertContact(userId, contact);
      // Import clears the review gate: new data must be re-reviewed.
      await this.setReviewedIn(tx as unknown as AppDb, userId, false);
    });
    return { imported };
  }

  private async contactRow(userId: string) {
    const row = await this.repo.getContact(userId);
    if (!row) return undefined;
    return {
      location: row.location || undefined,
      phone: row.phone || undefined,
      email: row.email || undefined,
      linkedin: row.linkedin || undefined,
      github: row.github || undefined,
      personal_site: row.personalSite || undefined,
    };
  }

  private async wipeGraph(userId: string): Promise<void> {
    for (const row of await this.repo.listAchievements(userId)) {
      await this.repo.deleteAchievement(userId, row.id);
    }
    for (const row of await this.repo.listParents(userId)) {
      await this.repo.deleteParent(userId, row.id);
    }
    for (const row of await this.repo.listSkills(userId)) {
      await this.repo.deleteSkill(userId, row.id);
    }
    for (const row of await this.repo.listEducation(userId)) {
      await this.repo.deleteEducation(userId, row.id);
    }
    for (const row of await this.repo.listCertifications(userId)) {
      await this.repo.deleteCertification(userId, row.id);
    }
  }

  private async setReviewedIn(
    db: AppDb,
    userId: string,
    reviewed: boolean,
  ): Promise<void> {
    const reviewedAt = reviewed ? new Date() : null;
    const [existing] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    if (existing) {
      await db
        .update(userSettings)
        .set({ reviewedAt })
        .where(eq(userSettings.userId, userId));
    } else {
      await db.insert(userSettings).values({ userId, reviewedAt });
    }
  }
}

function expandSkillIds(
  startId: string,
  adjacency: Map<string, Set<string>>,
  hops: 1 | 2,
): string[] {
  let frontier = new Set([startId]);
  const seen = new Set([startId]);
  for (let hop = 0; hop < hops; hop += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const adjacent of adjacency.get(id) ?? []) next.add(adjacent);
    }
    frontier = new Set([...next].filter((id) => !seen.has(id)));
    for (const id of frontier) seen.add(id);
  }
  return [...seen].filter((id) => id !== startId).sort();
}
