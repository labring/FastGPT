import type { OpenAPIPath } from '../type';
import { DevApiTagsMap } from '../tag';
import {
  InvokeAuthorizationHeaderSchema,
  InvokeChatCompletionsBodySchema,
  InvokeChatCompletionsResponseSchema,
  InvokeChatCompletionsSseResponseSchema,
  InvokeFileUploadFormSchema,
  InvokeFileUploadResponseSchema,
  InvokeOpenAIErrorResponseSchema,
  InvokeUserInfoResponseSchema
} from './invoke';

export const InvokePath: OpenAPIPath = {
  '/invoke/fileUpload': {
    post: {
      summary: '上传反向调用文件',
      description: '插件通过反向调用凭证上传文件到当前对话的文件目录',
      tags: [DevApiTagsMap.reverseInvokePlugin],
      requestParams: {
        header: InvokeAuthorizationHeaderSchema
      },
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: InvokeFileUploadFormSchema
          }
        }
      },
      responses: {
        200: {
          description: '文件上传成功',
          content: {
            'application/json': {
              schema: InvokeFileUploadResponseSchema
            }
          }
        }
      }
    }
  },
  '/invoke/userInfo': {
    post: {
      summary: '获取反向调用用户信息',
      description: '插件通过反向调用凭证获取当前运行上下文中的用户、组织和群组信息',
      tags: [DevApiTagsMap.reverseInvokePlugin],
      requestParams: {
        header: InvokeAuthorizationHeaderSchema
      },
      responses: {
        200: {
          description: '成功返回用户信息',
          content: {
            'application/json': {
              schema: InvokeUserInfoResponseSchema
            }
          }
        }
      }
    }
  },
  '/invoke/llm/chat/completions': {
    post: {
      summary: '反向调用大语言模型对话补全',
      description:
        '插件通过反向调用凭证（需声明 model:invoke 权限）调用当前团队可用且已启用的大语言模型，兼容标准 OpenAI Chat Completions 非流式 JSON 与流式 SSE 协议',
      tags: [DevApiTagsMap.reverseInvokePlugin],
      requestParams: {
        header: InvokeAuthorizationHeaderSchema
      },
      requestBody: {
        content: {
          'application/json': {
            schema: InvokeChatCompletionsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回标准 OpenAI ChatCompletion JSON 或 SSE 事件流',
          content: {
            'application/json': {
              schema: InvokeChatCompletionsResponseSchema
            },
            'text/event-stream': {
              schema: InvokeChatCompletionsSseResponseSchema
            }
          }
        },
        400: {
          description: '请求参数非法，或目标 modelId 不存在、类型不匹配、已被停用',
          content: {
            'application/json': {
              schema: InvokeOpenAIErrorResponseSchema
            }
          }
        },
        401: {
          description: '缺少反向调用凭证或凭证无效/已过期',
          content: {
            'application/json': {
              schema: InvokeOpenAIErrorResponseSchema
            }
          }
        },
        403: {
          description: '凭证未授权 model:invoke 权限，或当前团队无权访问目标模型',
          content: {
            'application/json': {
              schema: InvokeOpenAIErrorResponseSchema
            }
          }
        }
      }
    }
  }
};
