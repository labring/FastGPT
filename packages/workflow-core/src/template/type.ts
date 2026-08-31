import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import z from 'zod';

export const NodeTemplateRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), templateId: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal('teamApp'),
      appId: z.string().min(1),
      versionId: z.string().optional()
    })
    .strict(),
  z
    .object({
      kind: z.literal('systemTool'),
      toolId: z.string().min(1),
      source: z.string().min(1),
      versionId: z.string().optional()
    })
    .strict(),
  z
    .object({
      kind: z.literal('tool'),
      toolId: z.string().min(1),
      parentId: z.string().optional(),
      versionId: z.string().optional()
    })
    .strict()
]);
export type NodeTemplateRef = z.infer<typeof NodeTemplateRefSchema>;

/** CLI 字符串只在适配边界解析，Core 始终接收结构化 TemplateRef。 */
export const parseNodeTemplateRef = (value: string): NodeTemplateRef => {
  const separatorIndex = value.indexOf(':');
  const kind = value.slice(0, separatorIndex);
  const id = value.slice(separatorIndex + 1);
  if (separatorIndex <= 0 || !id) return NodeTemplateRefSchema.parse({ kind, templateId: '' });
  if (kind === 'builtin') return { kind, templateId: id };
  if (kind === 'teamApp') return { kind, appId: id };
  if (kind === 'systemTool') {
    const sourceSeparatorIndex = id.indexOf('/');
    if (sourceSeparatorIndex <= 0 || sourceSeparatorIndex === id.length - 1) {
      return NodeTemplateRefSchema.parse({ kind, source: '', toolId: '' });
    }
    const encodedSource = id.slice(0, sourceSeparatorIndex);
    const encodedToolId = id.slice(sourceSeparatorIndex + 1);
    try {
      return NodeTemplateRefSchema.parse({
        kind,
        source: decodeURIComponent(encodedSource),
        toolId: decodeURIComponent(encodedToolId)
      });
    } catch {
      return NodeTemplateRefSchema.parse({ kind, source: '', toolId: '' });
    }
  }
  if (kind === 'tool') return { kind, toolId: id };
  return NodeTemplateRefSchema.parse({ kind });
};

export const formatNodeTemplateRef = (ref: NodeTemplateRef) => {
  if (ref.kind === 'builtin') return `${ref.kind}:${ref.templateId}`;
  if (ref.kind === 'teamApp') return `${ref.kind}:${ref.appId}`;
  if (ref.kind === 'systemTool') {
    return `${ref.kind}:${encodeURIComponent(ref.source)}/${encodeURIComponent(ref.toolId)}`;
  }
  return `${ref.kind}:${ref.toolId}`;
};

export type WorkflowInputDefaultPolicy = 'template' | 'userRequired' | 'remoteValidated';
export type WorkflowResourceKind = 'dataset' | 'model' | 'app' | 'tool' | 'secret';

export const NodeInputAutomationMetaSchema = z
  .object({
    configurable: z.boolean().optional(),
    agentHint: z.string().optional(),
    valueSchema: z.record(z.string(), z.unknown()).optional(),
    examples: z.array(z.unknown()).optional(),
    defaultPolicy: z.enum(['template', 'userRequired', 'remoteValidated']).optional(),
    resourceKind: z.enum(['dataset', 'model', 'app', 'tool', 'secret']).optional(),
    bindingRequired: z.boolean().optional(),
    inputModes: z.array(z.enum(['literal', 'reference', 'secret'])).optional()
  })
  .strict();
export type NodeInputAutomationMeta = z.infer<typeof NodeInputAutomationMetaSchema>;

export const NodeTemplateAutomationMetaSchema = z
  .object({
    inputs: z.record(z.string(), NodeInputAutomationMetaSchema).optional()
  })
  .strict();
export type NodeTemplateAutomationMeta = z.infer<typeof NodeTemplateAutomationMetaSchema>;

export type ResolvedWorkflowTemplate = {
  template: FlowNodeTemplateType;
  automationMeta?: NodeTemplateAutomationMeta;
  validatedInputDefaults?: Record<string, { provided: true; value: unknown }>;
};

export type TemplateResolveContext = {
  locale: string;
  translate?: (value: string) => string;
};

export type WorkflowTemplateProvider = {
  list(context: TemplateResolveContext): Promise<NodeTemplateRef[]>;
  resolve(ref: NodeTemplateRef, context: TemplateResolveContext): Promise<ResolvedWorkflowTemplate>;
};
