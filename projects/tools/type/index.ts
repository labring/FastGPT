import { z } from 'zod';
import type { InputType, OutputType, WorkflowIOValueTypeEnum } from './fastgpt';

export const ToolCallbackType = z
  .function()
  .args(z.any())
  .returns(z.promise(z.object({ error: z.any().optional(), output: z.any() })));

export const InfoString = z.object({
  en: z.string().optional(),
  'zh-CN': z.string(),
  'zh-Hant': z.string().optional()
});

export const ToolTypeEnum = z.enum(['tools', 'search', 'multimodal', 'communication', 'other']);

export const ToolSchema = z
  .object({
    toolId: z.string().optional(),
    name: InfoString,
    description: InfoString,
    type: ToolTypeEnum,
    icon: z.string(),
    cb: ToolCallbackType.optional(),
    author: z.string().optional(),
    docURL: z.string().optional(),
    version: z.string(),
    parentId: z.string().optional(),
    isToolSet: z.boolean().optional()
  })
  .refine((data) => {
    if (!data.isToolSet && !data.cb) return { message: 'cb is required' };
  });

export type ToolType = z.infer<typeof ToolSchema> & {
  inputs: InputType[];
  outputs: OutputType[];
};

export type ToolSetType = z.infer<typeof ToolSchema> & {
  children: ToolType[];
};

export type ToolConfigType = Omit<ToolType, 'cb' | 'isToolSet'>;
export type ToolSetConfigType = Omit<ToolSetType, 'cb' | 'inputs' | 'outputs' | 'isToolSet'>;

export function defineTool(tool: ToolConfigType) {
  return {
    isToolSet: false,
    ...tool
  };
}

export function defineToolSet(folder: ToolSetConfigType) {
  return {
    isToolSet: true,
    ...folder
  };
}

export * from './fastgpt';
