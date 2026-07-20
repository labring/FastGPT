import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  CreateEvaluationFormSchema,
  CreateEvaluationResponseSchema,
  ListEvaluationsBodySchema,
  ListEvaluationsResponseSchema
} from './api';

export const AppEvaluationPath: OpenAPIPath = {
  '/core/app/evaluation/create': {
    post: {
      summary: 'Create application evaluation',
      description: 'Uploads a CSV dataset and starts an application evaluation task',
      tags: [DevApiTagsMap.appOther],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: CreateEvaluationFormSchema
          }
        }
      },
      responses: {
        200: {
          description: 'Evaluation task created successfully',
          content: {
            'application/json': { schema: CreateEvaluationResponseSchema }
          }
        }
      }
    }
  },
  '/core/app/evaluation/list': {
    post: {
      summary: 'List application evaluations',
      description: 'Lists evaluation tasks visible to the current team member',
      tags: [DevApiTagsMap.appOther],
      requestBody: {
        content: {
          'application/json': { schema: ListEvaluationsBodySchema }
        }
      },
      responses: {
        200: {
          description: 'Evaluation task list',
          content: {
            'application/json': { schema: ListEvaluationsResponseSchema }
          }
        }
      }
    }
  }
};
