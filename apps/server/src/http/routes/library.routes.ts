import { Router } from 'express';
import {
  createSubjectRequestSchema,
  deleteCourseRequestSchema,
  deleteSubjectRequestSchema,
  moveCourseRequestSchema,
  renameSubjectRequestSchema,
  reorderSubjectsRequestSchema,
} from '@ccb/contracts';

import type { LibraryService } from '../../app/library-service.js';
import { asyncHandler } from '../async-handler.js';
import { getRequestId, sendSuccess } from '../response.js';
import { parseBody, parseCourseId, parseSubjectId } from '../validation.js';

export function createLibraryRouter(service: LibraryService): Router {
  const router = Router();

  router.get(
    '/library',
    asyncHandler(async (_request, response) => {
      const library = await service.getLibrary();
      sendSuccess(
        response,
        { subjects: library.subjects, totalCourses: library.totalCourses },
        getRequestId(response),
        library.warnings,
      );
    }),
  );

  router.post(
    '/subjects',
    asyncHandler(async (request, response) => {
      const input = parseBody(request, createSubjectRequestSchema);
      const result = await service.createSubject(input.name);
      sendSuccess(
        response,
        { subject: result.subject },
        getRequestId(response),
        result.warnings,
        201,
      );
    }),
  );

  router.put(
    '/subjects/order',
    asyncHandler(async (request, response) => {
      const input = parseBody(request, reorderSubjectsRequestSchema);
      const result = await service.reorderSubjects(input.subjectIds);
      sendSuccess(
        response,
        { subjectIds: result.subjectIds },
        getRequestId(response),
        result.warnings,
      );
    }),
  );

  router.patch(
    '/subjects/:id',
    asyncHandler(async (request, response) => {
      const id = parseSubjectId(request);
      const input = parseBody(request, renameSubjectRequestSchema);
      const result = await service.renameSubject(id, input.name);
      sendSuccess(response, { subject: result.subject }, getRequestId(response), result.warnings);
    }),
  );

  router.delete(
    '/subjects/:id',
    asyncHandler(async (request, response) => {
      const id = parseSubjectId(request);
      const input = parseBody(request, deleteSubjectRequestSchema);
      const result = await service.deleteSubject(id, {
        cascade: input.cascade,
        ...(input.confirmName === undefined ? {} : { confirmName: input.confirmName }),
      });
      sendSuccess(
        response,
        { deletedId: result.deletedId, deletedCourses: result.deletedCourses },
        getRequestId(response),
        result.warnings,
      );
    }),
  );

  router.post(
    '/courses/:id/move',
    asyncHandler(async (request, response) => {
      const courseId = parseCourseId(request);
      const input = parseBody(request, moveCourseRequestSchema);
      const result = await service.moveCourse(courseId, input.subjectId);
      sendSuccess(response, { course: result.course }, getRequestId(response), result.warnings);
    }),
  );

  router.delete(
    '/courses/:id',
    asyncHandler(async (request, response) => {
      const courseId = parseCourseId(request);
      parseBody(request, deleteCourseRequestSchema);
      const result = await service.deleteCourse(courseId);
      sendSuccess(
        response,
        { deletedId: result.deletedId },
        getRequestId(response),
        result.warnings,
      );
    }),
  );

  return router;
}
