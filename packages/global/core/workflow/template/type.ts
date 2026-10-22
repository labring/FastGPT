import z from 'zod';
import { FlowNodeTemplateTypeSchema } from '../type/node';
import { FlowNodeOutputItemTypeSchema } from '../type/io';

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
    source: z.string().min(1),
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

export type WorkflowInputDefaultPolicy = 'template' | 'userRequired' | 'remoteValidated';
export type WorkflowResourceKind = 'dataset' | 'model' | 'app' | 'tool' | 'secret';

export const NodeInputAutomationMetaSchema = z.object({
  configurable: z.boolean().optional(),
  agentHint: z.string().optional(),
  valueSchema: z.record(z.string(), z.unknown()).optional(),
  examples: z.array(z.unknown()).optional(),
  defaultPolicy: z.enum(['template', 'userRequired', 'remoteValidated']).optional(),
  resourceKind: z.enum(['dataset', 'model', 'app', 'tool', 'secret']).optional(),
  bindingRequired: z.boolean().optional(),
  inputModes: z.array(z.enum(['literal', 'reference', 'secret'])).optional()
});
export type NodeInputAutomationMeta = z.infer<typeof NodeInputAutomationMetaSchema>;

export const NodeTemplateAutomationMetaSchema = z.object({
  availableForWorkflowBuilder: z.boolean().optional(),
  inputs: z.record(z.string(), NodeInputAutomationMetaSchema).optional()
});
export type NodeTemplateAutomationMeta = z.infer<typeof NodeTemplateAutomationMetaSchema>;

export const WorkflowTemplateBundleItemSchema = z
  .object({
    ref: NodeTemplateRefSchema,
    // 模板包供 Core/CLI 消费，只接收输出数据，不携带画布的可用性回调。
    template: FlowNodeTemplateTypeSchema.extend({
      outputs: z.array(FlowNodeOutputItemTypeSchema)
    }),
    automationMeta: NodeTemplateAutomationMetaSchema.optional(),
    /** false 时仅允许按 ref 解析，供内部容器节点和历史模板使用。 */
    listed: z.boolean().optional(),
    /** 宿主已完成资源校验的初始值；CLI 和服务端共用，避免计划 checksum 漂移。 */
    validatedInputDefaults: z
      .record(z.string(), z.object({ provided: z.literal(true), value: z.unknown() }))
      .optional()
  })
  .superRefine((item, context) => {
    if (item.ref.kind !== 'systemTool') return;
    if (item.template.pluginId !== item.ref.toolId) {
      context.addIssue({
        code: 'custom',
        path: ['template', 'pluginId'],
        message: 'System tool template pluginId must match ref.toolId'
      });
    }
    if (item.template.source && item.template.source !== item.ref.source) {
      context.addIssue({
        code: 'custom',
        path: ['template', 'source'],
        message: 'System tool template source must match ref.source'
      });
    }
  });

export const WorkflowTemplateBundleSchema = z.object({
  schemaVersion: z.literal('fastgpt-workflow-template-bundle/v1'),
  items: z.array(WorkflowTemplateBundleItemSchema)
});

export type WorkflowTemplateBundle = z.infer<typeof WorkflowTemplateBundleSchema>;
