import {
  normalizeNodeTemplateDescriptor,
  formatNodeTemplateRef,
  parseNodeTemplateRef,
  type NodeTemplateRef
} from '@fastgpt/workflow-core';
import { createTranslator } from '../i18n';
import type { CliContext, CliResult } from '../type';
import { requireString } from './helpers';

const resolveDescriptor = async (ref: NodeTemplateRef, context: CliContext) => {
  const resolved = await context.templateProvider.resolve(ref, { locale: context.locale });
  return normalizeNodeTemplateDescriptor({
    template: resolved.template,
    templateRef: ref,
    automationMeta: resolved.automationMeta,
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
