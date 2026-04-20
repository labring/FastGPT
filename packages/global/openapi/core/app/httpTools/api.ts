import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { StoreSecretValueTypeSchema } from '../../../../common/secret/type';
import { CreateAppBodySchema, CreateAppResponseSchema } from '../common/api';
import { HttpToolConfigTypeSchema } from '../../../../core/app/tool/httpTool/type';
import { HttpToolTypeEnum } from '../../../../core/app/tool/httpTool/constants';

/* ============================================================================
 * API: 创建 HTTP 工具集
 * Route: POST /core/app/httpTools/create
 * ============================================================================ */
export const CreateHttpToolsBodySchema = CreateAppBodySchema.omit({
  type: true,
  modules: true,
  edges: true,
  chatConfig: true
})
  .extend({
    createType: z.enum(HttpToolTypeEnum).meta({
      example: HttpToolTypeEnum.batch,
      description: '创建方式：batch 批量（通过 OpenAPI Schema），manual 手动'
    })
  })
  .meta({
    example: {
      name: 'HTTP 工具集',
      parentId: '68ad85a7463006c963799a05',
      createType: HttpToolTypeEnum.batch
    }
  });
export type CreateHttpToolsBodyType = z.infer<typeof CreateHttpToolsBodySchema>;

export const CreateHttpToolsResponseSchema = CreateAppResponseSchema;
export type CreateHttpToolsResponseType = z.infer<typeof CreateHttpToolsResponseSchema>;

/* ============================================================================
 * API: 更新 HTTP 工具集
 * Route: POST /core/app/httpTools/update
 * ============================================================================ */
export const UpdateHttpToolsBodySchema = z
  .object({
    appId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: 'HTTP 工具集 ID'
    }),
    toolList: z.array(HttpToolConfigTypeSchema).meta({
      example: [],
      description: 'HTTP 工具列表'
    }),
    baseUrl: z.string().optional().meta({
      example: 'https://api.example.com',
      description: '接口基础地址'
    }),
    apiSchemaStr: z.string().optional().meta({
      example: '',
      description: 'OpenAPI Schema 原始字符串'
    }),
    headerSecret: StoreSecretValueTypeSchema.optional().meta({
      example: { Authorization: { value: 'token', secret: '' } },
      description: '请求头密钥'
    }),
    customHeaders: z.string().optional().meta({
      example: '{}',
      description: '自定义请求头（JSON 字符串）'
    })
  })
  .meta({
    example: {
      appId: '68ad85a7463006c963799a05',
      toolList: []
    }
  });
export type UpdateHttpToolsBodyType = z.infer<typeof UpdateHttpToolsBodySchema>;

/* ============================================================================
 * API: 通过 URL 解析 OpenAPI Schema
 * Route: POST /core/app/httpTools/getApiSchemaByUrl
 * ============================================================================ */
export const GetApiSchemaByUrlBodySchema = z
  .object({
    url: z.string().meta({
      example: 'https://example.com/openapi.json',
      description: 'OpenAPI Schema 地址'
    })
  })
  .meta({
    example: {
      url: 'https://example.com/openapi.json'
    }
  });
export type GetApiSchemaByUrlBodyType = z.infer<typeof GetApiSchemaByUrlBodySchema>;

export const GetApiSchemaByUrlResponseSchema = z.any().meta({
  description: '解析后的 OpenAPI Schema 对象'
});
export type GetApiSchemaByUrlResponseType = z.infer<typeof GetApiSchemaByUrlResponseSchema>;

/* ============================================================================
 * API: 运行 HTTP 工具
 * Route: POST /core/app/httpTools/runTool
 * ============================================================================ */
export const RunHttpToolBodySchema = z
  .object({
    params: z.record(z.string(), z.any()).meta({
      example: { query: 'hello' },
      description: '工具调用参数'
    }),
    baseUrl: z.string().meta({
      example: 'https://api.example.com',
      description: '接口基础地址'
    }),
    toolPath: z.string().meta({
      example: '/search',
      description: '工具路径'
    }),
    method: z.string().meta({
      example: 'POST',
      description: 'HTTP 请求方法'
    }),
    customHeaders: z.record(z.string(), z.string()).optional().meta({
      example: {},
      description: '自定义请求头'
    }),
    headerSecret: StoreSecretValueTypeSchema.optional().meta({
      example: { Authorization: { value: 'token' } },
      description: '请求头密钥'
    }),
    staticParams: HttpToolConfigTypeSchema.shape.staticParams.meta({
      description: '静态请求参数（Query）'
    }),
    staticHeaders: HttpToolConfigTypeSchema.shape.staticHeaders.meta({
      description: '静态请求头'
    }),
    staticBody: HttpToolConfigTypeSchema.shape.staticBody.meta({
      description: '静态请求体'
    })
  })
  .meta({
    example: {
      params: {},
      baseUrl: 'https://api.example.com',
      toolPath: '/search',
      method: 'POST'
    }
  });
export type RunHttpToolBodyType = z.infer<typeof RunHttpToolBodySchema>;

export const RunHttpToolResponseSchema = z
  .object({
    data: z.any().optional().meta({
      description: '工具调用返回结果'
    }),
    errorMsg: z.string().optional().meta({
      example: '请求失败',
      description: '错误信息'
    })
  })
  .meta({
    description: 'HTTP 工具调用结果，data 与 errorMsg 二选一'
  });
export type RunHttpToolResponseType = z.infer<typeof RunHttpToolResponseSchema>;
