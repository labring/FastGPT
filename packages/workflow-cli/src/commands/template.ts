import {
  builtinTemplateProvider,
  normalizeNodeTemplateDescriptor,
  parseNodeTemplateRef,
  type NodeTemplateRef
} from '@fastgpt/workflow-core';
import { createTranslator } from '../i18n';
import type { CliContext, CliResult } from '../type';
import { requireString } from './helpers';

const resolveDescriptor = async (ref: NodeTemplateRef, context: CliContext) => {
  const resolved = await builtinTemplateProvider.resolve(ref, { locale: context.locale });
  return normalizeNodeTemplateDescriptor({
    template: resolved.template,
    templateRef: ref,
    automationMeta: resolved.automationMeta,
    translate: createTranslator(context.locale)
  });
};

export const listTemplates = async (
  _input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const refs = await builtinTemplateProvider.list({ locale: context.locale });
  return {
    changed: false,
    result: await Promise.all(refs.map((ref) => resolveDescriptor(ref, context)))
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
  const refs = await builtinTemplateProvider.list({ locale: context.locale });
  for (const ref of refs) {
    const descriptor = await resolveDescriptor(ref, context);
    if (descriptor.flowNodeType === flowNodeType) return descriptor;
  }
};
