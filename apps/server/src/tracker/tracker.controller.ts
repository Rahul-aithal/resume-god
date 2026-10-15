import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  SerializeOptions,
} from "@nestjs/common";
import type { Request } from "express";

import type { SessionUser } from "../auth/session.guard";
import {
  companiesListResponseSchema,
  companyDetailResponseSchema,
  companyIdParamSchema,
  companyResponseSchema,
  createCompanySchema,
  createRoleSchema,
  dashboardResponseSchema,
  listRolesQuerySchema,
  roleHistoryResponseSchema,
  roleIdParamSchema,
  roleMutationResponseSchema,
  rolesListResponseSchema,
  updateRoleSchema,
  type CreateCompanyInput,
  type CreateRoleInput,
  type ListRolesQuery,
  type UpdateRoleInput,
} from "./tracker.schemas";
import { TrackerService } from "./tracker.service";

interface AuthedRequest extends Request {
  user: SessionUser;
}

@Controller("api")
export class TrackerController {
  constructor(private readonly tracker: TrackerService) {}

  @Get("companies")
  @SerializeOptions({ schema: companiesListResponseSchema })
  async listCompanies(@Req() request: AuthedRequest) {
    return await this.tracker.listCompanies(request.user.id);
  }

  @Post("companies")
  @SerializeOptions({ schema: companyResponseSchema })
  async createCompany(
    @Req() request: AuthedRequest,
    @Body({ schema: createCompanySchema }) body: CreateCompanyInput,
  ) {
    return await this.tracker.createCompany(request.user.id, body);
  }

  @Get("dashboard")
  @SerializeOptions({ schema: dashboardResponseSchema })
  async dashboard(@Req() request: AuthedRequest) {
    return await this.tracker.dashboard(request.user.id);
  }

  @Get("companies/:companyId")
  @SerializeOptions({ schema: companyDetailResponseSchema })
  async companyDetail(
    @Req() request: AuthedRequest,
    @Param("companyId", { schema: companyIdParamSchema }) companyId: number,
  ) {
    return await this.tracker.companyDetail(request.user.id, companyId);
  }

  @Get("roles")
  @SerializeOptions({ schema: rolesListResponseSchema })
  async listRoles(
    @Req() request: AuthedRequest,
    @Query({ schema: listRolesQuerySchema }) query: ListRolesQuery,
  ) {
    return await this.tracker.listRoles(request.user.id, query);
  }

  @Post("roles")
  @SerializeOptions({ schema: roleMutationResponseSchema })
  async createRole(
    @Req() request: AuthedRequest,
    @Body({ schema: createRoleSchema }) body: CreateRoleInput,
  ) {
    return await this.tracker.createRole(request.user.id, body);
  }

  @Patch("roles/:roleId")
  @SerializeOptions({ schema: roleMutationResponseSchema })
  async updateRole(
    @Req() request: AuthedRequest,
    @Param("roleId", { schema: roleIdParamSchema }) roleId: number,
    @Body({ schema: updateRoleSchema }) body: UpdateRoleInput,
  ) {
    return await this.tracker.updateRole(request.user.id, roleId, body);
  }

  @Get("roles/:roleId/history")
  @SerializeOptions({ schema: roleHistoryResponseSchema })
  async roleHistory(
    @Req() request: AuthedRequest,
    @Param("roleId", { schema: roleIdParamSchema }) roleId: number,
  ) {
    return await this.tracker.roleHistory(request.user.id, roleId);
  }
}
