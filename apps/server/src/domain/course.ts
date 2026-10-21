import type { PriorCourseRef } from '@ccb/contracts';

export interface CourseInput {
  subjectName: string;
  topic: string;
  audience: string;
  instructions?: string;
  priorCourses?: readonly PriorCourseRef[];
}

export interface CourseIdentity {
  id: string;
  subject: {
    id: string;
    name: string;
  };
  topic: string;
  audience: string;
  instructions?: string;
  createdAt: string;
  updatedAt: string;
  ai: {
    provider: 'deepseek';
    model: string;
  };
}

export interface SectionDraft {
  number: number;
  title: string;
  markdown: string;
}

export class CourseAssemblyError extends Error {
  readonly sectionNumber?: number;

  constructor(message: string, options: { sectionNumber?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'CourseAssemblyError';

    if (options.sectionNumber !== undefined) {
      this.sectionNumber = options.sectionNumber;
    }
  }
}
