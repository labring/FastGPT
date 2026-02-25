import { getNanoid } from '../../../common/string/tools';
import z from 'zod';

export const AgentStepItemSchema = z.object({
  id: z.string().default(getNanoid(6)),
  title: z.string(),
  description: z.string(),
  depends_on: z.array(z.string()).nullish(),
  response: z.string().nullish(),
  summary: z.string().nullish()
});
export type AgentStepItemType = z.infer<typeof AgentStepItemSchema>;

export const AgentPlanSchema = z.object({
  planId: z.string().default(getNanoid(6)),
  task: z.string(),
  description: z.string(),
  background: z.string().nullish(),
  steps: z.array(AgentStepItemSchema)
});
export type AgentPlanType = z.infer<typeof AgentPlanSchema>;
