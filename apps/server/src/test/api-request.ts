import { MUTATION_HEADER_NAME, MUTATION_HEADER_VALUE } from '@ccb/contracts';
import request from 'supertest';

export function apiRequest(app: Parameters<typeof request.agent>[0]) {
  return request.agent(app).set(MUTATION_HEADER_NAME, MUTATION_HEADER_VALUE);
}
