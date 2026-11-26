import type { AppChatConfigType, AppDetailType } from '@fastgpt/global/core/app/type';
import { decompileStoreWorkflow } from '@fastgpt/workflow-core/store/decompile';
import { type WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { serializeRuntime } from '@/web/core/workflow/editor/codec';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';

/** 生成 Builder 的基线文档。空引用快照沿用历史文档的缺省形态，保持旧任务校验和。 */
export const workflowRuntimeToWorkflowDocument = ({
  runtime,
  chatConfig,
  app
}: {
  runtime: WorkflowRuntimePort;
  chatConfig?: AppChatConfigType;
  app?: WorkflowDocument['app'];
}): WorkflowDocument => {
  const workflow = serializeRuntime(runtime);
  const document = decompileStoreWorkflow({
    workflow: {
      ...workflow,
      chatConfig: chatConfig ?? workflow.chatConfig,
      referenceSnapshots: workflow.referenceSnapshots?.length
        ? workflow.referenceSnapshots
        : undefined
    }
  });
  return app ? { ...document, app: structuredClone(app) } : document;
};

/** 只投影 WorkflowDocument 领域需要的应用元数据，权限、时间等 Web 状态不进入 checksum。 */
export const appDetailToWorkflowDocumentApp = (
  appDetail: Pick<AppDetailType, '_id' | 'name' | 'intro' | 'type'>
): WorkflowDocument['app'] => ({
  appId: String(appDetail._id),
  name: appDetail.name,
  intro: appDetail.intro,
  appType: appDetail.type
});
