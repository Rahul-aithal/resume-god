import { Inject } from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";
import { APP_DB } from "../db/database.module";

import type { AppDb } from "../db/client";
import {
  kgAchievementMetrics,
  kgAchievementSkills,
  kgAchievements,
  kgCertifications,
  kgContact,
  kgEducation,
  kgParents,
  kgSkillAliases,
  kgSkillImplies,
  kgSkills,
  kgSoftSkills,
} from "../db/schema";

export interface SkillRow {
  userId: string;
  id: string;
  name: string;
  category: string;
  aliases: string[];
}

export interface ParentRow {
  userId: string;
  id: string;
  kind: "experience" | "project";
  name: string;
  title: string;
  url: string;
  dateRange: string;
}

export interface AchievementRow {
  userId: string;
  id: string;
  parentId: string;
  text: string;
  dateRange: string;
  skills: string[];
  metrics: string[];
}

export class GraphRepository {
  constructor(
    // Type-alias params emit no metadata under Bun; explicit token required.
    @Inject(APP_DB) private readonly db: AppDb,
  ) {}

  // ---- skills ----

  async listSkills(userId: string): Promise<SkillRow[]> {
    const skills = await this.db
      .select()
      .from(kgSkills)
      .where(eq(kgSkills.userId, userId))
      .orderBy(asc(kgSkills.name));
    const aliases = await this.db
      .select()
      .from(kgSkillAliases)
      .where(eq(kgSkillAliases.userId, userId));
    const bySkill = new Map<string, string[]>();
    for (const row of aliases) {
      const list = bySkill.get(row.skillId) ?? [];
      list.push(row.alias);
      bySkill.set(row.skillId, list);
    }
    return skills.map((row) => ({
      userId: row.userId,
      id: row.id,
      name: row.name,
      category: row.category,
      aliases: bySkill.get(row.id) ?? [],
    }));
  }

  async getSkill(userId: string, id: string): Promise<SkillRow | null> {
    const [row] = await this.db
      .select()
      .from(kgSkills)
      .where(and(eq(kgSkills.userId, userId), eq(kgSkills.id, id)));
    if (!row) return null;
    const aliases = (
      await this.db
        .select()
        .from(kgSkillAliases)
        .where(
          and(
            eq(kgSkillAliases.userId, userId),
            eq(kgSkillAliases.skillId, id),
          ),
        )
    ).map((row) => row.alias);
    return {
      userId: row.userId,
      id: row.id,
      name: row.name,
      category: row.category,
      aliases,
    };
  }

