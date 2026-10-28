import { z } from 'zod';
import { ModelTypeEnum } from '../../../../core/ai/constants';

/* ============================================================================
 * API: 替换团队内失效模型引用
 * Route: POST /api/core/ai/model/invalidReferences/replace
 * Method: POST
 * Description: 团队 owner 同步扫描知识库、应用和历史版本并替换失效的静态模型引用
 * Tags: ['模型管理', 'Write']
 * ============================================================================ */

export const ReplaceInvalidModelReferencesBodySchema = z.object({
  replacement: z
    .object({
      llmModelId: z
        .string()
        .trim()
        .min(1)
        .meta({ example: 'llm-model-id', description: '替换用的语言模型 ID' }),
      ttsModelId: z
        .string()
        .trim()
        .min(1)
        .meta({ example: 'tts-model-id', description: '替换用的语音播放模型 ID' }),
      rerankModelId: z
        .string()
        .trim()
        .min(1)
        .meta({ example: 'rerank-model-id', description: '替换用的重排模型 ID' })
    })
    .meta({ description: '按模型类型统一使用的替换目标' })
});
export type ReplaceInvalidModelReferencesBody = z.infer<
  typeof ReplaceInvalidModelReferencesBodySchema
>;

export const InvalidModelReferenceCountSchema = z.object({
  scannedRecords: z.number().int().nonnegative().meta({ description: '扫描的记录数' }),
  replacedRecords: z.number().int().nonnegative().meta({ description: '发生替换的记录数' }),
  replacedReferences: z.number().int().nonnegative().meta({ description: '替换的模型引用数' }),
  skippedReferences: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '跳过的空值、动态或其他非目标引用数' }),
  conflicts: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '并发冲突且重试后仍未写入的记录数' }),
  failedRecords: z.number().int().nonnegative().meta({ description: '处理失败的记录数' })
});
export type InvalidModelReferenceCount = z.infer<typeof InvalidModelReferenceCountSchema>;

const ResourceModelCountsSchema = z.object({
  [ModelTypeEnum.llm]: InvalidModelReferenceCountSchema,
  [ModelTypeEnum.tts]: InvalidModelReferenceCountSchema,
  [ModelTypeEnum.rerank]: InvalidModelReferenceCountSchema
});

export const ReplaceInvalidModelReferencesResponseSchema = z.object({
  completed: z
    .boolean()
    .meta({ example: true, description: '是否完整扫描本次范围；单条失败不影响此值' }),
  counts: z
    .object({
      dataset: ResourceModelCountsSchema.meta({ description: '知识库统计' }),
      app: ResourceModelCountsSchema.meta({ description: '应用兼容字段统计' }),
      version: ResourceModelCountsSchema.meta({ description: '应用历史版本统计' })
    })
    .meta({ description: '按资源和模型类型分组的实际执行统计' }),
  failedSamples: z
    .array(
      z.object({
        resourceType: z.enum(['dataset', 'app', 'version']).meta({ description: '失败资源类型' }),
        resourceId: z.string().meta({ description: '失败资源 ID' }),
        reason: z.string().meta({ description: '失败原因' })
      })
    )
    .meta({ description: '有上限的失败样例' }),
  stoppedReason: z
    .enum(['conditions_changed', 'scan_interrupted'])
    .optional()
    .meta({ description: '提前停止的原因代码' })
});
export type ReplaceInvalidModelReferencesResponse = z.infer<
  typeof ReplaceInvalidModelReferencesResponseSchema
>;
