import { SystemModelItemSchema } from '../../../../../core/ai/model.schema';
import z from 'zod';

/* ============================================================================
 * API: 更新系统模型配置
 * Route: PUT /api/core/ai/model/update
 * Method: PUT
 * Description: 合并并严格校验指定系统模型的配置
 * Tags: ['管理员系统配置', 'Write']
 * ============================================================================ */

export const UpdateSystemModelBodySchema = z.object({
  model: z.string().trim().min(1).meta({
    example: 'gpt-5',
    description: '待更新的模型标识'
  }),
  metadata: z.record(z.string(), z.unknown()).optional().meta({
    description: '本次更新的模型配置字段；与已有配置合并后执行完整模型校验'
  })
});
export type UpdateSystemModelBody = z.infer<typeof UpdateSystemModelBodySchema>;

export const UpdateSystemModelResponseSchema = z.undefined().meta({
  description: '模型配置更新成功'
});
export type UpdateSystemModelResponse = z.infer<typeof UpdateSystemModelResponseSchema>;

const ImportedSystemModelRecordSchema = z
  .object({
    model: z.string().trim().min(1),
    metadata: z.record(z.string(), z.unknown())
  })
  .transform(({ model, metadata }) => ({
    model,
    metadata: {
      ...metadata,
      model,
      name: typeof metadata.name === 'string' && metadata.name.trim() ? metadata.name.trim() : model
    }
  }))
  .pipe(
    z.object({
      model: z.string(),
      metadata: SystemModelItemSchema
    })
  );

const ImportedSystemModelListSchema = z.array(ImportedSystemModelRecordSchema);

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
      '[{"model":"gpt-5","metadata":{"type":"llm","provider":"OpenAI","model":"gpt-5","name":"GPT-5","maxContext":400000,"maxResponse":128000,"quoteMaxToken":300000,"toolChoice":true,"isActive":true}}]',
    description: '系统模型配置 JSON；解析后每条 metadata 必须符合完整模型 Schema'
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
