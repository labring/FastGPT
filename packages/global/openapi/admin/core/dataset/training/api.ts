import { z } from 'zod';
import { ObjectIdSchema } from '../../../../../common/type/mongo';

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
  totalOutputTokens: z.number().nonnegative().meta({ description: '模型输出 Token 数' })
});
export type AdminLlmParagraphResponse = z.infer<typeof AdminLlmParagraphResponseSchema>;
