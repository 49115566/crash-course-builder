import {
  LIBRARY_SCHEMA_VERSION,
  PROMPT_VERSION,
  courseMetadataSchema,
  type CourseMetadata,
  type CourseStats,
  type ParsedOutline,
} from '@ccb/contracts';

import { CourseAssemblyError, type CourseIdentity, type SectionDraft } from './course.js';
import {
  collapseBlankLines,
  rewriteHeadings,
  stripDangerousBlockHtml,
  stripImages,
  stripMermaidFences,
  stripOuterFence,
  stripTableOfContentsBlocks,
} from './markdown-text.js';
import { renderCourseCover, renderOutlineMarkdown, sectionHeading } from './outline-renderer.js';
import { countWords, readingMinutes } from './word-count.js';

export interface AssembleCourseInput {
  outline: ParsedOutline;
  sections: readonly SectionDraft[];
  identity: CourseIdentity;
}

export interface AssembledCourse {
  courseMarkdown: string;
  outlineMarkdown: string;
  metadata: CourseMetadata;
  stats: CourseStats;
}

export function assembleCourse(input: AssembleCourseInput): AssembledCourse {
  const drafts = matchSections(input.outline, input.sections);
  const courseSections = input.outline.sections.map((section) => {
    const draft = drafts.get(section.number);

    if (draft === undefined) {
      throw new CourseAssemblyError(
        `Section ${String(section.number)} is missing and the course cannot be assembled.`,
        { sectionNumber: section.number },
      );
    }

    return normalizeSection(section.number, section.title, draft.markdown);
  });

  const courseMarkdown = `${collapseBlankLines(
    [renderCourseCover(input.outline), ...courseSections].join('\n\n'),
  )}\n`;

  const words = countWords(courseMarkdown);
  const stats: CourseStats = {
    sections: input.outline.sections.length,
    words,
    readingMinutes: readingMinutes(words),
  };
  const instructions = input.identity.instructions?.trim();

  const metadata: CourseMetadata = courseMetadataSchema.parse({
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    id: input.identity.id,
    subject: {
      id: input.identity.subject.id,
      name: input.identity.subject.name,
    },
    topic: input.identity.topic,
    title: input.outline.title,
    audience: input.identity.audience,
    ...(instructions === undefined || instructions.length === 0 ? {} : { instructions }),
    createdAt: input.identity.createdAt,
    updatedAt: input.identity.updatedAt,
    status: 'complete',
    ai: {
      provider: 'deepseek',
      model: input.identity.ai.model,
    },
    promptVersion: PROMPT_VERSION,
    stats,
  });

  return {
    courseMarkdown,
    outlineMarkdown: renderOutlineMarkdown(input.outline),
    metadata,
    stats,
  };
}

function matchSections(
  outline: ParsedOutline,
  sections: readonly SectionDraft[],
): Map<number, SectionDraft> {
  if (sections.length !== outline.sections.length) {
    throw new CourseAssemblyError(
      `The course has ${String(outline.sections.length)} outline sections but ${String(sections.length)} generated sections.`,
    );
  }

  const expected = new Set(outline.sections.map((section) => section.number));
  const drafts = new Map<number, SectionDraft>();

  for (const section of sections) {
    if (!Number.isInteger(section.number) || !expected.has(section.number)) {
      throw new CourseAssemblyError(
        `Generated section ${String(section.number)} does not match the approved outline.`,
        { sectionNumber: section.number },
      );
    }

    if (drafts.has(section.number)) {
      throw new CourseAssemblyError(
        `Generated section ${String(section.number)} appears more than once.`,
        { sectionNumber: section.number },
      );
    }

    drafts.set(section.number, section);
  }

  for (const section of outline.sections) {
    if (!drafts.has(section.number)) {
      throw new CourseAssemblyError(
        `Section ${String(section.number)} is missing and the course cannot be assembled.`,
        { sectionNumber: section.number },
      );
    }
  }

  return drafts;
}

function normalizeSection(number: number, title: string, markdown: string): string {
  let content = stripOuterFence(markdown);
  content = stripTableOfContentsBlocks(content);
  content = stripMermaidFences(content);
  content = stripImages(content);
  content = stripDangerousBlockHtml(content);

  let removedSectionHeading = false;
  content = rewriteHeadings(content, (line, heading) => {
    if (heading.depth === 1) {
      return null;
    }

    if (heading.depth === 2) {
      if (!removedSectionHeading) {
        removedSectionHeading = true;
        return null;
      }

      return `### ${heading.text}`;
    }

    return line;
  });

  const body = collapseBlankLines(content);

  if (body.length === 0) {
    throw new CourseAssemblyError(
      `Section ${String(number)} was generated with no content. Resume generation to try that section again.`,
      { sectionNumber: number },
    );
  }

  return `${sectionHeading(number, title)}\n\n${body}`;
}
