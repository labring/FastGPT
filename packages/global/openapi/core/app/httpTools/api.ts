import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { StoreSecretValueTypeSchema } from '../../../../common/secret/type';
import { CreateAppBodySchema, CreateAppResponseSchema } from '../common/api';
import { HttpToolConfigTypeSchema } from '../../../../core/app/tool/httpTool/type';
import { HttpToolTypeEnum } from '../../../../core/app/tool/httpTool/constants';
import { ContentTypes } from '../../../../core/workflow/constants';

const HttpToolStaticKeyValueSchema = z
  .object({
    key: z.string().meta({
      example: 'Authorization',
      description: '固定参数或请求头名称'
    }),
    value: z.string().meta({
      example: 'Bearer token',
      description: '固定参数或请求头值'
    })
  })
  .meta({
    description: 'HTTP 工具固定键值配置'
  });

const HttpToolStaticParamsSchema = z.array(HttpToolStaticKeyValueSchema).optional().meta({
  description: '手动配置工具时固定追加到 Query 的参数'
});

const HttpToolStaticHeadersSchema = z.array(HttpToolStaticKeyValueSchema).optional().meta({
  description: '手动配置工具时固定追加到请求头的参数'
});

const HttpToolStaticBodySchema = z
  .object({
    type: z.enum(ContentTypes).meta({
      example: ContentTypes.json,
      description: '静态请求体内容类型'
    }),
    content: z.string().optional().meta({
      example: '{"keyword":"hello"}',
      description: '静态请求体文本内容，适用于 JSON、XML 或 Raw 文本'
    }),
    formData: z.array(HttpToolStaticKeyValueSchema).optional().meta({
      description: '表单类型请求体的固定字段列表'
    })
  })
  .optional()
  .meta({
    description: '手动配置工具时固定发送的请求体'
  });

const OpenAPIHttpToolConfigTypeSchema = HttpToolConfigTypeSchema.extend({
  name: z.string().meta({
    example: 'search',
    description: '工具名称，用于工作流节点选择和调用'
  }),
  description: z.string().meta({
    example: 'Search public documents',
    description: '工具能力说明，会作为调用工具时的语义描述'
  }),
  inputSchema: HttpToolConfigTypeSchema.shape.inputSchema.meta({
    description: '工具入参 JSON Schema，由 OpenAPI 参数或手动配置生成'
  }),
  outputSchema: HttpToolConfigTypeSchema.shape.outputSchema.meta({
    description: '工具出参 JSON Schema，用于描述远端接口返回结构'
  }),
  path: z.string().meta({
    example: '/search',
    description: '远端接口路径'
  }),
  method: z.string().meta({
    example: 'POST',
    description: '远端接口 HTTP 方法'
  }),
  requestSchema: HttpToolConfigTypeSchema.shape.requestSchema.meta({
    description: '原始请求参数 JSON Schema，用于还原远端接口请求结构'
  }),
  staticParams: HttpToolStaticParamsSchema,
  staticHeaders: HttpToolStaticHeadersSchema,
  staticBody: HttpToolStaticBodySchema,
  headerSecret: StoreSecretValueTypeSchema.nullish().meta({
    description: '工具级请求头密钥配置，会在运行工具时合并到请求头'
  })
}).meta({
  description: 'HTTP 工具配置'
});

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
 * Route: PUT /core/app/httpTools/update
 * ============================================================================ */
export const UpdateHttpToolsBodySchema = z
  .object({
    appId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: 'HTTP 工具集 ID'
    }),
    toolList: z.array(OpenAPIHttpToolConfigTypeSchema).meta({
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

export const UpdateHttpToolsResponseSchema = z.void().meta({
  description: '更新成功'
});
export type UpdateHttpToolsResponseType = z.infer<typeof UpdateHttpToolsResponseSchema>;

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
    customHeaders: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .meta({
        example: {},
        description: '自定义请求头'
      }),
    headerSecret: StoreSecretValueTypeSchema.optional().meta({
      example: { Authorization: { value: 'token' } },
      description: '请求头密钥'
    }),
    staticParams: HttpToolStaticParamsSchema.meta({
      description: '静态请求参数（Query）'
    }),
    staticHeaders: HttpToolStaticHeadersSchema.meta({
      description: '静态请求头'
    }),
    staticBody: HttpToolStaticBodySchema.meta({
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
