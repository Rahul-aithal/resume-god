import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  SerializeOptions,
} from "@nestjs/common";
import type { Request, Response } from "express";

import type { SessionUser } from "../auth/session.guard";
import {
  renderTypstRequestSchema,
  reviewRequestSchema,
  tailorRequestSchema,
} from "./tailor.schemas";
import { TailorService } from "./tailor.service";
import { TypstRenderService } from "./typst-render.service";

interface AuthedRequest extends Request {
  user: SessionUser;
}

@Controller("api")
export class TailorController {
  constructor(
    private readonly tailorService: TailorService,
    private readonly typst: TypstRenderService,
  ) {}

  @Post("tailor")
  async tailor(
    @Req() request: AuthedRequest,
    @Body({ schema: tailorRequestSchema })
    body: {
      jd_text: string;
      target_title?: string;
      max_achievements?: number;
      provider?: string;
      font?: string;
      summary?: string;
    },
  ) {
    return await this.tailorService.tailor(
      request.user.id,
      { display_name: request.user.display_name, email: request.user.email },
      body,
    );
  }

  @Post("review")
  async reviewEdits(
    @Req() request: AuthedRequest,
    @Body({ schema: reviewRequestSchema })
    body: {
      plan: Record<string, unknown>;
      edits: { rewritten_text: Record<string, string>; summary?: string };
    },
  ) {
    const { rejected } = await this.tailorService.reviewEdits(
      request.user.id,
      body.plan,
      body.edits,
    );
    return {
      plan: body.plan,
      rejected_edits: rejected,
    };
  }

  @Post("render")
  @HttpCode(200)
  async renderTypst(
    @Req() request: AuthedRequest,
    @Res({ passthrough: false }) response: Response,
    @Body({ schema: renderTypstRequestSchema })
    body: {
      resume_data: Record<string, unknown>;
    },
  ) {
    const pdf = await this.typst.compilePdf(
      body.resume_data as unknown as Parameters<
        TypstRenderService["compilePdf"]
      >[0],
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="resume.pdf"',
    );
    response.send(pdf);
  }
}
