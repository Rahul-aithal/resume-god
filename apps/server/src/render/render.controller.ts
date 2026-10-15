import { Controller, Get, Header, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import type { SessionUser } from "../auth/session.guard";
import { GraphRepository } from "../graph/graph.repository";
import { GraphService } from "../graph/graph.service";
import { buildResumeDocx } from "./docx-exporter";

interface AuthedRequest extends Request {
  user: SessionUser;
}

@Controller("api/render")
export class RenderController {
  constructor(
    private readonly graph: GraphService,
    private readonly repo: GraphRepository,
  ) {}

  /** resume.docx built from the user's knowledge graph. */
  @Get("docx")
  @Header(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  )
  async docx(
    @Req() request: AuthedRequest,
    @Res({ passthrough: false }) response: Response,
  ) {
    const contact = await this.graph.contact(
      request.user.id,
      request.user.display_name,
      request.user.email,
    );
    const buffer = await buildResumeDocx(request.user.id, this.repo, contact);
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="resume.docx"',
    );
    response.send(buffer);
  }
}
