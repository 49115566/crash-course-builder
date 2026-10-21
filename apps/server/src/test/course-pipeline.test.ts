import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { courseMetadataSchema } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FakeAiProvider } from '../adapters/fake-ai/fake-ai-provider.js';
import { writeJsonAtomic } from '../adapters/fs/atomic.js';
import type { AiChunk } from '../ports/ai-provider.js';
import { assembleCourse } from '../domain/course-assembler.js';
import type { CourseIdentity } from '../domain/course.js';
import { parseOutline } from '../domain/outline-parser.js';
import { buildContinuationPrompts, buildStartingPrompt } from '../domain/prompt-builder.js';
import { createTempDirectory, makeRepository, readCourseMetadata } from './library-fixtures.js';

async function collect(stream: AsyncIterable<AiChunk>): Promise<string> {
  let text = '';

  for await (const chunk of stream) {
    text += chunk.text;
  }

  return text;
}

describe('course generation pipeline', () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempDirectory('ccb-pipeline-');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('turns a deterministic outline into valid course.md, outline.md, and meta.json', async () => {
    const repository = makeRepository(root);
    await repository.initialize();
    const created = await repository.createSubject('Computer Science');
    const subject = created.subject;
    const input = {
      subjectName: subject.name,
      topic: 'Vector Databases',
      audience: 'software engineers',
      instructions: 'Use e-commerce examples throughout.',
    };

    const startingPrompt = buildStartingPrompt(input);
    expect(startingPrompt.user).toContain('Vector Databases');

    const provider = new FakeAiProvider({ chunkSize: 31 });
    const outlineText = await collect(
      provider.streamOutline(
        {
          prompt: { system: startingPrompt.system, user: startingPrompt.user },
        },
        new AbortController().signal,
      ),
    );
    const outline = parseOutline(outlineText, {
      fallbackTitle: input.topic,
      fallbackAudience: input.audience,
    });
    const prompts = buildContinuationPrompts({
      outline,
      audience: input.audience,
      instructions: input.instructions,
    });
    const sections = [];

    for (const prompt of prompts) {
      const markdown = await collect(
        provider.streamSection(
          {
            prompt: { system: prompt.system, user: prompt.user },
            sectionNumber: prompt.sectionNumber,
            sectionTitle: prompt.sectionTitle,
          },
          new AbortController().signal,
        ),
      );
      sections.push({
        number: prompt.sectionNumber,
        title: prompt.sectionTitle,
        markdown,
      });
    }

    const identity: CourseIdentity = {
      id: '123e4567-e89b-42d3-a456-426614174010',
      subject: { id: subject.id, name: subject.name },
      topic: input.topic,
      audience: input.audience,
      instructions: input.instructions,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
      ai: { provider: 'deepseek', model: 'deepseek-chat' },
    };
    const assembled = assembleCourse({ outline, sections, identity });
    const courseFolder = path.join(root, subject.name, input.topic);

    await mkdir(courseFolder, { recursive: true, mode: 0o700 });
    await writeJsonAtomic(path.join(courseFolder, 'meta.json'), assembled.metadata);
    await writeFile(path.join(courseFolder, 'course.md'), assembled.courseMarkdown, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await writeFile(path.join(courseFolder, 'outline.md'), assembled.outlineMarkdown, {
      encoding: 'utf8',
      mode: 0o600,
    });

    const meta = courseMetadataSchema.parse(
      JSON.parse(await readFile(path.join(courseFolder, 'meta.json'), 'utf8')),
    );
    const courseMarkdown = await readFile(path.join(courseFolder, 'course.md'), 'utf8');
    const outlineMarkdown = await readFile(path.join(courseFolder, 'outline.md'), 'utf8');
    const scanned = await repository.scan();
    const scannedSubject = scanned.subjects.find((entry) => entry.id === subject.id);
    const scannedCourse = scannedSubject?.courses.find((entry) => entry.id === identity.id);

    expect(meta.stats.sections).toBe(7);
    expect(meta.stats.words).toBeGreaterThan(100);
    expect(meta.promptVersion).toBe('1');
    expect(courseMarkdown.match(/^# /gm)).toHaveLength(1);
    expect(courseMarkdown.match(/^## /gm)).toHaveLength(7);
    expect(courseMarkdown).not.toContain('mermaid');
    expect(courseMarkdown).not.toContain('example.test');
    expect(outlineMarkdown).toContain('## Course outline');
    expect(outlineMarkdown).toContain('7. **Putting it together**');
    expect(scannedCourse).toMatchObject({
      id: identity.id,
      subjectId: subject.id,
      topic: input.topic,
      title: outline.title,
      audience: input.audience,
      status: 'complete',
      stats: meta.stats,
    });
    expect(scanned.warnings).toEqual([]);
    expect((await stat(path.join(courseFolder, 'meta.json'))).mode & 0o777).toBe(0o600);
    expect((await stat(path.join(courseFolder, 'course.md'))).mode & 0o777).toBe(0o600);
    expect((await stat(path.join(courseFolder, 'outline.md'))).mode & 0o777).toBe(0o600);
    expect(await readCourseMetadata(courseFolder)).toEqual(meta);
  });
});
