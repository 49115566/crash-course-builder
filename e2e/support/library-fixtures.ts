import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { libraryRoot } from './library-paths';

export interface SeededCourse {
  id: string;
  topic: string;
  title: string;
  audience: string;
  readingMinutes: number;
  folderName: string;
}

export async function seedCourse(
  subjectName: string,
  overrides: Partial<SeededCourse> = {},
): Promise<SeededCourse> {
  const course: SeededCourse = {
    id: '123e4567-e89b-42d3-a456-426614174010',
    topic: 'Vector Databases',
    title: 'Vector Databases: A Crash Course',
    audience: 'software engineers',
    readingMinutes: 22,
    folderName: 'Vector Databases',
    ...overrides,
  };

  const subjectPath = path.join(libraryRoot(), subjectName);
  const subjectMetadata = JSON.parse(
    await readFile(path.join(subjectPath, '.subject.json'), 'utf8'),
  ) as { id: string; name: string };

  const coursePath = path.join(subjectPath, course.folderName);
  await mkdir(coursePath, { recursive: true });
  await writeFile(
    path.join(coursePath, 'meta.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        id: course.id,
        subject: { id: subjectMetadata.id, name: subjectMetadata.name },
        topic: course.topic,
        title: course.title,
        audience: course.audience,
        instructions: 'Use practical examples',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
        status: 'complete',
        ai: { provider: 'deepseek', model: 'deepseek-chat' },
        promptVersion: '1',
        stats: { sections: 7, words: 4820, readingMinutes: course.readingMinutes },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await writeFile(path.join(coursePath, 'course.md'), '# Vector Databases\n\nA course.\n', 'utf8');
  await writeFile(
    path.join(coursePath, 'outline.md'),
    '# Vector Databases\n\n1. Foundations\n',
    'utf8',
  );

  return course;
}

export async function readLibraryOrder(): Promise<string[]> {
  const contents = await readFile(
    path.join(libraryRoot(), '.crash-course-builder', 'library.json'),
    'utf8',
  );
  return (JSON.parse(contents) as { subjectIds: string[] }).subjectIds;
}
