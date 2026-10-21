export type OutlineIssueCode =
  | 'EMPTY'
  | 'TOO_LARGE'
  | 'UNPARSEABLE'
  | 'TOO_FEW_SECTIONS'
  | 'TOO_MANY_SECTIONS'
  | 'EMPTY_TITLE'
  | 'DUPLICATE_TITLE';

export interface OutlineIssue {
  code: OutlineIssueCode;
  message: string;
  sectionNumber?: number;
  title?: string;
}

export class OutlineError extends Error {
  readonly code = 'OUTLINE_INVALID' as const;
  readonly issues: OutlineIssue[];

  constructor(message: string, issues: OutlineIssue[] = []) {
    super(message);
    this.name = 'OutlineError';
    this.issues = issues;
  }
}
