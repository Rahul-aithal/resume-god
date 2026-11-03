import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  SerializeOptions,
} from "@nestjs/common";
import type { Request, Response } from "express";

import type { SessionUser } from "../auth/session.guard";
import { TailorJobsService } from "./tailor-jobs.service";
import { TailorService } from "./tailor.service";
import { TypstRenderService } from "./typst-render.service";
import {
  RenderRequestDto,
  RetryTailorJobDto,
  ReviewRequestDto,
  TailorJobRequestDto,
  TailorRequestDto,
} from "./dto/tailor.dto";

interface AuthedRequest extends Request {
  user: SessionUser;
}

@Controller("api")
export class TailorController {
  constructor(
    private readonly tailorService: TailorService,
    private readonly jobs: TailorJobsService,
    private readonly typst: TypstRenderService,
  ) {}

  @Post("tailor")
  async tailor(@Req() request: AuthedRequest, @Body() body: TailorRequestDto) {
    return await this.tailorService.tailor(
      request.user.id,
      { display_name: request.user.display_name, email: request.user.email },
      body,
    );
  }

  /** Accepts the work and returns at once; the worker does the tailoring. */
  @Post("tailor/jobs")
  @HttpCode(202)
  async createJob(
    @Req() request: AuthedRequest,
    @Body() body: TailorJobRequestDto,
  ) {
    return await this.jobs.enqueue(request.user, body);
  }

  @Get("tailor/jobs")
  async listJobs(@Req() request: AuthedRequest) {
    return await this.jobs.list(request.user.id);
  }

  @Get("tailor/jobs/:jobId")
  async getJob(@Req() request: AuthedRequest, @Param("jobId") jobId: string) {
    return await this.jobs.get(request.user.id, jobId);
  }

  /** Queues a failed job again, optionally with edited input. */
  @Post("tailor/jobs/:jobId/retry")
  @HttpCode(202)
  async retryJob(
    @Req() request: AuthedRequest,
    @Param("jobId") jobId: string,
    @Body() body: RetryTailorJobDto,
  ) {
    return await this.jobs.retry(request.user, jobId, body.request);
  }

  @Post("review")
  async reviewEdits(
    @Req() request: AuthedRequest,
    @Body() body: ReviewRequestDto,
  ) {
    const { rejected } = await this.tailorService.reviewEdits(
      request.user.id,
      body.plan,
      body.edits,
    );
    // Rebuilt so accepted edits reach the PDF, and re-checked for grounding.
    const { resume_data, validation } = await this.tailorService.resumeFromPlan(
      request.user.id,
      request.user,
      body.plan,
      { font: body.font, summary: body.edits.summary },
    );
    if (body.job_id) {
      await this.jobs.saveReview(request.user.id, body.job_id, {
        plan: body.plan,
        resume_data,
        validation,
      });
    }
    return {
      plan: body.plan,
      rejected_edits: rejected,
      resume_data,
      validation,
    };
  }

  @Post("render")
  @HttpCode(200)
  async renderTypst(
    @Req() request: AuthedRequest,
    @Res({ passthrough: false }) response: Response,
    @Body() body: RenderRequestDto,
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
