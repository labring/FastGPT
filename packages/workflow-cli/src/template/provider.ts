import {
  WorkflowTemplateBundleSchema,
  builtinTemplateProvider,
  composeWorkflowTemplateProviders,
  createWorkflowTemplateBundleProvider,
  type WorkflowTemplateProvider
} from '@fastgpt/workflow-core';
import { readFile } from 'node:fs/promises';

export const WORKFLOW_TEMPLATE_BUNDLE_ENV = 'FASTGPT_WORKFLOW_TEMPLATE_BUNDLE';

/** 从受信环境变量指定的 JSON 文件加载本次 CLI 进程可用的组合模板 Provider。 */
export const loadCliTemplateProvider = async (
  env: NodeJS.ProcessEnv
): Promise<WorkflowTemplateProvider> => {
  const bundlePath = env[WORKFLOW_TEMPLATE_BUNDLE_ENV];
  if (!bundlePath) return builtinTemplateProvider;

  const bundle = WorkflowTemplateBundleSchema.parse(JSON.parse(await readFile(bundlePath, 'utf8')));
  return composeWorkflowTemplateProviders([
    builtinTemplateProvider,
    createWorkflowTemplateBundleProvider(bundle)
  ]);
};
