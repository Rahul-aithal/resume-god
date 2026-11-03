/**
 * resume.docx exporter — content from the knowledge-graph tables,
 * styling ported from the user's docx-js reference script
 * (Arial, dark/mid/light palette, bordered section headers,
 * pipe-separated role headers, tight bullets).
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  UnderlineType,
} from "docx";

import type { GraphRepository } from "../graph/graph.repository";
import {
  DOCX_BULLET_INDENT,
  DOCX_COLOR_DARK,
  DOCX_COLOR_LIGHT,
  DOCX_COLOR_LINK,
  DOCX_COLOR_MID,
  DOCX_FONT,
  DOCX_PAGE_MARGIN,
  DOCX_PAGE_SIZE,
  DOCX_SECTION_RULE,
  DOCX_SIZE_NAME,
  DOCX_SIZE_NORMAL,
  DOCX_SIZE_SECTION,
  DOCX_SPACING,
} from "./constants/docx.constants";

function run(
  text: string,
  opts: {
    bold?: boolean;
    italics?: boolean;
    color?: string;
    size?: number;
  } = {},
): TextRun {
  return new TextRun({
    text,
    font: DOCX_FONT,
    size: opts.size ?? DOCX_SIZE_NORMAL,
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color ?? DOCX_COLOR_MID,
  });
}

function sectionHeader(text: string): Paragraph {
  return new Paragraph({
    spacing: DOCX_SPACING.sectionHeading,
    border: {
      bottom: { style: BorderStyle.SINGLE, ...DOCX_SECTION_RULE },
    },
    children: [
      run(text, {
        bold: true,
        color: DOCX_COLOR_DARK,
        size: DOCX_SIZE_SECTION,
      }),
    ],
  });
}

function bullet(runs: TextRun[] | string): Paragraph {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: DOCX_SPACING.bullet,
    children: Array.isArray(runs) ? runs : [run(runs)],
  });
}

function link(text: string, url: string): ExternalHyperlink {
  return new ExternalHyperlink({
    link: url,
    children: [
      new TextRun({
        text,
        font: DOCX_FONT,
        size: DOCX_SIZE_NORMAL,
        color: DOCX_COLOR_LINK,
        underline: { type: UnderlineType.SINGLE },
      }),
    ],
  });
}

function roleHeader(
  company: string,
  title: string,
  location: string,
  dates: string,
): Paragraph {
  return new Paragraph({
    spacing: DOCX_SPACING.entryHeading,
    children: [
      run(company, { bold: true, color: DOCX_COLOR_DARK }),
      ...(title
        ? [
            run("  |  ", { color: DOCX_COLOR_LIGHT }),
            run(title, { italics: true }),
          ]
        : []),
      ...[location, dates]
        .filter(Boolean)
        .map((part) => run(`  |  ${part}`, { color: DOCX_COLOR_LIGHT })),
    ],
  });
}

function techStack(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: DOCX_SPACING.entryDetail,
    children: [
      run(`${label}: `, { bold: true, color: DOCX_COLOR_DARK }),
      run(value),
    ],
  });
}

function projectHeader(
  name: string,
  stack: string,
  date: string,
  url: string,
): Paragraph {
  const children: Array<TextRun | ExternalHyperlink> = [
    run(name, { bold: true, color: DOCX_COLOR_DARK }),
  ];
  if (stack)
    children.push(
      run(`  (${stack})`, { color: DOCX_COLOR_LIGHT, italics: true }),
    );
  if (date) children.push(run(`  |  ${date}`, { color: DOCX_COLOR_LIGHT }));
  if (url) {
    children.push(run("  "));
    children.push(link(url, url));
  }
  return new Paragraph({ spacing: DOCX_SPACING.entryHeading, children });
}

export interface DocxContact {
  name: string;
  location: string;
  phone: string;
  email: string;
  linkedin: string;
  github: string;
  personal_site: string;
}

/** Normalized like the PDF template: full URLs, bare domains, or handles. */
function asUrl(value: string, base = "https://"): string {
  return /^https?:\/\//.test(value) ? value : `${base}${value}`;
}

/** The fields a resume needs, whichever path produced them. */
export interface DocxResume {
  contact: DocxContact;
  summary?: string;
  skills: Array<{ category: string; names: string[] }>;
  sections: Array<Record<string, unknown>>;
  education: Array<Record<string, unknown>>;
  certifications: Array<Record<string, unknown>>;
  soft_skills: Array<{ name: string; detail: string }>;
}

/** The whole graph as a resume, for GET /api/render/docx. */
export async function buildResumeDocx(
  userId: string,
  repo: GraphRepository,
  contact: DocxContact,
): Promise<Buffer> {
  const skills = await repo.listSkills(userId);
  const parents = await repo.listParents(userId);
  const achievements = await repo.listAchievements(userId);
  const skillNames = new Map(skills.map((skill) => [skill.id, skill.name]));
  const bulletsOf = (parentId: string) =>
    achievements
      .filter((row) => row.parentId === parentId)
      .map((row) => row.text);

  const byCategory = new Map<string, string[]>();
  for (const skill of skills) {
    const category = skill.category || "Other";
    byCategory.set(category, [...(byCategory.get(category) ?? []), skill.name]);
  }

  const sections: DocxResume["sections"] = [];
  for (const parent of parents) {
    if (parent.kind === "experience") {
      sections.push({
        kind: "experience",
        organization: parent.name,
        role: parent.title,
        dates: parent.dateRange,
        bullets: bulletsOf(parent.id),
      });
    } else if (parent.kind === "project") {
      sections.push({
        kind: "project",
        name: parent.name,
        tech_stack: (await repo.skillsForParent(userId, parent.id))
          .map((id) => skillNames.get(id) ?? id)
          .join(", "),
        dates: parent.dateRange,
        url: parent.url,
        bullets: bulletsOf(parent.id),
      });
    }
  }

  return docxFromResume({
    contact,
    skills: [...byCategory]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, names]) => ({ category, names })),
    sections,
    education: (await repo.listEducation(userId)).map((row) => ({
      degree: row.credential,
      institution: row.institution,
      dates: row.dateRange,
    })),
    certifications: await repo.listCertifications(userId),
    soft_skills: await repo.listSoftSkills(userId),
  });
}

