import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import {
  WorkflowTemplateBundleSchema,
  type WorkflowTemplateBundle,
  type NodeTemplateRef
} from '@fastgpt/global/core/workflow/template/type';
import { WorkflowCommandError } from '../domain/diagnostic';
import {
  formatNodeTemplateRef,
  type ResolvedWorkflowTemplate,
  type WorkflowTemplateProvider
} from './type';

const throwTemplateUnavailable = (ref: NodeTemplateRef): never => {
  throw new WorkflowCommandError([
    {
      code: WorkflowDiagnosticCodeEnum.templateUnavailable,
      severity: 'error',
      params: { template: formatNodeTemplateRef(ref) }
    }
  ]);
};

/** 仅使用完整模板包构造只读 Provider；隐藏项可解析，缺失项不会回退到本地模板。 */
export const createWorkflowTemplateBundleProvider = (
  input: WorkflowTemplateBundle
): WorkflowTemplateProvider => {
  const bundle = WorkflowTemplateBundleSchema.parse(input);
  const entries = new Map<
    string,
    { ref: NodeTemplateRef; resolved: ResolvedWorkflowTemplate; listed: boolean }
  >();

  for (const item of bundle.items) {
    const key = formatNodeTemplateRef(item.ref);
    if (entries.has(key)) {
      throw new WorkflowCommandError([
        {
          code: WorkflowDiagnosticCodeEnum.templateProviderConflict,
          severity: 'error',
          params: { template: key }
        }
      ]);
    }
    entries.set(key, {
      ref: item.ref,
      listed: item.listed !== false,
      resolved: {
        template: item.template,
        automationMeta: item.automationMeta,
        validatedInputDefaults: item.validatedInputDefaults
      }
    });
  }

  return {
    async list() {
      return [...entries.values()].filter(({ listed }) => listed).map(({ ref }) => ref);
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
              code: WorkflowDiagnosticCodeEnum.templateProviderConflict,
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
            code: WorkflowDiagnosticCodeEnum.templateProviderConflict,
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
              [
                WorkflowDiagnosticCodeEnum.templateNotFound,
                WorkflowDiagnosticCodeEnum.templateUnavailable
              ].includes(diagnostic.code)
            )
          )
      );
      if (unexpectedFailure?.status === 'rejected') throw unexpectedFailure.reason;
      return throwTemplateUnavailable(ref);
    }
  };
};
