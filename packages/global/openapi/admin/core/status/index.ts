import type { OpenAPIPath } from '../../../type';
import {
  GetStatusOverviewResponseSchema,
  GetTrainingRecordListBodySchema,
  GetTrainingRecordListResponseSchema,
  GetTrainingTaskListResponseSchema,
  TrainingActionBodySchema,
  TrainingActionResponseSchema
} from './api';
import { DevApiTagsMap } from '../../../tag';

export const StatusPath: OpenAPIPath = {
  '/admin/status/overview': {
    get: {
      summary: '获取 Chunk 训练总览告警',
      tags: [DevApiTagsMap.adminStatus],
      responses: {
        200: {
          description: '成功获取训练总览告警',
          content: { 'application/json': { schema: GetStatusOverviewResponseSchema } }
        }
      }
    }
  },
  '/admin/status/dataset/tasks': {
    get: {
      summary: '获取 Chunk 训练状态汇总',
      tags: [DevApiTagsMap.adminStatus],
      responses: {
        200: {
          description: '成功获取训练状态汇总',
          content: { 'application/json': { schema: GetTrainingTaskListResponseSchema } }
        }
      }
    }
  },
  '/admin/status/dataset/training': {
    post: {
      summary: '获取 Chunk 训练任务列表',
      tags: [DevApiTagsMap.adminStatus],
      requestBody: {
        content: { 'application/json': { schema: GetTrainingRecordListBodySchema } }
      },
      responses: {
        200: {
          description: '成功获取训练任务列表',
          content: { 'application/json': { schema: GetTrainingRecordListResponseSchema } }
        }
      }
    }
  },
  '/admin/status/dataset/training/action': {
    post: {
      summary: '重试或删除 Chunk 训练任务',
      tags: [DevApiTagsMap.adminStatus],
      requestBody: {
        content: { 'application/json': { schema: TrainingActionBodySchema } }
      },
      responses: {
        200: {
          description: '成功执行训练任务操作',
          content: { 'application/json': { schema: TrainingActionResponseSchema } }
        }
      }
    }
  }
};
