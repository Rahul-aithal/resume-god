import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  SerializeOptions,
} from "@nestjs/common";
import type { Request } from "express";

import type { SessionUser } from "../auth/session.guard";
import {
  achievementCreateSchema,
  achievementResponseSchema,
  contactUpdateSchema,
  softSkillCreateSchema,
  softSkillUpdateSchema,
  achievementUpdateSchema,
  certificationCreateSchema,
  certificationUpdateSchema,
  educationCreateSchema,
  educationUpdateSchema,
  impliesEdgeSchema,
  parentCreateSchema,
  parentUpdateSchema,
  graphProjectionSchema,
  graphImportSchema,
  graphSearchQuerySchema,
  exploreQuerySchema,
  reviewResponseSchema,
  contactResponseSchema,
  skillCreateSchema,
  skillResponseSchema,
  skillUpdateSchema,
} from "./graph.schemas";
import { GraphService } from "./graph.service";

interface AuthedRequest extends Request {
  user: SessionUser;
}

@Controller("api/graph")
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  @Get()
  @SerializeOptions({ schema: graphProjectionSchema })
  async projection(@Req() request: AuthedRequest) {
    return await this.graph.projection(request.user.id);
  }

  @Get("search")
  async search(
    @Req() request: AuthedRequest,
    @Query({ schema: graphSearchQuerySchema })
    query: { q: string; limit: number },
  ) {
    return await this.graph.search(request.user.id, query.q, query.limit);
  }

  // ---- contact (falls back to auth account when no kg row exists) ----

  @Get("contact")
  @SerializeOptions({ schema: contactResponseSchema })
  async contact(@Req() request: AuthedRequest) {
    return await this.graph.contact(
      request.user.id,
      request.user.display_name,
      request.user.email,
    );
  }

  @Put("contact")
  async updateContact(
    @Req() request: AuthedRequest,
    @Body({ schema: contactUpdateSchema })
    body: {
      location?: string;
      phone?: string;
      email?: string;
      linkedin?: string;
      github?: string;
      personal_site?: string;
    },
  ) {
    return await this.graph.updateContact(request.user.id, body);
  }

  // ---- soft skills ----

  @Get("soft-skills")
  async listSoftSkills(@Req() request: AuthedRequest) {
    return await this.graph.listSoftSkills(request.user.id);
  }

  @Post("soft-skills")
  async createSoftSkill(
    @Req() request: AuthedRequest,
    @Body({ schema: softSkillCreateSchema })
    body: {
      id?: string;
      name: string;
      detail?: string;
    },
  ) {
    return await this.graph.createSoftSkill(request.user.id, body);
  }

  @Put("soft-skills/:id")
  async updateSoftSkill(
    @Req() request: AuthedRequest,
    @Param("id") id: string,
    @Body({ schema: softSkillUpdateSchema })
    body: {
      name?: string;
      detail?: string;
    },
  ) {
    return await this.graph.updateSoftSkill(request.user.id, id, body);
  }

  @Delete("soft-skills/:id")
  async deleteSoftSkill(
    @Req() request: AuthedRequest,
    @Param("id") id: string,
  ) {
    await this.graph.deleteSoftSkill(request.user.id, id);
    return { status: "deleted", id };
  }

  @Post("review")
  @SerializeOptions({ schema: reviewResponseSchema })
  async review(@Req() request: AuthedRequest) {
    return await this.graph.setReviewed(request.user.id, true);
  }

  @Delete("review")
  @SerializeOptions({ schema: reviewResponseSchema })
  async unreview(@Req() request: AuthedRequest) {
    return await this.graph.setReviewed(request.user.id, false);
  }

  // ---- skills ----

  @Post("skills")
  async createSkill(
    @Req() request: AuthedRequest,
    @Body({ schema: skillCreateSchema })
    body: {
      id?: string;
      name: string;
      category?: string;
      aliases?: string[];
    },
  ) {
    return await this.graph.createSkill(request.user.id, body);
  }

  @Get("skills/:id")
  @SerializeOptions({ schema: skillResponseSchema })
  getSkill(@Req() request: AuthedRequest, @Param("id") id: string) {
    return this.graph.getSkill(request.user.id, id);
  }

  @Put("skills/:id")
  async updateSkill(
    @Req() request: AuthedRequest,
    @Param("id") id: string,
    @Body({ schema: skillUpdateSchema })
    body: {
      name?: string;
      category?: string;
      aliases?: string[];
    },
  ) {
    return await this.graph.updateSkill(request.user.id, id, body);
  }

  @Delete("skills/:id")
  async deleteSkill(@Req() request: AuthedRequest, @Param("id") id: string) {
    await this.graph.deleteSkill(request.user.id, id);
    return { status: "deleted", id };
  }

  @Get("skills/:id/implies")
  async implies(
    @Req() request: AuthedRequest,
    @Param("id") id: string,
    @Query({ schema: exploreQuerySchema }) query: { hops: 1 | 2 },
  ) {
    return {
      skill_id: id,
      hops: query.hops,
      implied: await this.graph.impliedSkills(request.user.id, id),
    };
  }

  @Post("skill-implies")
  async addImplies(
    @Req() request: AuthedRequest,
    @Body({ schema: impliesEdgeSchema }) body: { from: string; to: string },
  ) {
    await this.graph.addImplies(request.user.id, body.from, body.to);
    return { status: "added", ...body };
  }

  @Delete("skill-implies/:from/:to")
  async deleteImplies(
    @Req() request: AuthedRequest,
    @Param("from") from: string,
    @Param("to") to: string,
  ) {
    await this.graph.deleteImplies(request.user.id, from, to);
    return { status: "deleted", from, to };
  }

  // ---- parents (experiences + projects) ----

  @Post("parents")
  async createParent(
    @Req() request: AuthedRequest,
    @Body({ schema: parentCreateSchema })
    body: {
      id?: string;
      kind: "experience" | "project";
      name: string;
      title?: string;
      url?: string;
      date_range?: string;
    },
  ) {
    return await this.graph.createParent(request.user.id, body);
  }

  @Put("parents/:id")
  async updateParent(
    @Req() request: AuthedRequest,
    @Param("id") id: string,
    @Body({ schema: parentUpdateSchema })
    body: {
      name?: string;
      title?: string;
      url?: string;
      date_range?: string;
    },
  ) {
    return await this.graph.updateParent(request.user.id, id, body);
  }

  @Delete("parents/:id")
  async deleteParent(@Req() request: AuthedRequest, @Param("id") id: string) {
    await this.graph.deleteParent(request.user.id, id);
    return { status: "deleted", id };
  }

  // ---- achievements ----

  @Post("achievements")
  async createAchievement(
    @Req() request: AuthedRequest,
    @Body({ schema: achievementCreateSchema })
    body: {
      id?: string;
      parent_id: string;
      text: string;
      date_range?: string;
      skills?: string[];
      metrics?: string[];
    },
  ) {
    return await this.graph.createAchievement(request.user.id, body);
  }

  @Get("achievements/:id")
  @SerializeOptions({ schema: achievementResponseSchema })
  getAchievement(@Req() request: AuthedRequest, @Param("id") id: string) {
    return this.graph.getAchievement(request.user.id, id);
  }

  @Put("achievements/:id")
  async updateAchievement(
    @Req() request: AuthedRequest,
    @Param("id") id: string,
    @Body({ schema: achievementUpdateSchema })
    body: {
      parent_id?: string;
      text?: string;
      date_range?: string;
      skills?: string[];
      metrics?: string[];
    },
  ) {
    return await this.graph.updateAchievement(request.user.id, id, body);
  }

  @Delete("achievements/:id")
  async deleteAchievement(
    @Req() request: AuthedRequest,
    @Param("id") id: string,
  ) {
    await this.graph.deleteAchievement(request.user.id, id);
    return { status: "deleted", id };
  }

  // ---- education / certifications ----

  @Post("education")
  async createEducation(
    @Req() request: AuthedRequest,
    @Body({ schema: educationCreateSchema })
    body: {
      id?: string;
      institution: string;
      credential?: string;
      date_range?: string;
    },
  ) {
    return await this.graph.createEducation(request.user.id, body);
  }

  @Put("education/:id")
  async updateEducation(
    @Req() request: AuthedRequest,
    @Param("id") id: string,
    @Body({ schema: educationUpdateSchema })
    body: {
      institution?: string;
      credential?: string;
      date_range?: string;
    },
  ) {
    return await this.graph.updateEducation(request.user.id, id, body);
  }

  @Delete("education/:id")
  async deleteEducation(
    @Req() request: AuthedRequest,
    @Param("id") id: string,
  ) {
    await this.graph.deleteEducation(request.user.id, id);
    return { status: "deleted", id };
  }

  @Post("certifications")
  async createCertification(
    @Req() request: AuthedRequest,
    @Body({ schema: certificationCreateSchema })
    body: {
      id?: string;
      name: string;
      issuer?: string;
      issued_on?: string;
    },
  ) {
    return await this.graph.createCertification(request.user.id, body);
  }

  @Put("certifications/:id")
  async updateCertification(
    @Req() request: AuthedRequest,
    @Param("id") id: string,
    @Body({ schema: certificationUpdateSchema })
    body: {
      name?: string;
      issuer?: string;
      issued_on?: string;
    },
  ) {
    return await this.graph.updateCertification(request.user.id, id, body);
  }

  @Delete("certifications/:id")
  async deleteCertification(
    @Req() request: AuthedRequest,
    @Param("id") id: string,
  ) {
    await this.graph.deleteCertification(request.user.id, id);
    return { status: "deleted", id };
  }

  // ---- import / export ----

  @Post("import")
  async importGraph(
    @Req() request: AuthedRequest,
    @Body({ schema: graphImportSchema })
    body: {
      format: "yaml" | "json";
      content: string;
      mode: "replace" | "merge";
    },
  ) {
    return await this.graph.importProfile(request.user.id, body);
  }

  @Get("export")
  async exportGraph(
    @Req() request: AuthedRequest,
    @Query("format") format?: string,
  ) {
    const profile = await this.graph.exportProfile(request.user.id);
    if (format === "json") {
      return { format: "json", content: profile };
    }
    // Lazy import keeps yaml off the hot path.
    const { stringify: stringifyYaml } = require("yaml") as {
      stringify: (value: unknown) => string;
    };
    return { format: "yaml", content: stringifyYaml(profile) };
  }
}
