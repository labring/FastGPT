import {
  NodeTemplateRefSchema,
  type NodeTemplateRef,
  type WorkflowTemplateBundle
} from '@fastgpt/global/core/workflow/template/type';

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

/** 内核模板直接复用注入包的数据契约，避免混入画布输出回调。 */
export type ResolvedWorkflowTemplate = Pick<
  WorkflowTemplateBundle['items'][number],
  'template' | 'automationMeta' | 'validatedInputDefaults'
>;

export type TemplateResolveContext = {
  locale: string;
  translate?: (value: string) => string;
};

export type WorkflowTemplateProvider = {
  list(context: TemplateResolveContext): Promise<NodeTemplateRef[]>;
  resolve(ref: NodeTemplateRef, context: TemplateResolveContext): Promise<ResolvedWorkflowTemplate>;
};
