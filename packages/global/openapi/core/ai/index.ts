import type { OpenAPIPath } from '../../type';
import { TagsMap } from '../../tag';
import {
  GetLLMRequestRecordParamsSchema,
  LLMRequestRecordSchema,
  ResumeStreamParamsSchema,
  StreamNoNeedToBeResumeSchema
} from './api';
import { SandboxPath } from './sandbox';
import { AgentPath } from './agent';
import { z } from 'zod';

export const AIPath: OpenAPIPath = {
  ...SandboxPath,
  ...AgentPath,

  '/core/ai/record/getRecord': {
    get: {
      summary: '获取 LLM 请求追踪记录',
      description: '根据 requestId 查询 LLM 请求的详细信息,包括请求体和响应内容',
      tags: [TagsMap.aiCommon],
      requestParams: {
        query: GetLLMRequestRecordParamsSchema
      },
      responses: {
        200: {
          description: '成功返回 LLM 请求记录',
          content: {
            'application/json': {
              schema: LLMRequestRecordSchema
            }
          }
        }
      }
    }
  },

  '/core/chat/resume': {
    get: {
      summary: '恢复流式响应',
      description: '与 /v2/chat/completions 配套；GET query 传 appId / chatId / teamId',
      tags: [TagsMap.aiCommon],
      requestParams: {
        query: ResumeStreamParamsSchema
      },
      responses: {
        200: {
          description: '成功恢复流式响应，如果不需要恢复，则返回终态事件',
          content: {
            'text/event-stream': {
              schema: z.string()
            },
            'application/json': {
              schema: StreamNoNeedToBeResumeSchema
            }
          }
        }
      }
    }
  }
};
