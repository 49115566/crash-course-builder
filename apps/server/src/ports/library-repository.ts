import type { CourseSummary, LibraryData, ScanWarning, SubjectSummary } from '@ccb/contracts';

export interface LibrarySnapshot extends LibraryData {
  warnings: ScanWarning[];
}

export interface SubjectMutationResult {
  subject: SubjectSummary;
  warnings: ScanWarning[];
}

export interface CourseMutationResult {
  course: CourseSummary;
  warnings: ScanWarning[];
}

export interface DeleteCourseResult {
  deletedId: string;
  warnings: ScanWarning[];
}

export interface DeleteSubjectResult {
  deletedId: string;
  deletedCourses: number;
  warnings: ScanWarning[];
}

export interface DeleteSubjectOptions {
  cascade: boolean;
  confirmName?: string;
}

export interface LibraryRepository {
  initialize(): Promise<void>;
  scan(): Promise<LibrarySnapshot>;
  createSubject(name: string): Promise<SubjectMutationResult>;
  renameSubject(id: string, name: string): Promise<SubjectMutationResult>;
  reorderSubjects(subjectIds: string[]): Promise<{ subjectIds: string[]; warnings: ScanWarning[] }>;
  moveCourse(courseId: string, subjectId: string): Promise<CourseMutationResult>;
  deleteCourse(courseId: string): Promise<DeleteCourseResult>;
  deleteSubject(id: string, options: DeleteSubjectOptions): Promise<DeleteSubjectResult>;
}
