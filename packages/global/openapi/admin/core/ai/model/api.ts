import {
  SystemModelDataSchema,
  SystemModelDocumentDataSchema
} from '../../../../../core/ai/model.schema';
import z from 'zod';

export const AdminSystemModelReferenceSchema = z.object({
  modelId: z.string().meta({ description: '模型稳定 ID' })
});
export type AdminSystemModelReference = z.infer<typeof AdminSystemModelReferenceSchema>;

export const GetAdminSystemModelListResponseSchema = z.array(SystemModelDataSchema);
export type GetAdminSystemModelListResponse = z.infer<typeof GetAdminSystemModelListResponseSchema>;

export const GetAdminSystemModelDetailResponseSchema = SystemModelDataSchema;
export type GetAdminSystemModelDetailResponse = z.infer<
  typeof GetAdminSystemModelDetailResponseSchema
>;

export const GetAdminSystemModelDefaultConfigResponseSchema = SystemModelDocumentDataSchema;
export type GetAdminSystemModelDefaultConfigResponse = z.infer<
  typeof GetAdminSystemModelDefaultConfigResponseSchema
>;

export const DeleteAdminSystemModelResponseSchema = z.object({});
export type DeleteAdminSystemModelResponse = z.infer<typeof DeleteAdminSystemModelResponseSchema>;

export const TestAdminSystemModelQuerySchema = AdminSystemModelReferenceSchema.extend({
  channelId: z.coerce.number().int().positive().optional()
});
export type TestAdminSystemModelQuery = z.infer<typeof TestAdminSystemModelQuerySchema>;
export const TestAdminSystemModelResponseSchema = z.unknown();

/* ============================================================================
 * API: 更新系统模型配置
 * Route: PUT /api/core/ai/model/update
 * Method: PUT
 * Description: 合并并严格校验指定系统模型的配置
 * Tags: ['管理员系统配置', 'Write']
 * ============================================================================ */

export const UpdateSystemModelBodySchema = z.object({
  modelId: z.string().optional().meta({
    description: '待更新的模型稳定 ID；创建模型时不传'
  }),
  modelData: z.record(z.string(), z.unknown()).meta({
    description: '完整的系统模型配置；服务端会在写入前修复可兼容的历史字段'
  })
});
export type UpdateSystemModelBody = z.infer<typeof UpdateSystemModelBodySchema>;

export const UpdateSystemModelResponseSchema = z.undefined().meta({
  description: '模型配置更新成功'
});
export type UpdateSystemModelResponse = z.infer<typeof UpdateSystemModelResponseSchema>;

const ImportedSystemModelListSchema = z.array(z.record(z.string(), z.unknown()));

const JsonSystemModelListSchema = z.string().transform((value, ctx) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    ctx.addIssue({
      code: 'custom',
      message: 'config must be valid JSON'
    });
    return z.NEVER;
  }
});

/* ============================================================================
 * API: 导入系统模型配置
 * Route: PUT /api/core/ai/model/updateWithJson
 * Method: PUT
 * Description: 使用 JSON 配置严格校验并覆盖系统模型记录
 * Tags: ['管理员系统配置', 'Write']
 * ============================================================================ */

export const UpdateSystemModelsWithJsonBodySchema = z.object({
  config: JsonSystemModelListSchema.pipe(ImportedSystemModelListSchema).meta({
    example:
      '[{"type":"llm","provider":"OpenAI","model":"gpt-5","name":"GPT-5","isSystem":true,"isActive":true,"config":{"maxContext":400000,"maxResponse":128000,"quoteMaxToken":300000,"toolChoice":true}}]',
    description: '系统模型配置 JSON；服务端会逐条修复后再按 canonical Schema 写入'
  })
});
export type UpdateSystemModelsWithJsonBody = z.input<typeof UpdateSystemModelsWithJsonBodySchema>;
export type ParsedSystemModelsWithJsonBody = z.output<typeof UpdateSystemModelsWithJsonBodySchema>;

export const UpdateSystemModelsWithJsonResponseSchema = z.undefined().meta({
  description: '模型配置导入成功'
});
export type UpdateSystemModelsWithJsonResponse = z.infer<
  typeof UpdateSystemModelsWithJsonResponseSchema
>;
