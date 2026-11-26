import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';

/* ============================================================================
 * Pro Admin Internal API: 使用 LLM 为长文本补充段落标题
 * Route: POST /api/core/dataset/training/llmPargraph
 * ============================================================================ */
export const AdminLlmParagraphBodySchema = z.object({
  rawText: z.string().meta({
    example: 'FastGPT 是一个 AI Agent 构建平台。它支持可视化工作流编排。',
    description: '需要补充段落标题的原始长文本'
  }),
  modelId: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '段落分析模型 ID'
  }),
  teamId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '发起解析任务的团队 ID'
  }),
  billId: z.string().trim().min(1).meta({
    example: 'dataset-parse-68ad85a7463006c963799a07',
    description: '知识库解析任务的计费关联 ID'
  })
});
export type AdminLlmParagraphBody = z.infer<typeof AdminLlmParagraphBodySchema>;

export const AdminLlmParagraphResponseSchema = z.object({
  resultText: z.string().meta({ description: '补充段落标题后的文本' }),
  totalInputTokens: z.number().nonnegative().meta({ description: '模型输入 Token 数' }),
  totalOutputTokens: z.number().nonnegative().meta({ description: '模型输出 Token 数' }),
  cacheReadTokens: z
    .number()
    .nonnegative()
    .optional()
    .meta({ description: '输入中缓存读取 Token 数' }),
  cacheCreationTokens: z
    .number()
    .nonnegative()
    .optional()
    .meta({ description: '输入中缓存创建 Token 数' })
});
export type AdminLlmParagraphResponse = z.infer<typeof AdminLlmParagraphResponseSchema>;

/* ============================================================================
 * Pro Admin Internal API: 计算知识库分块增强结果
 * Route: POST /api/core/dataset/training/enhance
 * Method: POST
 * Description: 在当前 Worker 所有权下原子提交分块增强阶段，并直接登记本次模型用量。
 * Tags: ['Pro 知识库']
 * ============================================================================ */
const AdminDatasetTrainingEnhanceInput = z.object({
  teamId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '训练所属团队 ID'
  }),
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a07',
    description: '分块所属知识库 ID'
  }),
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a09',
    description: '分块所属集合 ID'
  }),
  dataId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a10',
    description: '当前待增强的分块 ID'
  }),
  runId: z.string().min(1).meta({
    example: '4b9c2f9f-6b1a-4c6f-9c77-1c0a3b9e8d21',
    description: '当前持有集合训练权的 Worker runId'
  }),
  modelId: z
    .string()
    .min(1)
    .meta({ example: '68ad85a7463006c963799a05', description: '该阶段使用的模型 ID' }),
  usageId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a08',
    description: '本轮训练账单 ID，Pro 在原子提交阶段后直接登记本次用量'
  })
});

export const AdminDatasetTrainingEnhanceBodySchema = z.discriminatedUnion('mode', [
  AdminDatasetTrainingEnhanceInput.extend({
    mode: z.literal('imageParse').meta({ example: 'imageParse', description: '单图解析阶段' }),
    imageId: z.string().min(1).meta({
      example: 'dataset/68ad85a7463006c963799a07/settings.png',
      description: '单图的存储 key'
    })
  }),
  AdminDatasetTrainingEnhanceInput.extend({
    mode: z.literal('image').meta({ example: 'image', description: 'Markdown 图片增强阶段' }),
    q: z.string().meta({
      example: '知识库设置 ![设置](dataset/68ad85a7463006c963799a07/settings.png)',
      description: '带 Markdown 图片的正文'
    }),
    autoIndexes: z.boolean().optional().meta({
      example: true,
      description: '集合是否启用自动索引，用于决定图片增强提交后的下一阶段'
    })
  }),
  AdminDatasetTrainingEnhanceInput.extend({
    mode: z.literal('auto').meta({ example: 'auto', description: '自动索引增强阶段' }),
    q: z.string().meta({ example: '如何管理知识库？', description: '正文' }),
    a: z
      .string()
      .optional()
      .meta({ example: '可在知识库设置中调整索引方式。', description: '补充正文' })
  })
]);
export type AdminDatasetTrainingEnhanceBody = z.infer<typeof AdminDatasetTrainingEnhanceBodySchema>;

export const AdminDatasetTrainingEnhanceResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('skipped').meta({ example: 'skipped', description: '跳过增强且未计费' }),
    reason: z.literal('license').optional().meta({
      example: 'license',
      description: '许可证不可用或禁用增强时，跳过后续增强，直接写入索引'
    })
  }),
  z.object({
    status: z.literal('committed').meta({
      example: 'committed',
      description: 'Pro 已在当前工作项上提交增强结果并完成计费，或重试时检测到该阶段已提交'
    })
  }),
  z.object({
    status: z.literal('aborted').meta({
      example: 'aborted',
      description: 'Worker 已失去当前 runId 所有权或分块已不可运行，未提交也未计费'
    })
  })
]);
export type AdminDatasetTrainingEnhanceResponse = z.infer<
  typeof AdminDatasetTrainingEnhanceResponseSchema
>;
