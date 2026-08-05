import { FlowNodeTemplateTypeSchema } from '@fastgpt/global/core/workflow/type/node';
import z from 'zod';
import { WorkflowCommandError } from '../domain/diagnostic';
import {
  NodeTemplateAutomationMetaSchema,
  NodeTemplateRefSchema,
  formatNodeTemplateRef,
  type NodeTemplateRef,
  type ResolvedWorkflowTemplate,
  type WorkflowTemplateProvider
} from './type';

export const WorkflowTemplateBundleItemSchema = z
  .object({
    ref: NodeTemplateRefSchema,
    template: FlowNodeTemplateTypeSchema.strict(),
    automationMeta: NodeTemplateAutomationMetaSchema.optional()
  })
  .strict()
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

export const WorkflowTemplateBundleSchema = z
  .object({
    schemaVersion: z.literal('fastgpt-workflow-template-bundle/v1'),
    items: z.array(WorkflowTemplateBundleItemSchema)
  })
  .strict();

export type WorkflowTemplateBundle = z.infer<typeof WorkflowTemplateBundleSchema>;

const throwTemplateUnavailable = (ref: NodeTemplateRef): never => {
  throw new WorkflowCommandError([
    {
      code: 'WORKFLOW_TEMPLATE_UNAVAILABLE',
      severity: 'error',
      params: { template: formatNodeTemplateRef(ref) }
    }
  ]);
};

/** 用严格校验后的请求级模板包构造只读 Provider。 */
export const createWorkflowTemplateBundleProvider = (
  input: WorkflowTemplateBundle
): WorkflowTemplateProvider => {
  const bundle = WorkflowTemplateBundleSchema.parse(input);
  const entries = new Map<string, { ref: NodeTemplateRef; resolved: ResolvedWorkflowTemplate }>();

  for (const item of bundle.items) {
    const key = formatNodeTemplateRef(item.ref);
    if (entries.has(key)) {
      throw new WorkflowCommandError([
        {
          code: 'WORKFLOW_TEMPLATE_PROVIDER_CONFLICT',
          severity: 'error',
          params: { template: key }
        }
      ]);
    }
    entries.set(key, {
      ref: item.ref,
      resolved: {
        template: item.template,
        automationMeta: item.automationMeta
      }
    });
  }

  return {
    async list() {
      return [...entries.values()].map(({ ref }) => ref);
    },
    async resolve(ref) {
      return entries.get(formatNodeTemplateRef(ref))?.resolved ?? throwTemplateUnavailable(ref);
    }
  };
};

/** 合并多个 Provider，并在每次 list/resolve 时拒绝重复模板身份。 */
export const composeWorkflowTemplateProviders = (
  providers: WorkflowTemplateProvider[]
): WorkflowTemplateProvider => {
  const getProviderRegistry = async (context: Parameters<WorkflowTemplateProvider['list']>[0]) => {
    const providerRefs = await Promise.all(
      providers.map(async (provider) => ({ provider, refs: await provider.list(context) }))
    );
    const entries = new Map<string, { provider: WorkflowTemplateProvider; ref: NodeTemplateRef }>();

    for (const { provider, refs } of providerRefs) {
      for (const ref of refs) {
        const key = formatNodeTemplateRef(ref);
        if (entries.has(key)) {
          throw new WorkflowCommandError([
            {
              code: 'WORKFLOW_TEMPLATE_PROVIDER_CONFLICT',
              severity: 'error',
              params: { template: key }
            }
          ]);
        }
        entries.set(key, { provider, ref });
      }
    }
    return { entries, providerRefs };
  };

  return {
    async list(context) {
      return [...(await getProviderRegistry(context)).entries.values()].map(({ ref }) => ref);
    },
    async resolve(ref, context) {
      const registry = await getProviderRegistry(context);
      const entry = registry.entries.get(formatNodeTemplateRef(ref));
      if (entry) return entry.provider.resolve(entry.ref, context);

      // builtin 等 Provider 允许解析不公开在 list 中的内部模板。
      const candidates = registry.providerRefs.filter(({ refs }) =>
        refs.some((listedRef) => listedRef.kind === ref.kind)
      );
      const results = await Promise.allSettled(
        candidates.map(({ provider }) => provider.resolve(ref, context))
      );
      const resolved = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : []
      );
      if (resolved.length > 1) {
        throw new WorkflowCommandError([
          {
            code: 'WORKFLOW_TEMPLATE_PROVIDER_CONFLICT',
            severity: 'error',
            params: { template: formatNodeTemplateRef(ref) }
          }
        ]);
      }
      if (resolved[0]) return resolved[0];

      const unexpectedFailure = results.find(
        (result) =>
          result.status === 'rejected' &&
          !(
            result.reason instanceof WorkflowCommandError &&
            result.reason.diagnostics.every((diagnostic) =>
              ['WORKFLOW_TEMPLATE_NOT_FOUND', 'WORKFLOW_TEMPLATE_UNAVAILABLE'].includes(
                diagnostic.code
              )
            )
          )
      );
      if (unexpectedFailure?.status === 'rejected') throw unexpectedFailure.reason;
      return throwTemplateUnavailable(ref);
    }
  };
};
