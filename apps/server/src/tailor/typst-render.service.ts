import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { ResumeData } from "../pipeline/resume-data";

const TEMPLATE = resolve(import.meta.dir, "../render/template/resume-v2.typ");

@Injectable()
export class TypstRenderService {
  // Bun does not emit design:paramtypes for symbol tokens; explicit is required.
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async compilePdf(resumeData: ResumeData): Promise<Buffer> {
    const bin =
      this.config.get<string>("TYPST_BIN")?.trim() ||
      process.env.TYPST_BIN?.trim() ||
      "typst";
    const dir = mkdtempSync(join(tmpdir(), "resume-typst-"));
    const source = join(dir, "resume-v2.typ");
    const data = join(dir, "resume-data.json");
    const output = join(dir, "resume.pdf");
    try {
      writeFileSync(source, readFileSync(TEMPLATE, "utf8"));
      writeFileSync(data, JSON.stringify(resumeData));

      const proc = Bun.spawn([bin, "compile", source, output], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exit = await proc.exited;
      if (exit !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new BadRequestException(
          `Typst compilation failed: ${stderr.slice(0, 800)}`,
        );
      }
      return readFileSync(output);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        `Typst render failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }
}
