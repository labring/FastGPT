import { createWorkflowTemplateBundleProvider } from '@fastgpt/workflow-core/template/provider';
import { WorkflowTemplateBundleSchema } from '@fastgpt/global/core/workflow/template/type';
import { createWorkflowTemplateBundle } from '@fastgpt/web/core/workflow/template/bundle';
import { type WorkflowTemplateProvider } from '@fastgpt/workflow-core/template/type';
import { readFile } from 'node:fs/promises';

export const WORKFLOW_TEMPLATE_BUNDLE_ENV = 'FASTGPT_WORKFLOW_TEMPLATE_BUNDLE';

/** 直接加载宿主注入的完整模板包；独立运行时由 CLI 宿主装配离线系统模板。 */
export const loadCliTemplateProvider = async (
  env: NodeJS.ProcessEnv,
  locale: string
): Promise<WorkflowTemplateProvider> => {
  const bundlePath = env[WORKFLOW_TEMPLATE_BUNDLE_ENV];
  const bundle = bundlePath
    ? WorkflowTemplateBundleSchema.parse(JSON.parse(await readFile(bundlePath, 'utf8')))
    : createWorkflowTemplateBundle({ locale });
  return createWorkflowTemplateBundleProvider(bundle);
};
