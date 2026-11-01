import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Req,
  SerializeOptions,
} from "@nestjs/common";
import type { Request } from "express";

import { Public, type SessionUser } from "../auth/session.guard";
import {
  KNOWN_PROVIDERS,
  type ProviderName,
} from "../llm/llm-provider.interface";
import { ApiKeyService } from "./api-key.service";
import {
  apiKeysResponseSchema,
  providersStatusResponseSchema,
  saveApiKeySchema,
  type SaveApiKeyInput,
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
  constructor(
    private readonly settings: SettingsService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  private provider(value: string): ProviderName {
    if (!(KNOWN_PROVIDERS as string[]).includes(value)) {
      throw new BadRequestException(
        `Unknown provider. Use ${KNOWN_PROVIDERS.join(", ")}.`,
      );
    }
    return value as ProviderName;
  }

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

  @Get("settings/api-keys")
  @SerializeOptions({ schema: apiKeysResponseSchema })
  async listApiKeys(@Req() request: AuthedRequest) {
    return { keys: await this.apiKeys.list(request.user.id) };
  }

  @Put("settings/api-keys/:provider")
  @SerializeOptions({ schema: apiKeysResponseSchema })
  async saveApiKey(
    @Req() request: AuthedRequest,
    @Param("provider") provider: string,
    @Body({ schema: saveApiKeySchema }) body: SaveApiKeyInput,
  ) {
    return {
      keys: await this.apiKeys.save(
        request.user.id,
        this.provider(provider),
        body.api_key,
      ),
    };
  }

  @Delete("settings/api-keys/:provider")
  @SerializeOptions({ schema: apiKeysResponseSchema })
  async removeApiKey(
    @Req() request: AuthedRequest,
    @Param("provider") provider: string,
  ) {
    return {
      keys: await this.apiKeys.remove(request.user.id, this.provider(provider)),
    };
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
