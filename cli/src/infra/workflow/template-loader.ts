import { WorkflowTemplateBundleSchema } from '@fastgpt/global/core/workflow/template/type';
import { createWorkflowTemplateBundle } from '@fastgpt/workflow-core/template/bundle';
import { createWorkflowTemplateBundleProvider } from '@fastgpt/workflow-core/template/provider';
import type { WorkflowTemplateProvider } from '@fastgpt/workflow-core/template/type';
import { CliArgumentError } from '../../shared/errors';
import type { FileIoAdapter } from '../fs/file-io';

export const WORKFLOW_TEMPLATE_BUNDLE_ENV = 'FASTGPT_WORKFLOW_TEMPLATE_BUNDLE';

export type WorkflowTemplateLoader = {
  loadProvider: (params: {
    locale: string;
    env: NodeJS.ProcessEnv;
  }) => Promise<WorkflowTemplateProvider>;
};

/**
 * 加载工作流节点模板库：优先读取宿主注入的 `FASTGPT_WORKFLOW_TEMPLATE_BUNDLE`，
 * 独立运行时回退为 `@fastgpt/workflow-core/template/bundle` 内置的离线系统模板。
 */
export function createWorkflowTemplateLoader({
  fileIo
}: {
  fileIo: FileIoAdapter;
}): WorkflowTemplateLoader {
  return {
    loadProvider: async ({ locale, env }) => {
      const bundlePath = env[WORKFLOW_TEMPLATE_BUNDLE_ENV];
      if (!bundlePath) {
        return createWorkflowTemplateBundleProvider(createWorkflowTemplateBundle({ locale }));
      }

      const rawText = await fileIo.readTextFile(bundlePath);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        throw new CliArgumentError(
          `Workflow template bundle file "${bundlePath}" must contain valid JSON.`
        );
      }
      const bundle = WorkflowTemplateBundleSchema.parse(parsedJson);
      return createWorkflowTemplateBundleProvider(bundle);
    }
  };
}
