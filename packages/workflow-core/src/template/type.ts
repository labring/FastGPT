import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import z from 'zod';

export const NodeTemplateRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), templateId: z.string().min(1) }),
  z.object({
    kind: z.literal('teamApp'),
    appId: z.string().min(1),
    versionId: z.string().optional()
  }),
  z.object({
    kind: z.literal('systemTool'),
    toolId: z.string().min(1),
    versionId: z.string().optional()
  }),
  z.object({
    kind: z.literal('tool'),
    toolId: z.string().min(1),
    parentId: z.string().optional(),
    versionId: z.string().optional()
  })
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
  if (kind === 'systemTool') return { kind, toolId: id };
  if (kind === 'tool') return { kind, toolId: id };
  return NodeTemplateRefSchema.parse({ kind });
};

export const formatNodeTemplateRef = (ref: NodeTemplateRef) => {
  if (ref.kind === 'builtin') return `${ref.kind}:${ref.templateId}`;
  if (ref.kind === 'teamApp') return `${ref.kind}:${ref.appId}`;
  return `${ref.kind}:${ref.toolId}`;
};

export type WorkflowInputDefaultPolicy = 'template' | 'userRequired' | 'remoteValidated';
export type WorkflowResourceKind = 'dataset' | 'model' | 'app' | 'tool' | 'secret';

export type NodeInputAutomationMeta = {
  configurable?: boolean;
  agentHint?: string;
  valueSchema?: Record<string, unknown>;
  examples?: unknown[];
  defaultPolicy?: WorkflowInputDefaultPolicy;
  resourceKind?: WorkflowResourceKind;
  bindingRequired?: boolean;
};

export type NodeTemplateAutomationMeta = {
  inputs?: Record<string, NodeInputAutomationMeta>;
};

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
