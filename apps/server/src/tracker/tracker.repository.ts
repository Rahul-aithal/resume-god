import { Inject, Injectable } from "@nestjs/common";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { APP_DB } from "../db/database.module";
import type { AppDb } from "../db/client";
import { applications, artifacts, companies, roles } from "../db/schema";
import {
  DASHBOARD_RECENT_ARTIFACTS,
  DASHBOARD_RECENT_ROLES,
  DEFAULT_ROLE_STATUS,
} from "./constants/tracker.constants";

type CompanyRow = typeof companies.$inferSelect;
type RoleRow = typeof roles.$inferSelect;
type ApplicationRow = typeof applications.$inferSelect;

const iso = (date: Date | null | undefined) =>
  date ? date.toISOString() : null;

export interface CompanyInput {
  name: string;
  website?: string;
  location?: string;
  about?: string;
  notes?: string;
}

export interface RoleInput {
  company_id: number;
  target_title: string;
  status?: string;
  job_url?: string;
  salary?: string;
  location?: string;
  notes?: string;
}

export interface RolePatch {
  status?: string;
  job_url?: string;
  salary?: string;
  location?: string;
  notes?: string;
}

@Injectable()
export class TrackerRepository {
  constructor(@Inject(APP_DB) private readonly db: AppDb) {}

  // ---- companies ----

  async listCompanies(userId: string) {
    const counts = await this.db
      .select({ companyId: roles.companyId, count: sql<number>`count(*)` })
      .from(roles)
      .where(eq(roles.userId, userId))
      .groupBy(roles.companyId);
    const byCompany = new Map(
      counts.map((c) => [c.companyId, Number(c.count)]),
    );
    const rows = await this.db
      .select()
      .from(companies)
      .where(eq(companies.userId, userId))
      .orderBy(asc(companies.name));
    return rows.map((row) => this.company(row, byCompany.get(row.id) ?? 0));
  }

