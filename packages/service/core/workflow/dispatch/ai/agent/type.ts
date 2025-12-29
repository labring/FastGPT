import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import z from 'zod';
import { NodeToolConfigTypeSchema } from '@fastgpt/global/core/workflow/type/node';

export type ToolNodeItemType = RuntimeNodeItemType & {
  toolParams: RuntimeNodeItemType['inputs'];
  jsonSchema?: JSONSchemaInputType;
};

export type DispatchSubAppResponse = {
  response: string;
  result: Record<string, any>;
  runningTime: number;
  usages?: ChatNodeUsageType[];
};

export const SubAppRuntimeSchema = z.object({
  type: z.enum(['tool', 'file', 'workflow', 'toolWorkflow']),
  id: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
  toolDescription: z.string().optional(),
  version: z.string().optional(),
  toolConfig: NodeToolConfigTypeSchema.optional(),
  params: z.record(z.string(), z.any()).optional()
});
export type SubAppRuntimeType = z.infer<typeof SubAppRuntimeSchema>;

export type GetSubAppInfoFnType = (id: string) => {
  name: string;
  avatar: string;
  toolDescription: string;
};
