import { Injectable } from "@nestjs/common";

import { TrackerRepository } from "./tracker.repository";

@Injectable()
export class TrackerService {
  constructor(private readonly tracker: TrackerRepository) {}

  async listCompanies(userId: string) {
    return { companies: await this.tracker.listCompanies(userId) };
  }

  async createCompany(
    userId: string,
    input: Parameters<TrackerRepository["createCompany"]>[1],
  ) {
    return await this.tracker.createCompany(userId, input);
  }

  async companyDetail(userId: string, companyId: number) {
    return await this.tracker.companyDetail(userId, companyId);
  }

  async listRoles(
    userId: string,
    query: Parameters<TrackerRepository["listRoles"]>[1],
  ) {
    return { roles: await this.tracker.listRoles(userId, query) };
  }

  async createRole(
    userId: string,
    input: Parameters<TrackerRepository["createRole"]>[1],
  ) {
    return await this.tracker.createRole(userId, input);
  }

  async updateRole(
    userId: string,
    roleId: number,
    patch: Parameters<TrackerRepository["updateRole"]>[2],
  ) {
    return await this.tracker.updateRole(userId, roleId, patch);
  }

  async roleHistory(userId: string, roleId: number) {
    return await this.tracker.roleHistory(userId, roleId);
  }

  async dashboard(userId: string) {
    return await this.tracker.dashboard(userId);
  }
}