  async createCompany(userId: string, input: CompanyInput) {
    const [existing] = await this.db
      .select()
      .from(companies)
      .where(and(eq(companies.userId, userId), eq(companies.name, input.name)));
    const now = new Date();
    if (!existing) {
      const [row] = await this.db
        .insert(companies)
        .values({
          userId,
          name: input.name,
          website: input.website ?? "",
          location: input.location ?? "",
          about: input.about ?? "",
          notes: input.notes ?? "",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return this.company(row);
    }
    const patch: Partial<typeof companies.$inferInsert> = { updatedAt: now };
    for (const field of ["website", "location", "about", "notes"] as const) {
      const value = input[field];
      if (value != null) patch[field] = value;
    }
    const [row] = await this.db
      .update(companies)
      .set(patch)
      .where(eq(companies.id, existing.id))
      .returning();
    return this.company(row);
  }

  async companyDetail(userId: string, companyId: number) {
    const company = await this.getCompany(userId, companyId);
    const roleRows = await this.db
      .select()
      .from(roles)
      .where(and(eq(roles.userId, userId), eq(roles.companyId, companyId)))
      .orderBy(desc(roles.createdAt));
    const byStatus: Record<string, number> = {};
    for (const role of roleRows) {
      byStatus[role.status] = (byStatus[role.status] ?? 0) + 1;
    }
    return {
      ...this.company(company, roleRows.length),
      roles: roleRows.map((row) => this.role(row, company.name)),
      by_status: byStatus,
    };
  }

  // ---- roles ----

  async listRoles(
    userId: string,
    options: {
      company_id?: number;
      status?: string;
      limit: number;
      offset: number;
    },
  ) {
    const filters = [eq(roles.userId, userId)];
    if (options.company_id != null) {
      filters.push(eq(roles.companyId, options.company_id));
    }
    if (options.status) {
      filters.push(eq(roles.status, options.status));
    }
    const rows = await this.db
      .select({ role: roles, companyName: companies.name })
      .from(roles)
      .innerJoin(companies, eq(roles.companyId, companies.id))
      .where(and(...filters))
      .orderBy(desc(roles.createdAt))
      .limit(options.limit)
      .offset(options.offset);
    return rows.map(({ role, companyName }) => this.role(role, companyName));
  }

  async createRole(userId: string, input: RoleInput) {
    await this.getCompany(userId, input.company_id);
    const [duplicate] = await this.db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.userId, userId),
          eq(roles.companyId, input.company_id),
          eq(roles.targetTitle, input.target_title),
        ),
      );
    if (duplicate) {
      throw new ConflictException(
        "This company already has a role with that title",
      );
    }
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [role] = await tx
        .insert(roles)
        .values({
          userId,
          companyId: input.company_id,
          targetTitle: input.target_title,
          status: input.status ?? DEFAULT_ROLE_STATUS,
          jobUrl: input.job_url ?? "",
          salary: input.salary ?? "",
          location: input.location ?? "",
          notes: input.notes ?? "",
          createdAt: now,
        })
        .returning();
      await tx.insert(applications).values({
        userId,
        roleId: role.id,
        status: role.status,
        jobUrl: role.jobUrl,
        salary: role.salary,
        location: role.location,
        notes: role.notes,
        createdAt: now,
      });
      return this.role(role);
    });
  }

  async updateRole(userId: string, roleId: number, patch: RolePatch) {
    const role = await this.getRole(userId, roleId);
    const columns: Partial<typeof roles.$inferInsert> = {};
    let changedStatus = false;
    const fieldMap = {
      status: "status",
      job_url: "jobUrl",
      salary: "salary",
      location: "location",
      notes: "notes",
    } as const;
    for (const field of [
      "status",
      "job_url",
      "salary",
      "location",
      "notes",
    ] as const) {
      const value = patch[field];
      if (value == null) continue;
      if (field === "status" && value !== role.status) changedStatus = true;
      columns[fieldMap[field]] = value;
    }
    return this.db.transaction(async (tx) => {
      let updated = role;
      if (Object.keys(columns).length > 0) {
        const [row] = await tx
          .update(roles)
          .set(columns)
          .where(eq(roles.id, roleId))
          .returning();
        updated = row;
      }
      if (changedStatus) {
        await tx.insert(applications).values({
          userId,
          roleId: updated.id,
          status: updated.status,
          jobUrl: updated.jobUrl,
          salary: updated.salary,
          location: updated.location,
          notes: updated.notes,
          createdAt: new Date(),
        });
      }
      return this.role(updated);
    });
  }

  async roleHistory(userId: string, roleId: number) {
    const role = await this.getRole(userId, roleId);
    const rows = await this.db
      .select()
      .from(applications)
      .where(eq(applications.roleId, role.id))
      .orderBy(asc(applications.createdAt), asc(applications.id));
    return {
      role: this.role(role),
      history: rows.map((row) => this.application(row)),
    };
  }

  // ---- dashboard ----

  async dashboard(userId: string) {
    const [companyCountRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(companies)
      .where(eq(companies.userId, userId));
    const [roleCountRow] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(roles)
      .where(eq(roles.userId, userId));
    const byStatusRows = await this.db
      .select({ status: roles.status, count: sql<number>`count(*)` })
      .from(roles)
      .where(eq(roles.userId, userId))
      .groupBy(roles.status);
    const byStatus: Record<string, number> = {};
    for (const { status, count } of byStatusRows)
      byStatus[status] = Number(count);
    const recent = await this.db
      .select({ role: roles, companyName: companies.name })
      .from(roles)
      .innerJoin(companies, eq(roles.companyId, companies.id))
      .where(eq(roles.userId, userId))
      .orderBy(desc(roles.createdAt))
      .limit(DASHBOARD_RECENT_ROLES);
    const artifactRows = await this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.userId, userId))
      .orderBy(desc(artifacts.createdAt))
      .limit(DASHBOARD_RECENT_ARTIFACTS);
    return {
      company_count: Number(companyCountRow?.count ?? 0),
      role_count: Number(roleCountRow?.count ?? 0),
      by_status: byStatus,
      recent_roles: recent.map(({ role, companyName }) =>
        this.role(role, companyName),
      ),
      recent_artifacts: artifactRows.map((row) => ({
        id: row.id,
        kind: row.kind,
        path: row.path,
        created_at: iso(row.createdAt),
      })),
    };
  }

  // ---- helpers ----

  async getCompany(userId: string, companyId: number): Promise<CompanyRow> {
    const [company] = await this.db
      .select()
      .from(companies)
      .where(and(eq(companies.userId, userId), eq(companies.id, companyId)));
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }

  private async getRole(userId: string, roleId: number): Promise<RoleRow> {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(and(eq(roles.userId, userId), eq(roles.id, roleId)));
    if (!role) throw new NotFoundException("Role not found");
    return role;
  }

  private company(row: CompanyRow, roleCount = 0) {
    return {
      id: row.id,
      name: row.name,
      website: row.website,
      location: row.location,
      about: row.about,
      notes: row.notes,
      role_count: roleCount,
      created_at: iso(row.createdAt),
      updated_at: iso(row.updatedAt),
    };
  }

  private role(row: RoleRow, companyName?: string) {
    return {
      id: row.id,
      company_id: row.companyId,
      target_title: row.targetTitle,
      status: row.status,
      job_url: row.jobUrl,
      salary: row.salary,
      location: row.location,
      notes: row.notes,
      created_at: iso(row.createdAt),
      ...(companyName !== undefined ? { company_name: companyName } : {}),
    };
  }

  private application(row: ApplicationRow) {
    return {
      id: row.id,
      role_id: row.roleId,
      status: row.status,
      job_url: row.jobUrl,
      salary: row.salary,
      location: row.location,
      applied_on: row.appliedOn,
      notes: row.notes,
      created_at: iso(row.createdAt),
    };
  }
}
