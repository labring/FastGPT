import type { AppDetailType } from '@fastgpt/global/core/app/type';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';

/** 合并 Builder 应用后的系统配置；应用名称和简介始终由用户管理。 */
export const mergeWorkflowBuilderAppliedAppDetail = ({
  current,
  targetDocument
}: {
  current: AppDetailType;
  targetDocument: WorkflowDocument;
}): AppDetailType => ({
  ...current,
  chatConfig: targetDocument.chatConfig
});