  async insertSkill(row: SkillRow): Promise<void> {
    await this.db.insert(kgSkills).values({
      userId: row.userId,
      id: row.id,
      name: row.name,
      category: row.category,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    for (const alias of row.aliases)
      await this.insertAlias(row.userId, row.id, alias);
  }

  async updateSkill(
    userId: string,
    id: string,
    patch: { name?: string; category?: string; aliases?: string[] },
  ): Promise<void> {
    const columns: Record<string, string | Date> = { updatedAt: new Date() };
    if (patch.name != null) columns.name = patch.name;
    if (patch.category != null) columns.category = patch.category;
    await this.db
      .update(kgSkills)
      .set(columns)
      .where(and(eq(kgSkills.userId, userId), eq(kgSkills.id, id)));
    if (patch.aliases != null) {
      await this.db
        .delete(kgSkillAliases)
        .where(
          and(
            eq(kgSkillAliases.userId, userId),
            eq(kgSkillAliases.skillId, id),
          ),
        );
      for (const alias of patch.aliases)
        await this.insertAlias(userId, id, alias);
    }
  }

  async insertAlias(
    userId: string,
    skillId: string,
    alias: string,
  ): Promise<void> {
    await this.db.insert(kgSkillAliases).values({ userId, skillId, alias });
  }

  /** Referenced by achievements? Deletion is refused while true. */
  async skillUsed(userId: string, id: string): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(kgAchievementSkills)
      .where(
        and(
          eq(kgAchievementSkills.userId, userId),
          eq(kgAchievementSkills.skillId, id),
        ),
      );
    return row != null;
  }

  async deleteSkill(userId: string, id: string): Promise<void> {
    await this.db
      .delete(kgSkillAliases)
      .where(
        and(eq(kgSkillAliases.userId, userId), eq(kgSkillAliases.skillId, id)),
      );
    await this.db
      .delete(kgSkillImplies)
      .where(
        and(
          eq(kgSkillImplies.userId, userId),
          eq(kgSkillImplies.fromSkillId, id),
        ),
      );
    await this.db
      .delete(kgSkillImplies)
      .where(
        and(
          eq(kgSkillImplies.userId, userId),
          eq(kgSkillImplies.toSkillId, id),
        ),
      );
    await this.db
      .delete(kgSkills)
      .where(and(eq(kgSkills.userId, userId), eq(kgSkills.id, id)));
  }

  // ---- parents ----

  async listParents(
    userId: string,
    kind?: "experience" | "project",
  ): Promise<ParentRow[]> {
    const where = kind
      ? and(eq(kgParents.userId, userId), eq(kgParents.kind, kind))
      : eq(kgParents.userId, userId);
    const rows = await this.db
      .select()
      .from(kgParents)
      .where(where)
      .orderBy(asc(kgParents.name));
    return rows.map((row) => ({
      userId: row.userId,
      id: row.id,
      kind: row.kind as ParentRow["kind"],
      name: row.name,
      title: row.title,
      url: row.url,
      dateRange: row.dateRange,
    }));
  }

  async getParent(userId: string, id: string): Promise<ParentRow | null> {
    const [row] = await this.db
      .select()
      .from(kgParents)
      .where(and(eq(kgParents.userId, userId), eq(kgParents.id, id)));
    return row
      ? {
          userId: row.userId,
          id: row.id,
          kind: row.kind as ParentRow["kind"],
          name: row.name,
          title: row.title,
          url: row.url,
          dateRange: row.dateRange,
        }
      : null;
  }

  async insertParent(row: ParentRow): Promise<void> {
    await this.db.insert(kgParents).values({
      userId: row.userId,
      id: row.id,
      kind: row.kind,
      name: row.name,
      title: row.title,
      url: row.url,
      dateRange: row.dateRange,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async updateParent(
    userId: string,
    id: string,
    patch: {
      name?: string;
      title?: string;
      url?: string;
      dateRange?: string;
    },
  ): Promise<void> {
    const columns: Record<string, string | Date> = { updatedAt: new Date() };
    for (const field of ["name", "title", "url", "dateRange"] as const) {
      if (patch[field] != null) columns[field] = patch[field]!;
    }
    await this.db
      .update(kgParents)
      .set(columns)
      .where(and(eq(kgParents.userId, userId), eq(kgParents.id, id)));
  }

  async parentUsed(userId: string, id: string): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(kgAchievements)
      .where(
        and(eq(kgAchievements.userId, userId), eq(kgAchievements.parentId, id)),
      );
    return row != null;
  }

  async deleteParent(userId: string, id: string): Promise<void> {
    await this.db
      .delete(kgParents)
      .where(and(eq(kgParents.userId, userId), eq(kgParents.id, id)));
  }

  // ---- achievements ----

  async listAchievements(userId: string): Promise<AchievementRow[]> {
    const rows = await this.db
      .select()
      .from(kgAchievements)
      .where(eq(kgAchievements.userId, userId))
      .orderBy(asc(kgAchievements.id));
    const links = await this.db
      .select()
      .from(kgAchievementSkills)
      .where(eq(kgAchievementSkills.userId, userId));
    const metrics = await this.db
      .select()
      .from(kgAchievementMetrics)
      .where(eq(kgAchievementMetrics.userId, userId))
      .orderBy(asc(kgAchievementMetrics.sort));
    return rows.map((row) => ({
      userId: row.userId,
      id: row.id,
      parentId: row.parentId,
      text: row.text,
      dateRange: row.dateRange,
      skills: links
        .filter((link) => link.achievementId === row.id)
        .map((link) => link.skillId),
      metrics: metrics
        .filter((metric) => metric.achievementId === row.id)
        .map((metric) => metric.value),
    }));
  }

  async getAchievement(
    userId: string,
    id: string,
  ): Promise<AchievementRow | null> {
    return (
      (await this.listAchievements(userId)).find((row) => row.id === id) ?? null
    );
  }

  async insertAchievement(row: AchievementRow): Promise<void> {
    await this.db.insert(kgAchievements).values({
      userId: row.userId,
      id: row.id,
      parentId: row.parentId,
      text: row.text,
      dateRange: row.dateRange,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await this.replaceAchievementLinks(
      row.userId,
      row.id,
      row.skills,
      row.metrics,
    );
  }

  async updateAchievement(
    userId: string,
    id: string,
    patch: {
      parentId?: string;
      text?: string;
      dateRange?: string;
      skills?: string[];
      metrics?: string[];
    },
  ): Promise<void> {
    const columns: Record<string, string | Date> = { updatedAt: new Date() };
    if (patch.parentId != null) columns.parentId = patch.parentId;
    if (patch.text != null) columns.text = patch.text;
    if (patch.dateRange != null) columns.dateRange = patch.dateRange;
    await this.db
      .update(kgAchievements)
      .set(columns)
      .where(and(eq(kgAchievements.userId, userId), eq(kgAchievements.id, id)));
    if (patch.skills != null || patch.metrics != null) {
      const current = await this.getAchievement(userId, id);
      await this.replaceAchievementLinks(
        userId,
        id,
        patch.skills ?? current?.skills ?? [],
        patch.metrics ?? current?.metrics ?? [],
      );
    }
  }

  private async replaceAchievementLinks(
    userId: string,
    achievementId: string,
    skills: string[],
    metrics: string[],
  ): Promise<void> {
    await this.db
      .delete(kgAchievementSkills)
      .where(
        and(
          eq(kgAchievementSkills.userId, userId),
          eq(kgAchievementSkills.achievementId, achievementId),
        ),
      );
    for (const skillId of skills) {
      await this.db
        .insert(kgAchievementSkills)
        .values({ userId, achievementId, skillId });
    }
    await this.db
      .delete(kgAchievementMetrics)
      .where(
        and(
          eq(kgAchievementMetrics.userId, userId),
          eq(kgAchievementMetrics.achievementId, achievementId),
        ),
      );
    for (let sort = 0; sort < metrics.length; sort += 1) {
      await this.db
        .insert(kgAchievementMetrics)
        .values({ userId, achievementId, sort, value: metrics[sort] });
    }
  }

  async deleteAchievement(userId: string, id: string): Promise<void> {
    await this.db
      .delete(kgAchievementSkills)
      .where(
        and(
          eq(kgAchievementSkills.userId, userId),
          eq(kgAchievementSkills.achievementId, id),
        ),
      );
    await this.db
      .delete(kgAchievementMetrics)
      .where(
        and(
          eq(kgAchievementMetrics.userId, userId),
          eq(kgAchievementMetrics.achievementId, id),
        ),
      );
    await this.db
      .delete(kgAchievements)
      .where(and(eq(kgAchievements.userId, userId), eq(kgAchievements.id, id)));
  }

  /** Skills demonstrated by achievements under one parent (USES derivation). */
  async skillsForParent(userId: string, parentId: string): Promise<string[]> {
    const achievements = await this.db
      .select()
      .from(kgAchievements)
      .where(
        and(
          eq(kgAchievements.userId, userId),
          eq(kgAchievements.parentId, parentId),
        ),
      );
    if (achievements.length === 0) return [];
    const links = await this.db
      .select()
      .from(kgAchievementSkills)
      .where(
        and(
          eq(kgAchievementSkills.userId, userId),
          inArray(
            kgAchievementSkills.achievementId,
            achievements.map((row) => row.id),
          ),
        ),
      );
    return [...new Set(links.map((link) => link.skillId))].sort();
  }

  // ---- implies ----

  async listImplies(
    userId: string,
  ): Promise<Array<{ from: string; to: string }>> {
    const rows = await this.db
      .select()
      .from(kgSkillImplies)
      .where(eq(kgSkillImplies.userId, userId));
    return rows.map((row) => ({ from: row.fromSkillId, to: row.toSkillId }));
  }

  async insertImplies(userId: string, from: string, to: string): Promise<void> {
    await this.db
      .insert(kgSkillImplies)
      .values({ userId, fromSkillId: from, toSkillId: to })
      .onConflictDoNothing();
  }

  async deleteImplies(userId: string, from: string, to: string): Promise<void> {
    await this.db
      .delete(kgSkillImplies)
      .where(
        and(
          eq(kgSkillImplies.userId, userId),
          eq(kgSkillImplies.fromSkillId, from),
          eq(kgSkillImplies.toSkillId, to),
        ),
      );
  }

  // ---- education / certifications ----

  async listEducation(userId: string) {
    return await this.db
      .select()
      .from(kgEducation)
      .where(eq(kgEducation.userId, userId))
      .orderBy(asc(kgEducation.institution));
  }

  async getEducation(userId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(kgEducation)
      .where(and(eq(kgEducation.userId, userId), eq(kgEducation.id, id)));
    return row ?? null;
  }

  async insertEducation(row: {
    userId: string;
    id: string;
    institution: string;
    credential: string;
    dateRange: string;
  }): Promise<void> {
    await this.db.insert(kgEducation).values({
      ...row,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async updateEducation(
    userId: string,
    id: string,
    patch: { institution?: string; credential?: string; dateRange?: string },
  ): Promise<void> {
    const columns: Record<string, string | Date> = { updatedAt: new Date() };
    for (const field of ["institution", "credential", "dateRange"] as const) {
      if (patch[field] != null) columns[field] = patch[field]!;
    }
    await this.db
      .update(kgEducation)
      .set(columns)
      .where(and(eq(kgEducation.userId, userId), eq(kgEducation.id, id)));
  }

  async deleteEducation(userId: string, id: string): Promise<void> {
    await this.db
      .delete(kgEducation)
      .where(and(eq(kgEducation.userId, userId), eq(kgEducation.id, id)));
  }

  async listCertifications(userId: string) {
    return await this.db
      .select()
      .from(kgCertifications)
      .where(eq(kgCertifications.userId, userId))
      .orderBy(asc(kgCertifications.name));
  }

  async getCertification(userId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(kgCertifications)
      .where(
        and(eq(kgCertifications.userId, userId), eq(kgCertifications.id, id)),
      );
    return row ?? null;
  }

  async insertCertification(row: {
    userId: string;
    id: string;
    name: string;
    issuer: string;
    issuedOn: string;
  }): Promise<void> {
    await this.db.insert(kgCertifications).values({
      ...row,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async updateCertification(
    userId: string,
    id: string,
    patch: { name?: string; issuer?: string; issuedOn?: string },
  ): Promise<void> {
    const columns: Record<string, string | Date> = { updatedAt: new Date() };
    for (const field of ["name", "issuer", "issuedOn"] as const) {
      if (patch[field] != null) columns[field] = patch[field]!;
    }
    await this.db
      .update(kgCertifications)
      .set(columns)
      .where(
        and(eq(kgCertifications.userId, userId), eq(kgCertifications.id, id)),
      );
  }

  async deleteCertification(userId: string, id: string): Promise<void> {
    await this.db
      .delete(kgCertifications)
      .where(
        and(eq(kgCertifications.userId, userId), eq(kgCertifications.id, id)),
      );
  }

  // ---- contact (optional row; auth fallback handled by the service) ----

  async getContact(userId: string) {
    const [row] = await this.db
      .select()
      .from(kgContact)
      .where(eq(kgContact.userId, userId));
    return row ?? null;
  }

  async upsertContact(
    userId: string,
    patch: {
      location?: string;
      phone?: string;
      email?: string;
      linkedin?: string;
      github?: string;
      personalSite?: string;
    },
  ): Promise<void> {
    const existing = await this.getContact(userId);
    if (existing) {
      const columns: Record<string, string | Date> = { updatedAt: new Date() };
      for (const field of [
        "location",
        "phone",
        "email",
        "linkedin",
        "github",
        "personalSite",
      ] as const) {
        if (patch[field] != null) columns[field] = patch[field]!;
      }
      await this.db
        .update(kgContact)
        .set(columns)
        .where(eq(kgContact.userId, userId));
      return;
    }
    await this.db.insert(kgContact).values({
      userId,
      location: patch.location ?? "",
      phone: patch.phone ?? "",
      email: patch.email ?? "",
      linkedin: patch.linkedin ?? "",
      github: patch.github ?? "",
      personalSite: patch.personalSite ?? "",
      updatedAt: new Date(),
    });
  }

  // ---- soft skills ----

  async listSoftSkills(userId: string) {
    return await this.db
      .select()
      .from(kgSoftSkills)
      .where(eq(kgSoftSkills.userId, userId))
      .orderBy(asc(kgSoftSkills.name));
  }

  async getSoftSkill(userId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(kgSoftSkills)
      .where(and(eq(kgSoftSkills.userId, userId), eq(kgSoftSkills.id, id)));
    return row ?? null;
  }

  async insertSoftSkill(row: {
    userId: string;
    id: string;
    name: string;
    detail: string;
  }): Promise<void> {
    await this.db
      .insert(kgSoftSkills)
      .values({ ...row, createdAt: new Date(), updatedAt: new Date() });
  }

  async updateSoftSkill(
    userId: string,
    id: string,
    patch: { name?: string; detail?: string },
  ): Promise<void> {
    const columns: Record<string, string | Date> = { updatedAt: new Date() };
    for (const field of ["name", "detail"] as const) {
      if (patch[field] != null) columns[field] = patch[field]!;
    }
    await this.db
      .update(kgSoftSkills)
      .set(columns)
      .where(and(eq(kgSoftSkills.userId, userId), eq(kgSoftSkills.id, id)));
  }

  async wipeSoftSkills(userId: string): Promise<void> {
    await this.db.delete(kgSoftSkills).where(eq(kgSoftSkills.userId, userId));
  }

  /** Import helper: replace wipes first; merge upserts by id. */
  async wipeAndSetSoftSkills(
    userId: string,
    rows: Array<{ userId: string; id: string; name: string; detail: string }>,
    merge: boolean,
  ): Promise<void> {
    if (!merge) await this.wipeSoftSkills(userId);
    for (const row of rows) {
      if (merge && (await this.getSoftSkill(userId, row.id))) {
        await this.updateSoftSkill(userId, row.id, {
          name: row.name,
          detail: row.detail,
        });
      } else {
        await this.insertSoftSkill(row);
      }
    }
  }

  async deleteSoftSkill(userId: string, id: string): Promise<void> {
    await this.db
      .delete(kgSoftSkills)
      .where(and(eq(kgSoftSkills.userId, userId), eq(kgSoftSkills.id, id)));
  }
}
