import { option } from '../commandOptions';
import z from 'zod';
import { normalizeNodeTemplateDescriptor } from '@fastgpt/workflow-core/template/descriptor';
import { formatNodeTemplateRef, parseNodeTemplateRef } from '@fastgpt/workflow-core/template/type';
import { type NodeTemplateRef } from '@fastgpt/global/core/workflow/template/type';
import { createTranslator } from '@fastgpt/web/i18n/workflowTemplate';
import type { CliContext, CliResult, CliCommandDefinition } from '../type';
import { requireString } from './helpers';

const resolveDescriptor = async (ref: NodeTemplateRef, context: CliContext) => {
  const resolved = await context.templateProvider.resolve(ref, { locale: context.locale });
  return normalizeNodeTemplateDescriptor({
    template: resolved.template,
    templateRef: ref,
    automationMeta: resolved.automationMeta,
    validatedInputDefaults: resolved.validatedInputDefaults,
    translate: createTranslator(context.locale)
  });
};

export const listTemplates = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const refs = (await context.templateProvider.list({ locale: context.locale })).filter(
    (ref) => input.kind === undefined || ref.kind === input.kind
  );
  const counts = {
    builtin: 0,
    teamApp: 0,
    systemTool: 0,
    tool: 0
  };
  refs.forEach((ref) => {
    counts[ref.kind] += 1;
  });
  const items = await Promise.all(
    refs.map(async (ref) => {
      const descriptor = await resolveDescriptor(ref, context);
      return {
        kind: ref.kind,
        ref: formatNodeTemplateRef(ref),
        template: descriptor.template,
        name: descriptor.name,
        intro: descriptor.intro,
        flowNodeType: descriptor.flowNodeType
      };
    })
  );
  return {
    changed: false,
    result: {
      total: items.length,
      counts,
      items
    }
  };
};

export const showTemplate = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => ({
  changed: false,
  result: await resolveDescriptor(parseNodeTemplateRef(requireString(input, 'template')), context)
});

export const findDescriptorForNode = async (flowNodeType: string, context: CliContext) => {
  const refs = await context.templateProvider.list({ locale: context.locale });
  for (const ref of refs) {
    const descriptor = await resolveDescriptor(ref, context);
    if (descriptor.flowNodeType === flowNodeType) return descriptor;
  }
};

/** template 命令定义与执行逻辑在同一模块维护；注册器只负责收集。 */
export const templateCommands: CliCommandDefinition[] = [
  {
    path: ['template', 'list'],
    introducedIn: 'PR1',
    kind: 'query',
    inputSchema: z
      .object({ kind: z.enum(['builtin', 'teamApp', 'systemTool', 'tool']).optional() })
      .strict(),
    options: [option('--kind', 'Filter by template kind')],
    supportsDryRun: false,
    confirm: 'none',
    handler: listTemplates
  },
  {
    path: ['template', 'show'],
    introducedIn: 'PR1',
    kind: 'query',
    inputSchema: z.object({ template: z.string().min(1) }).strict(),
    options: [option('--template', 'Explicit template reference', { required: true })],
    supportsDryRun: false,
    confirm: 'none',
    handler: showTemplate
  }
];