export async function docxFromResume(resume: DocxResume): Promise<Buffer> {
  const { contact } = resume;
  const text = (value: unknown) => String(value ?? "");
  const contactLine = [contact.location, contact.phone, contact.email]
    .filter(Boolean)
    .join("  |  ");

  const links: Array<[string, string]> = [];
  if (contact.linkedin) links.push(["LinkedIn", asUrl(contact.linkedin)]);
  if (contact.github) {
    links.push(["GitHub", asUrl(contact.github, "https://github.com/")]);
  }
  if (contact.personal_site) {
    links.push(["Portfolio", asUrl(contact.personal_site)]);
  }
  const headerChildren: Array<TextRun | ExternalHyperlink> = [];
  if (contactLine) {
    headerChildren.push(
      run(links.length > 0 ? `${contactLine}  |  ` : contactLine, {
        color: DOCX_COLOR_LIGHT,
      }),
    );
  }
  links.forEach(([label, url], index) => {
    if (index > 0)
      headerChildren.push(run("  |  ", { color: DOCX_COLOR_LIGHT }));
    headerChildren.push(link(label, url));
  });

  const children: Paragraph[] = [
    new Paragraph({
      spacing: DOCX_SPACING.contact,
      children: [
        run(contact.name, {
          bold: true,
          color: DOCX_COLOR_DARK,
          size: DOCX_SIZE_NAME,
        }),
      ],
    }),
  ];
  if (headerChildren.length > 0) {
    children.push(
      new Paragraph({
        spacing: DOCX_SPACING.summary,
        children: headerChildren,
      }),
    );
  }

  if (resume.summary) {
    children.push(sectionHeader("Summary"));
    children.push(
      new Paragraph({
        spacing: DOCX_SPACING.summary,
        children: [run(resume.summary)],
      }),
    );
  }

  const bulletsOf = (section: Record<string, unknown>) =>
    ((section.bullets as string[] | undefined) ?? []).map((line) =>
      bullet(line),
    );

  const experience = resume.sections.filter((row) => row.kind === "experience");
  if (experience.length > 0) {
    children.push(sectionHeader("Experience"));
    for (const section of experience) {
      children.push(
        roleHeader(
          text(section.organization),
          text(section.role),
          text(section.location),
          text(section.dates),
        ),
        ...bulletsOf(section),
      );
    }
  }

  const projects = resume.sections.filter((row) => row.kind === "project");
  if (projects.length > 0) {
    children.push(sectionHeader("Projects"));
    for (const section of projects) {
      const url = text(section.url);
      children.push(
        projectHeader(
          text(section.name),
          text(section.tech_stack),
          text(section.dates),
          url && asUrl(url),
        ),
        ...bulletsOf(section),
      );
    }
  }

  if (resume.skills.length > 0) {
    children.push(sectionHeader("Technical Skills"));
    for (const { category, names } of resume.skills) {
      children.push(techStack(category || "Other", names.join(", ")));
    }
  }

  if (resume.education.length > 0) {
    children.push(sectionHeader("Education"));
    for (const row of resume.education) {
      const dates = text(row.dates);
      children.push(
        new Paragraph({
          spacing: DOCX_SPACING.listItem,
          children: [
            run(text(row.degree) || text(row.institution), {
              bold: true,
              color: DOCX_COLOR_DARK,
            }),
            run(
              `  -  ${text(row.institution)}${dates ? `  |  ${dates}` : ""}`,
              {
                color: DOCX_COLOR_LIGHT,
              },
            ),
          ],
        }),
      );
    }
  }

  if (resume.certifications.length > 0) {
    children.push(sectionHeader("Certifications"));
    for (const row of resume.certifications) {
      children.push(
        bullet([
          run(text(row.name), { color: DOCX_COLOR_DARK }),
          run(row.issuer ? ` - ${text(row.issuer)}` : "", {
            color: DOCX_COLOR_LIGHT,
          }),
        ]),
      );
    }
  }

  if (resume.soft_skills.length > 0) {
    children.push(sectionHeader("Soft Skills"));
    for (const row of resume.soft_skills) {
      children.push(
        bullet([
          run(row.name, { bold: true, color: DOCX_COLOR_DARK }),
          run(row.detail ? ` - ${row.detail}` : ""),
        ]),
      );
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: DOCX_BULLET_INDENT } },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: { run: { font: DOCX_FONT, size: DOCX_SIZE_NORMAL } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: DOCX_PAGE_SIZE,
            margin: {
              top: DOCX_PAGE_MARGIN,
              right: DOCX_PAGE_MARGIN,
              bottom: DOCX_PAGE_MARGIN,
              left: DOCX_PAGE_MARGIN,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc) as unknown as Promise<Buffer>;
}
