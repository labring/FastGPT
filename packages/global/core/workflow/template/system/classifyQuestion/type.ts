import z from 'zod';

export const ClassifyQuestionAgentItemSchema = z
  .object({
    value: z.string().meta({ description: '分类值' }),
    key: z.string().meta({ description: '分类键' })
  })
  .meta({ description: '分类问题Agent项' });
export type ClassifyQuestionAgentItemType = z.infer<typeof ClassifyQuestionAgentItemSchema>;
