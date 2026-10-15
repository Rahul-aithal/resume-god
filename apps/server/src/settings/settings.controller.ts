import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  SerializeOptions,
} from "@nestjs/common";
import type { Request } from "express";

import { Public, type SessionUser } from "../auth/session.guard";
import {
  providersStatusResponseSchema,
  updateSettingsSchema,
  userSettingsResponseSchema,
  type UpdateSettingsInput,
} from "./settings.schema";
import { SettingsService } from "./settings.service";

interface AuthedRequest extends Request {
  user: SessionUser;
}

@Controller("api")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get("health")
  async health() {
    return { status: "ok" };
  }

  @Get("providers")
  @SerializeOptions({ schema: providersStatusResponseSchema })
  async providers(@Req() request: AuthedRequest) {
    return await this.settings.providerStatus(request.user.id);
  }

  @Get("settings")
  @SerializeOptions({ schema: userSettingsResponseSchema })
  async getSettings(@Req() request: AuthedRequest) {
    return await this.settings.get(request.user.id);
  }

  @Put("settings")
  @SerializeOptions({ schema: userSettingsResponseSchema })
  async updateSettings(
    @Req() request: AuthedRequest,
    @Body({ schema: updateSettingsSchema }) body: UpdateSettingsInput,
  ) {
    return await this.settings.update(request.user.id, body);
  }
}
