import type { AppDetailType } from '@fastgpt/global/core/app/type';
import type { WorkflowDocument } from '@fastgpt/workflow-core';

/** 合并 Builder 应用后的应用级状态，确保系统配置与画布节点一起生效。 */
export const mergeWorkflowBuilderAppliedAppDetail = ({
  current,
  targetDocument
}: {
  current: AppDetailType;
  targetDocument: WorkflowDocument;
}): AppDetailType => ({
  ...current,
  name: targetDocument.app?.name ?? current.name,
  intro: targetDocument.app?.intro ?? current.intro,
  chatConfig: targetDocument.chatConfig
});
