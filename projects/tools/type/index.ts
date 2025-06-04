import { z } from 'zod';
import type { InputType, OutputType } from './fastgpt';

export const ToolCallbackType = z
  .function()
  .args(z.any())
  .returns(z.promise(z.object({ error: z.any().optional(), output: z.any() })));

export const InfoString = z.object({
  en: z.string().optional(),
  'zh-CN': z.string(),
  'zh-Hant': z.string().optional()
});

const InputBaseSchema = z.object({
  version: z.string().optional()
});

export function defineInputSchema<T extends z.AnyZodObject>(schema: T) {
  return InputBaseSchema.merge(schema);
}

export const ToolTypeEnum = z.enum(['tools', 'search', 'multimodal', 'communication', 'other']);

export const VersionSchema = z.object({
  version: z.string(),
  description: z.string().optional()
});

export const ToolSchema = z.object({
  toolId: z.string(),
  name: InfoString,
  description: InfoString,
  type: ToolTypeEnum,
  icon: z.string(),
  author: z.string().optional(),
  docURL: z.string().optional(),
  versionList: z.array(VersionSchema).min(1),
  parentId: z.string().optional(),
  isToolSet: z.boolean().optional(),
  cb: ToolCallbackType
});

export type ToolType = z.infer<typeof ToolSchema> & {
  inputs: InputType[];
  outputs: OutputType[];
};

export const ToolSetSchema = ToolSchema.merge(
  z.object({
    children: z.array(ToolSchema)
  })
);

export type ToolSetType = z.infer<typeof ToolSetSchema>;

export const ToolConfigSchema = ToolSchema.omit({
  cb: true,
  isToolSet: true,
  toolId: true
}).merge(
  z.object({
    toolId: z.string().optional(),
    inputs: z.unknown(),
    outputs: z.unknown()
  })
);

export const ToolSetConfigSchema = ToolSetSchema.omit({
  cb: true,
  isToolSet: true,
  toolId: true
}).merge(
  z.object({
    toolId: z.string().optional()
  })
);

export type ToolConfigType = z.infer<typeof ToolConfigSchema> & {
  inputs: InputType[];
  outputs: OutputType[];
};
export type ToolSetConfigType = z.infer<typeof ToolSetConfigSchema>;

export function defineTool(tool: ToolConfigType) {
  return {
    isToolSet: false,
    ...tool
  };
}

export function defineToolSet(toolset: ToolSetConfigType) {
  return {
    isToolSet: true,
    ...toolset
  };
}

export * from './fastgpt';
