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
  companyResponseSchema,
  dashboardResponseSchema,
  roleHistoryResponseSchema,
  roleMutationResponseSchema,
  rolesListResponseSchema,
} from "./tracker.schemas";
import { TrackerService } from "./tracker.service";
import {
  CompanyIdParamDto,
  CreateCompanyDto,
  CreateRoleDto,
  ListRolesQueryDto,
  RoleIdParamDto,
  UpdateRoleDto,
} from "./dto/tracker.dto";

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
    @Body() body: CreateCompanyDto,
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
    @Param() { companyId }: CompanyIdParamDto,
  ) {
    return await this.tracker.companyDetail(request.user.id, companyId);
  }

  @Get("roles")
  @SerializeOptions({ schema: rolesListResponseSchema })
  async listRoles(
    @Req() request: AuthedRequest,
    @Query() query: ListRolesQueryDto,
  ) {
    return await this.tracker.listRoles(request.user.id, query);
  }

  @Post("roles")
  @SerializeOptions({ schema: roleMutationResponseSchema })
  async createRole(@Req() request: AuthedRequest, @Body() body: CreateRoleDto) {
    return await this.tracker.createRole(request.user.id, body);
  }

  @Patch("roles/:roleId")
  @SerializeOptions({ schema: roleMutationResponseSchema })
  async updateRole(
    @Req() request: AuthedRequest,
    @Param() { roleId }: RoleIdParamDto,
    @Body() body: UpdateRoleDto,
  ) {
    return await this.tracker.updateRole(request.user.id, roleId, body);
  }

  @Get("roles/:roleId/history")
  @SerializeOptions({ schema: roleHistoryResponseSchema })
  async roleHistory(
    @Req() request: AuthedRequest,
    @Param() { roleId }: RoleIdParamDto,
  ) {
    return await this.tracker.roleHistory(request.user.id, roleId);
  }
}
