import { Inject, Injectable } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { SettingsService } from "../settings/settings.service";
import { GraphService } from "../graph/graph.service";
import { buildProfileView } from "../graph/profile-view";
import { APP_DB } from "../db/database.module";
import type { AppDb } from "../db/client";
import { GraphRepository } from "../graph/graph.repository";
import { searchDocs, type SearchDoc } from "../graph/graph-search";
import {
  LlmProviderChainService,
  type LlmProvider,
} from "../llm/provider-chain.service";
import {
  parseJobDescription,
  type ParsedJobDescription,
} from "../pipeline/jd-parser";
import { buildTailoringPlan, type TailoringPlan } from "../pipeline/tailor";
import {
  buildResumeData,
  validateResumeData,
  type ContactView,
  type ResumeData,
} from "../pipeline/resume-data";
import { rewritePlan } from "../pipeline/rewrite";

export interface StageInfo {
  requested: string;
  used: string;
  fallback_error: string | null;
}

export interface TailorResult {
  plan: TailoringPlan;
  resume_data: ResumeData;
  validation: {
    dropped_bullets: string[];
    fallback_bullets: string[];
    issues: string[];
  };
  providers: Record<string, StageInfo>;
}

@Injectable()
export class TailorService {
  constructor(
    private readonly chain: LlmProviderChainService,
    private readonly settings: SettingsService,
    private readonly graph: GraphService,
    private readonly repo: GraphRepository,
    // Bun does not emit design:paramtypes for symbol tokens; explicit is required.
    @Inject(APP_DB) private readonly db: AppDb,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private async orderFor(userId: string): Promise<string[]> {
    const settings = await this.settings.get(userId);
    return settings.llm_order
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private async semanticSearch(
    userId: string,
    query: string,
    limit: number,
  ): Promise<Array<{ id: string; similarity: number }>> {
    const skills = await this.repo.listSkills(userId);
    const parents = await this.repo.listParents(userId);
    const skillNames = new Map(skills.map((skill) => [skill.id, skill.name]));
    const parentNames = new Map(
      parents.map((parent) => [parent.id, parent.name]),
    );
    const docs: SearchDoc[] = (await this.repo.listAchievements(userId)).map(
      (achievement) => ({
        id: achievement.id,
        document: [
          achievement.text,
          parentNames.get(achievement.parentId) ?? "",
          ...achievement.skills.map((id) => skillNames.get(id) ?? ""),
        ].join(" "),
      }),
    );
    return searchDocs(query, docs, limit);
  }

  async tailor(
    userId: string,
    account: { display_name: string; email: string },
    input: {
      jd_text: string;
      target_title?: string;
      max_achievements?: number;
      provider?: string;
      font?: string;
      summary?: string;
    },
  ): Promise<TailorResult> {
    const order = await this.orderFor(userId);
    const choice = input.provider ?? "auto";
    const font = firstNonEmptyInput(
      input.font,
      (await this.settings.get(userId)).default_font,
    );

    const impliesEdges = await this.repo.listImplies(userId);
    const contact: ContactView = await this.graph.contact(
      userId,
      account.display_name,
      account.email,
    );

    const providers: Record<string, StageInfo> = {};

    // ---- 1. parse ----
    const parseList = this.chain.resolveList(choice, order);
    const parseResult = await this.chain.attemptEach(
      parseList.providers,
      async (provider: LlmProvider | null) => {
        const parsed: ParsedJobDescription = await parseJobDescription(
          await this.profileView(userId),
          input.jd_text,
          { provider, targetTitle: input.target_title ?? null },
        );
        const ok = parsed.provider !== "deterministic";
        return {
          result: parsed,
          ok,
          detail: parsed.provider_fallback_error ?? "",
        };
      },
    );
    const parsed = parseResult.result;
    providers.parsing = {
      requested: choice,
      used: parseResult.used,
      fallback_error:
        [parseList.error ?? "", ...parseResult.errors]
          .filter(Boolean)
          .join("; ") || null,
    };

    // ---- 2. plan ----
    const profileView = await this.profileView(userId);
    const plan = await buildTailoringPlan(profileView, input.jd_text, {
      // User-requested title wins; buildTailoringPlan 400s on mismatch.
      targetTitle: firstNonEmptyInput(input.target_title, parsed.role_title),
      maxAchievements: input.max_achievements ?? 10,
      parsedJobDescription: parsed as unknown as Record<string, unknown>,
      searchBullets: (query, limit) =>
        this.semanticSearch(userId, query, limit),
      impliesEdges,
    });

    // ---- 3. rewrite (LLM, deterministic fallback) ----
    const rewriteList = this.chain.resolveList(choice, order);
    const rewriteResult = await this.chain.attemptEach(
      rewriteList.providers,
      async (provider) => {
        const rewritten = (await rewritePlan(
          plan as unknown as Parameters<typeof rewritePlan>[0],
          profileView,
          provider,
        )) as unknown as {
          rewrite_provider: string;
          rewrite_provider_fallback_error?: string;
          ranking: Array<{ achievement_id: string }>;
          selected_parents: Array<{
            kind: string;
            id: string;
            achievement_ids: string[];
          }>;
          selected_achievements: Array<Record<string, unknown>>;
          target_title: string;
          matched_skills: Array<{ id: string }>;
        };
        const ok = rewritten.rewrite_provider !== "deterministic";
        return {
          result: rewritten,
          ok,
          detail: rewritten.rewrite_provider_fallback_error ?? "",
        };
      },
    );
    const rewritten = rewriteResult.result as unknown as TailoringPlan & {
      rewrite_provider_fallback_error?: string;
    };
    providers.rewriting = {
      requested: choice,
      used: rewriteResult.used,
      fallback_error:
        [rewriteList.error ?? "", ...rewriteResult.errors]
          .filter(Boolean)
          .join("; ") || null,
    };

    // ---- 4. resume-data + grounding ----
    const techStackByParent: Record<string, string> = {};
    for (const parent of await this.repo.listParents(userId)) {
      const names: string[] = [];
      for (const id of await this.repo.skillsForParent(userId, parent.id)) {
        const skill = await this.repo.getSkill(userId, id);
        names.push(skill?.name ?? id);
      }
      techStackByParent[parent.id] = names.join(", ");
    }

    const resumeData = buildResumeData(
      rewritten as unknown as Parameters<typeof buildResumeData>[0],
      profileView,
      contact,
      {
        font,
        summary: input.summary ?? null,
        techStackByParent,
      },
    );
    const validation = validateResumeData(
      resumeData,
      {
        achievements: profileView.achievements.map((item) => ({
          id: String(item.id),
          text: String(item.text ?? ""),
          part_of: item.part_of ? String(item.part_of) : undefined,
        })),
      },
      (sourceText, rewrittenText, achievement) => {
        const { validateRewrite } = lazyRewrite();
        return validateRewrite(
          sourceText,
          rewrittenText,
          achievement,
          profileView,
        );
      },
    );

    return {
      plan: rewritten,
      resume_data: validation.data,
      validation: {
        dropped_bullets: validation.dropped_bullets,
        fallback_bullets: validation.fallback_bullets,
        issues: validation.issues,
      },
      providers,
    };
  }

  /** Re-check reviewed rewrite edits; rejected ids fall back to source. */
  async reviewEdits(
    userId: string,
    plan: Record<string, unknown>,
    edits: { rewritten_text: Record<string, string> },
  ): Promise<{ rejected: string[] }> {
    const profileView = await this.profileView(userId);
    const achievements = new Map(
      profileView.achievements.map((item) => [String(item.id), item]),
    );
    const rewrites = (plan.rewrites ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const rejected: string[] = [];
    for (const [achievementId, edit] of Object.entries(edits.rewritten_text)) {
      const achievement = achievements.get(achievementId);
      if (!achievement) {
        throw new BadRequestException(
          `Reviewed plan references unknown achievement: ${achievementId}`,
        );
      }
      const record = rewrites[achievementId];
      if (!record) continue;
      const sourceText = String(achievement.text);
      if (record.source_text !== sourceText) {
        throw new BadRequestException(
          `Reviewed plan edits reviewed facts for ${achievementId}: only rewritten_text may be reviewed.`,
        );
      }
      const { validateRewrite } = lazyRewrite();
      const verdict = validateRewrite(
        sourceText,
        edit,
        achievement,
        profileView,
      );
      if (verdict.passed) {
        record.rewritten_text = edit;
        record.used_rewrite = true;
        record.validation_passed = true;
        record.issues = [];
      } else {
        rejected.push(achievementId);
        record.rewritten_text = sourceText;
        record.used_rewrite = false;
        record.validation_passed = false;
        record.issues = verdict.issues.map(
          (issue) =>
            `review edit rejected, fell back to reviewed original: ${issue}`,
        );
      }
    }
    const usedCount = Object.values(rewrites).filter(
      (record) => record.used_rewrite === true,
    ).length;
    plan.rewrite_summary = {
      selected_achievement_count: Object.keys(rewrites).length,
      used_rewrite_count: usedCount,
      fallback_count: Object.keys(rewrites).length - usedCount,
    };
    return { rejected };
  }

  private profileView(userId: string) {
    return buildProfileView(userId, this.repo, false).then(async (view) => ({
      ...view,
      reviewed: await this.graph.isReviewed(userId),
    }));
  }
}

import { validateRewrite } from "../pipeline/rewrite";

function lazyRewrite() {
  return { validateRewrite };
}

function firstNonEmptyInput(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}
