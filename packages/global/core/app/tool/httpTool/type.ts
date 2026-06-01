import { StoreSecretValueTypeSchema } from '../../../../common/secret/type';
import { JSONSchemaInputTypeSchema, JSONSchemaOutputTypeSchema } from '../../jsonschema';
import { ContentTypes } from '../../../workflow/constants';
import z from 'zod';

const PathDataTypeSchema = z.object({
  name: z.string().meta({
    description: '接口名称'
  }),
  description: z.string().meta({
    description: '接口能力说明'
  }),
  method: z.string().meta({
    description: '接口 HTTP 方法'
  }),
  path: z.string().meta({
    description: '接口路径'
  }),
  params: z.array(z.any()),
  request: z.any(),
  response: z.any()
});
export type PathDataType = z.infer<typeof PathDataTypeSchema>;

export const OpenApiJsonSchemaSchema = z.object({
  pathData: z.array(PathDataTypeSchema),
  serverPath: z.string()
});
export type OpenApiJsonSchema = z.infer<typeof OpenApiJsonSchemaSchema>;

export const HttpToolConfigTypeSchema = z.object({
  name: z.string().meta({
    example: 'search',
    description: 'HTTP 工具名称，用于工作流节点选择和调用'
  }),
  description: z.string().meta({
    example: 'Search public documents',
    description: 'HTTP 工具能力说明，会作为调用工具时的语义描述'
  }),
  inputSchema: JSONSchemaInputTypeSchema.optional().meta({
    description: 'HTTP 工具入参 JSON Schema，由 OpenAPI 参数或手动配置生成'
  }),
  outputSchema: JSONSchemaOutputTypeSchema.optional().meta({
    description: 'HTTP 工具出参 JSON Schema，用于描述远端接口返回结构'
  }),
  path: z.string().meta({
    example: '/search',
    description: 'HTTP 工具请求路径'
  }),
  method: z.string().meta({
    example: 'POST',
    description: 'HTTP 工具请求方法'
  }),
  requestSchema: JSONSchemaInputTypeSchema.optional().meta({
    description: 'HTTP 工具原始请求结构 JSON Schema'
  }),

  // manual
  staticParams: z
    .array(
      z
        .object({
          key: z.string().meta({
            description: '固定参数名称'
          }),
          value: z.string().meta({
            description: '固定参数值'
          })
        })
        .meta({
          description: 'HTTP 工具固定 Query 参数项'
        })
    )
    .optional()
    .meta({
      description: '手动配置工具时固定追加到 Query 的参数'
    }),
  staticHeaders: z
    .array(
      z
        .object({
          key: z.string().meta({
            description: '固定请求头名称'
          }),
          value: z.string().meta({
            description: '固定请求头值'
          })
        })
        .meta({
          description: 'HTTP 工具固定请求头项'
        })
    )
    .optional()
    .meta({
      description: '手动配置工具时固定追加到请求头的参数'
    }),
  staticBody: z
    .object({
      type: z.enum(ContentTypes).meta({
        description: '静态请求体内容类型'
      }),
      content: z.string().optional().meta({
        description: '静态请求体文本内容，适用于 JSON、XML 或 Raw 文本'
      }),
      formData: z
        .array(
          z
            .object({
              key: z.string().meta({
                description: '表单字段名称'
              }),
              value: z.string().meta({
                description: '表单字段值'
              })
            })
            .meta({
              description: 'HTTP 工具固定表单字段项'
            })
        )
        .optional()
        .meta({
          description: '表单类型请求体的固定字段列表'
        })
    })
    .optional()
    .meta({
      description: '手动配置工具时固定发送的请求体'
    }),
  headerSecret: StoreSecretValueTypeSchema.nullish().meta({
    description: 'HTTP 工具请求头密钥配置'
  })
});
export type HttpToolConfigType = z.infer<typeof HttpToolConfigTypeSchema>;
