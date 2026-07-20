import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { Initv4170ResponseSchema } from './api';

export const AdminMigrationPath: OpenAPIPath = {
  '/admin/initv4170': {
    post: {
      summary: 'Migrate model management data for V4.17.0',
      description: 'Runs the idempotent V4.17.0 model management migration.',
      tags: [DevApiTagsMap.adminModels],
      responses: {
        200: {
          description: 'Migration completed',
          content: { 'application/json': { schema: Initv4170ResponseSchema } }
        }
      }
    }
  }
};
