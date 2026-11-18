import {
  WorkflowTemplateBundleSchema,
  type WorkflowTemplateBundle
} from '@fastgpt/global/core/workflow/template/type';
import { createWorkflowTemplateBundle } from '@fastgpt/workflow-core/template/bundle';
import { CliArgumentError } from '../../shared/errors';
import type { FileIoAdapter } from '../fs/file-io';

export const WORKFLOW_TEMPLATE_BUNDLE_ENV = 'FASTGPT_WORKFLOW_TEMPLATE_BUNDLE';
export const WORKFLOW_TEMPLATE_BUNDLE_FILE_NAME = 'template-bundle.json';

export type WorkflowTemplateLoader = {
  loadBundle: (params: {
    locale: string;
    env: NodeJS.ProcessEnv;
    dir?: string;
  }) => Promise<WorkflowTemplateBundle>;
};

/** 先读取 Pro 等宿主的显式模板包，再检查工作区，兼容尚未保存模板包的旧工作区。 */
export function createWorkflowTemplateLoader({
  fileIo
}: {
  fileIo: FileIoAdapter;
}): WorkflowTemplateLoader {
  return {
    loadBundle: async ({ locale, env, dir = '.' }) => {
      const override = env[WORKFLOW_TEMPLATE_BUNDLE_ENV];
      if (!override && !(await fileIo.exists(WORKFLOW_TEMPLATE_BUNDLE_FILE_NAME, dir))) {
        return createWorkflowTemplateBundle({ locale });
      }

      const bundlePath = override
        ? override
        : fileIo.resolvePath(WORKFLOW_TEMPLATE_BUNDLE_FILE_NAME, dir);
      const rawText = await fileIo.readTextFile(bundlePath);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        throw new CliArgumentError(
          `Workflow template bundle file "${bundlePath}" must contain valid JSON.`
        );
      }
      return WorkflowTemplateBundleSchema.parse(parsedJson);
    }
  };
}
