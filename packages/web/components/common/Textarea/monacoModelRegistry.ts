import type { Monaco } from '@monaco-editor/react';

type MonacoModel = ReturnType<Monaco['editor']['getModels']>[number];

const workflowModels = new Map<string, MonacoModel>();
const disposeListeners = new WeakSet<MonacoModel>();

/** 随机工作流 URI 不写入 Monaco 的全局视图缓存，调用方按临时路径重新挂载以避免写入旧 URI。 */
export const shouldSaveMonacoViewState = (path?: string) =>
  !path?.startsWith('inmemory://fastgpt/workflow/');

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
