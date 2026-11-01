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

const FONT = "Arial";
const SIZE_NORMAL = 22; // half-points → 11pt
const SIZE_NAME = 36; // 18pt
const SIZE_SECTION = 24; // 12pt
const DARK = "1A1A1A";
const MID = "333333";
const LIGHT = "666666";
const LINK = "1155CC";

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
    font: FONT,
    size: opts.size ?? SIZE_NORMAL,
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color ?? MID,
  });
}

function sectionHeader(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 180, after: 60 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "2C2C2C", space: 2 },
    },
    children: [run(text, { bold: true, color: DARK, size: SIZE_SECTION })],
  });
}

function bullet(runs: TextRun[] | string): Paragraph {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 35, after: 35 },
    children: Array.isArray(runs) ? runs : [run(runs)],
  });
}

function link(text: string, url: string): ExternalHyperlink {
  return new ExternalHyperlink({
    link: url,
    children: [
      new TextRun({
        text,
        font: FONT,
        size: SIZE_NORMAL,
        color: LINK,
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
    spacing: { before: 140, after: 40 },
    children: [
      run(company, { bold: true, color: DARK }),
      run("  |  ", { color: LIGHT }),
      run(title, { italics: true }),
      run("  |  ", { color: LIGHT }),
      run([location, dates].filter(Boolean).join("  |  "), { color: LIGHT }),
    ],
  });
}

function techStack(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [run(`${label}: `, { bold: true, color: DARK }), run(value)],
  });
}

function projectHeader(
  name: string,
  stack: string,
  date: string,
  url: string,
): Paragraph {
  const children: Array<TextRun | ExternalHyperlink> = [
    run(name, { bold: true, color: DARK }),
  ];
  if (stack)
    children.push(run(`  (${stack})`, { color: LIGHT, italics: true }));
  if (date) children.push(run(`  |  ${date}`, { color: LIGHT }));
  if (url) {
    children.push(run("  "));
    children.push(link(url, url));
  }
  return new Paragraph({ spacing: { before: 140, after: 40 }, children });
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

export async function buildResumeDocx(
  userId: string,
  repo: GraphRepository,
  contact: DocxContact,
): Promise<Buffer> {
  const skills = await repo.listSkills(userId);
  const parents = await repo.listParents(userId);
  const achievements = await repo.listAchievements(userId);
  const education = await repo.listEducation(userId);
  const certifications = await repo.listCertifications(userId);
  const softSkills = await repo.listSoftSkills(userId);

  const skillNames = new Map(skills.map((skill) => [skill.id, skill.name]));
  const contactLine = [contact.location, contact.phone, contact.email]
    .filter(Boolean)
    .join("  |  ");

  const headerChildren: Array<TextRun | ExternalHyperlink | Paragraph> = [];
  if (contactLine) {
    headerChildren.push(run(contactLine + "  |  ", { color: LIGHT }));
  }
  const links: Array<[string, string]> = [];
  if (contact.linkedin) links.push(["LinkedIn", contact.linkedin]);
  if (contact.github) links.push(["GitHub", contact.github]);
  if (contact.personal_site) links.push(["Portfolio", contact.personal_site]);
  links.forEach(([label, url], index) => {
    if (index > 0) headerChildren.push(run("  |  ", { color: LIGHT }));
    headerChildren.push(link(label, url));
  });

  const children: Paragraph[] = [
    new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [
        run(contact.name, { bold: true, color: DARK, size: SIZE_NAME }),
      ],
    }),
  ];
  if (headerChildren.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 0, after: 80 },
        children: headerChildren,
      }),
    );
  }

  // ---- Experience ----
  const experiences = parents.filter((parent) => parent.kind === "experience");
  if (experiences.length > 0) {
    children.push(sectionHeader("Experience"));
    for (const parent of experiences) {
      children.push(
        roleHeader(parent.name, parent.title, "", parent.dateRange),
      );
      for (const achievement of achievements.filter(
        (row) => row.parentId === parent.id,
      )) {
        children.push(bullet(achievement.text));
      }
    }
  }

  // ---- Projects ----
  const projects = parents.filter((parent) => parent.kind === "project");
  if (projects.length > 0) {
    children.push(sectionHeader("Projects"));
    for (const parent of projects) {
      const stack = (await repo.skillsForParent(userId, parent.id))
        .map((id) => skillNames.get(id) ?? id)
        .join(", ");
      children.push(
        projectHeader(parent.name, stack, parent.dateRange, parent.url),
      );
      for (const achievement of achievements.filter(
        (row) => row.parentId === parent.id,
      )) {
        children.push(bullet(achievement.text));
      }
    }
  }

  // ---- Technical Skills ----
  if (skills.length > 0) {
    children.push(sectionHeader("Technical Skills"));
    const byCategory = new Map<string, string[]>();
    for (const skill of skills) {
      const category = skill.category || "Other";
      const list = byCategory.get(category) ?? [];
      list.push(skill.name);
      byCategory.set(category, list);
    }
    for (const [category, names] of [...byCategory].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      children.push(techStack(category, names.join(", ")));
    }
  }

  // ---- Education ----
  if (education.length > 0) {
    children.push(sectionHeader("Education"));
    for (const row of education) {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 30 },
          children: [
            run(row.credential || row.institution, { bold: true, color: DARK }),
            run(
              `  -  ${row.institution}${
                row.dateRange ? `  |  ${row.dateRange}` : ""
              }`,
              { color: LIGHT },
            ),
          ],
        }),
      );
    }
  }

  // ---- Certifications ----
  if (certifications.length > 0) {
    children.push(sectionHeader("Certifications"));
    for (const row of certifications) {
      children.push(
        bullet([
          run(row.name, { color: DARK }),
          run(row.issuer ? ` - ${row.issuer}` : "", { color: LIGHT }),
        ]),
      );
    }
  }

  // ---- Soft Skills ----
  if (softSkills.length > 0) {
    children.push(sectionHeader("Soft Skills"));
    for (const row of softSkills) {
      children.push(
        bullet([
          run(`${row.name}`, { bold: true, color: DARK }),
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
              style: { paragraph: { indent: { left: 480, hanging: 280 } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: { document: { run: { font: FONT, size: SIZE_NORMAL } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1008, right: 1008, bottom: 1008, left: 1008 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc) as unknown as Promise<Buffer>;
}
