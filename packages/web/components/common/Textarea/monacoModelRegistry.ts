import type { Monaco } from '@monaco-editor/react';

type MonacoModel = ReturnType<Monaco['editor']['getModels']>[number];

const workflowModels = new Map<string, MonacoModel>();
const disposeListeners = new WeakSet<MonacoModel>();

/** 注册工作流字段 model，并让它跟随 Monaco model 生命周期自动移除。 */
export const registerWorkflowMonacoModel = (model: MonacoModel) => {
  const uri = model.uri.toString();
  workflowModels.set(uri, model);

  if (disposeListeners.has(model)) return;
  disposeListeners.add(model);
  model.onWillDispose(() => {
    if (workflowModels.get(uri) === model) {
      workflowModels.delete(uri);
    }
  });
};

/** 释放指定工作流页面留下的 Monaco model。 */
export const disposeWorkflowMonacoModels = (uriPrefix: string) => {
  if (!uriPrefix) return;

  for (const [uri, model] of workflowModels) {
    if (!uri.startsWith(uriPrefix)) continue;
    workflowModels.delete(uri);
    if (!model.isDisposed()) {
      model.dispose();
    }
  }
};
