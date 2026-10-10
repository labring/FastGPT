import { matchesModelFilter, peekModelCatalog } from '@/web/core/ai/model/modelData';

/**
 * 同步读取当前团队可用的模型目录，作为 Runtime 的环境事实（getEnvironment 必须同步）。
 * 目录未就绪返回 undefined，与“目录为空”区分开：调用方据此跳过本轮模型规则，
 * 目录就绪后由 host 触发一次 Issue 刷新补上结果。
 */
export const peekWorkflowEnvironmentModels = () => {
  const catalog = peekModelCatalog();
  if (!catalog) return undefined;
  // 与 peekModelDetail 共用同一份过滤规则，避免可选列表和可用性校验出现两套口径。
  return catalog.modelList
    .filter((model) => matchesModelFilter(model, {}))
    .map((model) => ({
      modelId: model.modelId,
      model: model.model,
      type: model.type,
      config: model.config
    }));
};
